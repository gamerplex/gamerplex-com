// VRFC — Virtual Reality Fighting Championship. WebGPU Muay Thai in a neon
// boxing ring: two primitive-built fighters (no gltf), procedural strike
// timelines (startup → active → recovery) across the eight limbs, block/dodge,
// stamina + combo scoring, best-of-3 rounds vs a seeded AI. Follows the
// gamerplex web stack: three/webgpu, mobile budget (DPR<=2, clamped dt),
// deterministic seeded AI (challenge-link replayable), additive glow + a soft
// stylized post stack (bloom/warm-grade/vignette) shared with PLG.

import * as THREE from "three/webgpu";
import { rng } from "./frame";
import { setupLook, type Look } from "./look";

export type StrikeId = "jab" | "cross" | "hook" | "elbow" | "knee" | "kick";

export interface HudState {
  phase: "fighting" | "over";
  score: number;
  round: number;
  roundTime: number;
  playerHp: number;
  oppHp: number;
  stamina: number;
  combo: number;
  playerRounds: number;
  oppRounds: number;
  banner: string;
  win: boolean;
}

const C = {
  RING_R: 3.2,           // circular playable radius on the mat (xz)
  MIN_SEP: 0.95,
  ADVANCE_SPEED: 2.0,    // along the facing line (closer/farther)
  CIRCLE_SPEED: 2.0,     // perpendicular (orbit the opponent)
  ROUND_TIME: 60,
  ROUNDS_TO_WIN: 2,
  MAX_ROUNDS: 3,
  HP_MAX: 100,
  ST_MAX: 100,
  ST_REGEN: 20,
  BLOCK_DMG_MUL: 0.2,
  DODGE_TIME: 0.34,
  DODGE_CD: 0.9,
  STUN_TIME: 0.26,
  KNOCKBACK: 0.10,       // base clean-hit push (per unit of damage adds more)
  KNOCKBACK_PER_DMG: 0.016,
  BLOCK_PUSH: 0.05,
  HURT_HEAD_R: 0.34,    // hurtbox radii (world units) — tip must physically reach
  HURT_BODY_R: 0.42,
  HURT_LOW_R: 0.4,
  CONTACT_EPS: 0.14,    // small forgiveness so a well-placed strike connects
  COMBO_WINDOW: 2.4,
  CHAIN_WINDOW: 0.5,     // seconds after a strike ends to continue a combo chain
  CHAIN_SPEED: 1.15,     // chained strikes play back slightly faster (the flow reward)
  STEP_IN: 0.9,          // auto step-in drift (u/s) during a strike's startup
  KO_BONUS: 500,
  ROUND_BONUS: 250,
  WIN_BONUS: 500,
};

// ── procedural pose system — flat numeric records so we can lerp everything ──
// Left arm = lead, right arm = rear (orthodox stance). Right leg = rear (power
// side): rear cross, roundhouse kick and knee all drive off the right side, hip
// and rear-heel rotating through — authentic Muay Thai mechanics.
type Pose = {
  slx: number; sly: number; slz: number; elx: number;  // left shoulder(x,y,z) + elbow
  srx: number; sry: number; srz: number; erx: number;  // right shoulder(x,y,z) + elbow
  hlx: number; hlz: number; klx: number;               // left hip(x,z) + knee
  hrx: number; hrz: number; krx: number;               // right hip(x,z) + knee
  tw: number; ln: number;                              // torso twist(y) / lean(+back,-fwd)
  lg: number; cr: number;                              // lunge fwd(local z) / crouch(dip)
  by: number; rise: number;                            // whole-body yaw / vertical rise (pivot & knees)
};

// Authentic Muay Thai high guard: upper arms hang with elbows DOWN and tucked to
// the ribs, forearms folded up near-vertical so each glove sits beside its own
// temple (fists ~x±0.30, y~1.79 vs head at y~1.86 — beside the cheekbones, NOT
// crossed in front of the face), chin tucked, shoulders a touch raised.
const GUARD: Pose = {
  slx: -0.85, sly: -0.06, slz: 0.30, elx: -2.75,   // lead (left): elbow down, forearm up
  srx: -0.85, sry: 0.06, srz: -0.30, erx: -2.75,   // rear (right): mirror
  hlx: 0.02, hlz: 0.05, klx: 0.14,
  hrx: -0.12, hrz: -0.05, krx: 0.22,
  tw: 0.14, ln: -0.08, lg: 0, cr: 0.02, by: 0, rise: 0,
};
// Cover-up: gloves squeeze tighter in front of the face (still not crossed),
// elbows pinched to shield the ribs/liver, a small dip behind the shell, and the
// rear shin lifts a touch — the Muay Thai shin-check that also defends low kicks.
const BLOCK: Pose = { ...GUARD, slx: -0.95, slz: 0.42, elx: -2.85, srx: -0.95, srz: -0.42, erx: -2.85, cr: 0.06, ln: -0.02, tw: 0, hrx: -0.5, krx: 0.7 };
const DODGE: Pose = { ...GUARD, ln: 0.62, cr: 0.12, lg: -0.3, tw: 0.05 };

const pose = (p: Partial<Pose>): Pose => ({ ...GUARD, ...p });

type TipId = "fistL" | "fistR" | "elbTip" | "kneeTip" | "footTip";

// A strike is an ordered keyframe timeline (chamber → impact → follow-through →
// recover). `d` is the seconds spent easing INTO that keyframe from the previous
// one. `impact:true` marks the frame whose START is the hit window — reach/damage
// resolve there, so limbs travel through a real arc before contact.
interface KeyFrame { p: Pose; d: number; impact?: boolean }
// target = which hurtbox the strike aims at (contact resolves against it):
// "auto" = nearest of head/body (fists/elbows), "head"/"body"/"low" for kicks.
type HitTarget = "auto" | "head" | "body" | "low";
interface StrikeDef { frames: KeyFrame[]; range: number; dmg: number; st: number; tip: TipId; target: HitTarget }

// Build the guard→…→guard timeline; the last frame always returns to GUARD.
// `recover` = how fast the limb comes home (straights SNAP back, kicks swing).
const strike = (range: number, dmg: number, st: number, tip: TipId, frames: KeyFrame[], target: HitTarget = "auto", recover = 0.16): StrikeDef =>
  ({ range, dmg, st, tip, target, frames: [...frames, { p: GUARD, d: recover }] });

// The art of eight limbs. Each move poses the WHOLE body with real mechanics.
// PUNCH DOCTRINE: straights fire FROM THE GUARD in a straight line at shoulder
// height — no wind-up, no outward swing; the elbow stays down/behind the fist
// through extension and the fist snaps straight back along the same line.
// Power is BODY rotation (tw) + hip/heel pivot (by) + a small lunge (lg).
const STRIKES: Record<StrikeId, StrikeDef> = {
  // Lead straight (jab): chin-line out, minimal body turn, fastest, snaps home.
  jab: strike(1.6, 6, 7, "fistL", [
    { p: pose({ slx: -1.32, slz: 0.18, elx: -1.5, tw: 0.2, lg: 0.08 }), d: 0.045 },        // fist leaves the guard, elbow trailing under it
    { p: pose({ slx: -1.57, sly: 0.05, slz: 0.1, elx: -0.06, tw: 0.34, lg: 0.16, cr: 0.03 }), d: 0.055, impact: true }, // full extension at shoulder height, lead shoulder covers the chin
    { p: pose({ slx: -1.3, slz: 0.2, elx: -1.7, tw: 0.22, lg: 0.05 }), d: 0.07 },          // snap straight back along the same line
  ], "auto", 0.09),
  // Rear straight (cross): same straight line, but the whole rear side drives —
  // hip + shoulder rotate through (tw), rear heel pivots up (by), weight forward.
  cross: strike(1.75, 11, 11, "fistR", [
    { p: pose({ srx: -1.32, srz: -0.18, erx: -1.5, tw: -0.05, by: 0.1, lg: 0.1 }), d: 0.055 }, // fires from guard as the hips begin turning
    { p: pose({ srx: -1.57, sry: -0.05, srz: -0.1, erx: -0.06, tw: -0.55, by: 0.34, lg: 0.28, cr: 0.04 }), d: 0.065, impact: true }, // extension down the centerline, heel up
    { p: pose({ srx: -1.3, srz: -0.2, erx: -1.7, tw: -0.2, by: 0.12, lg: 0.08 }), d: 0.08 }, // straight back to guard
  ], "auto", 0.1),
  // Lead hook — the ONE horizontal-arc punch: elbow lifts level BEHIND the fist
  // (fist never drops below the guard), arm locks ~90°, the BODY pivot whips it.
  hook: strike(1.35, 14, 14, "fistL", [
    { p: pose({ slx: -1.5, sly: -0.35, slz: 0.12, elx: -1.75, tw: 0.3, by: 0.1 }), d: 0.07 },  // elbow up level, fist stays guard-high
    { p: pose({ slx: -1.5, sly: 0.95, slz: 0.35, elx: -1.65, tw: -0.45, by: -0.26, lg: 0.14 }), d: 0.08, impact: true }, // horizontal arc through on the foot pivot
    { p: pose({ slx: -1.35, sly: 0.2, slz: 0.25, elx: -2.1, tw: -0.1, by: -0.06 }), d: 0.08 },
  ], "auto", 0.11),
  // Elbow (sok): tight diagonal slashing elbow, elbow leads with shoulder high,
  // sharp compact rotation, very short range, high damage.
  elbow: strike(1.05, 16, 15, "elbTip", [
    { p: pose({ srx: -2.5, sry: -0.5, srz: 0.5, erx: -2.6, tw: 0.34, by: -0.1 }), d: 0.06 }, // raise elbow, coil
    { p: pose({ srx: -2.35, sry: 1.0, srz: 0.2, erx: -2.7, tw: -0.7, by: 0.32, lg: 0.22, cr: 0.03 }), d: 0.08, impact: true }, // slash diagonally down/across
    { p: pose({ srx: -2.2, sry: 0.3, srz: 0.25, erx: -2.5, tw: -0.15, by: 0.08 }), d: 0.11 },
  ]),
  // Knee (khao): pull the guard DOWN with both hands, drive rear knee up-and-
  // forward, THRUST hips, rise onto the ball of the support foot, toe down.
  knee: strike(1.15, 16, 16, "kneeTip", [
    { p: pose({ slx: -1.2, slz: -0.5, elx: -1.7, srx: -1.2, srz: 0.5, erx: -1.7, hrx: -0.6, krx: 1.2, cr: 0.06 }), d: 0.08 }, // clinch-pull + chamber
    { p: pose({ hrx: -2.0, hrz: -0.1, krx: 2.3, ln: -0.28, lg: 0.24, rise: 0.16, slx: -1.0, slz: -0.7, elx: -1.9, srx: -1.0, srz: 0.7, erx: -1.9 }), d: 0.1, impact: true }, // spear knee up, hips thrust, on the ball of the foot
    { p: pose({ hrx: -0.9, krx: 1.0, ln: -0.05, rise: 0.04 }), d: 0.12 },
  ]),
  // Roundhouse (te tat) — the money shot (BODY / mid by default). Support foot
  // pivots and the WHOLE body rotates through ~60° (by sweeps), rear leg swings a
  // HORIZONTAL arc from the hip with the SHIN as contact (not a snap-kick), arms
  // counter-rotate. Full turn-through on a miss, then recover to guard.
  kick: strike(2.1, 22, 22, "footTip", [
    { p: pose({ by: -0.28, tw: 0.28, hrx: -0.3, hrz: -0.9, krx: 0.5, slx: -1.6, slz: -0.5, srx: -2.2, srz: 0.6, ln: 0.05 }), d: 0.09 }, // step + coil, chamber the leg to the side
    { p: pose({ by: 0.55, tw: -0.6, hrx: -1.7, hrz: -0.75, krx: 0.25, ln: 0.22, lg: 0.34, slx: -0.7, sly: -0.6, slz: 0.9, srx: -2.6, sry: 0.9, srz: -0.2 }), d: 0.13, impact: true }, // shin whips through the arc INTO the target, body turns, arms counter-rotate
    { p: pose({ by: 1.05, tw: -0.5, hrx: -0.2, hrz: -0.9, krx: 0.6, slx: -1.7, srx: -1.7 }), d: 0.12 }, // full turn-through (or miss follow-through)
  ], "body"),
};

// Kick height variants, selected by the up/down movement modifier at strike time.
// body = STRIKES.kick. HIGH roundhouse to the head (higher arc, +dmg/+st, slower);
// LOW kick chops the lead leg/thigh (fast, less dmg). Each resolves contact
// against its matching hurtbox, so a head kick only lands if the shin reaches it.
const KICK_VARIANTS: Record<"head" | "body" | "low", StrikeDef> = {
  body: STRIKES.kick,
  // HIGH roundhouse (te tat sung) — leg swings up high, shin to the head.
  head: strike(2.15, 26, 30, "footTip", [
    { p: pose({ by: -0.3, tw: 0.3, hrx: -0.5, hrz: -0.8, krx: 0.4, slx: -1.6, slz: -0.5, srx: -2.2, srz: 0.6, ln: 0.06 }), d: 0.11 }, // deeper chamber, load the pivot
    { p: pose({ by: 0.5, tw: -0.6, hrx: -2.5, hrz: -0.5, krx: 0.15, ln: 0.1, lg: 0.3, slx: -0.6, sly: -0.7, slz: 1.0, srx: -2.7, sry: 1.0, srz: -0.3 }), d: 0.16, impact: true }, // shin arcs UP to head height
    { p: pose({ by: 1.1, tw: -0.55, hrx: -0.4, hrz: -0.8, krx: 0.6, slx: -1.7, srx: -1.7 }), d: 0.14 }, // full turn-through
  ], "head"),
  // LOW kick (te tat lang) — fast chop to the lead thigh, minimal chamber.
  low: strike(1.9, 13, 14, "footTip", [
    { p: pose({ by: -0.2, tw: 0.2, hrx: -0.3, hrz: -0.7, krx: 0.6, slx: -1.6, srx: -1.9, ln: 0.05 }), d: 0.07 }, // quick load
    { p: pose({ by: 0.45, tw: -0.5, hrx: -0.9, hrz: -1.0, krx: 0.5, ln: 0.15, lg: 0.3, slx: -1.0, srx: -2.2, sry: 0.5 }), d: 0.1, impact: true }, // shin chops low into the thigh
    { p: pose({ by: 0.7, tw: -0.3, hrx: -0.2, hrz: -0.7, krx: 0.6 }), d: 0.1 },
  ], "low"),
};

// Rear uppercut — chain-only (no dedicated button): a small knee dip drops the
// rear fist to the rib line with the elbow DOWN, then legs + hips drive it
// straight UP under the chin (fist rotating up, rise onto the ball of the foot).
const UPPERCUT: StrikeDef = strike(1.2, 15, 13, "fistR", [
  { p: pose({ srx: -0.6, srz: -0.2, erx: -2.1, cr: 0.13, tw: 0.24, by: -0.08, ln: 0.05 }), d: 0.06 }, // dip + drop the fist, elbow tucked
  { p: pose({ srx: -1.5, srz: -0.12, erx: -1.7, cr: 0, rise: 0.12, tw: -0.5, by: 0.28, lg: 0.3, ln: -0.14 }), d: 0.08, impact: true }, // drive up under the chin
  { p: pose({ srx: -1.05, srz: -0.2, erx: -2.2, tw: -0.15, by: 0.08, lg: 0.1 }), d: 0.09 },
], "head", 0.12);

// The punch-tap combo chain: rhythmic taps of the punch input flow a real
// kickboxing combination instead of repeating the jab.
type ChainId = StrikeId | "uppercut";
const CHAIN: ChainId[] = ["jab", "cross", "hook", "uppercut"];
const chainDef = (id: ChainId): StrikeDef => (id === "uppercut" ? UPPERCUT : STRIKES[id]);

const lerpPose = (out: Pose, a: Pose, b: Pose, t: number) => {
  for (const k of Object.keys(a) as (keyof Pose)[]) out[k] = a[k] + (b[k] - a[k]) * t;
};
const smooth = (t: number) => t * t * (3 - 2 * t);

// Total duration of a strike timeline (sum of per-frame ease-in times).
const strikeDur = (d: StrikeDef) => d.frames.reduce((s, f) => s + f.d, 0);
// The impact frame's START time (the hit window opens here).
const strikeImpactT = (d: StrikeDef) => {
  let t = 0;
  for (const f of d.frames) { if (f.impact) return t; t += f.d; }
  return t;
};
// The hit window CLOSES at the impact frame's end (+ a tiny tail): contact is
// tested every frame in between, so the strike lands at the true moment the
// animated limb physically reaches the target — or whiffs if it never does.
const strikeActiveEnd = (d: StrikeDef) => {
  let t = 0;
  for (const f of d.frames) { if (f.impact) return t + f.d + 0.04; t += f.d; }
  return t;
};

// Soft radial sprite texture (module-level so buildRig can use it too).
function radialTex(inner: string, outer = "rgba(0,0,0,0)"): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// ── fighter rig — primitives only, pivots at joints so poses are rotations ──
interface Rig {
  root: THREE.Group; tilt: THREE.Group; torso: THREE.Group; head: THREE.Mesh;
  shL: THREE.Group; elL: THREE.Group; shR: THREE.Group; elR: THREE.Group;
  hipL: THREE.Group; kneeL: THREE.Group; hipR: THREE.Group; kneeR: THREE.Group;
  tips: Record<TipId, THREE.Object3D>;
  tipGlow: Record<TipId, THREE.Sprite>;
}

function buildRig(accent: number, glove: number, skinHex: number): Rig {
  const skin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.65, metalness: 0.05 });
  const trunks = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.5 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: glove, emissive: glove, emissiveIntensity: 0.25, roughness: 0.4 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x222430, roughness: 0.8 });

  const root = new THREE.Group();
  const tilt = new THREE.Group(); // KO-fall + lunge pivot
  root.add(tilt);

  // Lean, athletic build. Joint pivots (hip 0.98, knee -0.44, shoulder 0.72,
  // elbow -0.32) and tip offsets are UNCHANGED so the animations line up — only
  // the meshes hanging off them are reshaped/tapered.
  const leg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx, 0.98, 0);
    const glute = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skin);   // hip/quad top mass
    glute.position.y = -0.03; glute.scale.set(1, 0.8, 1);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.34, 5, 12), skin); // longer, leaner
    thigh.position.y = -0.22; thigh.scale.set(1, 1, 0.92);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    const kneecap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    kneecap.position.y = 0.02;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 5, 12), skin);   // thinner than thigh
    shin.position.y = -0.2;
    const calf = new THREE.Mesh(new THREE.SphereGeometry(0.066, 10, 8), skin);         // slight calf swell
    calf.position.set(0, -0.16, -0.03); calf.scale.set(1, 1.5, 1);
    const ankleWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 10), wrap);
    ankleWrap.position.y = -0.36;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.24), skin);
    foot.position.set(0, -0.44, 0.06);
    knee.add(kneecap, shin, calf, ankleWrap, foot);
    hip.add(glute, thigh, knee);
    tilt.add(hip);
    return { hip, knee };
  };
  const L = leg(-0.12), R = leg(0.12); // slightly narrower stance for a leaner silhouette

  const torso = new THREE.Group();
  torso.position.y = 0.98;
  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.26), trunks);
  shorts.position.y = 0.08; shorts.scale.set(1, 1, 1);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.185, 0.06, 14), gloveMat);
  belt.position.y = 0.24;
  // Lean-athletic anatomy: broad shoulders (traps + deltoid caps) → flat fan-
  // shaped pec shelf high on the chest → V-taper lats down the sides → tight
  // waist → ab segments down the center. Defined, not bulky, not fatty.
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 14), skin);
  waist.position.y = 0.34;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.175, 0.24, 16), skin); // broad ribcage up top
  chest.position.y = 0.58; chest.scale.set(1, 1, 0.8);
  // Pecs — ONE broad, subtly-domed FLAT shelf across the upper chest, hugging the
  // chest surface (a heavily flattened sphere, not protruding blocks). Reads as
  // continuous upper-chest muscle with a defined lower edge; the soft bloom blends
  // it into the torso. Slight center dip toward the sternum via the flatten.
  const pecShelf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), skin);
  pecShelf.scale.set(1.05, 0.42, 0.5);   // wide, very flat, shallow depth
  pecShelf.position.set(0, 0.62, 0.09);  // high on the chest, flush to the surface
  // Abs — two subtle core segments down the front center, below the pec shelf.
  const abUp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), skin);
  abUp.position.set(0, 0.47, 0.09); abUp.scale.set(1, 1, 0.7);
  const abLo = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.09), skin);
  abLo.position.set(0, 0.38, 0.085); abLo.scale.set(1, 1, 0.7);
  // Lats — broaden the UPPER BACK/sides (behind the arm line, negative z), tapering
  // to the waist for the V. Flattened slabs tucked against the back, NOT front bumps.
  const latGeo = new THREE.BoxGeometry(0.06, 0.26, 0.2);
  const latL = new THREE.Mesh(latGeo, skin);
  latL.position.set(-0.19, 0.52, -0.04); latL.rotation.set(0, 0.2, -0.24); latL.scale.set(1, 1, 0.9);
  const latR = new THREE.Mesh(latGeo, skin);
  latR.position.set(0.19, 0.52, -0.04); latR.rotation.set(0, -0.2, 0.24); latR.scale.set(1, 1, 0.9);
  // Traps — fill the neck→shoulder slope so the shoulders read broad.
  const trap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 0.1, 12), skin);
  trap.position.set(0, 0.69, -0.01); trap.scale.set(1.6, 1, 0.7);
  // Deltoid CAPS — sit AT the shoulder pivot (y~0.72), nudged UP + OUT, rounding
  // OVER the top of the upper arm where it meets the torso (not dangling below).
  const delGeo = new THREE.SphereGeometry(0.085, 12, 10);
  const delL = new THREE.Mesh(delGeo, skin);
  delL.position.set(-0.28, 0.74, 0); delL.scale.set(1.05, 0.85, 1.1);
  const delR = new THREE.Mesh(delGeo, skin);
  delR.position.set(0.28, 0.74, 0); delR.scale.set(1.05, 0.85, 1.1);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.07, 0.1, 10), skin);
  neck.position.y = 0.74;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 14), skin);
  head.position.y = 0.88; head.scale.set(0.94, 1.06, 0.98);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.024, 8, 20), trunks); // mongkhon-style headband
  band.rotation.x = Math.PI / 2.4;
  band.position.y = 0.9;
  torso.add(shorts, belt, waist, chest, pecShelf, abUp, abLo, latL, latR, trap, delL, delR, neck, head, band);

  const arm = (sx: number) => {
    const sh = new THREE.Group();
    sh.position.set(sx, 0.72, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.22, 5, 12), skin); // leaner, longer
    upper.position.y = -0.17;
    const bicep = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), skin);        // slight bicep swell
    bicep.position.set(0, -0.12, 0.015); bicep.scale.set(1, 1.4, 1);
    const el = new THREE.Group();
    el.position.y = -0.32;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 5, 12), skin);    // forearm thinner than upper
    fore.position.y = -0.15;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10), wrap);
    cuff.position.y = -0.24;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), gloveMat);       // glove stays chunky
    fist.position.y = -0.33; fist.scale.set(1, 1.05, 1.1);
    el.add(fore, cuff, fist);
    sh.add(upper, bicep, el);
    torso.add(sh);
    return { sh, el, fist };
  };
  const AL = arm(-0.3), AR = arm(0.3);
  tilt.add(torso);

  const tipAt = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const tips: Record<TipId, THREE.Object3D> = {
    fistL: tipAt(AL.el, 0, -0.34, 0),
    fistR: tipAt(AR.el, 0, -0.34, 0),
    elbTip: tipAt(AR.el, 0, 0.02, 0.04),
    kneeTip: tipAt(R.hip, 0, -0.46, 0.06),
    footTip: tipAt(R.knee, 0, -0.42, 0.08),
  };
  // wind-up telegraph glow — an additive sprite on each contact surface, off by
  // default; opacity ramps during a strike's startup so big strikes telegraph.
  const glowTex = radialTex("rgba(255,240,200,1)");
  const tipGlow = {} as Record<TipId, THREE.Sprite>;
  (Object.keys(tips) as TipId[]).forEach((k) => {
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    gl.scale.setScalar(0.5);
    tips[k].add(gl);
    tipGlow[k] = gl;
  });

  return { root, tilt, torso, head, shL: AL.sh, elL: AL.el, shR: AR.sh, elR: AR.el, hipL: L.hip, kneeL: L.knee, hipR: R.hip, kneeR: R.knee, tips, tipGlow };
}

interface Fighter {
  rig: Rig;
  x: number; z: number;     // position on the ring floor (xz plane)
  yaw: number;              // facing yaw (toward opponent), eased for smoothness
  hp: number; st: number;
  cur: Pose;                // damped display pose
  // resolved def (kick/chain variant included); speed>1 + dmg bonus = chain flow
  strike: { def: StrikeDef; t: number; hitDone: boolean; speed: number; bonus: number; flow: boolean } | null;
  chainIdx: number;         // next slot in the punch-tap combo chain
  chainT: number;           // time left to continue the chain after a strike ends
  buffered: { id: StrikeId; height?: "up" | "down" } | null; // input buffered mid-strike
  aiChainN: number;         // AI queued chain follow-ups (seeded at decision time)
  blockHeld: boolean;
  dodgeT: number; dodgeCd: number;
  stunT: number;
  advance: number;          // -1 retreat … +1 advance (along facing line)
  circle: number;           // -1 … +1 strafe/orbit (perpendicular to facing)
  koT: number;              // >=0 → falling
  walk: number;
  recoilT: number; recoilMax: number; recoilMag: number; // hit-reaction flinch
  recoilLX: number; recoilLZ: number; // flinch dir in the fighter's LOCAL frame
}

export class VrfcGame {
  private renderer!: THREE.WebGPURenderer;
  private look: Look | null = null; // stylized post stack (null → plain render)
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private player!: Fighter;
  private opp!: Fighter;

  private aiRand: () => number;
  private fxRand: () => number;
  private onState: (s: HudState) => void;
  private onEvent: (e: string) => void;

  private state: HudState = { phase: "fighting", score: 0, round: 1, roundTime: C.ROUND_TIME, playerHp: C.HP_MAX, oppHp: C.HP_MAX, stamina: C.ST_MAX, combo: 0, playerRounds: 0, oppRounds: 0, banner: "", win: false };
  private mode: "intro" | "fight" | "end" | "over" = "intro";
  private modeT = 0;
  private matchDone = false;
  private endBanner = "";
  private comboT = 0;
  private aiThinkT = 0;
  private aiRetreatT = 0;

  private timeScale = 1;
  private shake = 0;
  private hitStop = 0;                              // freeze-frame timer (real seconds)
  private camKickX = 0; private camKickY = 0;       // directional camera kick (eased out)
  private zoomTarget: THREE.Vector3 | null = null; // KO punch-in focus (xz on the mat)
  private koCineT = 0;                              // KO cinematic clock (extends slow-mo)
  private camAngle = Math.PI * 0.5;                // ringside orbit angle, eased
  private t = 0;
  private running = false;
  private raf = 0;
  private lastT = 0;
  private disposed = false;
  private keys = new Set<string>();

  // fx pools (all on the fxRand stream — never perturbs AI/determinism)
  private floaters: { sprite: THREE.Sprite; t: number; life: number }[] = [];
  private bursts: { pts: THREE.Points; vel: Float32Array; t: number; life: number; grav: number }[] = [];
  private sparks: { sprite: THREE.Sprite; t: number; life: number; grow: number }[] = [];
  private crowd: { s: THREE.Sprite; ph: number; f: number; flare: number }[] = [];
  // motion trails: sampled world points of the active limb tip → a fading ribbon.
  private trails: { pts: THREE.Points; head: number; count: number; life: number; t: number }[] = [];
  private activeTrail: { f: Fighter; tip: TipId; buf: Float32Array; n: number; hex: number } | null = null;
  private speedLines!: THREE.LineSegments;          // radial streaks, ramp on heavy/slow-mo
  private speedAmt = 0;
  private ringFlare!: THREE.Mesh;                   // ring-light flare plane, pulses on impact
  private ringFlareT = 0;
  private impactLight!: THREE.PointLight;            // a bright pop light at the contact
  private impactLightT = 0;

  constructor(seed: number, onState: (s: HudState) => void, onEvent: (e: string) => void) {
    this.aiRand = rng(seed);
    this.fxRand = rng(seed ^ 0x9e3779b9); // separate stream: fx never perturbs AI
    this.onState = onState;
    this.onEvent = onEvent;
  }

  async start(canvas: HTMLCanvasElement) {
    let webgl = false;
    try {
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
      await this.renderer.init();
    } catch {
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true } as never);
      await this.renderer.init();
      webgl = true;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // moody-but-not-black ring: a deep blue-violet, not near-black.
    this.scene.background = new THREE.Color(0x110d2e);
    // fog kept BEYOND the dome-visible band — the WebGPU post path can ignore
    // material.fog=false, so the backdrop must never sit in the fully-fogged zone.
    this.scene.fog = new THREE.Fog(0x151038, 18, 85);

    this.buildArena();
    this.buildRing();
    this.buildLights();
    this.buildCrowd();
    this.buildFxRig();

    this.player = this.makeFighter(0x14f195, 0x0fca7a, 0xd8a678, -1.4, "YOU", 0x14f195);
    this.opp = this.makeFighter(0x9945ff, 0xff3b5c, 0x9a6a4a, 1.4, "RAVAN", 0xff5b7b);
    this.faceOff();

    // Stylized soft look (bloom + warm grade + vignette). Guarded: if the TSL
    // post stack can't init (e.g. the WebGL fallback path), skip it and render
    // plainly — the game must never break on non-WebGPU devices.
    if (!webgl) {
      try { this.look = setupLook(this.renderer, this.scene, this.camera, { strength: 0.3, threshold: 0.8 }); }
      catch (e) { console.warn("vrfc look disabled", e); this.look = null; }
    }

    this.bindInput(canvas);
    this.resize();
    window.addEventListener("resize", this.resize);

    this.mode = "intro";
    this.modeT = 0;
    this.running = true;
    this.lastT = performance.now();
    this.loop();
  }

  // ── scene ──
  private static softTex(inner: string, outer = "rgba(0,0,0,0)"): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  private matTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "#101528";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(127,215,255,0.5)";
    g.lineWidth = 6;
    g.strokeRect(36, 36, 440, 440);
    g.strokeStyle = "rgba(153,69,255,0.55)";
    g.beginPath();
    g.arc(256, 256, 120, 0, Math.PI * 2);
    g.stroke();
    g.font = "900 64px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(20,241,149,0.5)";
    g.fillText("VRFC", 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  // Arena backdrop — a gradient dome with a baked "stadium" band (banked crowd
  // lights + haze) so the void above the ring reads as a real venue, not black.
  // One inside-out sphere + one canvas texture: near-zero cost, huge depth win.
  private buildArena() {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    const g = c.getContext("2d")!;
    // authored for flipY=false (WebGPU-safe): canvas y=0 → sphere BOTTOM,
    // y=512 → sphere TOP; the equator/horizon sits at y≈256.
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#151033");     // under-ring floor line
    grd.addColorStop(0.3, "#221a52");
    grd.addColorStop(0.52, "#3d2e8c");  // glow band right above the horizon
    grd.addColorStop(0.75, "#2a1f66");
    grd.addColorStop(1, "#3b2b86");     // hazy violet overhead
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    // banked crowd/stadium lights: rows of soft dots just above the horizon
    // (fx stream — purely cosmetic, never touches AI determinism).
    for (let row = 0; row < 5; row++) {
      const y = 272 + row * 14;
      for (let x = 0; x < 1024; x += 6) {
        if (this.fxRand() < 0.42) {
          const warm = this.fxRand();
          g.fillStyle = warm < 0.18 ? "rgba(60,255,180,0.85)" : warm < 0.36 ? "rgba(190,120,255,0.9)" : `rgba(${190 + Math.floor(this.fxRand() * 60)},${200 + Math.floor(this.fxRand() * 50)},255,${0.45 + this.fxRand() * 0.4})`;
          const r = 1.2 + this.fxRand() * 2.2;
          g.beginPath(); g.arc(x + this.fxRand() * 5, y + (this.fxRand() - 0.5) * 10, r, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // a soft horizontal glow strip where ring lights wash the haze
    const strip = g.createLinearGradient(0, 250, 0, 345);
    strip.addColorStop(0, "rgba(130,110,255,0)");
    strip.addColorStop(0.5, "rgba(150,135,255,0.3)");
    strip.addColorStop(1, "rgba(130,110,255,0)");
    g.fillStyle = strip;
    g.fillRect(0, 250, 1024, 95);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false; // consistent across WebGPU + the WebGL fallback
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const domeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    domeMat.fog = false; // the dome IS the distance — don't fog it out
    const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), domeMat);
    dome.position.y = 2;
    this.scene.add(dome);
  }

  private buildRing() {
    const S = 3.9; // mat half-size
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), new THREE.MeshStandardMaterial({ map: this.matTexture(), roughness: 0.85 }));
    mat.rotation.x = -Math.PI / 2;
    this.scene.add(mat);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(S * 2 + 0.5, 0.6, S * 2 + 0.5), new THREE.MeshStandardMaterial({ color: 0x0a0d1c, roughness: 0.9 }));
    apron.position.y = -0.31;
    this.scene.add(apron);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, metalness: 0.7, roughness: 0.35 });
    const padCols = [0x14f195, 0x9945ff, 0x14f195, 0x9945ff];
    const corners: [number, number][] = [[-S, -S], [S, -S], [S, S], [-S, S]];
    corners.forEach(([px, pz], i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.5, 10), postMat);
      post.position.set(px, 0.75, pz);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: padCols[i], transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      cap.position.set(px, 1.52, pz);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), new THREE.MeshStandardMaterial({ color: padCols[i], emissive: padCols[i], emissiveIntensity: 0.4, roughness: 0.6 }));
      pad.position.set(px - Math.sign(px) * 0.09, 0.75, pz - Math.sign(pz) * 0.09);
      this.scene.add(post, cap, pad);
    });

    // 3 ropes per side, neon with additive glow shells (TimeGate glow technique)
    const ropeCols = [0x9945ff, 0xdfe8ff, 0x14f195];
    const heights = [0.52, 0.88, 1.24];
    const sides: { p: [number, number, number]; rz: boolean }[] = [
      { p: [0, 0, -S], rz: true }, { p: [0, 0, S], rz: true },
      { p: [-S, 0, 0], rz: false }, { p: [S, 0, 0], rz: false },
    ];
    for (const side of sides) {
      heights.forEach((h, i) => {
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, S * 2, 6, 1), new THREE.MeshBasicMaterial({ color: ropeCols[i], transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, S * 2, 6, 1), new THREE.MeshBasicMaterial({ color: ropeCols[i], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
        core.add(shell);
        if (side.rz) core.rotation.z = Math.PI / 2;
        else core.rotation.x = Math.PI / 2;
        core.position.set(side.p[0], h, side.p[2]);
        this.scene.add(core);
      });
    }
  }

  private buildLights() {
    // Brighter, punchier neon-arena lighting — fighters read vividly, ring stays
    // moody (not black). Lifted ambient + key/fill + strong colored rims.
    this.scene.add(new THREE.AmbientLight(0xa0b0e0, 0.85));
    const key = new THREE.SpotLight(0xffffff, 150, 32, Math.PI / 4.5, 0.4, 1.5);
    key.position.set(0, 8, 3);
    key.target.position.set(0, 0.8, 0);
    this.scene.add(key, key.target);
    const fill = new THREE.SpotLight(0xbfe0ff, 70, 32, Math.PI / 4.5, 0.6, 1.7);
    fill.position.set(-4, 6, -3);
    fill.target.position.set(0, 1, 0);
    this.scene.add(fill, fill.target);
    // a warm front fill so faces/torsos don't sink into shadow.
    const front = new THREE.DirectionalLight(0xfff0d8, 0.9); front.position.set(0, 3, 8); this.scene.add(front);
    const rim = new THREE.PointLight(0xb066ff, 14, 16);
    rim.position.set(0, 2.6, -4);
    this.scene.add(rim);
    // Colored back-rims so the fighters pop off the dark ring (green + magenta).
    const rimG = new THREE.PointLight(0x14f195, 12, 14); rimG.position.set(-3.5, 2.4, -3); this.scene.add(rimG);
    const rimM = new THREE.PointLight(0xff3b7a, 12, 14); rimM.position.set(3.5, 2.4, -3); this.scene.add(rimM);
    // A bright impact pop-light, off until a clean hit (positioned at contact).
    this.impactLight = new THREE.PointLight(0xffffff, 0, 6);
    this.impactLight.position.set(0, 1.2, 0);
    this.scene.add(this.impactLight);

    // fake volumetric beams — additive open cones from the rig above
    const beamTex = VrfcGame.softTex("rgba(160,200,255,0.5)");
    for (const bx of [-1.6, 1.6]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 7, 20, 1, true),
        new THREE.MeshBasicMaterial({ map: beamTex, color: 0x8fb8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.set(bx, 4.2, 0);
      this.scene.add(cone);
    }
    // overhead light rig
    const rig = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 3.2), new THREE.MeshBasicMaterial({ color: 0x1a2036 }));
    rig.position.y = 7.6;
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.y = 7.5;
    this.scene.add(rig, lamp);

    // Floor sheen — a soft additive glow disc on the mat that reads as a wet neon
    // reflection under the fighters (cheap; no real reflection pass).
    const sheen = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 40),
      new THREE.MeshBasicMaterial({ map: VrfcGame.softTex("rgba(120,150,255,0.6)"), color: 0x5a7fff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sheen.rotation.x = -Math.PI / 2; sheen.position.y = 0.012;
    this.scene.add(sheen);
  }

  // Distant crowd-void camera flashes — cheap sprites flickering in the dark;
  // they also POP on big hits/KO (flare, driven in stepFx).
  private buildCrowd() {
    const tex = VrfcGame.softTex("rgba(220,235,255,1)");
    for (let i = 0; i < 30; i++) {
      const a = this.fxRand() * Math.PI * 2;
      const r = 8 + this.fxRand() * 8;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xaac4ff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(Math.cos(a) * r, 0.4 + this.fxRand() * 3.4, Math.sin(a) * r);
      s.scale.setScalar(0.5 + this.fxRand() * 0.7);
      this.scene.add(s);
      this.crowd.push({ s, ph: this.fxRand() * 20, f: 0.4 + this.fxRand() * 1.2, flare: 0 });
    }
  }

  // FX rig built once: pooled speed-lines (radial streaks) + a ring-flare plane.
  private buildFxRig() {
    // Speed lines — radial segments from screen center, opacity ramps on heavy
    // hits + slow-mo. Sits on a small sphere around the camera focus, billboard-ish.
    const N = 64;
    const segs: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = this.fxRand() * Math.PI * 2;
      const r0 = 2.4 + this.fxRand() * 0.6, r1 = 5.5 + this.fxRand() * 2;
      const y = 1.2 + (this.fxRand() - 0.5) * 3;
      segs.push(Math.cos(a) * r0, y, Math.sin(a) * r0, Math.cos(a) * r1, y, Math.sin(a) * r1);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    this.speedLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.speedLines);

    // Ring-light flare — a big additive plane high over the ring that flashes on impact.
    this.ringFlare = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: VrfcGame.softTex("rgba(255,240,210,0.8)"), color: 0xfff2d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ringFlare.rotation.x = -Math.PI / 2; this.ringFlare.position.y = 5;
    this.scene.add(this.ringFlare);
  }

  // Floating name tag over a fighter's head — disambiguates YOU vs the opponent
  // (tester couldn't tell them apart while moving). Child of the rig root so it
  // tracks the fighter; a Sprite so it always faces the camera; depthTest off so
  // it reads over the body. Colours match the HUD (YOU green, RAVAN red).
  private nameTag(text: string, hex: number): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d")!;
    g.font = "900 44px 'Space Grotesk', system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,0.9)"; g.strokeText(text, 128, 36);
    g.fillStyle = "#" + hex.toString(16).padStart(6, "0"); g.fillText(text, 128, 36);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(1.7, 0.42, 1);
    s.position.set(0, 2.7, 0);
    s.renderOrder = 999;
    return s;
  }

  private makeFighter(accent: number, glove: number, skin: number, x: number, tag: string, tagHex: number): Fighter {
    const rig = buildRig(accent, glove, skin);
    rig.root.position.set(x, 0, 0);
    rig.root.add(this.nameTag(tag, tagHex));
    this.scene.add(rig.root);
    return { rig, x, z: 0, yaw: 0, hp: C.HP_MAX, st: C.ST_MAX, cur: { ...GUARD }, strike: null, chainIdx: 0, chainT: 0, buffered: null, aiChainN: 0, blockHeld: false, dodgeT: 0, dodgeCd: 0, stunT: 0, advance: 0, circle: 0, koT: -1, walk: 0, recoilT: 0, recoilMax: 0, recoilMag: 0, recoilLX: 0, recoilLZ: 0 };
  }

  // ── facing: the rig models limbs pointing at the opponent when yaw = atan2 of
  // the self→opponent vector. Fighters ALWAYS face each other. ──
  private faceYaw(f: Fighter, other: Fighter): number {
    return Math.atan2(other.x - f.x, other.z - f.z);
  }
  private faceOff() {
    this.player.yaw = this.faceYaw(this.player, this.opp);
    this.opp.yaw = this.faceYaw(this.opp, this.player);
  }

  // ── public input API (mobile buttons + engine keys both land here) ──
  // `height` targets kick/knee elevation: "up"→head, "down"→low, else neutral.
  // Desktop passes undefined (the engine reads the held W/S modifier); mobile
  // passes an explicit height from a swipe on the kick button.
  strike(id: StrikeId, height?: "up" | "down") { this.tryStrike(this.player, id, true, height); }
  setBlock(on: boolean) { this.player.blockHeld = on; }
  setAdvance(v: number) { this.player.advance = v; } // +1 advance / -1 retreat
  setCircle(v: number) { this.player.circle = v; }   // +1/-1 orbit the opponent
  private dodgeSlip = 0; // which way the current dodge slips (strafe sign)
  dodge() {
    const f = this.player;
    if (this.mode !== "fight" || f.koT >= 0 || f.stunT > 0 || f.strike || f.dodgeCd > 0) return;
    f.dodgeT = C.DODGE_TIME;
    f.dodgeCd = C.DODGE_CD;
    this.dodgeSlip = f.circle !== 0 ? Math.sign(f.circle) : 1; // slip along the strafe axis
    this.onEvent("dodge");
  }

  private tryStrike(f: Fighter, id: StrikeId, isPlayer: boolean, height?: "up" | "down") {
    if (this.mode !== "fight" || f.koT >= 0 || f.stunT > 0 || f.dodgeT > 0 || f.blockHeld) return;
    // mid-strike input buffers a follow-up (once the hit window has opened) so
    // rhythmic taps FLOW: the next strike launches off this one's follow-through.
    if (f.strike) {
      if (f.strike.t >= strikeImpactT(f.strike.def)) f.buffered = { id, height };
      return;
    }
    // COMBO CHAIN: repeated punch taps walk JAB → CROSS → LEAD HOOK → REAR
    // UPPERCUT. Any strike thrown inside the chain window rides the flow
    // (faster + small damage bonus) — so jab-cross into a kick flows too.
    const inChain = f.chainT > 0 && f.chainIdx > 0;
    let cid: ChainId = id;
    if (id === "jab" && inChain) cid = CHAIN[f.chainIdx % CHAIN.length];
    let def = chainDef(cid);
    // KICK targeting: resolve the height variant. Desktop reads the held advance
    // modifier when no explicit height was passed (mobile passes one).
    if (cid === "kick") {
      const h = height ?? (f.advance > 0.2 ? "up" : f.advance < -0.2 ? "down" : undefined);
      def = h === "up" ? KICK_VARIANTS.head : h === "down" ? KICK_VARIANTS.low : KICK_VARIANTS.body;
    }
    if (f.st < def.st) { f.chainIdx = 0; f.chainT = 0; if (isPlayer) this.onEvent("gassed"); return; } // gassed = the chain drops
    f.st -= def.st;
    const flow = inChain;
    const bonus = flow ? Math.min(6, f.chainIdx * 2) : 0; // later chain hits bite harder
    f.strike = { def, t: 0, hitDone: false, speed: flow ? C.CHAIN_SPEED : 1, bonus, flow };
    // advance the chain pointer: punch taps walk the sequence (uppercut
    // completes the lap); any other strike caps/resets the chain.
    f.chainIdx = id === "jab" && cid !== "uppercut" ? f.chainIdx + 1 : 0;
    f.chainT = 0;
  }

  // ── combat resolution ──
  private tipWorld(f: Fighter, tip: TipId): THREE.Vector3 {
    const v = new THREE.Vector3();
    f.rig.tips[tip].getWorldPosition(v);
    return v;
  }
  // Hurtbox anchors from the ACTUAL animated rig (reflect flinch/dodge/pose).
  private headWorld(f: Fighter): THREE.Vector3 { return f.rig.head.getWorldPosition(new THREE.Vector3()); }
  private bodyWorld(f: Fighter): THREE.Vector3 { const v = f.rig.torso.getWorldPosition(new THREE.Vector3()); v.y += 0.45; return v; } // chest height
  private lowWorld(f: Fighter): THREE.Vector3 { const v = f.rig.root.getWorldPosition(new THREE.Vector3()); v.y += 0.62; return v; } // thigh/leg height

  // Push a fighter along a world xz direction + kick off a recoil flinch that
  // reads in their LOCAL frame (head/torso snap away from the strike).
  private applyReaction(def: Fighter, dirX: number, dirZ: number, push: number, mag: number, stagger: number) {
    const l = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / l, nz = dirZ / l;
    def.x += nx * push; def.z += nz * push;
    this.clampToRing(def);
    // convert the world push dir into the defender's local frame for the flinch:
    // local +x = the fighter's right (strafe), local +z = toward their opponent.
    const fwdX = Math.sin(def.yaw), fwdZ = Math.cos(def.yaw);
    const rgtX = fwdZ, rgtZ = -fwdX;
    def.recoilLZ = -(nx * fwdX + nz * fwdZ);  // struck from the front → snap backward
    def.recoilLX = -(nx * rgtX + nz * rgtZ);  // lateral component
    def.recoilMag = mag;
    def.recoilMax = def.recoilT = stagger;
  }

  // Test real 3D contact for the swinging limb THIS frame. Returns true when the
  // swing has resolved (hit, block or dodged-through) — false = not yet reaching,
  // keep testing until the hit window closes.
  private tryLand(att: Fighter, def: Fighter, st: NonNullable<Fighter["strike"]>): boolean {
    if (def.koT >= 0) return true; // already down
    const s = st.def;
    const isPlayer = att === this.player;
    const at = this.tipWorld(att, s.tip); // world position of the striking surface

    // REAL 3D contact against the TARGETED hurtbox: the animated limb tip must
    // physically reach it. "auto" = nearest of head/body (punches/elbows);
    // kicks target head / body / low so a head kick only lands if the shin gets up.
    let reach: number;
    if (s.target === "head") reach = at.distanceTo(this.headWorld(def)) - C.HURT_HEAD_R;
    else if (s.target === "body") reach = at.distanceTo(this.bodyWorld(def)) - C.HURT_BODY_R;
    else if (s.target === "low") reach = at.distanceTo(this.lowWorld(def)) - C.HURT_LOW_R;
    else reach = Math.min(at.distanceTo(this.headWorld(def)) - C.HURT_HEAD_R, at.distanceTo(this.bodyWorld(def)) - C.HURT_BODY_R);
    if (reach > C.CONTACT_EPS) return false; // not there yet — the arc keeps swinging

    // hit direction in the ring plane: attacker → defender.
    let hx = def.x - att.x, hz = def.z - att.z;
    if (Math.hypot(hx, hz) < 0.02) { hx = Math.sin(att.yaw); hz = Math.cos(att.yaw); }

    if (def.dodgeT > 0) { // slipped clean through the i-frames
      this.spawnFloater(at, "MISS", 0x9fb0d0, 0.5);
      if (isPlayer) this.onEvent("whiff");
      return true;
    }
    const raw = s.dmg + st.bonus; // chain-flow bonus on later hits
    const base = isPlayer ? raw : Math.round(raw * 0.75); // player edge — fun, not unfair
    // weight 0..1 by damage → scales every juice channel.
    const weight = Math.min(1, raw / 22);
    const attHex = isPlayer ? 0x14f195 : 0xff3b5c;
    if (def.blockHeld) {
      const dmg = Math.max(1, Math.round(base * C.BLOCK_DMG_MUL));
      def.hp = Math.max(0, def.hp - dmg);
      def.st = Math.max(0, def.st - s.dmg * 0.4);
      // block spark (cyan) + a guard-shudder; a small pop, distinct from a clean hit.
      this.spawnSpark(at, 0x7fd7ff, 1.0);
      this.spawnBurst(at, 0x7fd7ff, 8, 0.9);
      this.spawnFloater(at, "BLOCK", 0x7fd7ff, 0.5);
      this.impactFx(at, 0x7fd7ff, weight * 0.4);
      this.applyReaction(def, hx, hz, C.BLOCK_PUSH, 0.35, 0.14);
      if (isPlayer) this.state.score += s.dmg * 2;
      this.onEvent("block");
    } else {
      def.hp = Math.max(0, def.hp - base);
      def.stunT = C.STUN_TIME + weight * 0.18;
      if (def.strike) this.setLimbGlow(def, def.strike.def.tip, 0); // kill a lit telegraph
      def.strike = null; // clean hit interrupts their wind-up
      def.buffered = null; def.chainIdx = 0; def.chainT = 0; // and breaks their chain
      // weighty knockback + flinch, scaled by strike weight (jab nudges, kick shoves).
      const push = C.KNOCKBACK + base * C.KNOCKBACK_PER_DMG;
      const stagger = 0.2 + base * 0.012;
      this.applyReaction(def, hx, hz, push, 1, stagger);
      // AAA impact: colored burst + white flash spark + sweat/energy spray + a
      // pop-light + ring/crowd flare + camera kick + hit-stop, all scaled by weight.
      this.spawnBurst(at, attHex, 18, 1);
      this.spawnSpark(at, 0xffffff, 1.4 + weight);
      this.spawnSpray(at, hx, hz, weight);
      this.impactFx(at, attHex, weight);
      this.camKick(hx, hz, 0.05 + weight * 0.14);
      this.hitStop = Math.max(this.hitStop, 0.03 + weight * 0.06); // 2–5 frames
      if (isPlayer) {
        this.state.combo++;
        this.comboT = C.COMBO_WINDOW;
        const mult = Math.min(3, 1 + this.state.combo * 0.1);
        const pts = Math.round(raw * 10 * mult);
        this.state.score += pts;
        this.spawnFloater(at, st.flow ? `${base} FLOW` : `${base}`, 0xffd24a, 0.8 + weight * 0.4);
        if (st.flow) this.onEvent("flow");
        // combo flair: a bright screen-edge pop + extra crowd flare on 5+.
        if (this.state.combo >= 5) { this.flareCrowd(0.9); this.ringFlareT = Math.max(this.ringFlareT, 0.22); }
        this.onEvent("hit");
      } else {
        this.state.combo = 0;
        this.spawnFloater(at, `${base}`, 0xff5b7b, 0.8 + weight * 0.4);
        this.onEvent("hurt");
      }
      if (def.hp <= 0) this.knockout(def, at, hx, hz);
      else if (def.hp < 20 && weight > 0.6) { this.timeScale = Math.min(this.timeScale, 0.5); this.koCineT = Math.max(this.koCineT, 0.25); } // near-KO slow-mo beat
    }
    return true;
  }

  // Centralized impact pop: flash spark + pop-light + ring/crowd flare, weight-scaled.
  private impactFx(at: THREE.Vector3, hex: number, weight: number) {
    this.shake = Math.max(this.shake, 0.06 + weight * 0.14);
    this.impactLight.position.copy(at);
    this.impactLight.color.setHex(hex);
    this.impactLightT = Math.max(this.impactLightT, 0.14 + weight * 0.1);
    this.ringFlareT = Math.max(this.ringFlareT, 0.1 + weight * 0.14);
    if (weight > 0.55) this.flareCrowd(0.6 + weight * 0.4);
    this.speedAmt = Math.max(this.speedAmt, weight * 0.9);
  }
  private camKick(dirX: number, dirZ: number, amt: number) {
    // project the world hit dir onto screen-ish axes for a directional jolt.
    this.camKickX += dirX * amt;
    this.camKickY += (Math.abs(dirZ) + 0.4) * amt * 0.5;
  }
  private flareCrowd(intensity: number) {
    for (const c of this.crowd) if (this.fxRand() < 0.5) c.flare = Math.max(c.flare, intensity);
  }

  private knockout(f: Fighter, at?: THREE.Vector3, hx = 0, hz = 1) {
    f.koT = 0;
    f.strike = null;
    f.buffered = null; f.aiChainN = 0; f.chainIdx = 0; f.chainT = 0;
    // KO CINEMATIC: hard slow-mo, long cinematic beat, big flash + shake + kick.
    this.timeScale = 0.16;
    this.koCineT = 1.4;
    this.zoomTarget = new THREE.Vector3(f.x, 0.9, f.z);
    this.shake = 0.34;
    this.camKick(hx, hz, 0.28);
    this.hitStop = Math.max(this.hitStop, 0.11);       // a hard freeze on the finish
    if (at) { this.spawnBurst(at, 0xffffff, 30, 1.4); this.spawnSpray(at, hx, hz, 1.3); this.impactFx(at, 0xfff2d0, 1.3); }
    this.ringFlareT = 0.5; this.flareCrowd(1); this.speedAmt = 1;
    this.onEvent("ko");
    this.endRound(f === this.opp, true);
  }

  // Keep a fighter inside the circular mat.
  private clampToRing(f: Fighter) {
    const r = Math.hypot(f.x, f.z);
    if (r > C.RING_R) { f.x = (f.x / r) * C.RING_R; f.z = (f.z / r) * C.RING_R; }
  }

  // ── round / match flow ──
  private endRound(playerWon: boolean, ko: boolean) {
    if (this.mode !== "fight") return;
    this.mode = "end";
    this.modeT = 0;
    if (playerWon) {
      this.state.playerRounds++;
      this.state.score += C.ROUND_BONUS + (ko ? C.KO_BONUS : 0);
    } else {
      this.state.oppRounds++;
    }
    this.endBanner = ko ? "KO!" : playerWon ? "TIME! ROUND YOURS" : "TIME! ROUND LOST";
    this.state.banner = this.endBanner;
    if (!ko) this.onEvent(playerWon ? "round" : "hurt");
    this.matchDone =
      this.state.playerRounds >= C.ROUNDS_TO_WIN ||
      this.state.oppRounds >= C.ROUNDS_TO_WIN ||
      this.state.round >= C.MAX_ROUNDS;
  }

  private nextRound() {
    this.state.round++;
    this.state.roundTime = C.ROUND_TIME;
    for (const f of [this.player, this.opp]) {
      f.hp = C.HP_MAX;
      f.st = C.ST_MAX;
      f.strike = null;
      f.blockHeld = false;
      f.stunT = 0;
      f.dodgeT = 0;
      f.koT = -1;
      f.rig.tilt.rotation.x = 0;
      f.advance = 0;
      f.circle = 0;
      f.recoilT = 0;
      f.chainIdx = 0; f.chainT = 0; f.buffered = null; f.aiChainN = 0;
    }
    this.player.x = -1.4; this.player.z = 0;
    this.opp.x = 1.4; this.opp.z = 0;
    this.faceOff();
    this.state.combo = 0;
    this.zoomTarget = null;
    this.koCineT = 0; this.hitStop = 0; this.camKickX = 0; this.camKickY = 0;
    if (this.activeTrail) this.flushTrail();
    this.mode = "intro";
    this.modeT = 0;
    this.onEvent("round");
  }

  private finish() {
    this.mode = "over";
    const win = this.state.playerRounds > this.state.oppRounds;
    this.state.win = win;
    if (win) this.state.score += C.WIN_BONUS + Math.round(this.player.hp * 5);
    this.state.phase = "over";
    this.state.banner = "";
    this.onEvent(win ? "win" : "lose");
    this.onEvent("over");
    this.emit();
  }

  // ── AI — seeded, aggression scales with round; fun over fair. Moves in xz:
  // advances/retreats along the facing line, occasionally circles. ──
  private stepAI(dt: number) {
    const o = this.opp, p = this.player;
    if (o.koT >= 0 || o.stunT > 0) return;
    const sep = Math.hypot(o.x - p.x, o.z - p.z);
    const aggro = 0.27 + 0.15 * (this.state.round - 1);
    const pStartup = p.strike ? strikeImpactT(p.strike.def) : 0;

    this.aiThinkT -= dt;
    if (this.aiThinkT > 0) return;
    this.aiThinkT = 0.22 + this.aiRand() * 0.2;

    // low hp → sometimes back off for a beat
    if (o.hp < 28 && this.aiRetreatT <= 0 && this.aiRand() < 0.3) this.aiRetreatT = 0.9 + this.aiRand();
    if (this.aiRetreatT > 0) {
      this.aiRetreatT -= 0.25;
      o.advance = -1;
      o.circle = this.aiRand() < 0.5 ? (this.aiRand() < 0.5 ? -1 : 1) : 0; // dance out
      o.blockHeld = this.aiRand() < 0.5;
      return;
    }

    // react to a player wind-up: block or slip out
    o.blockHeld = false;
    if (p.strike && p.strike.t < pStartup && sep < 2.3) {
      const r = this.aiRand();
      if (r < 0.2 + 0.13 * (this.state.round - 1)) { o.blockHeld = true; o.advance = 0; o.circle = 0; return; }
      if (r < 0.3 && o.dodgeCd <= 0) { o.dodgeT = C.DODGE_TIME; o.dodgeCd = C.DODGE_CD; o.advance = 0; o.circle = 0; return; }
    }

    // occasional feint-circle to keep the movement alive/readable
    o.circle = this.aiRand() < 0.22 ? (this.aiRand() < 0.5 ? -1 : 1) : 0;

    // close to actual striking range (contact is now 3D — must be in reach).
    const STRIKE_RANGE = 1.2;
    if (sep > STRIKE_RANGE) { o.advance = 1; return; }
    o.advance = sep < C.MIN_SEP + 0.06 ? -0.35 : 0;
    if (this.aiRand() < aggro) {
      const r = this.aiRand();
      // pick a strike whose limb actually reaches at this distance.
      const id: StrikeId =
        sep > 1.1 ? (r < 0.5 ? "jab" : "cross") :          // long: straights
        sep > 1.0 ? (r < 0.35 ? "jab" : r < 0.7 ? "cross" : r < 0.85 ? "knee" : "kick") :
        r < 0.24 ? "jab" : r < 0.44 ? "cross" : r < 0.6 ? "hook" : // close: everything
        r < 0.76 ? "knee" : r < 0.9 ? "elbow" : "kick";
      // AI mixes kick heights: mostly body, occasional head (highlight) / low.
      const h = id === "kick" ? (this.aiRand() < 0.22 ? "up" : this.aiRand() < 0.3 ? "down" : undefined) : undefined;
      this.tryStrike(o, id, false, h);
      // seeded combinations: off a straight, sometimes flow 1–2 chained follow-ups.
      if ((id === "jab" || id === "cross") && this.aiRand() < 0.35) o.aiChainN = this.aiRand() < 0.4 ? 2 : 1;
    }
  }

  // ── per-fighter simulation ──
  private stepFighter(f: Fighter, other: Fighter, dt: number) {
    if (f.koT >= 0) {
      f.koT += dt;
      f.rig.tilt.rotation.x = -smooth(Math.min(1, f.koT / 0.7)) * (Math.PI / 2 - 0.12);
      this.applyPose(f, GUARD, dt, 4);
      return;
    }
    f.st = Math.min(C.ST_MAX, f.st + (f.strike ? 0 : C.ST_REGEN * dt));
    f.stunT = Math.max(0, f.stunT - dt);
    f.dodgeT = Math.max(0, f.dodgeT - dt);
    f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.recoilT = Math.max(0, f.recoilT - dt);
    f.chainT = Math.max(0, f.chainT - dt);

    // facing: always turn toward the opponent (eased) — gloves point at them.
    const wantYaw = this.faceYaw(f, other);
    let dyaw = wantYaw - f.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    f.yaw += dyaw * (1 - Math.exp(-12 * dt));

    // face-relative movement basis: forward = toward opponent, right = strafe.
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw);
    const rgtX = fwdZ, rgtZ = -fwdX;

    // movement (locked while striking/stunned; block crawls). advance = along the
    // facing line (closer/farther), circle = perpendicular (orbit the opponent).
    const canMove = this.mode === "fight" && !f.strike && f.stunT <= 0 && f.dodgeT <= 0;
    if (canMove && (f.advance !== 0 || f.circle !== 0)) {
      const g = f.blockHeld ? 0.4 : 1;
      f.x += (fwdX * f.advance * C.ADVANCE_SPEED + rgtX * f.circle * C.CIRCLE_SPEED) * g * dt;
      f.z += (fwdZ * f.advance * C.ADVANCE_SPEED + rgtZ * f.circle * C.CIRCLE_SPEED) * g * dt;
      f.walk += dt * 9;
    }
    // dodge slips fast along the strafe axis (the i-frame lean)
    if (f.dodgeT > 0) {
      const slip = (f === this.player ? this.dodgeSlip : 1) * 3.4 * dt;
      f.x += rgtX * slip; f.z += rgtZ * slip;
    }
    this.clampToRing(f);
    // body collision — never overlap (push apart in xz)
    const dx = f.x - other.x, dz = f.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d < C.MIN_SEP) {
      const inv = d > 0.001 ? 1 / d : 0;
      const nx = inv ? dx * inv : fwdX, nz = inv ? dz * inv : fwdZ;
      f.x = other.x + nx * C.MIN_SEP; f.z = other.z + nz * C.MIN_SEP;
    }
    this.clampToRing(f);

    // strike timeline — walk the keyframe list; hit resolves at the impact frame.
    // A motion-trail ribbon samples the striking limb through its active swing,
    // and the tip glows on wind-up (telegraph) — both keyed to the impact time.
    let target: Pose = GUARD;
    let poseK = 14;
    if (f.strike) {
      const s = f.strike;
      const def = s.def;
      const impactT = strikeImpactT(def);
      const activeEnd = strikeActiveEnd(def);
      const wasT = s.t;
      s.t += dt * s.speed; // chained strikes flow slightly faster
      const total = strikeDur(def);
      // authentic step-in: fighters carry momentum INTO a strike during its
      // startup (real combos march forward) — collision below keeps MIN_SEP.
      if (wasT < impactT) {
        f.x += fwdX * C.STEP_IN * dt; f.z += fwdZ * C.STEP_IN * dt;
      }
      // wind-up telegraph: glow the striking limb tip during startup.
      const chargeK = wasT < impactT ? smooth(wasT / Math.max(0.001, impactT)) : 0;
      this.setLimbGlow(f, def.tip, chargeK);
      // trail: begin just before impact, sample through active + follow-through.
      const trailStart = impactT - 0.06;
      if (this.activeTrail?.f !== f && wasT >= trailStart && wasT < total - 0.04) {
        this.startTrail(f, def.tip, f === this.player ? 0x9dffcf : 0xffa6bf);
      }
      if (this.activeTrail?.f === f) this.sampleTrail();
      // HIT WINDOW — test real 3D contact EVERY frame while the limb swings
      // through its active arc; land at the true moment it reaches, whiff if
      // the window closes without contact.
      if (!s.hitDone && s.t >= impactT) {
        if (s.t <= activeEnd) {
          if (this.tryLand(f, other, s)) s.hitDone = true;
        } else {
          s.hitDone = true;
          if (f === this.player) { this.spawnFloater(this.tipWorld(f, def.tip), "MISS", 0x9fb0d0, 0.5); this.onEvent("whiff"); }
        }
      }
      if (s.t >= total) {
        if (this.activeTrail?.f === f) this.flushTrail();
        this.setLimbGlow(f, def.tip, 0);
        f.strike = null;
        f.chainT = C.CHAIN_WINDOW; // the chain window opens off the follow-through
        // a buffered tap launches NOW — the combo flows strike into strike.
        if (f.buffered) {
          const b = f.buffered;
          f.buffered = null;
          this.tryStrike(f, b.id, f === this.player, b.height);
        } else if (f.aiChainN > 0) { // seeded AI combination follow-up
          f.aiChainN--;
          this.tryStrike(f, "jab", false);
        }
      } else {
        target = this.sampleStrike(def, s.t);
        poseK = 30; // strikes snap hard
      }
    }
    if (!f.strike) {
      if (f.dodgeT > 0) { target = DODGE; poseK = 20; }
      else if (f.blockHeld) target = BLOCK;
    }
    if (f.stunT > 0) poseK = 6; // hit-stun: sluggish recovery reads as impact

    this.applyPose(f, target, dt, poseK);
  }

  // Wind-up telegraph: ramp the striking limb's glow sprite (0 = off).
  private setLimbGlow(f: Fighter, tip: TipId, amt: number) {
    const gl = f.rig.tipGlow[tip];
    (gl.material as THREE.SpriteMaterial).opacity = amt * 0.85;
    gl.scale.setScalar(0.4 + amt * 0.5);
  }

  // Sample the keyframe timeline: find the segment `t` falls in and smooth-lerp
  // from the previous keyframe (GUARD before frame 0) into it.
  private strikeTmp: Pose = { ...GUARD };
  private sampleStrike(def: StrikeDef, t: number): Pose {
    let prev: Pose = GUARD;
    let acc = 0;
    for (const f of def.frames) {
      if (t < acc + f.d) {
        lerpPose(this.strikeTmp, prev, f.p, smooth((t - acc) / f.d));
        return this.strikeTmp;
      }
      acc += f.d;
      prev = f.p;
    }
    return prev;
  }

  private applyPose(f: Fighter, target: Pose, dt: number, k: number) {
    const kk = 1 - Math.exp(-k * dt);
    lerpPose(f.cur, f.cur, target, kk);
    const p = f.cur, r = f.rig;
    r.shL.rotation.set(p.slx, p.sly, p.slz);
    r.elL.rotation.x = p.elx;
    r.shR.rotation.set(p.srx, p.sry, p.srz);
    r.elR.rotation.x = p.erx;
    const stepping = !f.strike && f.koT < 0 && (f.advance !== 0 || f.circle !== 0);
    const sway = stepping ? Math.sin(f.walk) * 0.24 : 0;
    // idle Muay Thai bounce: a light rhythmic knee spring when set in the stance.
    const idle = !f.strike && f.koT < 0 && f.stunT <= 0 && !stepping;
    const bob = idle ? Math.max(0, Math.sin(this.t * 5.5 + f.x)) * 0.12 : 0;
    r.hipL.rotation.set(p.hlx + sway, 0, p.hlz);
    r.kneeL.rotation.x = p.klx + bob + (stepping ? Math.max(0, -Math.sin(f.walk)) * 0.3 : 0);
    r.hipR.rotation.set(p.hrx - sway, 0, p.hrz);
    r.kneeR.rotation.x = p.krx + bob + (stepping ? Math.max(0, Math.sin(f.walk)) * 0.3 : 0);
    // hit-reaction flinch: head/torso snap away from the strike, decaying fast.
    // rc: a sharp early spike (sin) that settles — reads as an impact recoil.
    let flZ = 0, flX = 0, flTwist = 0;
    if (f.recoilT > 0 && f.koT < 0) {
      const u = 1 - f.recoilT / f.recoilMax;           // 0→1 over the flinch
      const rc = Math.sin(Math.min(1, u * 1.4) * Math.PI) * f.recoilMag; // spike then settle
      flZ = f.recoilLZ * rc;                            // local fwd/back component
      flX = f.recoilLX * rc;                            // lateral component
      flTwist = f.recoilLX * rc * 0.5;
    }
    // torso: lean back/aside from the blow + a twist; loses guard crispness briefly.
    r.torso.rotation.set(p.ln - flZ * 0.5, p.tw + flTwist, flX * 0.4);
    r.tilt.position.z = p.lg;
    const stunWob = f.stunT > 0 ? Math.sin(this.t * 40) * 0.03 : 0;
    // stagger: shove the whole body along the world recoil dir (local→world).
    const fwdX = Math.sin(f.yaw), fwdZ = Math.cos(f.yaw), rgtX = fwdZ, rgtZ = -fwdX;
    const stX = (fwdX * flZ + rgtX * flX) * 0.22;
    const stZ = (fwdZ * flZ + rgtZ * flX) * 0.22;
    // rise lifts the whole body (knees onto the ball of the support foot); crouch
    // dips; the idle bounce dips the body a touch as the knees spring (bob>0).
    r.root.position.set(f.x + stX, -p.cr + p.rise - bob * 0.14 + stunWob - Math.abs(flZ) * 0.04, f.z + stZ);
    // face the opponent + a slight open stance + per-strike body-yaw pivot (by).
    r.root.rotation.y = f.yaw - 0.12 + p.by;
  }

  // ── fx (TimeGate patterns: soft additive sprites, short pools) ──
  private textSprite(text: string, hex: number): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const g = c.getContext("2d")!;
    g.font = "900 84px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "#" + hex.toString(16).padStart(6, "0");
    g.shadowBlur = 22;
    g.fillStyle = "#" + hex.toString(16).padStart(6, "0");
    g.fillText(text, 128, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  private spawnFloater(at: THREE.Vector3, text: string, hex: number, scale: number) {
    const s = this.textSprite(text, hex);
    s.scale.set(1.4 * scale, 0.7 * scale, 1);
    s.position.copy(at).add(new THREE.Vector3(0, 0.15, 0.2));
    this.scene.add(s);
    this.floaters.push({ sprite: s, t: 0, life: 0.8 });
  }

  // A bright additive flash sprite at the contact (impact "pop").
  private spawnSpark(at: THREE.Vector3, hex: number, scale: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: VrfcGame.softTex("rgba(255,255,255,1)"), color: hex, transparent: true, opacity: 0.98, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(0.4 * scale);
    s.position.copy(at);
    this.scene.add(s);
    this.sparks.push({ sprite: s, t: 0, life: 0.28, grow: 9 + scale * 4 });
  }

  // Radial particle burst at the contact (count + spread scale with weight).
  private spawnBurst(at: THREE.Vector3, hex: number, N = 16, scale = 1) {
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const sp = (1.5 + this.fxRand() * 2.5) * scale;
      const dx = this.fxRand() - 0.5, dy = this.fxRand() - 0.3, dz = this.fxRand() - 0.5;
      const inv = sp / (Math.hypot(dx, dy, dz) || 1);
      vel[i * 3] = dx * inv; vel[i * 3 + 1] = dy * inv; vel[i * 3 + 2] = dz * inv;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(N * 2), 2)); // silences WebGPU uv warning
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: VrfcGame.softTex("rgba(255,230,190,1)"), color: hex, size: 0.14 * (0.9 + scale * 0.3), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.bursts.push({ pts, vel, t: 0, life: 0.45, grav: 2 });
  }

  // Stylized sweat/energy spray — a cone of light-pops flung along the hit dir
  // (NOT gore; clean neon droplets). Weight scales count + speed.
  private spawnSpray(at: THREE.Vector3, hx: number, hz: number, weight: number) {
    const N = Math.round(10 + weight * 14);
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const l = Math.hypot(hx, hz) || 1; const nx = hx / l, nz = hz / l;
    for (let i = 0; i < N; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const sp = (2.5 + this.fxRand() * 4) * (0.7 + weight);
      // biased along the hit direction + upward, with spread
      const dx = nx + (this.fxRand() - 0.5) * 1.1, dy = 0.4 + this.fxRand() * 1.1, dz = nz + (this.fxRand() - 0.5) * 1.1;
      const inv = sp / (Math.hypot(dx, dy, dz) || 1);
      vel[i * 3] = dx * inv; vel[i * 3 + 1] = dy * inv; vel[i * 3 + 2] = dz * inv;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(N * 2), 2));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: VrfcGame.softTex("rgba(210,230,255,1)"), color: 0xdff0ff, size: 0.09, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.bursts.push({ pts, vel, t: 0, life: 0.6, grav: 6 }); // heavier gravity → droplet arc
  }

  // Motion-trail ribbon: start sampling the active limb tip at strike start; each
  // sampled point becomes a fading additive dot → a streak/arc along the swing.
  private startTrail(f: Fighter, tip: TipId, hex: number) {
    const CAP = 14;
    this.activeTrail = { f, tip, buf: new Float32Array(CAP * 3), n: 0, hex };
  }
  private sampleTrail() {
    const a = this.activeTrail;
    if (!a) return;
    const p = this.tipWorld(a.f, a.tip);
    const CAP = a.buf.length / 3;
    const i = (a.n % CAP) * 3;
    a.buf[i] = p.x; a.buf[i + 1] = p.y; a.buf[i + 2] = p.z;
    a.n++;
  }
  private flushTrail() {
    const a = this.activeTrail;
    this.activeTrail = null;
    if (!a || a.n < 3) return;
    const CAP = a.buf.length / 3;
    const count = Math.min(a.n, CAP);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = a.buf[i * 3]; pos[i * 3 + 1] = a.buf[i * 3 + 1]; pos[i * 3 + 2] = a.buf[i * 3 + 2]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: VrfcGame.softTex("rgba(255,255,255,1)"), color: a.hex, size: 0.22, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.trails.push({ pts, head: 0, count, life: 0.22, t: 0 });
  }

  private stepFx(dt: number) {
    for (const f of this.floaters) {
      f.t += dt;
      f.sprite.position.y += dt * 1.1;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t / f.life);
    }
    this.floaters = this.floaters.filter((f) => { if (f.t >= f.life) { this.disposeSprite(f.sprite); return false; } return true; });
    for (const s of this.sparks) {
      s.t += dt;
      const k = s.t / s.life;
      s.sprite.scale.setScalar(s.sprite.scale.x * (1 + dt * s.grow));
      (s.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.98 * (1 - k));
    }
    this.sparks = this.sparks.filter((s) => { if (s.t >= s.life) { this.disposeSprite(s.sprite); return false; } return true; });
    for (const b of this.bursts) {
      b.t += dt;
      const p = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, p.getX(i) + b.vel[i * 3] * dt, p.getY(i) + b.vel[i * 3 + 1] * dt - b.grav * b.t * dt, p.getZ(i) + b.vel[i * 3 + 2] * dt);
      }
      p.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.t / b.life);
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.t >= b.life) { this.scene.remove(b.pts); b.pts.geometry.dispose(); (b.pts.material as THREE.Material).dispose(); return false; }
      return true;
    });
    // motion trails — fade out fast.
    for (const tr of this.trails) { tr.t += dt; (tr.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 0.7 * (1 - tr.t / tr.life)); }
    this.trails = this.trails.filter((tr) => { if (tr.t >= tr.life) { this.scene.remove(tr.pts); tr.pts.geometry.dispose(); (tr.pts.material as THREE.Material).dispose(); return false; } return true; });

    // crowd camera flashes + hit flares
    for (const c of this.crowd) {
      c.flare = Math.max(0, c.flare - dt * 3.5);
      const v = Math.sin(this.t * c.f + c.ph);
      (c.s.material as THREE.SpriteMaterial).opacity = Math.max(v > 0.985 ? 0.9 : 0.05, c.flare);
    }
    // impact pop-light decays.
    this.impactLightT = Math.max(0, this.impactLightT - dt);
    this.impactLight.intensity = this.impactLightT > 0 ? this.impactLightT * 30 : 0;
    // ring-light flare decays.
    this.ringFlareT = Math.max(0, this.ringFlareT - dt * 2.4);
    (this.ringFlare.material as THREE.MeshBasicMaterial).opacity = this.ringFlareT * 0.7;
    // speed lines: face the camera, ramp with speedAmt (+ slow-mo), decay.
    this.speedAmt = Math.max(0, this.speedAmt - dt * 2.2);
    const slow = this.timeScale < 0.9 ? (1 - this.timeScale) * 0.6 : 0;
    (this.speedLines.material as THREE.LineBasicMaterial).opacity = Math.min(0.5, this.speedAmt * 0.5 + slow);
    this.speedLines.position.set(this.camera.position.x * 0.2, 1.2, this.camera.position.z * 0.2);
  }

  // ── camera: ringside, side-on to the line between the fighters so both stay
  // framed and all eight limbs read as they orbit + change depth. ──
  private stepCamera(dt: number) {
    const p = this.player, o = this.opp;
    const midX = (p.x + o.x) / 2, midZ = (p.z + o.z) / 2;
    const sep = Math.hypot(p.x - o.x, p.z - o.z);
    // Look ALONG the fighters' line; the camera sits perpendicular to it (ringside).
    // atan2(dz,dx): keep the near-side that stays closest to the last angle so the
    // view doesn't flip when they swap sides.
    const lineA = Math.atan2(o.z - p.z, o.x - p.x);
    let camA = lineA + Math.PI / 2;              // perpendicular = ringside
    let da = camA - this.camAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > Math.PI / 2) { camA += Math.PI; da = camA - this.camAngle; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; }
    this.camAngle += da * (1 - Math.exp(-3 * dt));

    const dist = 4.6 + sep * 0.5;
    let cx = midX + Math.cos(this.camAngle) * dist;
    let cz = midZ + Math.sin(this.camAngle) * dist;
    let cy = 2.1, lx = midX, lz = midZ, ly = 1.05;
    if (this.zoomTarget) { // KO punch-in — pull toward the downed fighter
      cx = this.zoomTarget.x + Math.cos(this.camAngle) * 2.9;
      cz = this.zoomTarget.z + Math.sin(this.camAngle) * 2.9;
      cy = 1.5; lx = this.zoomTarget.x; lz = this.zoomTarget.z; ly = 0.8;
    }
    const k = 1 - Math.exp(-4 * dt);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    // directional camera kick (a jolt in the hit dir) + screen shake, both eased.
    this.camera.position.x += this.camKickX;
    this.camera.position.y += this.camKickY;
    this.camKickX *= Math.exp(-11 * dt);
    this.camKickY *= Math.exp(-11 * dt);
    if (this.shake > 0.001) {
      this.camera.position.x += Math.sin(this.t * 91) * this.shake;
      this.camera.position.y += Math.cos(this.t * 77) * this.shake * 0.7;
      this.shake *= Math.exp(-7 * dt);
    }
    this.camera.lookAt(lx, ly, lz);
  }

  // ── main loop ──
  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let real = (now - this.lastT) / 1000;
    this.lastT = now;
    if (real > 1 / 20) real = 1 / 20;
    // HIT-STOP: freeze the sim for a few frames on impact — the "it connects" trick.
    if (this.hitStop > 0) {
      this.hitStop -= real;
      this.stepFx(real * 0.15);          // fx crawl during the freeze (keeps flash alive)
      this.stepCamera(real);             // camera still settles/shakes
      this.renderFrame();
      return;
    }
    // KO cinematic keeps time crawling; otherwise slow-mo eases back to normal.
    this.koCineT = Math.max(0, this.koCineT - real);
    const target = this.koCineT > 0 ? 0.18 : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, real * (this.koCineT > 0 ? 4 : 1.6));
    const dt = real * this.timeScale;
    if (this.mode !== "over") this.step(dt, real);
    this.renderFrame();
  };

  // Render through the stylized look; if it ever throws, drop to plain render.
  private renderFrame() {
    if (this.look) {
      try { this.look.render(); }
      catch { try { this.look.dispose(); } catch {} this.look = null; this.renderer.render(this.scene, this.camera); }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private step(dt: number, real: number) {
    this.t += dt;
    this.modeT += real;

    if (this.mode === "intro") {
      this.state.banner = this.modeT < 1.1 ? `ROUND ${this.state.round}` : "FIGHT!";
      if (this.modeT >= 1.9) { this.mode = "fight"; this.state.banner = ""; }
    } else if (this.mode === "fight") {
      this.state.roundTime -= dt;
      if (this.state.roundTime <= 0) {
        this.state.roundTime = 0;
        this.endRound(this.player.hp >= this.opp.hp, false); // tie → yours
      }
      this.readKeys();
      this.stepAI(dt);
    } else if (this.mode === "end") {
      if (this.matchDone && this.modeT > 1.4) this.state.banner = this.state.playerRounds > this.state.oppRounds ? "VICTORY!" : "DEFEAT";
      if (this.modeT >= (this.matchDone ? 3.0 : 2.4)) {
        if (this.matchDone) return this.finish();
        this.nextRound();
      }
    }

    this.comboT -= dt;
    if (this.comboT <= 0) this.state.combo = 0;

    this.stepFighter(this.player, this.opp, dt);
    this.stepFighter(this.opp, this.player, dt);
    this.stepFx(dt);
    this.stepCamera(real);

    this.state.playerHp = this.player.hp;
    this.state.oppHp = this.opp.hp;
    this.state.stamina = this.player.st;
    this.emit();
  }

  private emit() { this.onState({ ...this.state }); }

  // ── input ──
  private canvas!: HTMLCanvasElement;
  private bindInput(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.style.touchAction = "none";
  }

  // Desktop map: A/D or ←→ = circle · W/S or ↑↓ = advance/retreat · J/K/L jab/
  // cross/hook · U/I/O elbow/knee/kick · Space (hold) = block · Shift = dodge.
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === "j") this.strike("jab");
    else if (k === "k") this.strike("cross");
    else if (k === "l") this.strike("hook");
    else if (k === "u") this.strike("elbow");
    else if (k === "i") this.strike("knee");
    else if (k === "o") this.strike("kick");
    else if (k === "shift") this.dodge();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  private readKeys() {
    const k = this.keys;
    // circle (strafe): perpendicular orbit. keys override touch when pressed.
    let cir = 0;
    if (k.has("a") || k.has("arrowleft")) cir -= 1;
    if (k.has("d") || k.has("arrowright")) cir += 1;
    if (cir !== 0) this.player.circle = cir;
    else if (this.keyCircleActive) this.player.circle = 0;
    this.keyCircleActive = cir !== 0;
    // advance/retreat along the facing line.
    let adv = 0;
    if (k.has("w") || k.has("arrowup")) adv += 1;
    if (k.has("s") || k.has("arrowdown")) adv -= 1;
    if (adv !== 0) this.player.advance = adv;
    else if (this.keyAdvActive) this.player.advance = 0;
    this.keyAdvActive = adv !== 0;
    // block = space (hold).
    if (k.has(" ")) this.player.blockHeld = true;
    else if (this.keyBlockActive) this.player.blockHeld = false;
    this.keyBlockActive = k.has(" ");
  }
  private keyCircleActive = false;
  private keyAdvActive = false;
  private keyBlockActive = false;

  private resize = () => {
    if (!this.renderer) return;
    const w = this.canvas?.clientWidth || window.innerWidth;
    const h = this.canvas?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ── teardown ──
  private disposeSprite(s: THREE.Sprite) {
    this.scene.remove(s);
    const mat = s.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
  }

  private disposeObj(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      if (mat) { mat.map?.dispose?.(); mat.dispose?.(); }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.floaters.forEach((f) => this.disposeSprite(f.sprite));
    this.sparks.forEach((s) => this.disposeSprite(s.sprite));
    this.bursts.forEach((b) => { this.scene.remove(b.pts); b.pts.geometry.dispose(); (b.pts.material as THREE.Material).dispose(); });
    this.trails.forEach((tr) => { this.scene.remove(tr.pts); tr.pts.geometry.dispose(); (tr.pts.material as THREE.Material).dispose(); });
    this.crowd.forEach((c) => this.disposeSprite(c.s));
    const roots: THREE.Object3D[] = [];
    if (this.player) roots.push(this.player.rig.root);
    if (this.opp) roots.push(this.opp.rig.root);
    for (const o of [...roots, ...this.scene.children]) {
      try { this.disposeObj(o); } catch {}
    }
    try { this.look?.dispose(); } catch {}
    try { this.renderer?.dispose(); } catch {}
  }
}
