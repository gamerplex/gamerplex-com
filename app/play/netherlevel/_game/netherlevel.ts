// NETHERLEVEL — first-person trap-corridor engine, Season 1: the full arc.
// THE DESCENT (0 → −6, the 666 motif) → THE ABYSS mastery gate (3 flawless
// trial clears open the Ascent Door) → THE ASCENSION (−6 → 0 → +12): fresh,
// tonally-opposite climbing halls out of hell, through Earth, up the TWELVE
// GATES to Heaven — reaching the Twelfth Gate (+12) is the ENDING (the sky
// reveal). Plus THE DAILY DESCENT: one date-seeded hall, identical for every
// player worldwide, scored fewest-deaths-then-fastest, one attempt per day.
// The corridor lies to you: authored, fully deterministic traps
// (collapse pits, lunging spikes, fake/vanishing floor, crush walls, look-flip,
// fake gates, delayed drops, false-safe tiles — and on the climb: wind gusts,
// edge-falls, vapor clouds) fire on position triggers, identical for every
// player and re-armed identically on respawn — skill-only, NO RNG in the
// outcome (the daily's date-seed makes one layout, the same for everyone).
// Kinematic mover (walk/strafe/hop/dodge, gravity, AABB collision — no physics
// engine), fixed 120Hz timestep, viewmodel hands parented to the camera.
// First real adopter of the vendored @gamerplex/game-kit (lib/gamekit): renderer
// bootstrap + "Z effect" look + adaptive quality governor + deterministic frame.

import * as THREE from "three/webgpu";
import {
  createRenderer, clampedDpr,
  setupLook, type Look,
  makeQualityGovernor, type Governor,
  rng, seedFrom,
  makeKeySet, type KeySet,
  softTex,
} from "../../../../lib/gamekit";

export type HallZone = "descent" | "hell" | "ascent" | "earth" | "sky";

export interface HudState {
  phase: "running" | "over";
  ascension: number;        // current hall, 1-based
  totalAscensions: number;
  hallName: string;
  depth: number;            // signed rung: −6 … 0 … +12 (the depth HUD read)
  zone: HallZone;           // realm read for the HUD (descent vs the climb)
  daily: boolean;           // the Daily Descent mode
  abyss: boolean;           // in the Abyss trial hall
  streak: number;           // Abyss flawless clears held, 0..3
  relic: boolean;           // the Relic granted (3rd flawless clear)
  whisper: string;          // story beat — a non-blocking one-line vision
  deaths: number;
  timeSec: number;
  distToGate: number;       // meters to the (real) Gate — the progress read
  score: number;
  banner: string;
  flip: boolean;            // look-flip curse active (UI tint)
  wind: number;             // gust telegraph: sign = push direction, |v| 0..1 (0 = calm)
  win: boolean;
}

export type NlEvent =
  | "tell" | "hop" | "dodge" | "trap" | "flip" | "land"
  | "death" | "respawn" | "gate" | "win"
  | "beat" | "trial" | "streakbreak" | "relic" | "ascent"
  | "windwarn" | "gust" | "heaven";

const SIM_DT = 1 / 120;          // fixed timestep — cross-device deterministic
const EYE = 1.6;
const PW = 0.3;                  // player half-width (x/z)
const PH = 1.7;                  // player height
const WALK = 3.4;
const ACCEL_G = 30;              // ground accel (never set velocity raw from input)
const ACCEL_A = 16;              // air control ~55% of ground
const GRAV = 18;
const FALL_MULT = 1.5;           // falling faster than rising — the snappy hop
const MAX_FALL = 20;
const HOP_VY = 5.2;
const HOP_CUT = 2.4;             // release space early → hop rise capped (variable height)
const HOP_BOOST = 1.25;          // airborne forward carry
const COYOTE = 0.1;              // hop grace after leaving a ledge
const HOP_BUFFER = 0.12;         // hop pressed just before landing still fires
const DODGE_TIME = 0.16;
const DODGE_CD = 0.7;
const DODGE_SPEED = 7.5;
const KILL_Y = -5;               // fell into the fire shaft (or off the sky's edge)
const HALL_W = 4;                // corridor inner width (x −2..2)
const WALL_H = 3.2;
const WIND_PUSH = 2.4;           // gust lateral push (m/s) — counter-strafe (3.4) beats it
const WIND_WARN = 1.5;           // long telegraph before the gust — read it, brace or wait
const WIND_LEAD = 2.4;           // the warn starts this far up-hall of the trigger line
const WIND_ACTIVE = 2.4;         // how long the gust blows once live
const WIND_RAMP = 0.5;           // push ramps in (and eases out) — a lean, never a snap

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

type TrapKind = "collapse" | "spike" | "fakefloor" | "crush" | "lookflip" | "fakegate" | "wind";
interface TrapDef {
  kind: TrapKind;
  triggerZ: number;   // fires when player z <= triggerZ
  z0: number;         // affected band, nearer edge (less negative)
  z1: number;         // farther edge
  side?: 1 | -1;      // spike origin wall / fake-floor SAFE side / wind push direction
  x0?: number; x1?: number; // collapse only: partial-width band (false-safe tiles)
  warnT?: number;     // collapse only: warn duration — long = the delayed drop lie
}
interface Hole { z0: number; z1: number; x0: number; x1: number } // open fire pit / sky gap (no trap logic)
// Per-hall zone theming — the visual arc ramp (Earth calm → the Abyss → the sky). Visuals only.
interface HallTheme {
  zone: HallZone;
  open?: boolean;     // sky halls: no walls/ceiling — a floating bridge; edge-falls are real
  wall: number; ceil: number; floorTint: number;
  wallEmissive: number; wallEmissiveI: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  dirColor: number; dirI: number;
  rimColor?: number; rimI?: number;   // red rim from down-hall — the hell glare
  bgTop: number; bgBottom: number;    // background gradient
  fogColor: number; fogFar: number;
  fireLevel: number;                  // 0..1 scales grate fire/embers/light
  stripI?: number;                    // accent point-light scale (dim the neon read)
  handFill: number; handFillI: number; // viewmodel carry-light — theme-adaptive hands
  handCuff: number;                    // viewmodel cuff emissive — cool up top, ember below
  reveal: "none" | "fire" | "sky";    // sky = the Heaven finale (the +12 ending)
}
interface HallDef {
  name: string;
  depth: number;      // signed rung: −1…−6 the descent, 0 Earth, +1…+12 the gates
  length: number;
  traps: TrapDef[];
  holes?: Hole[];
  grates?: Hole[]; // fire grates: real shaft below, solid walkable cover — glow only
  pillars?: { x: number; z: number }[]; // sky slalom columns — solid, one instanced draw
  gate: { x: number; z: number };
  fakeGate?: { x: number; z: number };
  alcove?: { side: 1 | -1; z0: number; z1: number; depth: number }; // hides the real Gate
  strip: number;      // realm accent color — warms as you approach the descent
  beat?: string;      // story beat whispered on entering the hall (non-blocking)
  abyss?: boolean;    // the Abyss trial hall — the 3×-flawless mastery gate
  daily?: boolean;    // the Daily Descent hall (date-seeded, HUD reads differently)
  theme: HallTheme;
}

// color lerp for the sky ramp (module init only — never per-frame)
const lerpHex = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

const GATE_ORD = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH"];

// The sky ramp: gates +1 → +12 brighten and warm toward Heaven's gold. Open
// halls (no walls — a floating bridge), edge-falls real, zero fire.
const skyTheme = (gate: number): HallTheme => {
  const t = (gate - 1) / 11;
  return {
    zone: "sky", open: true,
    wall: lerpHex(0x6a86b8, 0x9a8a6c, t), ceil: 0x6a86b8, floorTint: lerpHex(0xffffff, 0xfff0d0, t),
    wallEmissive: 0x4a6aa8, wallEmissiveI: 0.05,
    hemiSky: lerpHex(0xdcecff, 0xfff4da, t), hemiGround: lerpHex(0x7690b8, 0xc0a884, t), hemiI: 5.2 + 0.8 * t,
    dirColor: lerpHex(0xffffff, 0xffedb8, t), dirI: 4.6 + 0.8 * t,
    bgTop: lerpHex(0x4a86d0, 0x7ab0e8, t), bgBottom: lerpHex(0xa8c8ec, 0xf0d8a8, t),
    fogColor: lerpHex(0xb8d4f0, 0xe8d8b0, t), fogFar: 58 + 12 * t,
    fireLevel: 0, stripI: 1,
    handFill: lerpHex(0xf4f8ff, 0xfff2d0, t), handFillI: 3.0, handCuff: lerpHex(0x8fd0ff, 0xffd24a, t),
    reveal: gate === 12 ? "sky" : "none",
  };
};
const skyStrip = (gate: number) => lerpHex(0x9ecfff, 0xffe28a, (gate - 1) / 11);

// Season 1 — the full arc. THE DESCENT: six halls, Earth (0) down to the 666
// floor (−6), then THE ABYSS trial (the 3×-flawless mastery gate). Then THE
// ASCENSION: new halls climbing out — cooled hell (−4, −2), Earth (0), and the
// TWELVE GATES (+1…+12, open sky bridges: wind, edge-falls, vapor). The theming
// ramp is the arc: calm → ember dread → the Abyss, then release — cooling,
// dawn, and gold. Hands, strips, fog all follow — data here, not code.
const HALLS: HallDef[] = [
  {
    name: "THE FIRST LIE", depth: -1, length: 24, strip: 0x9ab8d8,
    beat: "you fell, Pilgrim — and the only way out is down.",
    traps: [{ kind: "collapse", triggerZ: -8.6, z0: -9.4, z1: -11.0 }],
    gate: { x: 0, z: -22.6 },
    theme: {
      // Earth calm — pale, cool, almost gentle. The lie is that it's safe here.
      zone: "descent", wall: 0x565c78, ceil: 0x3e4560, floorTint: 0xffffff,
      wallEmissive: 0x2a3350, wallEmissiveI: 0.05,
      hemiSky: 0xcfd8ee, hemiGround: 0x3e4258, hemiI: 5.0, dirColor: 0xe8eeff, dirI: 4.2,
      bgTop: 0x2a3450, bgBottom: 0x0c101e, fogColor: 0x192134, fogFar: 50,
      fireLevel: 0, stripI: 0.9,
      handFill: 0xe8f0ff, handFillI: 3.0, handCuff: 0x7fd7ff,
      reveal: "none",
    },
  },
  {
    name: "THE SPIKE", depth: -2, length: 30, strip: 0x8a6ae0,
    beat: "you did not trip. you let go.",
    traps: [{ kind: "spike", triggerZ: -7.0, z0: -8.2, z1: -9.0, side: 1 }],
    holes: [{ z0: -16, z1: -17.6, x0: -2, x1: 2 }],
    gate: { x: 0, z: -28.6 },
    theme: {
      // Twilight — the violet dims, the first long drop yawns open mid-hall.
      zone: "descent", wall: 0x453a63, ceil: 0x30284c, floorTint: 0xffffff,
      wallEmissive: 0x2a1840, wallEmissiveI: 0.06,
      hemiSky: 0xa89ae0, hemiGround: 0x33203a, hemiI: 3.9, dirColor: 0xcfc0ff, dirI: 3.2,
      bgTop: 0x1c1232, bgBottom: 0x090512, fogColor: 0x110a1e, fogFar: 42,
      fireLevel: 0, stripI: 0.8,
      handFill: 0xded2ff, handFillI: 2.9, handCuff: 0x9a7fff,
      reveal: "none",
    },
  },
  {
    name: "THE VANISHING", depth: -3, length: 32, strip: 0xb0421e,
    beat: "the hall lies to you as you lied — softly, and to yourself.",
    traps: [
      { kind: "fakefloor", triggerZ: -9.0, z0: -10, z1: -12.5, side: 1 },
      { kind: "spike", triggerZ: -19, z0: -20, z1: -20.8, side: -1 },
    ],
    grates: [
      { z0: -15, z1: -16.4, x0: -2, x1: -1.5 },
      { z0: -24, z1: -25.4, x0: 1.5, x1: 2 },
    ],
    gate: { x: 0, z: -30.6 },
    theme: {
      // The threshold — neon dies here; ember light starts leaking up the shaft.
      zone: "hell", wall: 0x4a2f38, ceil: 0x321f28, floorTint: 0xffd6c0,
      wallEmissive: 0x7a1c0c, wallEmissiveI: 0.14,
      hemiSky: 0xc09585, hemiGround: 0x38181a, hemiI: 3.6, dirColor: 0xffb08a, dirI: 2.9,
      rimColor: 0xff3a1a, rimI: 2.6,
      bgTop: 0x36100a, bgBottom: 0x060303, fogColor: 0x1a0906, fogFar: 38,
      fireLevel: 0.35, stripI: 0.6,
      handFill: 0xffdcb8, handFillI: 2.8, handCuff: 0xff9a4a,
      reveal: "fire",
    },
  },
  {
    name: "THE CRUSH", depth: -4, length: 34, strip: 0xd25428,
    beat: "what you buried down here still burns.",
    traps: [
      { kind: "crush", triggerZ: -8.4, z0: -9.4, z1: -11.0 },
      { kind: "lookflip", triggerZ: -16, z0: -16, z1: -16.9 },
      { kind: "collapse", triggerZ: -21.6, z0: -22.4, z1: -24.0 },
    ],
    grates: [
      { z0: -4.5, z1: -6, x0: 1.5, x1: 2 },
      { z0: -13, z1: -14.5, x0: -2, x1: -1.5 },
      { z0: -27.5, z1: -29, x0: 1.5, x1: 2 },
    ],
    gate: { x: 0, z: -32.6 },
    theme: {
      // Ember hell — the walls close in and the grade goes furnace.
      zone: "hell", wall: 0x54312e, ceil: 0x381f1e, floorTint: 0xffbfa4,
      wallEmissive: 0xb2260c, wallEmissiveI: 0.2,
      hemiSky: 0xd88a68, hemiGround: 0x401410, hemiI: 3.4, dirColor: 0xff9a5a, dirI: 2.7,
      rimColor: 0xff2e12, rimI: 3.4,
      bgTop: 0x571106, bgBottom: 0x0a0302, fogColor: 0x240b05, fogFar: 36,
      fireLevel: 0.65, stripI: 0.7,
      handFill: 0xffcf9e, handFillI: 2.8, handCuff: 0xffa03c,
      reveal: "fire",
    },
  },
  {
    name: "THE FALSE GATE", depth: -5, length: 32, strip: 0xe86428,
    beat: "you called it an accident. the fire remembers.",
    traps: [
      { kind: "collapse", triggerZ: -6.6, z0: -7.4, z1: -9.0 },
      { kind: "spike", triggerZ: -13, z0: -14.2, z1: -15.0, side: 1 },
      { kind: "crush", triggerZ: -19, z0: -20, z1: -21.6 },
      { kind: "fakegate", triggerZ: -28.8, z0: -29.4, z1: -30.6 },
    ],
    grates: [
      { z0: -11, z1: -12.5, x0: -2, x1: -1.5 },
      { z0: -17, z1: -18.3, x0: 1.5, x1: 2 },
      { z0: -23, z1: -24.4, x0: -2, x1: -1.5 },
    ],
    gate: { x: 3.6, z: -26.5 },
    fakeGate: { x: 0, z: -30.4 },
    alcove: { side: 1, z0: -25.4, z1: -27.6, depth: 2.5 },
    theme: {
      // Deep hell — even the Gates lie now.
      zone: "hell", wall: 0x5c322a, ceil: 0x3c201a, floorTint: 0xffb598,
      wallEmissive: 0xd42f08, wallEmissiveI: 0.26,
      hemiSky: 0xe89a70, hemiGround: 0x481208, hemiI: 3.2, dirColor: 0xffa25e, dirI: 2.6,
      rimColor: 0xff2a0c, rimI: 4.2,
      bgTop: 0x6b1504, bgBottom: 0x0c0302, fogColor: 0x2b0c05, fogFar: 34,
      fireLevel: 0.85, stripI: 0.8,
      handFill: 0xffc088, handFillI: 2.9, handCuff: 0xff8a2a,
      reveal: "fire",
    },
  },
  {
    name: "THE FLOOR OF THE WORLD", depth: -6, length: 36, strip: 0xff6a20,
    beat: "almost at the floor of the world. name what dropped you.",
    traps: [
      // the delayed drop: it holds while you hesitate — then lets go under you
      { kind: "collapse", triggerZ: -5.8, z0: -6.6, z1: -8.6, warnT: 1.25 },
      // false-safe tiles: the "safe" ledge past the vanishing floor betrays you
      { kind: "fakefloor", triggerZ: -13.0, z0: -14.0, z1: -16.5, side: 1 },
      { kind: "collapse", triggerZ: -15.3, z0: -16.5, z1: -18.1, x0: 0.8, x1: 2 },
      { kind: "spike", triggerZ: -22.0, z0: -23.2, z1: -24.0, side: -1 },
      { kind: "crush", triggerZ: -27.4, z0: -28.4, z1: -30.0 },
      { kind: "lookflip", triggerZ: -31.4, z0: -31.4, z1: -32.3 },
    ],
    grates: [
      { z0: -10, z1: -11.5, x0: -2, x1: -1.5 },
      { z0: -20, z1: -21.4, x0: 1.5, x1: 2 },
      { z0: -25.4, z1: -26.8, x0: -2, x1: -1.5 },
      { z0: -32.6, z1: -34, x0: 1.5, x1: 2 },
    ],
    gate: { x: 0, z: -34.6 },
    theme: {
      // −6, the 666 floor — everything is fire, dread and very little light.
      zone: "hell", wall: 0x4a221c, ceil: 0x2c1210, floorTint: 0xffab88,
      wallEmissive: 0xe03608, wallEmissiveI: 0.3,
      hemiSky: 0xf09060, hemiGround: 0x400e06, hemiI: 3.1, dirColor: 0xff9448, dirI: 2.5,
      rimColor: 0xff2000, rimI: 4.8,
      bgTop: 0x711302, bgBottom: 0x090201, fogColor: 0x2a0a04, fogFar: 32,
      fireLevel: 1, stripI: 0.9,
      handFill: 0xffb87e, handFillI: 3.0, handCuff: 0xff7a26,
      reveal: "fire",
    },
  },
  {
    name: "THE ABYSS", depth: -6, length: 36, strip: 0xff4a14, abyss: true,
    beat: "here the lies end. master the Abyss, and the way up will open.",
    traps: [
      // the trial: every cruelty in one gauntlet, identical on every attempt
      { kind: "spike", triggerZ: -6.0, z0: -7.2, z1: -8.0, side: 1 },
      { kind: "crush", triggerZ: -11.4, z0: -12.4, z1: -14.0 },
      { kind: "collapse", triggerZ: -17.4, z0: -18.2, z1: -19.8 },
      { kind: "fakefloor", triggerZ: -22.4, z0: -23.4, z1: -25.9, side: 1 },
      { kind: "collapse", triggerZ: -27.6, z0: -28.4, z1: -30.0, warnT: 1.15 },
      { kind: "lookflip", triggerZ: -31.0, z0: -31.0, z1: -31.9 },
    ],
    grates: [
      { z0: -4.4, z1: -5.6, x0: -2, x1: -1.5 },
      { z0: -9.4, z1: -10.8, x0: 1.5, x1: 2 },
      { z0: -15.2, z1: -16.6, x0: -2, x1: -1.5 },
      { z0: -21, z1: -22.2, x0: 1.5, x1: 2 },
      { z0: -32.4, z1: -33.8, x0: -2, x1: -1.5 },
    ],
    gate: { x: 0, z: -34.6 },
    theme: {
      // The Abyss — near-black, crimson glare, the locked Ascent Door at the end.
      zone: "hell", wall: 0x38140f, ceil: 0x1e0906, floorTint: 0xff9a74,
      wallEmissive: 0xff2e06, wallEmissiveI: 0.36,
      hemiSky: 0xff8a5a, hemiGround: 0x300a04, hemiI: 2.9, dirColor: 0xff8438, dirI: 2.3,
      rimColor: 0xff1a00, rimI: 5.6,
      bgTop: 0x8a1400, bgBottom: 0x060100, fogColor: 0x2e0b03, fogFar: 30,
      fireLevel: 1, stripI: 1,
      handFill: 0xffa868, handFillI: 3.1, handCuff: 0xff5a1e,
      reveal: "fire",
    },
  },

  // ── THE ASCENSION — the climb out. Tonally opposite: every hall is lighter,
  // cooler, freer than the last. First back up through cooled hell…
  {
    name: "THE LONG CLIMB", depth: -4, length: 30, strip: 0xd07840,
    beat: "the door closes behind you. the climb is yours.",
    traps: [
      { kind: "spike", triggerZ: -7.0, z0: -8.2, z1: -9.0, side: -1 },
      { kind: "collapse", triggerZ: -14.0, z0: -14.8, z1: -16.4 },
      { kind: "crush", triggerZ: -21.0, z0: -22.0, z1: -23.6 },
    ],
    grates: [
      { z0: -11, z1: -12.4, x0: -2, x1: -1.5 },
      { z0: -18, z1: -19.3, x0: 1.5, x1: 2 },
    ],
    gate: { x: 0, z: -28 },
    theme: {
      // Cooling hell — the furnace is behind you now; rust, not flame.
      zone: "ascent", wall: 0x4c3a40, ceil: 0x33242c, floorTint: 0xffe2cf,
      wallEmissive: 0x8a2a14, wallEmissiveI: 0.12,
      hemiSky: 0xd8a888, hemiGround: 0x3a1c18, hemiI: 3.6, dirColor: 0xffc08a, dirI: 3.0,
      rimColor: 0xff5a2a, rimI: 1.8,
      bgTop: 0x3a1810, bgBottom: 0x080304, fogColor: 0x1c0d08, fogFar: 40,
      fireLevel: 0.45, stripI: 0.7,
      handFill: 0xffe0c0, handFillI: 2.9, handCuff: 0xffb060,
      reveal: "fire",
    },
  },
  {
    name: "THE COOLING", depth: -2, length: 30, strip: 0x8a7ae0,
    beat: "the heat lets go of you. the dark thins.",
    traps: [
      { kind: "fakefloor", triggerZ: -9.0, z0: -9.8, z1: -12.3, side: -1 },
      { kind: "lookflip", triggerZ: -16.0, z0: -16.0, z1: -16.9 },
      { kind: "collapse", triggerZ: -21.0, z0: -21.8, z1: -23.4 },
    ],
    holes: [{ z0: -5, z1: -6.4, x0: -2, x1: 2 }],
    gate: { x: 0, z: -28 },
    theme: {
      // Violet dusk returning — the first color that isn't fire.
      zone: "ascent", wall: 0x473d66, ceil: 0x322a4e, floorTint: 0xffffff,
      wallEmissive: 0x35245c, wallEmissiveI: 0.08,
      hemiSky: 0xafa0e0, hemiGround: 0x2c2340, hemiI: 4.2, dirColor: 0xd0c8ff, dirI: 3.4,
      bgTop: 0x241a44, bgBottom: 0x0a0716, fogColor: 0x141026, fogFar: 44,
      fireLevel: 0.12, stripI: 0.85,
      handFill: 0xe2d8ff, handFillI: 2.9, handCuff: 0x9a8aff,
      reveal: "none",
    },
  },
  {
    name: "EARTH — THE CROSSING", depth: 0, length: 26, strip: 0x9ec8e8,
    beat: "the world you fell from. it is not yours to keep — higher, Pilgrim.",
    traps: [
      { kind: "collapse", triggerZ: -10.0, z0: -10.8, z1: -12.4 },
      { kind: "spike", triggerZ: -18.0, z0: -19.2, z1: -20.0, side: 1 },
    ],
    gate: { x: 0, z: -24 },
    theme: {
      // Dawn over Earth — calm, wide, almost kind. Do not stop here.
      zone: "earth", wall: 0x596480, ceil: 0x414b64, floorTint: 0xffffff,
      wallEmissive: 0x2c3a58, wallEmissiveI: 0.06,
      hemiSky: 0xe8eeff, hemiGround: 0x48506a, hemiI: 5.4, dirColor: 0xfff0d0, dirI: 4.6,
      bgTop: 0x3c5a88, bgBottom: 0x101a2c, fogColor: 0x22304a, fogFar: 52,
      fireLevel: 0, stripI: 1,
      handFill: 0xf2f6ff, handFillI: 3.0, handCuff: 0x8fe0ff,
      reveal: "none",
    },
  },

  // …then the TWELVE GATES: open sky bridges, each its own SET-PIECE. No walls
  // — a misstep is a long fall. Wind gusts (long multi-channel telegraph,
  // one-shot, counter-strafe beats them), vapor clouds (fakefloor), cloud
  // crumble (collapse), honest gaps — plus the signatures: the broken span
  // (+2), the vapor field (+3), the narrow way (+5), the crosswind (+8), the
  // pillared way (+9), the crumbling span (+10), the false gate in the sky
  // (+11 — the descent's lie, called back), and the twelfth's final gauntlet.
  {
    name: "THE FIRST GATE", depth: 1, length: 20, strip: skyStrip(1),
    beat: "sky, Pilgrim. you had forgotten sky.",
    traps: [{ kind: "wind", triggerZ: -12.5, z0: -13.0, z1: -15.5, side: 1 }],
    holes: [{ z0: -9, z1: -10.8, x0: -2, x1: 2 }],
    gate: { x: 0, z: -18 }, theme: skyTheme(1),
  },
  {
    // THE BROKEN SPAN — three hops, each gap wider than the last
    name: "THE SECOND GATE", depth: 2, length: 22, strip: skyStrip(2),
    beat: "the span is broken. commit, Pilgrim — the sky holds the committed.",
    traps: [],
    holes: [
      { z0: -6, z1: -7.5, x0: -2, x1: 2 },
      { z0: -11, z1: -12.7, x0: -2, x1: 2 },
      { z0: -16, z1: -17.9, x0: -2, x1: 2 },
    ],
    gate: { x: 0, z: -20 }, theme: skyTheme(2),
  },
  {
    // THE VAPOR FIELD — two lying cloud shelves; a gust leans you toward the second
    name: "THE THIRD GATE", depth: 3, length: 22, strip: skyStrip(3),
    beat: "clouds lie softer than corridors. still lies.",
    traps: [
      { kind: "fakefloor", triggerZ: -6.8, z0: -7.6, z1: -10.1, side: 1 },
      { kind: "fakefloor", triggerZ: -13.4, z0: -14.2, z1: -17.2, side: 1 },
      { kind: "wind", triggerZ: -13.0, z0: -13.6, z1: -16.6, side: -1 },
    ],
    gate: { x: 0, z: -20 }, theme: skyTheme(3),
  },
  {
    name: "THE FOURTH GATE", depth: 4, length: 24, strip: skyStrip(4),
    beat: "do not look down. you have been down.",
    traps: [{ kind: "collapse", triggerZ: -7.2, z0: -8.0, z1: -9.6 }],
    holes: [{ z0: -14, z1: -16, x0: -2, x1: 0.6 }],
    gate: { x: 0, z: -22 }, theme: skyTheme(4),
  },
  {
    // THE NARROW WAY — the bridge thins to ledges; each gust wants you in the void
    name: "THE FIFTH GATE", depth: 5, length: 24, strip: skyStrip(5),
    beat: "half-way is not a place. the way thins — hold your line.",
    traps: [
      { kind: "wind", triggerZ: -8.2, z0: -8.8, z1: -11.8, side: -1 },
      { kind: "wind", triggerZ: -15.0, z0: -15.6, z1: -18.6, side: 1 },
    ],
    holes: [
      { z0: -8, z1: -12.5, x0: -2, x1: 0.9 },   // the right ledge — the wind blows left
      { z0: -14.5, z1: -19, x0: -0.9, x1: 2 },  // then the left ledge — the wind flips
    ],
    gate: { x: 0, z: -22 }, theme: skyTheme(5),
  },
  {
    name: "THE SIXTH GATE", depth: 6, length: 24, strip: skyStrip(6),
    beat: "the light knows your name now.",
    traps: [
      { kind: "lookflip", triggerZ: -6.6, z0: -6.6, z1: -7.5 },
      { kind: "fakefloor", triggerZ: -16.4, z0: -17.2, z1: -19.4, side: -1 },
    ],
    holes: [{ z0: -11, z1: -12.7, x0: -2, x1: 2 }],
    gate: { x: 0, z: -22 }, theme: skyTheme(6),
  },
  {
    name: "THE SEVENTH GATE", depth: 7, length: 26, strip: skyStrip(7),
    beat: "narrow is the way. you knew that.",
    traps: [{ kind: "wind", triggerZ: -16.0, z0: -16.6, z1: -18.6, side: -1 }],
    holes: [
      { z0: -8, z1: -11, x0: -2, x1: -0.4 },   // walk the right ledge…
      { z0: -12, z1: -15, x0: 0.4, x1: 2 },    // …then cross to the left
    ],
    gate: { x: 0, z: -24 }, theme: skyTheme(7),
  },
  {
    // THE CROSSWIND — the wind IS the gate: three long gusts, alternating sides
    name: "THE EIGHTH GATE", depth: 8, length: 24, strip: skyStrip(8),
    beat: "the wind tests what the fire could not.",
    traps: [
      { kind: "wind", triggerZ: -5.5, z0: -6.0, z1: -10.0, side: 1 },
      { kind: "wind", triggerZ: -11.0, z0: -11.5, z1: -15.5, side: -1 },
      { kind: "wind", triggerZ: -16.5, z0: -17.0, z1: -21.0, side: 1 },
    ],
    gate: { x: 0, z: -22 }, theme: skyTheme(8),
  },
  {
    // THE PILLARED WAY — weave the columns; the gust presses you into them
    name: "THE NINTH GATE", depth: 9, length: 26, strip: skyStrip(9),
    beat: "even the sky raises walls. weave, Pilgrim.",
    traps: [{ kind: "wind", triggerZ: -13.0, z0: -13.6, z1: -17.6, side: 1 }],
    pillars: [
      { x: -0.7, z: -7 }, { x: 0.7, z: -9.2 }, { x: -0.7, z: -11.4 },
      { x: 0.9, z: -14 }, { x: -0.9, z: -16.4 }, { x: 0.9, z: -18.8 },
    ],
    holes: [{ z0: -21, z1: -22.7, x0: -2, x1: 2 }],
    gate: { x: 0, z: -24 }, theme: skyTheme(9),
  },
  {
    // THE CRUMBLING SPAN — three chained crumbles: keep moving or hop the wreck
    name: "THE TENTH GATE", depth: 10, length: 26, strip: skyStrip(10),
    beat: "almost. the word you never trusted. keep moving.",
    traps: [
      { kind: "collapse", triggerZ: -6.4, z0: -7.2, z1: -8.8, warnT: 0.85 },
      { kind: "collapse", triggerZ: -9.4, z0: -10.2, z1: -11.8, warnT: 0.85 },
      { kind: "collapse", triggerZ: -12.4, z0: -13.2, z1: -14.8, warnT: 0.85 },
    ],
    holes: [{ z0: -19, z1: -20.8, x0: -2, x1: 2 }],
    gate: { x: 0, z: -24 }, theme: skyTheme(10),
  },
  {
    // THE FALSE GATE IN THE SKY — the descent's lie, called back: skirt the liar
    name: "THE ELEVENTH GATE", depth: 11, length: 28, strip: skyStrip(11),
    beat: "one more lie of a gate. one more.",
    traps: [
      { kind: "wind", triggerZ: -6.2, z0: -6.8, z1: -9.4, side: 1 },
      { kind: "fakegate", triggerZ: -12.0, z0: -13.0, z1: -15.0 },
      { kind: "collapse", triggerZ: -19.0, z0: -19.8, z1: -21.4, warnT: 1.1 },
    ],
    holes: [{ z0: -24, z1: -25.7, x0: -2, x1: 2 }],
    gate: { x: 0, z: -26 },
    fakeGate: { x: 0, z: -14 },
    theme: skyTheme(11),
  },
  {
    // THE FINAL GAUNTLET — twin gusts, the last gap, and a span that falls if you falter
    name: "THE TWELFTH GATE", depth: 12, length: 22, strip: skyStrip(12),
    beat: "the twelfth gate. walk it clean, and be free.",
    traps: [
      { kind: "wind", triggerZ: -5.2, z0: -5.8, z1: -8.4, side: -1 },
      { kind: "wind", triggerZ: -9.6, z0: -10.2, z1: -12.8, side: 1 },
      { kind: "collapse", triggerZ: -16.9, z0: -17.7, z1: -19.1, warnT: 1.0 },
    ],
    holes: [{ z0: -14, z1: -15.8, x0: -2, x1: 2 }],
    gate: { x: 0, z: -20 }, theme: skyTheme(12),
  },
];

// Campaign meta for the shell (ready-screen journey map + the in-run ladder).
export const CAMPAIGN_HALLS: { name: string; depth: number; abyss: boolean; zone: HallZone }[] =
  HALLS.map((h) => ({ name: h.name, depth: h.depth, abyss: !!h.abyss, zone: h.theme.zone }));
export const ABYSS_INDEX = HALLS.findIndex((h) => !!h.abyss); // 6 — the mastery gate

// THE DAILY DESCENT — one date-seeded hall, identical for every player
// worldwide. The seed only picks the LAYOUT (still zero RNG in the outcome:
// everyone plays the same authored-by-seed corridor). Deliberately accessible:
// three single traps from the gentle pool, generous spacing, no combos, no
// delayed drops, no fake gates — anyone can place; mastery lives in the campaign.
export function makeDailyHall(dateKey: string): HallDef {
  const r = rng(seedFrom("nl-daily:" + dateKey));
  const L = 26 + Math.floor(r() * 3) * 3; // 26 | 29 | 32
  const kinds: TrapKind[] = ["collapse", "spike", "crush", "fakefloor"];
  for (let i = kinds.length - 1; i > 0; i--) { // seeded shuffle → pick 3 distinct
    const j = Math.floor(r() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const slots = [-8 - r() * 1.6, -(L * 0.5 + r() * 1.6), -(L - 7) - r() * 1.2];
  const traps: TrapDef[] = [];
  for (let i = 0; i < 3; i++) {
    const z = slots[i];
    const side: 1 | -1 = r() < 0.5 ? 1 : -1;
    const k = kinds[i];
    if (k === "collapse") traps.push({ kind: "collapse", triggerZ: z + 0.8, z0: z, z1: z - 1.6 });
    else if (k === "spike") traps.push({ kind: "spike", triggerZ: z + 1.2, z0: z, z1: z - 0.8, side });
    else if (k === "crush") traps.push({ kind: "crush", triggerZ: z + 1.0, z0: z, z1: z - 1.6 });
    else traps.push({ kind: "fakefloor", triggerZ: z + 1.0, z0: z, z1: z - 2.5, side });
  }
  return {
    name: "THE DAILY DESCENT", depth: -1, daily: true, length: L, strip: 0x8fb8ff,
    beat: "one descent, the same for every soul today. walk it clean.",
    traps,
    gate: { x: 0, z: -(L - 1.6) },
    theme: {
      // The liminal dusk — the daily's own moon-silver look, no fire.
      zone: "descent", wall: 0x3e4468, ceil: 0x2b3050, floorTint: 0xffffff,
      wallEmissive: 0x24305c, wallEmissiveI: 0.07,
      hemiSky: 0xb8c8ee, hemiGround: 0x2c3048, hemiI: 4.6, dirColor: 0xd8e2ff, dirI: 3.8,
      bgTop: 0x1c2646, bgBottom: 0x090c18, fogColor: 0x131a30, fogFar: 46,
      fireLevel: 0, stripI: 0.9,
      handFill: 0xe6ecff, handFillI: 3.0, handCuff: 0x9ab8ff,
      reveal: "none",
    },
  };
}

// the Abyss mastery gate: this many flawless trial clears IN A ROW open the door
const TRIAL_CLEARS = 3;

// Live trap state machine (reset every respawn — traps re-arm, identical timing).
interface Trap {
  def: TrapDef;
  phase: "armed" | "warn" | "active" | "hold" | "retract" | "spent";
  t: number;
  told: boolean;                      // the hum/tell fired for this attempt
  tiles?: { mesh: THREE.Mesh; solid: boolean; vy: number; rx: number; rz: number }[];
  spike?: THREE.Group;
  crushL?: THREE.Mesh; crushR?: THREE.Mesh;
  shimmer?: THREE.Sprite;
  glyph?: THREE.Mesh;
  streaks?: THREE.Sprite[];           // wind: drifting gust streaks (fx only)
}

interface HandRig { group: THREE.Group; side: number }

export interface NlOptions {
  maxAscensions?: number;  // short-run hook (dev/e2e): how many halls to play
  startHall?: number;      // start-at-hall hook (Continue / journey-map replay / dev/e2e), 1-based
  comfort?: boolean;       // reduced motion: no head-bob, softer shake
  daily?: { dateKey: string }; // THE DAILY DESCENT: one date-seeded hall instead of the campaign
}

export class NetherlevelGame {
  private renderer!: THREE.WebGPURenderer;
  private look: Look | null = null;
  private governor: Governor | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
  private handAnchor = new THREE.Group();
  private hands: HandRig[] = [];

  private fxRand: () => number;      // visuals ONLY — sim outcome has no RNG
  private onState: (s: HudState) => void;
  private onEvent: (e: NlEvent) => void;
  private opts: NlOptions;
  private totalHalls: number;

  // player kinematics
  private px = 0; private py = 0; private pz = -1;
  private vx = 0; private vy = 0; private vz = 0;
  private yaw = 0; private pitch = 0;   // yaw 0 = facing down the hall (−Z)
  private grounded = true;
  private dodgeT = 0; private dodgeCd = 0; private dodgeDx = 0; private dodgeDz = 0;
  private moveX = 0; private moveZ = 0; // touch stick (−1..1); keys override
  private coyoteT = 0;
  private hopBufT = 0;
  private hopTouch = false;             // touch hops are never height-cut
  private flipT = 0;                    // look-flip curse timer
  private walkPhase = 0;
  private landDip = 0;
  private shake = 0;
  private flinchT = 0;
  private hitStop = 0;                  // freeze-frames on an impact death
  private airCarry = 1;

  // run state
  private hallIx = 0;
  private deaths = 0;
  private simT = 0;
  private mode: "run" | "dying" | "transition" | "over" = "run";
  private modeT = 0;
  private dieByFall = false;
  private banner = ""; private bannerT = 0;
  private whisper = ""; private whisperT = 0;  // story beat — never blocks the loop
  private win = false;
  // the Abyss mastery gate
  private streak = 0;          // flawless trial clears held (any death → 0)
  private relic = false;       // granted on the 3rd flawless clear
  private ascentOpen = false;  // the Ascent Door — opens the climb
  private lapReset = false;    // transition loops back to the Abyss Shrine
  private ending = false;      // the Abyss script (Relic → reveal → door) is playing
  private endingStage = 0;
  private heavenEnding = false; // the +12 finale script (the sky reveal) is playing
  private heavenStage = 0;
  private windVx = 0;          // gust push applied this step (deterministic)

  // scene per hall
  private hallGroup = new THREE.Group();
  private solids: Box[] = [];
  private trapSolids: Box[] = [];
  private traps: Trap[] = [];
  private embers: { s: THREE.Sprite; x: number; z: number; ph: number }[] = [];
  private bursts: { s: THREE.Sprite; vx: number; vy: number; vz: number; t: number; life: number }[] = [];
  private burstTex: THREE.Texture | null = null;
  private gatePortal: THREE.Mesh | null = null;
  private gateGlow: THREE.PointLight | null = null;
  private fakePortal: THREE.Mesh | null = null;
  private carryLight: THREE.PointLight | null = null;   // theme-adaptive hand fill
  private cuffMat: THREE.MeshStandardMaterial | null = null;
  private fireLights: THREE.PointLight[] = [];
  private shellMeshes: THREE.Object3D[] = []; // walls/ceiling/strips/shafts — hidden at the heaven reveal
  private bgTex: THREE.Texture | null = null;
  private heavenOn = false;

  private keySet: KeySet | null = null;
  private canvas!: HTMLCanvasElement;
  private raf = 0;
  private running = false;
  private disposed = false;
  private lastT = 0;
  private acc = 0;
  private baseDpr = 1;

  private startHallIx = 0;

  private halls: HallDef[];

  constructor(seed: number, onState: (s: HudState) => void, onEvent: (e: NlEvent) => void, opts: NlOptions = {}) {
    this.fxRand = rng(seed ^ 0x9e3779b9);
    this.onState = onState;
    this.onEvent = onEvent;
    this.opts = opts;
    // the Daily Descent swaps the campaign for one date-seeded hall
    this.halls = opts.daily ? [makeDailyHall(opts.daily.dateKey)] : HALLS;
    this.startHallIx = Math.min(this.halls.length - 1, Math.max(0, (opts.startHall ?? 1) - 1));
    this.hallIx = this.startHallIx;
    this.totalHalls = Math.min(this.halls.length, this.startHallIx + Math.max(1, opts.maxAscensions ?? this.halls.length));
    // resuming past the Abyss (Continue / map replay): the door already opened
    if (ABYSS_INDEX >= 0 && this.startHallIx > ABYSS_INDEX) this.ascentOpen = true;
  }

  async start(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = await createRenderer(canvas);
    // Filmic tone map + exposure lift — the corridor was authored too dark under
    // raw NoToneMapping; ACES keeps the neon strips from clipping while lifting mids.
    // NOTE: renderer tone mapping is deliberately NOT used — on the WebGL2
    // fallback the TSL post path renders ACESFilmic hue-INVERTED and Neutral
    // blown-white (three 0.183). Brightness comes from lights + the look lift,
    // which render identically on WebGPU and WebGL2.
    this.baseDpr = clampedDpr();
    this.camera.rotation.order = "YXZ";
    this.camera.add(this.handAnchor);
    this.scene.add(this.camera);
    this.buildHands();
    this.scene.add(this.hallGroup);
    this.buildHall(this.hallIx);

    // "Z effect" post — the kit look self-degrades to a plain render on WebGL2
    // drivers that can't run the TSL stack, so wire it unconditionally.
    try {
      this.look = setupLook(this.renderer, this.scene, this.camera, { strength: 0.35, threshold: 0.72, lift: 0.18 });
      this.governor = makeQualityGovernor(
        this.renderer, this.look,
        (dpr) => { this.renderer.setPixelRatio(dpr); this.resize(); },
        this.baseDpr, 0.35,
      );
    } catch (e) { console.warn("netherlevel look disabled", e); this.look = null; }

    this.bindInput(canvas);
    this.resize();
    window.addEventListener("resize", this.resize);

    this.enterHallBeat();
    this.running = true;
    this.lastT = performance.now();
    this.loop();
  }

  // ── public input API (wrapper touch controls + engine keys both land here) ──
  setMove(x: number, z: number) { this.moveX = clamp(x, -1, 1); this.moveZ = clamp(z, -1, 1); }
  lookBy(dx: number, dy: number) {
    if (this.mode !== "run") return;
    const s = this.flipT > 0 ? -1 : 1;
    this.yaw += dx * s;
    this.pitch = clamp(this.pitch - dy * s, -1.25, 1.25);
  }
  hop(touch = false) {
    // buffered: fires in-step when grounded OR inside the coyote window
    if (this.mode !== "run") return;
    this.hopBufT = HOP_BUFFER;
    this.hopTouch = touch;
  }
  hopRelease() {
    // variable height: release early while rising → cap the rest of the rise
    if (this.hopTouch) return;
    if (this.vy > HOP_CUT) this.vy = HOP_CUT;
  }
  dodge() {
    if (this.mode !== "run" || this.dodgeCd > 0) return;
    // step BACK along the look direction — the read-and-react escape
    this.dodgeT = DODGE_TIME;
    this.dodgeCd = DODGE_CD;
    this.dodgeDx = -Math.sin(this.yaw);
    this.dodgeDz = Math.cos(this.yaw);
    this.onEvent("dodge");
  }
  abandon() {
    if (this.mode === "over") return;
    this.finish(false);
  }

  // ── viewmodel hands — two low-poly gauntlets parented to the camera.
  // Theme-adaptive: the cuff emissive + carry fill retint per hall (cool up
  // top, ember in hell) so the hands never clash with the realm — see buildHall.
  private buildHands() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xb0a8c4, roughness: 0.7, metalness: 0.05 });
    const cuffM = new THREE.MeshStandardMaterial({ color: 0x7fd7ff, emissive: 0x7fd7ff, emissiveIntensity: 0.2, roughness: 0.4 });
    this.cuffMat = cuffM;
    const mk = (side: number): HandRig => {
      const g = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.038, 0.15), skin);
      g.add(palm);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.09), skin);
        f.position.set(-0.04 + i * 0.027, 0.004, -0.11);
        f.rotation.x = -0.22;
        g.add(f);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.07), skin);
      thumb.position.set(side * -0.063, 0, -0.03);
      thumb.rotation.y = side * 0.6;
      g.add(thumb);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.045), cuffM);
      cuff.position.set(0, 0, 0.09);
      g.add(cuff);
      g.position.set(side * 0.26, -0.24, -0.5);
      g.rotation.set(-0.35, side * -0.18, 0);
      g.scale.setScalar(0.78);
      this.handAnchor.add(g);
      return { group: g, side };
    };
    this.hands = [mk(-1), mk(1)];
    // a soft camera-carried fill so the viewmodel always reads (torch-light feel);
    // color/intensity retint per hall theme so the hands sit in the realm's light
    const carry = new THREE.PointLight(0xfff0e0, 3.0, 4, 1.4);
    carry.position.set(0, -0.05, -0.25);
    this.camera.add(carry);
    this.carryLight = carry;
  }

  // ── hall construction ──
  private tileTex(seams: boolean, sky = false): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    // sky bridges are light cloud-stone (a dark map can't be tinted lighter)
    g.fillStyle = sky ? (seams ? "#c2cede" : "#b8c4d6") : seams ? "#332a48" : "#2a2238";
    g.fillRect(0, 0, 256, 256);
    // per-tile shade variation so the floor reads as tiles, not a void
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      g.fillStyle = `rgba(255,255,255,${0.03 + ((tx + ty) % 2) * 0.05})`;
      g.fillRect(tx * 128 + 4, ty * 128 + 4, 120, 120);
    }
    g.strokeStyle = sky
      ? (seams ? "rgba(255,240,190,0.9)" : "rgba(160,180,210,0.35)")
      : seams ? "rgba(150,110,255,0.8)" : "rgba(70,58,95,0.35)";
    g.lineWidth = 4;
    for (let i = 0; i <= 256; i += 128) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  // floors repeat the tile texture at ~1 tile/meter (clone per rect, cheap)
  private floorMat(base: THREE.MeshStandardMaterial, w: number, d: number): THREE.MeshStandardMaterial {
    const m = base.clone();
    if (m.map) {
      m.map = m.map.clone();
      m.map.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2)));
      m.map.needsUpdate = true;
    }
    return m;
  }

  private addBoxMesh(b: Box, mat: THREE.Material, solid = true): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), mat);
    m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    this.hallGroup.add(m);
    if (solid) this.solids.push(b);
    return m;
  }

  // vertical background gradient (scene.background / heaven dome) — canvas, cheap
  private gradTex(top: number, bottom: number): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, cssHex(top));
    gr.addColorStop(1, cssHex(bottom));
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private grateTex(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2b1c12";
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) g.clearRect(6, 6 + i * 15, 52, 9); // slots — fire shows through
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private fireShaft(x0: number, x1: number, z0: number, z1: number, level = 1, lightY = -3) {
    const lava = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, Math.abs(z0 - z1)),
      new THREE.MeshBasicMaterial({ color: 0xff5a1e, transparent: true, opacity: 0.9 }),
    );
    lava.rotation.x = -Math.PI / 2;
    lava.position.set((x0 + x1) / 2, -7, (z0 + z1) / 2);
    this.hallGroup.add(lava);
    this.shellMeshes.push(lava);
    // pit walls so the hole reads as a shaft, not a void
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 1 });
    this.shellMeshes.push(this.addBoxMesh({ x0, x1, y0: -7, y1: -0.3, z0: z1 - 0.15, z1 }, shaftMat, false));
    this.shellMeshes.push(this.addBoxMesh({ x0, x1, y0: -7, y1: -0.3, z0, z1: z0 + 0.15 }, shaftMat, false));
    const s = Math.max(0.4, level);
    const fire = new THREE.PointLight(0xff6a22, 30 * s, 10, 1.6);
    fire.position.set((x0 + x1) / 2, lightY, (z0 + z1) / 2);
    fire.userData.base = 26 * s;
    fire.userData.amp = 7 * s;
    this.hallGroup.add(fire);
    this.fireLights.push(fire);
    const emberTex = softTex("rgba(255,160,60,1)");
    const n = Math.round(4 + 6 * Math.min(1, level));
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emberTex, color: 0xff9a40, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.06 + this.fxRand() * 0.08);
      const ex = x0 + this.fxRand() * (x1 - x0), ez = z1 + this.fxRand() * (z0 - z1);
      s.position.set(ex, -4, ez);
      this.hallGroup.add(s);
      this.embers.push({ s, x: ex, z: ez, ph: this.fxRand() * 10 });
    }
  }

  // fire grate cover: the shaft below is real (glow + embers rise through) but the
  // cover is SOLID and walkable — identical collision to plain floor, zero gameplay change
  private buildGrate(c: Hole) {
    this.solids.push({ x0: c.x0, x1: c.x1, y0: -0.3, y1: 0, z0: c.z1, z1: c.z0 });
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(c.x1 - c.x0, 0.06, c.z0 - c.z1),
      new THREE.MeshStandardMaterial({
        map: this.grateTex(), color: 0x7a675a, roughness: 0.55, metalness: 0.6,
        emissive: 0xff6a22, emissiveIntensity: 0.9, transparent: true, alphaTest: 0.5,
      }),
    );
    g.position.set((c.x0 + c.x1) / 2, -0.02, (c.z0 + c.z1) / 2);
    this.hallGroup.add(g);
    this.shellMeshes.push(g);
    // unlit fire sheet right under the bars — the slots read as open fire
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(c.x1 - c.x0, c.z0 - c.z1),
      new THREE.MeshBasicMaterial({ color: 0xff7a26 }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set((c.x0 + c.x1) / 2, -0.42, (c.z0 + c.z1) / 2);
    this.hallGroup.add(glow);
    this.shellMeshes.push(glow);
  }

  // the ending is IN-WORLD: past the Twelfth Gate the corridor dissolves — golden
  // sky, flooding warm light, clouds, and the TWELVE GATES arrayed in an arc
  // ahead. Visuals only; the score/save/shell flow is untouched.
  private revealHeaven() {
    this.heavenOn = true;
    for (const m of this.shellMeshes) m.visible = false;
    for (const e of this.embers) e.s.visible = false;
    for (const f of this.fireLights) f.visible = false;
    for (const t of this.traps) {
      if (t.tiles) for (const tile of t.tiles) tile.mesh.visible = false;
      if (t.spike) t.spike.visible = false;
      if (t.crushL) t.crushL.visible = false;
      if (t.crushR) t.crushR.visible = false;
      if (t.shimmer) t.shimmer.visible = false;
      if (t.glyph) t.glyph.visible = false;
    }
    if (this.fakePortal?.parent) this.fakePortal.parent.visible = false; // the liar dissolves too
    // the Gate itself dissolves — its additive portal right at the camera would white out the sky
    if (this.gatePortal?.parent) this.gatePortal.parent.visible = false;
    this.bgTex?.dispose();
    this.bgTex = this.gradTex(0x3f77c4, 0xd9a75c);
    this.scene.background = this.bgTex;
    this.scene.fog = new THREE.Fog(0xe6cfa0, 20, 160);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(55, 24, 16),
      new THREE.MeshBasicMaterial({ map: this.gradTex(0x3f77c4, 0xd9a75c), side: THREE.BackSide, fog: false }),
    );
    dome.position.set(this.px, 0, this.pz);
    this.hallGroup.add(dome);
    this.hallGroup.add(new THREE.HemisphereLight(0xfff6dd, 0xe8d0a8, 1.7));
    const sun = new THREE.DirectionalLight(0xffedb8, 1.3);
    sun.position.set(4, 12, this.pz + 6);
    this.hallGroup.add(sun);
    const cloudTex = softTex("rgba(255,255,255,1)");
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xfff4e0, transparent: true, opacity: 0.55, depthWrite: false }));
      s.scale.set(9 + this.fxRand() * 8, 3.5 + this.fxRand() * 2.5, 1);
      const ang = this.fxRand() * Math.PI * 2;
      s.position.set(this.px + Math.cos(ang) * (10 + this.fxRand() * 14), 3 + this.fxRand() * 7, this.pz + Math.sin(ang) * (10 + this.fxRand() * 14));
      this.hallGroup.add(s);
    }
    // THE TWELVE GATES — a golden arc ahead of the Pilgrim (frames only, no
    // extra lights: the hemi+sun above carry the scene)
    const R = 13;
    for (let i = 0; i < 12; i++) {
      const a = ((i - 5.5) / 5.5) * 0.9; // spread ±~52° across the forward arc
      const gx = this.px + Math.sin(a) * R;
      const gz = this.pz - Math.cos(a) * R;
      this.makeGate(gx, gz, a, 0xffd985, 0);
    }
    // the sun at the arc's heart
    const sun2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex("rgba(255,244,214,1)"), color: 0xfff0b8, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    sun2.scale.set(20, 20, 1);
    sun2.position.set(this.px, 10, this.pz - 30);
    this.hallGroup.add(sun2);
  }

  // small pooled-ish sprite bursts (dust/debris/impact) — fx stream only, capped
  private spawnBurst(x: number, y: number, z: number, color: number, n: number, speed: number) {
    if (!this.burstTex) this.burstTex = softTex("rgba(255,255,255,1)");
    const count = this.opts.comfort ? Math.ceil(n / 2) : n; // reduced motion = fewer particles
    for (let i = 0; i < count; i++) {
      if (this.bursts.length > 70) break;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.burstTex, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.05 + this.fxRand() * 0.07);
      s.position.set(x, y, z);
      this.scene.add(s);
      const a = this.fxRand() * Math.PI * 2;
      this.bursts.push({ s, vx: Math.cos(a) * speed * this.fxRand(), vy: 0.6 + this.fxRand() * speed, vz: Math.sin(a) * speed * this.fxRand(), t: 0, life: 0.45 + this.fxRand() * 0.35 });
    }
  }

  private makeShimmer(x: number, y: number, z: number, color: number): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex("rgba(255,255,255,0.9)"), color, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, z);
    s.scale.set(1.6, 1.0, 1);
    this.hallGroup.add(s);
    return s;
  }

  private makeGate(x: number, z: number, yawY: number, color: number, glowI = 22): { portal: THREE.Mesh; glow: THREE.PointLight } {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x241c34, roughness: 0.5, metalness: 0.4 });
    const g = new THREE.Group();
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, 0.3), frameMat); pl.position.set(-0.95, 1.45, 0);
    const pr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, 0.3), frameMat); pr.position.set(0.95, 1.45, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.3), frameMat); lintel.position.set(0, 2.95, 0);
    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.7),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    portal.position.set(0, 1.4, 0);
    const glow = new THREE.PointLight(color, glowI, 9, 1.5);
    glow.position.set(0, 1.6, 0.6);
    g.add(pl, pr, lintel, portal);
    if (glowI > 0) g.add(glow); // the ending's gate ARC skips 12 extra lights
    g.position.set(x, 0, z);
    g.rotation.y = yawY;
    this.hallGroup.add(g);
    return { portal, glow };
  }

  private buildHall(ix: number) {
    // tear down the previous hall completely (three does not GC GPU resources)
    this.disposeTree(this.scene, this.hallGroup);
    this.hallGroup = new THREE.Group();
    this.scene.add(this.hallGroup);
    this.solids = [];
    this.trapSolids = [];
    this.traps = [];
    this.embers = [];
    this.fireLights = [];
    this.gatePortal = null;
    this.gateGlow = null;
    this.fakePortal = null;
    this.shellMeshes = [];

    const H = this.halls[ix];
    const T = H.theme;
    const L = H.length;
    // theme-adaptive hands: warm ember fill + cuff in hell, cooler up top
    if (this.carryLight) { this.carryLight.color.setHex(T.handFill); this.carryLight.intensity = T.handFillI; }
    if (this.cuffMat) { this.cuffMat.color.setHex(T.handCuff); this.cuffMat.emissive.setHex(T.handCuff); }
    this.scene.fog = new THREE.Fog(T.fogColor, 5, T.fogFar);
    this.bgTex?.dispose();
    this.bgTex = this.gradTex(T.bgTop, T.bgBottom);
    this.scene.background = this.bgTex;

    const sky = T.zone === "sky";
    const open = !!T.open;
    const floorBase = new THREE.MeshStandardMaterial({ map: this.tileTex(true, sky), color: T.floorTint, roughness: 0.85 });
    const wallMat = new THREE.MeshStandardMaterial({ color: T.wall, roughness: 0.9, emissive: T.wallEmissive, emissiveIntensity: T.wallEmissiveI });
    const ceilMat = new THREE.MeshStandardMaterial({ color: T.ceil, roughness: 1, emissive: T.wallEmissive, emissiveIntensity: T.wallEmissiveI * 0.7 });
    const floor = (b: Box) => this.addBoxMesh(b, this.floorMat(floorBase, b.x1 - b.x0, b.z1 - b.z0));

    // floor: full corridor minus every hole (open pits + trap bands + fire grates cut it)
    const grates = H.grates ?? [];
    const grateSet = new Set<Hole>(grates);
    const cuts: Hole[] = [...(H.holes ?? []), ...grates];
    for (const t of H.traps) {
      if (t.kind === "collapse") cuts.push({ z0: t.z0, z1: t.z1, x0: t.x0 ?? -HALL_W / 2, x1: t.x1 ?? HALL_W / 2 });
      if (t.kind === "fakefloor") cuts.push({ z0: t.z0, z1: t.z1, x0: -HALL_W / 2, x1: 0.8 * (t.side ?? 1) });
    }
    cuts.sort((a, b) => b.z0 - a.z0);
    let zCursor = 2; // a little floor behind the spawn
    for (const c of cuts) {
      if (c.z0 < zCursor) floor({ x0: -HALL_W / 2, x1: HALL_W / 2, y0: -0.3, y1: 0, z0: c.z0, z1: zCursor });
      // side strips beside a partial-width cut (the safe ledge)
      if (c.x0 > -HALL_W / 2) floor({ x0: -HALL_W / 2, x1: c.x0, y0: -0.3, y1: 0, z0: c.z1, z1: c.z0 });
      if (c.x1 < HALL_W / 2) floor({ x0: c.x1, x1: HALL_W / 2, y0: -0.3, y1: 0, z0: c.z1, z1: c.z0 });
      // grate fires sit their light just ABOVE the floor so the glow paints the
      // hall — in the sky a gap is just open air (the long fall to Earth)
      if (!sky) this.fireShaft(c.x0, c.x1, c.z0, c.z1, grateSet.has(c) ? T.fireLevel : 1, grateSet.has(c) ? 0.35 : -3);
      if (grateSet.has(c)) this.buildGrate(c);
      zCursor = c.z1;
    }
    floor({ x0: -HALL_W / 2, x1: HALL_W / 2, y0: -0.3, y1: 0, z0: -L, z1: zCursor });

    const wx = HALL_W / 2;
    if (!open) {
      // walls + ceiling (right wall splits around the alcove when present) —
      // collected as shell so the heaven finale can dissolve the corridor away
      const shell = (b: Box, m: THREE.Material) => this.shellMeshes.push(this.addBoxMesh(b, m));
      shell({ x0: -wx - 0.3, x1: -wx, y0: 0, y1: WALL_H, z0: -L, z1: 2 }, wallMat);
      const a = H.alcove;
      if (a && a.side === 1) {
        shell({ x0: wx, x1: wx + 0.3, y0: 0, y1: WALL_H, z0: a.z0, z1: 2 }, wallMat);
        shell({ x0: wx, x1: wx + 0.3, y0: 0, y1: WALL_H, z0: -L, z1: a.z1 }, wallMat);
        // the alcove pocket: floor, back wall, side walls
        floor({ x0: wx, x1: wx + a.depth, y0: -0.3, y1: 0, z0: a.z1, z1: a.z0 });
        shell({ x0: wx + a.depth, x1: wx + a.depth + 0.3, y0: 0, y1: WALL_H, z0: a.z1, z1: a.z0 }, wallMat);
        shell({ x0: wx, x1: wx + a.depth + 0.3, y0: 0, y1: WALL_H, z0: a.z0, z1: a.z0 + 0.3 }, wallMat);
        shell({ x0: wx, x1: wx + a.depth + 0.3, y0: 0, y1: WALL_H, z0: a.z1 - 0.3, z1: a.z1 }, wallMat);
        shell({ x0: wx, x1: wx + a.depth, y0: WALL_H, y1: WALL_H + 0.3, z0: a.z1, z1: a.z0 }, ceilMat);
      } else {
        shell({ x0: wx, x1: wx + 0.3, y0: 0, y1: WALL_H, z0: -L, z1: 2 }, wallMat);
      }
      shell({ x0: -wx - 0.3, x1: wx + 0.3, y0: WALL_H, y1: WALL_H + 0.3, z0: -L, z1: 2 }, ceilMat);
      shell({ x0: -wx, x1: wx, y0: 0, y1: WALL_H, z0: -L - 0.3, z1: -L }, wallMat); // end cap
      shell({ x0: -wx, x1: wx, y0: 0, y1: WALL_H, z0: 2, z1: 2.3 }, wallMat);       // behind spawn
    }

    // neon seam strips — the realm accent. Open halls keep only the floor-level
    // pair: they become the EDGE markers of the bridge (read your footing).
    const stripMat = new THREE.MeshBasicMaterial({ color: H.strip });
    for (const sx of [-wx + 0.02, wx - 0.02]) {
      if (!open) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, L + 2), stripMat);
        s.position.set(sx, 2.6, -L / 2 + 1);
        this.hallGroup.add(s);
        this.shellMeshes.push(s);
      }
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, L + 2), stripMat);
      f.position.set(sx, 0.04, -L / 2 + 1);
      this.hallGroup.add(f);
      this.shellMeshes.push(f);
    }

    // sky dressing: still clouds around/below the bridge + a high sun glow.
    // Static sprites — zero per-frame cost; the wind is felt via the gust traps.
    if (sky) {
      const cloudTex = softTex("rgba(255,255,255,1)");
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.4 + this.fxRand() * 0.25, depthWrite: false }));
        s.scale.set(7 + this.fxRand() * 9, 2.6 + this.fxRand() * 2.4, 1);
        const side = this.fxRand() > 0.5 ? 1 : -1;
        s.position.set(side * (5 + this.fxRand() * 11), -3 + this.fxRand() * 8, -this.fxRand() * L);
        this.hallGroup.add(s);
      }
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex("rgba(255,244,214,1)"), color: 0xfff2c8, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      sun.scale.set(14, 14, 1);
      sun.position.set(3, 14, -L - 12);
      this.hallGroup.add(sun);
    }

    // pillared slalom: cloud-marble columns on the bridge — one instanced draw,
    // AABB solids matching the visual (weave between them; wind makes it bite)
    if (H.pillars?.length) {
      const inst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.5, 2.6, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x5f7294, roughness: 0.9, emissive: 0x1c3050, emissiveIntensity: 0.12 }),
        H.pillars.length,
      );
      const m4 = new THREE.Matrix4();
      H.pillars.forEach((p, i) => { m4.setPosition(p.x, 1.3, p.z); inst.setMatrixAt(i, m4); });
      inst.instanceMatrix.needsUpdate = true;
      this.hallGroup.add(inst);
      this.shellMeshes.push(inst);
      for (const p of H.pillars) this.solids.push({ x0: p.x - 0.25, x1: p.x + 0.25, y0: 0, y1: 2.6, z0: p.z - 0.25, z1: p.z + 0.25 });
    }

    // corridor lighting: per-zone hemi base + key + optional hell rim + accent points
    this.hallGroup.add(new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemiI));
    const down = new THREE.DirectionalLight(T.dirColor, T.dirI);
    down.position.set(0.5, 6, 2);
    this.hallGroup.add(down);
    if (T.rimI) {
      // ember glare from deep down the hall — the hell read
      const rim = new THREE.DirectionalLight(T.rimColor ?? 0xff2e12, T.rimI);
      rim.position.set(0, 2, -L - 4);
      this.hallGroup.add(rim);
      this.shellMeshes.push(rim);
    }
    for (let z = -5; z > -L; z -= 7) {
      // stripI dims the accent wash where neon must yield to ember (the hell read)
      const p = new THREE.PointLight(H.strip, 26 * (T.stripI ?? 1), 13, 1.7);
      p.position.set(0, 2.7, z);
      this.hallGroup.add(p);
      this.shellMeshes.push(p);
    }

    // Shrine — the checkpoint pylon at the hall mouth
    const shrine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2440, emissive: 0x7fd7ff, emissiveIntensity: 0.5, roughness: 0.5 }));
    shrine.position.set(-1.5, 0.75, -0.6);
    shrine.rotation.y = 0.5;
    this.hallGroup.add(shrine);
    const sGlow = new THREE.PointLight(0x7fd7ff, 5, 5, 2);
    sGlow.position.set(-1.5, 1.4, -0.6);
    this.hallGroup.add(sGlow);

    // the Gate (real) — and the liar, when this hall has one. In the Abyss the
    // Gate is the LOCKED Ascent Door: cold dark red until the trial is mastered.
    const gateYaw = H.alcove ? -Math.PI / 2 : 0;
    const locked = !!H.abyss && !this.ascentOpen;
    const gate = this.makeGate(H.gate.x, H.gate.z, gateYaw, locked ? 0xb81f0c : 0xffd24a);
    this.gatePortal = gate.portal;
    this.gateGlow = gate.glow;
    if (locked) { (gate.portal.material as THREE.MeshBasicMaterial).opacity = 0.45; gate.glow.intensity = 10; }
    if (H.fakeGate) this.fakePortal = this.makeGate(H.fakeGate.x, H.fakeGate.z, 0, 0xffd24a).portal;

    // traps
    for (const def of H.traps) this.traps.push(this.buildTrap(def));
  }

  private buildTrap(def: TrapDef): Trap {
    const trap: Trap = { def, phase: "armed", t: 0, told: false };
    const midZ = (def.z0 + def.z1) / 2;
    const sky = this.halls[this.hallIx].theme.zone === "sky";
    if (def.kind === "collapse") {
      // cracked tiles bridge the cut — solid until they hinge away underfoot
      // (x0/x1 narrow the band: the false-safe ledge tiles). Sky: cloud crumble.
      const mat = sky
        ? new THREE.MeshStandardMaterial({ map: this.tileTex(true, true), roughness: 0.9, emissive: 0x9ecbff, emissiveIntensity: 0.06 })
        : new THREE.MeshStandardMaterial({ map: this.tileTex(true), roughness: 0.85, emissive: 0xff5a1e, emissiveIntensity: 0.04 });
      trap.tiles = [];
      const bx0 = def.x0 ?? -HALL_W / 2, bx1 = def.x1 ?? HALL_W / 2;
      const rows = 2, cols = Math.max(1, Math.round(bx1 - bx0));
      const dz = (def.z0 - def.z1) / rows, dx = (bx1 - bx0) / cols;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x0 = bx0 + c * dx, z0 = def.z0 - r * dz;
        const m = new THREE.Mesh(new THREE.BoxGeometry(dx - 0.04, 0.24, dz - 0.04), mat);
        m.position.set(x0 + dx / 2, -0.12, z0 - dz / 2);
        this.hallGroup.add(m);
        trap.tiles.push({ mesh: m, solid: true, vy: 0, rx: (this.fxRand() - 0.5) * 2, rz: (this.fxRand() - 0.5) * 2 });
      }
      trap.shimmer = this.makeShimmer((bx0 + bx1) / 2, 0.25, midZ, 0xff8a4a);
    } else if (def.kind === "spike") {
      const side = def.side ?? 1;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, def.z0 - def.z1), new THREE.MeshStandardMaterial({ color: 0x241c30, roughness: 0.4, metalness: 0.5 }));
      body.position.y = 1.2;
      g.add(body);
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccdd, roughness: 0.25, metalness: 0.8, emissive: 0x445, emissiveIntensity: 0.3 });
      for (let i = 0; i < 4; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8), spikeMat);
        cone.rotation.z = side * Math.PI / 2;
        cone.position.set(side * -0.85, 0.5 + i * 0.55, 0);
        g.add(cone);
      }
      g.position.set(side * 2.75, 0, midZ);
      this.hallGroup.add(g);
      trap.spike = g;
      trap.shimmer = this.makeShimmer(side * 1.8, 1.4, midZ, 0xaad4ff);
    } else if (def.kind === "fakefloor") {
      // the lie: tiles with NO neon seams (the hindsight tell) — never solid.
      // Sky: vapor — a cloud slab that looks like the bridge but holds nothing.
      const mat = new THREE.MeshStandardMaterial({ map: this.tileTex(false, sky), roughness: 0.95 });
      const x1 = 0.8 * (def.side ?? 1);
      mat.map!.repeat.set(Math.max(1, Math.round((x1 + HALL_W / 2) / 2)), Math.max(1, Math.round((def.z0 - def.z1) / 2)));
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - -HALL_W / 2, 0.24, def.z0 - def.z1), mat);
      m.position.set((-HALL_W / 2 + x1) / 2, -0.12, midZ);
      this.hallGroup.add(m);
      trap.shimmer = this.makeShimmer(-0.6, 0.2, midZ, 0xb7a7ff);
    } else if (def.kind === "crush") {
      const mat = new THREE.MeshStandardMaterial({ color: 0x352a48, roughness: 0.6, metalness: 0.3, emissive: 0xff5a3c, emissiveIntensity: 0.08 });
      const len = def.z0 - def.z1;
      trap.crushL = new THREE.Mesh(new THREE.BoxGeometry(0.35, WALL_H, len), mat);
      trap.crushL.position.set(-2.35, WALL_H / 2, midZ);
      trap.crushR = new THREE.Mesh(new THREE.BoxGeometry(0.35, WALL_H, len), mat);
      trap.crushR.position.set(2.35, WALL_H / 2, midZ);
      this.hallGroup.add(trap.crushL, trap.crushR);
      trap.shimmer = this.makeShimmer(0, 1.6, midZ, 0xff6a5a);
    } else if (def.kind === "lookflip") {
      const glyphTex = softTex("rgba(190,120,255,1)");
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.8, 24),
        new THREE.MeshBasicMaterial({ map: glyphTex, color: 0xb46bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.02, midZ);
      this.hallGroup.add(m);
      trap.glyph = m;
    } else if (def.kind === "fakegate") {
      trap.shimmer = this.makeShimmer(0, 1.2, def.z0 + 0.6, 0xff4a3c);
      if (trap.shimmer) (trap.shimmer.material as THREE.SpriteMaterial).opacity = 0.05;
    } else if (def.kind === "wind") {
      // gust streaks: long white sprites that build through the warn then race
      // toward the push side — the read is unmistakable, the push is deterministic
      const tex = softTex("rgba(255,255,255,0.9)");
      trap.streaks = [];
      const side = def.side ?? 1;
      const n = this.opts.comfort ? 8 : 12; // comfort mode = fewer particles
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xf4faff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.set(2.0 + this.fxRand() * 1.2, 0.07 + this.fxRand() * 0.05, 1);
        s.position.set(-side * 2 + this.fxRand() * 1.5 * -side, 0.4 + this.fxRand() * 1.9, def.z1 + this.fxRand() * (def.z0 - def.z1));
        s.userData.ph = this.fxRand() * 4;
        this.hallGroup.add(s);
        trap.streaks.push(s);
      }
      trap.shimmer = this.makeShimmer(0, 1.2, midZ, 0xcfe8ff);
    }
    return trap;
  }

  // ── the deterministic sim step ──
  private step(dt: number) {
    if (this.mode === "over") return;
    this.simT += this.mode === "run" ? dt : 0;
    this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.bannerT === 0) this.banner = "";
    this.whisperT = Math.max(0, this.whisperT - dt);
    if (this.whisperT === 0) this.whisper = "";
    this.flipT = Math.max(0, this.flipT - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);

    if (this.mode === "dying") {
      this.modeT += dt;
      if (this.dieByFall) { this.vy -= GRAV * dt; this.py += this.vy * dt; }
      else this.pitch = Math.max(-1.35, this.pitch - dt * 3.2); // crumple: face the floor
      // an edge-fall in the open sky is a LONG fall — let the drop land
      const dieT = this.dieByFall && this.halls[this.hallIx].theme.open ? 1.35 : 0.85;
      if (this.modeT >= dieT) this.respawn();
      return;
    }
    if (this.mode === "transition") {
      this.modeT += dt;
      if (this.heavenEnding) { this.stepHeaven(); return; }
      if (this.ending) { this.stepEnding(); return; }
      if (this.lapReset) {
        // a flawless clear loops back to the Abyss Shrine — the trial re-arms identically
        if (this.modeT >= 1.3) {
          this.lapReset = false;
          this.rearmTraps();
          this.resetPlayer();
          this.mode = "run";
          this.setBanner(`THE TRIAL RE-ARMS — ${this.streak}/${TRIAL_CLEARS} HELD`, 1.8);
        }
        return;
      }
      if (this.modeT >= 1.1) {
        this.hallIx++;
        if (this.hallIx >= this.totalHalls) { this.finish(true); return; }
        this.buildHall(this.hallIx);
        this.resetPlayer();
        this.mode = "run";
        this.enterHallBeat();
      }
      return;
    }

    // movement input: keyboard overrides the touch stick when held
    const k = this.keySet;
    let mx = this.moveX, mz = this.moveZ;
    if (k) {
      let kx = 0, kz = 0;
      if (k.has("a")) kx -= 1;
      if (k.has("d")) kx += 1;
      if (k.has("w")) kz += 1;
      if (k.has("s")) kz -= 1;
      if (kx !== 0 || kz !== 0) { mx = kx; mz = kz; }
      // arrow keys = deterministic look (also the e2e-drivable path)
      const ls = this.flipT > 0 ? -1 : 1;
      if (k.has("arrowleft")) this.yaw -= 1.9 * dt * ls;
      if (k.has("arrowright")) this.yaw += 1.9 * dt * ls;
      if (k.has("arrowup")) this.pitch = clamp(this.pitch + 1.4 * dt * ls, -1.25, 1.25);
      if (k.has("arrowdown")) this.pitch = clamp(this.pitch - 1.4 * dt * ls, -1.25, 1.25);
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const carry = this.grounded ? 1 : this.airCarry;
    const tvx = (fx * mz + rx * mx) * WALK * carry;
    const tvz = (fz * mz + rz * mx) * WALK * carry;
    const accel = this.grounded ? ACCEL_G : ACCEL_A;
    this.vx = approach(this.vx, tvx, accel * dt);
    this.vz = approach(this.vz, tvz, accel * dt);
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.vx = this.dodgeDx * DODGE_SPEED;
      this.vz = this.dodgeDz * DODGE_SPEED;
    }

    // coyote + buffered hop (platformer-physics standard: forgiving AND tight)
    this.coyoteT = this.grounded ? COYOTE : Math.max(0, this.coyoteT - dt);
    this.hopBufT = Math.max(0, this.hopBufT - dt);
    if (this.hopBufT > 0 && (this.grounded || this.coyoteT > 0)) {
      this.hopBufT = 0;
      this.coyoteT = 0;
      this.vy = HOP_VY;
      this.grounded = false;
      this.airCarry = HOP_BOOST;
      // hop from a standstill still carries: snap to full hop speed along held input
      if (ml > 0.3) {
        this.vx = (fx * mz + rx * mx) / Math.max(1, ml) * WALK * HOP_BOOST;
        this.vz = (fz * mz + rz * mx) / Math.max(1, ml) * WALK * HOP_BOOST;
      }
      this.spawnBurst(this.px, 0.1, this.pz, 0x8a7fb8, 4, 1.2);
      this.onEvent("hop");
    }

    this.vy -= GRAV * (this.vy < 0 ? FALL_MULT : 1) * dt;
    if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;

    // wind gusts: a deterministic lateral push while inside an active band —
    // read the warn, then brace (counter-strafe wins) or wait the gust out.
    // The push RAMPS in and eases out (envelope on sim time) — readable, never a snap.
    this.windVx = 0;
    for (const t of this.traps) {
      if (t.def.kind !== "wind" || t.phase !== "active") continue;
      if (this.pz <= t.def.z0 + 0.4 && this.pz >= t.def.z1 - 0.4) this.windVx += (t.def.side ?? 1) * WIND_PUSH * windEnv(t.t);
    }

    this.moveAndCollide(dt);
    this.walkPhase += Math.hypot(this.vx, this.vz) * dt * 2.0;

    this.stepTraps(dt);
    this.checkKills();
    this.checkGates();
  }

  private allSolids(): Box[] { return this.trapSolids.length ? [...this.solids, ...this.trapSolids] : this.solids; }

  private overlaps(b: Box): boolean {
    return this.px - PW < b.x1 && this.px + PW > b.x0 &&
      this.py < b.y1 && this.py + PH > b.y0 &&
      this.pz - PW < b.z1 && this.pz + PW > b.z0;
  }

  private moveAndCollide(dt: number) {
    // rebuild dynamic solids (collapse tiles that are still standing)
    this.trapSolids = [];
    for (const t of this.traps) {
      if (t.def.kind === "collapse" && t.tiles) {
        for (const tile of t.tiles) {
          if (!tile.solid) continue;
          const p = tile.mesh.position;
          const g = tile.mesh.geometry as THREE.BoxGeometry;
          const hw = g.parameters.width / 2, hd = g.parameters.depth / 2;
          this.trapSolids.push({ x0: p.x - hw, x1: p.x + hw, y0: -0.3, y1: 0, z0: p.z - hd, z1: p.z + hd });
        }
      }
    }
    const solids = this.allSolids();

    const pushX = this.vx + this.windVx; // gust push rides the same collision path
    this.px += pushX * dt;
    for (const b of solids) if (this.overlaps(b)) this.px = pushX > 0 ? b.x0 - PW : b.x1 + PW;
    this.pz += this.vz * dt;
    for (const b of solids) if (this.overlaps(b)) this.pz = this.vz > 0 ? b.z0 - PW : b.z1 + PW;
    this.py += this.vy * dt;
    const wasAir = !this.grounded;
    this.grounded = false;
    for (const b of solids) {
      if (!this.overlaps(b)) continue;
      if (this.vy <= 0 && this.py < b.y1 && this.py + PH > b.y1) {
        if (wasAir && this.vy < -4) {
          this.landDip = 0.12;
          this.spawnBurst(this.px, 0.08, this.pz, 0x6a5f8a, 6, 1.5);
          this.onEvent("land");
        }
        this.py = b.y1; this.vy = 0; this.grounded = true; this.airCarry = 1;
      } else if (this.vy > 0) {
        this.py = b.y0 - PH; this.vy = 0;
      }
    }
  }

  private stepTraps(dt: number) {
    for (const t of this.traps) {
      const d = t.def;
      // the tell: a hum + shimmer flare when the Pilgrim draws near, once
      if (!t.told && t.phase === "armed" && this.pz <= d.triggerZ + 3.2 && this.pz > d.z1 - 2) {
        t.told = true;
        this.onEvent("tell");
      }
      const inTrigger = this.pz <= d.triggerZ && this.pz >= d.z1 - 1.5;
      // x-banded collapse (false-safe tiles) only fires under the Pilgrim's feet
      const inBandX = d.x0 === undefined || (this.px >= d.x0 - 0.3 && this.px <= (d.x1 ?? HALL_W / 2) + 0.3);
      switch (d.kind) {
        case "collapse": {
          if (t.phase === "armed" && inTrigger && inBandX) { t.phase = "warn"; t.t = 0; this.flinchT = 0.4; this.onEvent("trap"); this.shakeBy(0.06); }
          else if (t.phase === "warn") {
            t.t += dt;
            for (const tile of t.tiles!) tile.mesh.position.y = -0.12 + Math.sin(t.t * 60 + tile.rx * 9) * 0.02;
            // warnT > default = the delayed drop: it holds… then lets go under you
            if (t.t >= (d.warnT ?? 0.42)) { t.phase = "active"; t.t = 0; for (const tile of t.tiles!) tile.solid = false; this.shakeBy(0.12); this.spawnBurst(((d.x0 ?? -HALL_W / 2) + (d.x1 ?? HALL_W / 2)) / 2, 0.2, (d.z0 + d.z1) / 2, 0xff7a3c, 10, 2); }
          } else if (t.phase === "active") {
            t.t += dt;
            for (const tile of t.tiles!) {
              tile.vy += GRAV * dt;
              tile.mesh.position.y -= tile.vy * dt;
              tile.mesh.rotation.x += tile.rx * dt * 1.6;
              tile.mesh.rotation.z += tile.rz * dt * 1.6;
            }
            if (t.t > 1.4) { t.phase = "spent"; for (const tile of t.tiles!) tile.mesh.visible = false; }
          }
          break;
        }
        case "spike": {
          const side = d.side ?? 1;
          const rest = side * 2.75, out = side * -0.55;
          if (t.phase === "armed" && inTrigger) { t.phase = "warn"; t.t = 0; this.flinchT = 0.4; this.onEvent("trap"); }
          else if (t.phase === "warn") { t.t += dt; if (t.t >= 0.34) { t.phase = "active"; t.t = 0; this.shakeBy(0.1); this.spawnBurst((d.side ?? 1) * 1.6, 1.2, (d.z0 + d.z1) / 2, 0xaad4ff, 6, 2.2); } }
          else if (t.phase === "active") { t.t += dt; t.spike!.position.x = lerp(rest, out, Math.min(1, t.t / 0.11)); if (t.t >= 0.11) { t.phase = "hold"; t.t = 0; } }
          else if (t.phase === "hold") { t.t += dt; if (t.t >= 0.38) { t.phase = "retract"; t.t = 0; } }
          else if (t.phase === "retract") { t.t += dt; t.spike!.position.x = lerp(out, rest, Math.min(1, t.t / 0.5)); if (t.t >= 0.5) t.phase = "spent"; }
          break;
        }
        case "crush": {
          const restL = -2.35, outL = -0.45, restR = 2.35, outR = 0.45;
          if (t.phase === "armed" && inTrigger) { t.phase = "warn"; t.t = 0; this.flinchT = 0.4; this.onEvent("trap"); }
          else if (t.phase === "warn") {
            t.t += dt;
            const j = Math.sin(t.t * 55) * 0.02;
            t.crushL!.position.x = restL + j; t.crushR!.position.x = restR - j;
            this.shake = Math.max(this.shake, 0.02);
            if (t.t >= 0.66) { t.phase = "active"; t.t = 0; this.shakeBy(0.2); this.spawnBurst(0, 1.4, (d.z0 + d.z1) / 2, 0xff6a5a, 8, 2.4); }
          } else if (t.phase === "active") {
            t.t += dt;
            const u = Math.min(1, t.t / 0.13);
            t.crushL!.position.x = lerp(restL, outL, u); t.crushR!.position.x = lerp(restR, outR, u);
            if (u >= 1) { t.phase = "hold"; t.t = 0; }
          } else if (t.phase === "hold") { t.t += dt; if (t.t >= 0.9) { t.phase = "retract"; t.t = 0; } }
          else if (t.phase === "retract") {
            t.t += dt;
            const u = Math.min(1, t.t / 1.1);
            t.crushL!.position.x = lerp(outL, restL, u); t.crushR!.position.x = lerp(outR, restR, u);
            if (u >= 1) t.phase = "spent";
          }
          break;
        }
        case "lookflip": {
          if (t.phase === "armed" && this.pz <= d.triggerZ && this.pz >= d.z1) {
            t.phase = "spent";
            this.flipT = 1.6;
            this.onEvent("flip");
          }
          break;
        }
        case "wind": {
          // one-shot gust: a LONG multi-channel warn (streaks, edge vignette,
          // rising sound, lean), then the push ramps through the band.
          // Wait it out from solid ground, or brace and cross — pure read+react.
          if (t.phase === "armed" && this.pz <= d.triggerZ + WIND_LEAD && this.pz >= d.z1 - 3) { t.phase = "warn"; t.t = 0; this.onEvent("windwarn"); }
          else if (t.phase === "warn") {
            t.t += dt;
            if (t.t >= WIND_WARN) {
              t.phase = "active"; t.t = 0;
              this.shakeBy(0.05);
              this.spawnBurst(-(d.side ?? 1) * 1.6, 1.2, (d.z0 + d.z1) / 2, 0xdfefff, 8, 2.6);
              this.onEvent("gust");
            }
          }
          else if (t.phase === "active") { t.t += dt; if (t.t >= WIND_ACTIVE) t.phase = "spent"; }
          break;
        }
        case "fakegate": {
          const H = this.halls[this.hallIx];
          if (!H.fakeGate) break;
          const dist = Math.hypot(this.px - H.fakeGate.x, this.pz - H.fakeGate.z);
          if (t.phase === "armed" && dist < 1.7) { t.phase = "warn"; t.t = 0; this.flinchT = 0.4; this.onEvent("trap"); this.shakeBy(0.15); }
          else if (t.phase === "warn") {
            t.t += dt;
            if (this.fakePortal) (this.fakePortal.material as THREE.MeshBasicMaterial).color.setHex(0xff3c2a);
            if (t.t >= 0.3) { t.phase = "active"; t.t = 0; }
          } else if (t.phase === "active") {
            t.t += dt;
            if (dist < 1.9) this.die(false);
            if (t.t >= 0.5) t.phase = "spent";
          }
          break;
        }
      }
    }
  }

  private killBoxes(): Box[] {
    const out: Box[] = [];
    for (const t of this.traps) {
      const d = t.def;
      if (d.kind === "spike" && (t.phase === "active" || t.phase === "hold")) {
        const gx = t.spike!.position.x;
        out.push({ x0: gx - 1.0, x1: gx + 1.0, y0: 0, y1: 2.4, z0: d.z1, z1: d.z0 });
      }
      if (d.kind === "crush" && (t.phase === "active" || t.phase === "hold")) {
        for (const m of [t.crushL!, t.crushR!]) out.push({ x0: m.position.x - 0.2, x1: m.position.x + 0.2, y0: 0, y1: WALL_H, z0: d.z1, z1: d.z0 });
      }
    }
    return out;
  }

  private checkKills() {
    if (this.py < KILL_Y) { this.die(true); return; }
    for (const b of this.killBoxes()) if (this.overlaps(b)) { this.die(false); return; }
  }

  private checkGates() {
    const H = this.halls[this.hallIx];
    // the Ascent Door is a full-threshold doorway (no flanking alcove walls),
    // so its trigger is generously wide; corridor Gates stay tight (1.0)
    const r = H.abyss ? 1.9 : 1.0;
    if (Math.hypot(this.px - H.gate.x, this.pz - H.gate.z) < r) {
      if (H.abyss) { this.abyssGate(H); return; }
      this.mode = "transition";
      this.modeT = 0;
      const finale = this.hallIx + 1 >= this.totalHalls;
      if (finale && H.theme.reveal === "sky") {
        // THE TWELFTH GATE — the ending: the corridor dissolves into Heaven
        this.heavenEnding = true;
        this.heavenStage = 0;
        this.revealHeaven();
        this.onEvent("gate");
        return;
      }
      // numbered gates on the heaven stretch; plain Gates below
      this.setBanner(H.depth > 0 ? `THE ${GATE_ORD[H.depth - 1]} GATE OPENS` : "THE GATE OPENS", 1.4);
      this.spawnBurst(H.gate.x, 1.5, H.gate.z, 0xffd24a, 14, 2.2);
      this.onEvent("gate");
    }
  }

  // the Abyss mastery gate: reaching the Ascent Door = one flawless clear held.
  // 3 in a row (no death) → the Relic + the reveal + the door opens (the ending).
  private abyssGate(H: HallDef) {
    this.streak++;
    this.mode = "transition";
    this.modeT = 0;
    this.spawnBurst(H.gate.x, 1.5, H.gate.z, 0xffd24a, 14, 2.2);
    if (this.streak >= TRIAL_CLEARS) {
      this.ending = true;
      this.endingStage = 0;
      this.onEvent("gate");
    } else {
      this.lapReset = true;
      this.setBanner(`FLAWLESS — ${this.streak}/${TRIAL_CLEARS}`, 1.6);
      this.onEvent("trial");
    }
  }

  // the Abyss script: Relic → the Adversary's reveal → the Ascent Door opens →
  // and the run CONTINUES INTO THE ASCENT (the climb out). Timed on modeT (sim time).
  private stepEnding() {
    if (this.endingStage === 0 && this.modeT >= 0.2) {
      this.endingStage = 1;
      this.relic = true;
      this.setBanner("THE RELIC IS YOURS", 2.0);
      this.onEvent("relic");
    } else if (this.endingStage === 1 && this.modeT >= 2.4) {
      this.endingStage = 2;
      this.setBanner("THE FIRST LIE WAS YOUR OWN", 2.2);
      this.whisper = "the Adversary bows. you faced what dropped you.";
      this.whisperT = 4.4;
      this.onEvent("beat");
    } else if (this.endingStage === 2 && this.modeT >= 4.8) {
      this.endingStage = 3;
      this.openAscentDoor();
      this.setBanner("THE ASCENT DOOR OPENS", 2.2);
      this.onEvent("ascent");
    } else if (this.endingStage === 3 && this.modeT >= 7.2) {
      this.endingStage = 4;
      this.setBanner("YOUR ASCENSION BEGINS", 2.2);
    } else if (this.endingStage === 4 && this.modeT >= 9.4) {
      // through the Ascent Door — the climb out begins (−6 → 0 → +12).
      // Short runs capped by ?asc= still end here (score stays honest).
      this.ending = false;
      this.hallIx++;
      if (this.hallIx >= this.totalHalls) { this.finish(true); return; }
      this.buildHall(this.hallIx);
      this.resetPlayer();
      this.mode = "run";
      this.enterHallBeat();
    }
  }

  // the +12 finale: the Twelfth Gate → the sky floods in → ASCENSION → shell.
  // The reveal itself fired in checkGates (revealHeaven) — this scripts the beats.
  private stepHeaven() {
    if (this.heavenStage === 0 && this.modeT >= 0.3) {
      this.heavenStage = 1;
      this.setBanner("THE TWELFTH GATE OPENS", 2.2);
    } else if (this.heavenStage === 1 && this.modeT >= 2.8) {
      this.heavenStage = 2;
      this.setBanner("THE SKY FLOODS IN", 2.2);
      this.whisper = "you fell. you faced what dropped you. you climbed.";
      this.whisperT = 4.6;
      this.onEvent("beat");
    } else if (this.heavenStage === 2 && this.modeT >= 5.6) {
      this.heavenStage = 3;
      this.setBanner("ASCENSION — THE PILGRIM IS FREE", 2.6);
      this.onEvent("heaven");
    } else if (this.heavenStage === 3 && this.modeT >= 8.8) {
      this.finish(true);
    }
  }

  private openAscentDoor() {
    this.ascentOpen = true;
    const H = this.halls[this.hallIx];
    if (this.gatePortal) (this.gatePortal.material as THREE.MeshBasicMaterial).color.setHex(0xfff2c0);
    if (this.gateGlow) {
      this.gateGlow.color.setHex(0xffe9a0);
      this.gateGlow.intensity = 60;
      this.gateGlow.distance = 18;
    }
    this.spawnBurst(H.gate.x, 1.6, H.gate.z, 0xfff2c0, 18, 2.8);
    this.shakeBy(0.18);
  }

  private enterHallBeat() {
    const H = this.halls[this.hallIx];
    const z = H.theme.zone;
    const label = H.abyss ? "THE ABYSS — THE TRIAL OF THREE"
      : H.daily ? `THE DAILY DESCENT — ${H.name === "THE DAILY DESCENT" ? "TODAY'S LIE" : H.name}`
      : z === "ascent" ? `▲ ASCENT −${Math.abs(H.depth)} — ${H.name}`
      : z === "earth" ? `▲ EARTH — ${H.name}`
      : z === "sky" ? `▲ ASCENT +${H.depth} — ${H.name}`
      : `▼ DESCENT −${Math.abs(H.depth)} — ${H.name}`;
    this.setBanner(label, 2.6);
    if (H.beat) {
      this.whisper = H.beat;
      this.whisperT = 4.2;
      this.onEvent("beat");
    }
  }

  private die(byFall: boolean) {
    if (this.mode !== "run") return;
    this.mode = "dying";
    this.modeT = 0;
    this.dieByFall = byFall;
    this.deaths++;
    if (!byFall) { this.vy = 0; this.hitStop = 0.11; } // impact deaths get freeze-frames
    this.flinchT = 0.5;
    this.shakeBy(0.3);
    const fwdX = Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    this.spawnBurst(this.px + fwdX * 0.6, this.py + 1.2, this.pz + fwdZ * 0.6, 0xff4a3c, 14, 2.6);
    // in the Abyss any death SHATTERS the flawless streak back to 0/3
    if (this.halls[this.hallIx].abyss && this.streak > 0) {
      this.streak = 0;
      this.setBanner(`THE STREAK SHATTERS — 0/${TRIAL_CLEARS}`, 1.6);
      this.onEvent("streakbreak");
    } else {
      this.setBanner("THE PILGRIM PERISHES", 1.2);
    }
    this.onEvent("death");
  }

  // sprite-safe teardown: kit disposeObject would dispose three's SHARED Sprite
  // geometry (module-level in three), breaking every later sprite draw — skip it.
  private disposeTree(parent: THREE.Object3D, o?: THREE.Object3D) {
    if (!o) return;
    parent.remove(o);
    o.traverse((c) => {
      if (!(c as THREE.Sprite).isSprite) (c as THREE.Mesh).geometry?.dispose?.();
      const mat = (c as THREE.Mesh).material as (THREE.Material & { map?: THREE.Texture }) | undefined;
      if (mat) { mat.map?.dispose?.(); mat.dispose?.(); }
    });
  }

  // every trap re-arms — identical timing on every attempt (the fairness gate)
  private rearmTraps() {
    const keep = this.traps.map((t) => t.def);
    for (const t of this.traps) {
      if (t.tiles) for (const tile of t.tiles) this.disposeTree(this.hallGroup, tile.mesh);
      if (t.streaks) for (const s of t.streaks) this.disposeTree(this.hallGroup, s);
      this.disposeTree(this.hallGroup, t.spike);
      this.disposeTree(this.hallGroup, t.crushL);
      this.disposeTree(this.hallGroup, t.crushR);
      this.disposeTree(this.hallGroup, t.shimmer);
      this.disposeTree(this.hallGroup, t.glyph);
    }
    this.traps = keep.map((d) => this.buildTrap(d));
    if (this.fakePortal) (this.fakePortal.material as THREE.MeshBasicMaterial).color.setHex(0xffd24a);
  }

  private respawn() {
    this.resetPlayer();
    this.rearmTraps();
    this.mode = "run";
    // the Abyss respawn is the Abyss Shrine — the descent is never replayed
    this.setBanner(this.halls[this.hallIx].abyss ? "THE ABYSS SHRINE HOLDS YOU — AGAIN" : "YOUR SOUL RETURNS TO THE SHRINE", 1.6);
    this.onEvent("respawn");
  }

  private resetPlayer() {
    this.px = 0; this.py = 0; this.pz = -1;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.grounded = true;
    this.dodgeT = 0;
    this.flipT = 0;
    this.moveX = 0; this.moveZ = 0;
  }

  private finish(win: boolean) {
    this.mode = "over";
    this.win = win;
    this.banner = "";
    this.onEvent(win ? "win" : "death");
    this.emit();
  }

  private score(): number {
    // counts only halls actually played (?hall= dev starts stay honest);
    // deterministic, dominated by fewest deaths (−250 each ≈ a minute of time)
    const cleared = (this.win ? this.totalHalls : this.hallIx) - this.startHallIx;
    const base = cleared * 800;
    const bonus = this.win ? Math.max(0, 6400 - this.deaths * 250 - Math.floor(this.simT) * 4) : 0;
    return base + bonus;
  }

  // the gust telegraph read: sign = push direction, |v| rises through the warn,
  // full during the blow (envelope). Drives the HUD vignette + camera lean + FOV.
  private windRead(): number {
    let w = 0;
    for (const t of this.traps) {
      if (t.def.kind !== "wind") continue;
      const side = t.def.side ?? 1;
      if (t.phase === "warn") w += side * (0.2 + 0.5 * Math.min(1, t.t / WIND_WARN));
      else if (t.phase === "active") w += side * windEnv(t.t);
    }
    return clamp(w, -1, 1);
  }

  private setBanner(b: string, t: number) { this.banner = b; this.bannerT = t; }
  private shakeBy(s: number) { this.shake = Math.max(this.shake, this.opts.comfort ? s * 0.35 : s); }

  private emit() {
    const ix = Math.min(this.hallIx, this.totalHalls - 1);
    const H = this.halls[ix];
    this.onState({
      phase: this.mode === "over" ? "over" : "running",
      ascension: ix + 1,
      totalAscensions: this.totalHalls,
      hallName: H.name,
      depth: H.depth,
      zone: H.theme.zone,
      daily: !!H.daily,
      abyss: !!H.abyss,
      streak: this.streak,
      relic: this.relic,
      whisper: this.whisper,
      deaths: this.deaths,
      timeSec: this.simT,
      distToGate: Math.max(0, Math.round(Math.hypot(this.px - H.gate.x, this.pz - H.gate.z) * 10) / 10),
      score: this.score(),
      banner: this.banner,
      flip: this.flipT > 0,
      wind: this.mode === "run" ? this.windRead() : 0,
      win: this.win,
    });
  }

  // ── visuals (real-dt, never touches the sim) ──
  private updateVisuals(real: number, now: number) {
    // camera from the mover
    const bob = this.opts.comfort ? 0 : Math.sin(this.walkPhase * 2) * 0.03;
    this.landDip = Math.max(0, this.landDip - real * 0.5);
    let cy = this.py + EYE + bob - this.landDip;
    let roll = 0;
    if (this.mode === "dying") {
      if (this.dieByFall) roll = Math.min(1, this.modeT * 2.2) * 0.8;
      else cy = this.py + lerp(EYE, 0.5, Math.min(1, this.modeT * 2.4));
    }
    let pitchUp = 0;
    if (this.heavenEnding) {
      // the ending: a slow, calm rise — eyes drift to the sky (comfort-aware)
      const u = this.opts.comfort ? 0.5 : 1;
      cy += Math.min(1.6, this.modeT * 0.28) * u;
      pitchUp = Math.min(0.3, this.modeT * 0.055) * u;
    }
    // gust telegraph: a subtle lean into the push + a slight FOV swell (visuals
    // only — comfort mode softens the lean and skips the FOV entirely)
    const wind = this.mode === "run" ? this.windRead() : 0;
    if (wind !== 0) roll += -wind * 0.05 * (this.opts.comfort ? 0.4 : 1);
    if (!this.opts.comfort) {
      const f = 72 + Math.abs(wind) * 4;
      if (Math.abs(this.camera.fov - f) > 0.05) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
    }
    this.camera.position.set(this.px, cy, this.pz);
    this.camera.rotation.set(this.pitch + pitchUp, -this.yaw, roll);
    if (this.shake > 0.002) {
      this.camera.position.x += Math.sin(now * 0.09) * this.shake;
      this.camera.position.y += Math.cos(now * 0.077) * this.shake * 0.7;
      this.shake *= Math.exp(-6 * real);
    }

    // hands: idle sway + walk bob, flinch on trap/death, reach near the Gate
    this.flinchT = Math.max(0, this.flinchT - real);
    const H = this.halls[Math.min(this.hallIx, this.totalHalls - 1)];
    const gateDist = Math.hypot(this.px - H.gate.x, this.pz - H.gate.z);
    const reach = clamp(1 - gateDist / 3, 0, 1);
    const flinch = clamp(this.flinchT / 0.5, 0, 1);
    // portrait phones have a narrow horizontal FOV — tuck the hands inward
    const handX = Math.min(0.26, 0.12 + 0.09 * this.camera.aspect);
    for (const h of this.hands) {
      const g = h.group;
      const swayY = Math.sin(this.walkPhase + h.side) * 0.014 + Math.sin(now * 0.0016) * 0.004;
      const swayX = Math.cos(this.walkPhase * 0.5) * 0.008 * h.side;
      let tx = h.side * handX + swayX, ty = -0.24 + swayY, tz = -0.5;
      let rx = -0.35, rz = 0;
      if (!this.grounded) { ty += 0.03; rx = -0.6; }             // brace on a hop
      tz += reach * -0.1; ty += reach * 0.05; rx += reach * 0.3; // reach for the Threshold
      if (flinch > 0) {                                          // recoil to the face
        ty += flinch * 0.16; tz += flinch * 0.14; rx += flinch * 0.9; rz = h.side * flinch * 0.5;
      }
      g.position.set(tx, ty, tz);
      g.rotation.set(rx, h.side * -0.18, rz);
    }

    // embers rise + flicker; fire lights breathe; shimmers pulse
    for (const e of this.embers) {
      const u = ((now * 0.00045 + e.ph) % 1 + 1) % 1;
      e.s.position.set(e.x + Math.sin(now * 0.001 + e.ph * 7) * 0.2, -6.5 + u * 7.5, e.z);
      (e.s.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - u);
    }
    for (const f of this.fireLights) f.intensity = ((f.userData.base as number) ?? 26) + Math.sin(now * 0.006 + f.position.z) * ((f.userData.amp as number) ?? 7);
    // burst particles: drift, light gravity, fade out, dispose on expiry
    for (const b of this.bursts) {
      b.t += real;
      b.vy -= 5 * real;
      b.s.position.x += b.vx * real;
      b.s.position.y += b.vy * real;
      b.s.position.z += b.vz * real;
      (b.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.9 * (1 - b.t / b.life));
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.t < b.life) return true;
      this.scene.remove(b.s);
      (b.s.material as THREE.Material).dispose(); // map is the shared burstTex — kept
      return false;
    });
    for (const t of this.traps) {
      if (t.shimmer) {
        const base = t.def.kind === "fakegate" ? 0.05 : 0.1;
        (t.shimmer.material as THREE.SpriteMaterial).opacity = t.phase === "armed" ? base + (t.told ? 0.1 : 0.02) * (1 + Math.sin(now * 0.008)) : 0;
      }
      if (t.glyph && t.phase === "armed") (t.glyph.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(now * 0.005) * 0.2;
      if (t.streaks) {
        // gust streaks: build through the warn (brighter + faster as the gust
        // nears), then scream across while the wind blows — the directional read
        const on = t.phase === "warn" || t.phase === "active";
        const side = t.def.side ?? 1;
        const u = Math.min(1, t.t / WIND_WARN); // warn build-up 0..1
        for (const s of t.streaks) {
          const m = s.material as THREE.SpriteMaterial;
          if (!on) { if (m.opacity > 0) m.opacity = Math.max(0, m.opacity - real * 2); continue; }
          m.opacity = t.phase === "active" ? 0.85 : 0.2 + 0.45 * u;
          s.position.x += side * (t.phase === "active" ? 9 : 3 + 3.5 * u) * real;
          if (side > 0 ? s.position.x > 3 : s.position.x < -3) s.position.x = -side * 3;
        }
      }
    }
    if (this.gatePortal) {
      const gm = this.gatePortal.material as THREE.MeshBasicMaterial;
      if (H.abyss && !this.ascentOpen) gm.opacity = 0.4 + Math.sin(now * 0.0018) * 0.1; // locked Ascent Door: slow dark pulse
      else if (this.ascentOpen) gm.opacity = 0.95 + Math.sin(now * 0.006) * 0.05;       // opened: blazing
      else gm.opacity = 0.75 + Math.sin(now * 0.003) * 0.12;
    }
    // the liar flickers — the hindsight tell
    if (this.fakePortal) (this.fakePortal.material as THREE.MeshBasicMaterial).opacity = 0.7 + (Math.sin(now * 0.021) > 0.6 ? -0.35 : 0.15);
  }

  // ── main loop: fixed-step sim, real-dt visuals, governed render ──
  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let real = (now - this.lastT) / 1000;
    this.lastT = now;
    if (real > 0.05) real = 0.05; // clamp stalls; sim just advances less
    if (this.hitStop > 0) {
      // freeze-frames on an impact death — the "it connects" beat
      this.hitStop -= real;
    } else {
      this.acc += real;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 8) { this.step(SIM_DT); this.acc -= SIM_DT; steps++; }
      if (steps === 8) this.acc = 0;
    }
    if (this.mode !== "over") this.emit();
    this.updateVisuals(real, now);
    this.governor?.sample(real);
    this.renderFrame();
  };

  private renderFrame() {
    if (this.look) {
      try { this.look.render(); }
      catch { try { this.look.dispose(); } catch {} this.look = null; this.renderer.render(this.scene, this.camera); }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ── input ──
  private lookId: number | null = null;
  private lookLastX = 0; private lookLastY = 0;
  private lookStartX = 0; private lookStartY = 0; private lookStartT = 0;

  private bindInput(canvas: HTMLCanvasElement) {
    this.keySet = makeKeySet();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === " ") this.hop();
    else if (k === "shift") this.dodge();
  };
  private onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") this.hopRelease(); };

  private onPointerDown = (e: PointerEvent) => {
    if (this.lookId !== null) return;
    this.lookId = e.pointerId;
    this.lookLastX = this.lookStartX = e.clientX;
    this.lookLastY = this.lookStartY = e.clientY;
    this.lookStartT = performance.now();
    this.canvas.setPointerCapture?.(e.pointerId);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.lookId) return;
    const sens = e.pointerType === "touch" ? 0.006 : 0.0042;
    this.lookBy((e.clientX - this.lookLastX) * sens, (e.clientY - this.lookLastY) * sens);
    this.lookLastX = e.clientX;
    this.lookLastY = e.clientY;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.lookId) return;
    this.lookId = null;
    const moved = Math.hypot(e.clientX - this.lookStartX, e.clientY - this.lookStartY);
    if (moved < 10 && performance.now() - this.lookStartT < 240) this.hop(true); // tap = hop (full height)
  };

  private resize = () => {
    if (!this.renderer) return;
    const w = this.canvas?.clientWidth || window.innerWidth;
    const h = this.canvas?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keySet?.dispose();
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    }
    for (const b of this.bursts) { try { this.scene.remove(b.s); (b.s.material as THREE.Material).dispose(); } catch {} }
    this.bursts = [];
    try { this.burstTex?.dispose(); } catch {}
    try { this.bgTex?.dispose(); } catch {}
    for (const o of [...this.scene.children]) { try { this.disposeTree(this.scene, o); } catch {} }
    try { this.look?.dispose(); } catch {}
    try { this.renderer?.dispose(); } catch {}
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// gust strength over its life: ramp in, hold, ease out — pure function of sim time
const windEnv = (t: number) => Math.min(1, t / WIND_RAMP) * clamp((WIND_ACTIVE - t) / 0.4, 0, 1);
const cssHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (v: number, target: number, maxStep: number) =>
  v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);
