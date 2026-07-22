// Time Gate — WebGPU on-rails space flight. Rez-style depth tunnel + numbered
// prime-gate forks + enemies + wrong-ring TIME LOOP + adaptive synth + a BOOST
// meter that rings refill. Follows the gamerplex web stack: three/webgpu (0.183,
// PLG-proven import), Frame basis, mobile budget (DPR<=2, clamped dt),
// deterministic seeded spawns (challenge-link replayable). The deeper
// math-pattern wormholes are L2+ (see TIME_GATE.md).
//
// THE PATTERN: gates are labelled with numbers counting up in PRIMES
// (2,3,5,7,11…). Fly the ring showing the NEXT prime → score + time + boost.
// A fork shows a decoy (non-prime / wrong number) — take it and you're pulled
// off-axis into a time loop (critical hull drain; hold BOOST to power out).

import * as THREE from "three/webgpu";
import { rng } from "./frame";
import { TimeGateMusic } from "./music";

export interface HudState {
  phase: "playing" | "over";
  score: number;
  timeLeft: number;
  hull: number; // 0..100
  boost: number; // 0..100
  gates: number;
  level: number;
  loop: boolean;
  loopProgress: number; // 0..1 — how close to breaking out of the time loop
  lastNum: number; // last number collected (HUD hint)
  pattern: string; // current sequence rule name (HUD)
}

const C = {
  BASE_SPEED: 40,
  SPEED_PER_LEVEL: 6,
  BOOST_MUL: 1.7,
  BRAKE_MUL: 0.6,
  PLAYER_Z: 0,
  CAMERA_Z: 7,
  CAMERA_Y: 1.4,
  SPAWN_Z: -240,
  DESPAWN_Z: 12,
  BOUND_X: 13,
  BOUND_Y: 8,
  STEER_SPEED: 26,
  GATE_R: 3.4,
  ENEMY_R: 1.5,
  LASER_SPEED: 180,
  LASER_COOLDOWN: 0.14,
  START_TIME: 30,
  GATE_TIME_BONUS: 2.4,
  HULL_MAX: 100,
  ENEMY_HIT_HULL: 16,
  MISS_GATE_HULL: 6,
  GATES_PER_LEVEL: 6,
  BOOST_MAX: 100,
  BOOST_DRAIN: 36, // per sec while boosting
  BOOST_REFILL: 30, // per correct ring
  TUNNEL_R: 17,
  TUNNEL_RING_GAP: 9,
  TUNNEL_RINGS: 28,
  TUNNEL_LINES: 24,
  FORK_EVERY: 3,
  LOOP_DURATION: 3.4,
  LOOP_DPS: 15,
};

// first N primes (sieve).
const PRIMES = (() => {
  const out: number[] = [];
  for (let n = 2; out.length < 40; n++) {
    let p = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; }
    if (p) out.push(n);
  }
  return out;
})();
const FIB = (() => {
  const out = [1, 2];
  for (let i = 2; i < 40; i++) out.push(out[i - 1] + out[i - 2]);
  return out;
})();

// The escalating math patterns (see TIME_GATE.md). Each LEVEL uses the next
// pattern — the correct ring continues the sequence; a decoy is a nearby number
// NOT in it. Only the first GATES_PER_LEVEL values of each are ever shown.
interface Pattern { label: string; values: number[]; set: Set<number>; decoy(expected: number): number; }
function pat(label: string, gen: (i: number) => number): Pattern {
  const values: number[] = [];
  for (let i = 0; i < 12; i++) values.push(gen(i));
  const set = new Set(values);
  return {
    label, values, set,
    decoy(expected: number): number {
      for (const d of [expected + 1, expected - 1, expected + 2, expected + 3, expected - 2]) {
        if (d > 1 && !set.has(d)) return d;
      }
      return expected + 1;
    },
  };
}
const PATTERNS: Pattern[] = [
  pat("PRIMES", (i) => PRIMES[i]),
  pat("×3", (i) => 3 * (i + 1)),
  pat("SQUARES", (i) => (i + 1) * (i + 1)),
  pat("FIBONACCI", (i) => FIB[i]),
  pat("×2 DOUBLING", (i) => 2 ** (i + 1)),
];

type Gate = { mesh: THREE.Mesh; label: THREE.Sprite; x: number; y: number; z: number; num: number; scored: boolean; correct: boolean; fork: boolean; pattern: string };
type Enemy = { mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; alive: boolean; passed: boolean };
type Laser = { mesh: THREE.Mesh; z: number; x: number; y: number };

export class TimeGateGame {
  private renderer!: THREE.WebGPURenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
  private ship = new THREE.Group();
  private stars!: THREE.Points;
  private tunnelRings: THREE.Mesh[] = [];
  private tunnelLines!: THREE.LineSegments;
  private tube!: THREE.Mesh;              // glowing chamber wall
  private gates: Gate[] = [];
  private enemies: Enemy[] = [];
  private lasers: Laser[] = [];
  private music = new TimeGateMusic();

  // ── FX state (visual only — no gameplay effect) ──
  private engineCores: THREE.Mesh[] = []; // pulsing thruster glows
  private trail!: THREE.Mesh;             // exhaust plume behind the ship
  private warpLines!: THREE.LineSegments; // hyperspace streaks (ramp with speed/boost)
  private warpAmt = 0;                    // eased 0..1 warp intensity
  private shocks: { mesh: THREE.Mesh; t: number; life: number }[] = []; // gate-pass shockwaves
  private floaters: { sprite: THREE.Sprite; t: number; life: number; vy: number }[] = []; // +score popups
  private bursts: { pts: THREE.Points; vel: Float32Array; t: number; life: number; flash: THREE.Sprite }[] = []; // enemy explosions
  private t = 0;                          // animation clock

  private rand: () => number;
  private onState: (s: HudState) => void;
  private onEvent: (e: string) => void;

  private target = { x: 0, y: 0 };
  // Visible play half-extents at the ship plane — computed from the camera
  // frustum in resize() so the ship (and spawns) stay ON SCREEN. The old fixed
  // ±13/±8 were far wider than the view, so you could fly clean off-screen.
  private boundX = 6.5;
  private boundY = 4.2;
  private keys = new Set<string>();
  private firing = false;
  private boosting = false;
  private braking = false;
  private pointerActive = false;

  private state: HudState = { phase: "playing", score: 0, timeLeft: C.START_TIME, hull: C.HULL_MAX, boost: C.BOOST_MAX, gates: 0, level: 1, loop: false, loopProgress: 0, lastNum: 0, pattern: PATTERNS[0].label };
  private fireCd = 0;
  private nextSpawnZ = -40;
  private spawnGateCount = 0; // gate-steps spawned → drives pattern + position
  private loopT = 0;
  private loopAnim = 0;
  private running = false;
  private raf = 0;
  private lastT = 0;
  private disposed = false;

  constructor(seed: number, onState: (s: HudState) => void, onEvent: (e: string) => void) {
    this.rand = rng(seed);
    this.onState = onState;
    this.onEvent = onEvent;
  }

  async start(canvas: HTMLCanvasElement) {
    try {
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
      await this.renderer.init();
    } catch {
      this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true } as never);
      await this.renderer.init();
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(0x03010a);
    this.scene.fog = new THREE.Fog(0x070218, 90, 260);

    this.camera.position.set(0, C.CAMERA_Y, C.CAMERA_Z);
    this.camera.lookAt(0, 0, -30);

    this.scene.add(new THREE.AmbientLight(0x7080ff, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 6, 8);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x9945ff, 2.2, 60);   // purple rim from behind
    rim.position.set(0, 2, 10);
    this.scene.add(rim);
    const under = new THREE.PointLight(0x14f195, 1.4, 40);  // green underglow on the ship
    under.position.set(0, -3, 2);
    this.scene.add(under);

    this.buildStars();
    this.buildWarp();
    this.buildTunnel();
    this.buildShip();
    this.scene.add(this.ship);

    this.bindInput(canvas);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.music.start();

    this.running = true;
    this.lastT = performance.now();
    this.loop();
  }

  // Soft radial sprite used for star glints + big nebula clouds.
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

  private buildStars() {
    const N = 1300;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (this.rand() - 0.5) * 150;
      pos[i * 3 + 1] = (this.rand() - 0.5) * 100;
      pos[i * 3 + 2] = -this.rand() * 320;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        map: TimeGateGame.softTex("rgba(200,225,255,1)"),
        color: 0xbfe0ff, size: 1.1, sizeAttenuation: true,
        transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.stars);

    // A few huge, faint nebula clouds far down the tube for colour + depth.
    const nebTex = TimeGateGame.softTex("rgba(120,90,255,0.55)");
    const cols = [0x6b3bff, 0x14f195, 0x2f6fb0, 0xff3b6b];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex, color: cols[i % cols.length], transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(50 + this.rand() * 40);
      s.position.set((this.rand() - 0.5) * 70, (this.rand() - 0.5) * 50, -60 - this.rand() * 240);
      this.scene.add(s);
    }
  }

  // Hyperspace streaks — radial line segments that ramp up with speed/boost for
  // the "warp" rush. Purely additive, sits behind everything.
  private buildWarp() {
    const N = 90;
    const segs: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 6 + this.rand() * 20;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const z = -20 - this.rand() * 240;
      segs.push(x, y, z, x, y, z - (10 + this.rand() * 22)); // a streak along -z
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    this.warpLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.warpLines);
  }

  // Rez depth tunnel — faint wireframe rings streaming toward the camera +
  // longitudinal lines. The biggest depth cue: gates read as a wormhole in a
  // tube, not floating in a void.
  // The chamber: bright additive rings streaming toward the camera (each with its
  // own material so it can pulse), longitudinal spokes, and a faint glowing tube
  // wall so the whole thing reads as a luminous wormhole, not floating rings.
  private buildTunnel() {
    const ringGeo = new THREE.TorusGeometry(C.TUNNEL_R, 0.13, 8, 64);
    for (let i = 0; i < C.TUNNEL_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3f7fd6, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(ringGeo, mat);
      m.position.z = -i * C.TUNNEL_RING_GAP;
      this.scene.add(m);
      this.tunnelRings.push(m);
    }
    const segs: number[] = [];
    for (let i = 0; i < C.TUNNEL_LINES; i++) {
      const a = (i / C.TUNNEL_LINES) * Math.PI * 2;
      const x = Math.cos(a) * C.TUNNEL_R;
      const y = Math.sin(a) * C.TUNNEL_R;
      segs.push(x, y, C.CAMERA_Z, x, y, C.SPAWN_Z);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    this.tunnelLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3f7fd6, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.tunnelLines);

    // Glowing chamber wall — a long open cylinder around the flight path.
    const tubeGeo = new THREE.CylinderGeometry(C.TUNNEL_R + 0.6, C.TUNNEL_R + 0.6, 340, 48, 1, true);
    this.tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: 0x14306b, transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tube.rotation.x = Math.PI / 2;
    this.tube.position.z = -150;
    this.scene.add(this.tube);
  }

  // Tint the whole chamber one hue (opacity is driven by the pulse in scrollTunnel).
  private tintTunnel(hex: number) {
    for (const m of this.tunnelRings) (m.material as THREE.MeshBasicMaterial).color.setHex(hex);
    (this.tunnelLines.material as THREE.LineBasicMaterial).color.setHex(hex);
    (this.tube.material as THREE.MeshBasicMaterial).color.setHex(hex === 0xff2244 ? 0x5a0a18 : 0x14306b);
  }

  private buildShip() {
    const hull = new THREE.MeshStandardMaterial({ color: 0xd2dcf0, metalness: 0.82, roughness: 0.24, emissive: 0x0a1226 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x14f195, emissive: 0x0a6a44, metalness: 0.5, roughness: 0.4 });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.7, 18), hull);
    nose.rotation.x = -Math.PI / 2; nose.position.z = -1.55;             // tip forward (-z)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.8, 18), hull);
    body.rotation.x = Math.PI / 2; body.position.z = -0.35;
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8ff0ff, emissive: 0x0a4a66, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.92 }),
    );
    cockpit.position.set(0, 0.24, -0.75);

    const wingGeo = new THREE.BoxGeometry(1.5, 0.07, 0.95);
    const wl = new THREE.Mesh(wingGeo, accent); wl.position.set(-0.78, -0.05, 0.35); wl.rotation.set(0, 0.34, 0.14);
    const wr = new THREE.Mesh(wingGeo, accent); wr.position.set(0.78, -0.05, 0.35); wr.rotation.set(0, -0.34, -0.14);

    // Engine nacelles + additive glowing cores (pulse in the loop) + halos.
    const naGeo = new THREE.CylinderGeometry(0.16, 0.21, 0.62, 14);
    const haloTex = TimeGateGame.softTex("rgba(150,225,255,0.95)");
    for (const sx of [-0.44, 0.44]) {
      const na = new THREE.Mesh(naGeo, hull); na.rotation.x = Math.PI / 2; na.position.set(sx, -0.05, 0.72);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), new THREE.MeshBasicMaterial({ color: 0xaeeeff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.position.set(sx, -0.05, 1.0);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x35e0ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.0); halo.position.set(sx, -0.05, 1.05);
      this.ship.add(na, core, halo);
      this.engineCores.push(core);
    }

    this.ship.add(nose, body, cockpit, wl, wr);

    // Exhaust plume — an additive cone that flares from the engines and streams
    // backward; grows + brightens with speed/boost (animated in step()).
    this.trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 2.8, 18, 1, true),
      new THREE.MeshBasicMaterial({ map: TimeGateGame.softTex("rgba(150,220,255,0.95)", "rgba(20,60,120,0)"), color: 0x35e0ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.trail.rotation.x = Math.PI / 2;  // tip trails backward (+z)
    this.trail.position.z = 1.7;
    this.ship.add(this.trail);

    this.ship.position.set(0, 0, C.PLAYER_Z);
  }

  private numberSprite(n: number, hex: number): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 128, 128);
    g.font = "bold 88px monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#" + hex.toString(16).padStart(6, "0");
    g.fillText(String(n), 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(3, 3, 1);
    return s;
  }

  private neonRing(color: number, tube: number) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(C.GATE_R, tube, 12, 52),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    // Soft additive halo so the ring blooms even without post-processing.
    const shell = new THREE.Mesh(
      new THREE.TorusGeometry(C.GATE_R, tube * 2.8, 12, 52),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.add(shell);
    return ring;
  }

  private spawnGate(z: number, correct: boolean, fork: boolean, num: number, patternLabel: string, xOverride?: number) {
    // Spawn centres inside the visible box so every ring is reachable on-screen.
    const clamp = (v: number, b: number) => Math.max(-b, Math.min(b, v));
    const x = xOverride !== undefined ? clamp(xOverride, this.boundX * 0.9) : (this.rand() - 0.5) * 2 * this.boundX * 0.55;
    const y = (this.rand() - 0.5) * 2 * this.boundY * 0.55;
    const hex = correct ? 0x14f195 : 0xff3b6b;
    const mesh = this.neonRing(hex, correct ? 0.3 : 0.34);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const label = this.numberSprite(num, correct ? 0xaaffdd : 0xffb3c4);
    label.position.set(x, y, z);
    this.scene.add(label);
    this.gates.push({ mesh, label, x, y, z, num, scored: false, correct, fork, pattern: patternLabel });
  }

  private spawnFork(z: number, expected: number, p: Pattern) {
    // Independent placement (tester: the two rings shouldn't be a fixed mirrored
    // pair). Vary the gap and slide the pair off-centre so a run sometimes hugs
    // one edge — both stay on-screen (clamped) and clearly separate. Seeded.
    const maxX = this.boundX * 0.85;
    const half = Math.min(maxX, (0.45 + this.rand() * 0.9) * maxX * 0.5);
    const centre = (this.rand() - 0.5) * 2 * Math.max(0, maxX - half);
    const clamp = (v: number) => Math.max(-maxX, Math.min(maxX, v));
    const left = clamp(centre - half);
    const right = clamp(centre + half);
    const correctLeft = this.rand() < 0.5;
    this.spawnGate(z, true, true, expected, p.label, correctLeft ? left : right);
    this.spawnGate(z, false, true, p.decoy(expected), p.label, correctLeft ? right : left);
  }

  private spawnEnemy(z: number) {
    const x = (this.rand() - 0.5) * 2 * this.boundX * 0.85;
    const y = (this.rand() - 0.5) * 2 * this.boundY * 0.85;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(C.ENEMY_R, 0), new THREE.MeshStandardMaterial({ color: 0xff8a3b, emissive: 0x7a3a0a, metalness: 0.3, roughness: 0.5 }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.enemies.push({ mesh, x, y, z, vx: (this.rand() - 0.5) * 6, alive: true, passed: false });
  }

  private fire() {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.rotation.x = Math.PI / 2;
    const x = this.ship.position.x, y = this.ship.position.y;
    m.position.set(x, y, C.PLAYER_Z - 1);
    this.scene.add(m);
    this.lasers.push({ mesh: m, z: C.PLAYER_Z - 1, x, y });
    this.onEvent("shot");
  }

  // Expanding additive ring left behind when you thread a correct gate.
  private spawnShock(x: number, y: number, z: number, color: number) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(C.GATE_R, 0.16, 10, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.position.set(x, y, z);
    this.scene.add(m);
    this.shocks.push({ mesh: m, t: 0, life: 0.5 });
  }
  private updateShocks(dt: number) {
    for (const s of this.shocks) {
      s.t += dt;
      const k = s.t / s.life;
      const sc = 1 + k * 3;
      s.mesh.scale.set(sc, sc, sc);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      s.mesh.position.z += this.speed() * dt;
    }
    this.shocks = this.shocks.filter((s) => { if (s.t >= s.life) { this.disposeMesh(s.mesh); return false; } return true; });
  }

  // Floating "+score" popup that rises + fades where you threaded a gate.
  private textSprite(text: string, hex: number): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const g = c.getContext("2d")!;
    g.font = "900 72px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#" + hex.toString(16).padStart(6, "0"); g.shadowBlur = 24;
    g.fillStyle = "#" + hex.toString(16).padStart(6, "0");
    g.fillText(text, 128, 66);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  }
  private spawnFloater(x: number, y: number, z: number, text: string, hex: number) {
    const s = this.textSprite(text, hex);
    s.scale.set(6, 3, 1);
    s.position.set(x, y, z);
    this.scene.add(s);
    this.floaters.push({ sprite: s, t: 0, life: 0.95, vy: 7 });
  }
  private updateFloaters(dt: number) {
    for (const f of this.floaters) {
      f.t += dt;
      const k = f.t / f.life;
      f.sprite.position.y += f.vy * dt;
      f.sprite.position.z += this.speed() * dt;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      const sc = 1 + k * 0.5;
      f.sprite.scale.set(6 * sc, 3 * sc, 1);
    }
    this.floaters = this.floaters.filter((f) => { if (f.t >= f.life) { this.disposeSprite(f.sprite); return false; } return true; });
  }

  // Enemy explosion — an additive particle burst + a bright flash, instead of the
  // enemy just vanishing.
  private spawnExplosion(x: number, y: number, z: number, hex: number) {
    const N = 26;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const sp = 5 + this.rand() * 9;
      const dx = this.rand() - 0.5, dy = this.rand() - 0.5, dz = this.rand() - 0.5;
      const inv = sp / (Math.hypot(dx, dy, dz) || 1);
      vel[i * 3] = dx * inv; vel[i * 3 + 1] = dy * inv; vel[i * 3 + 2] = dz * inv;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: TimeGateGame.softTex("rgba(255,210,150,1)"), color: hex, size: 1.5, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TimeGateGame.softTex("rgba(255,235,190,1)"), color: hex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.scale.setScalar(4); flash.position.set(x, y, z);
    this.scene.add(flash);
    this.bursts.push({ pts, vel, t: 0, life: 0.6, flash });
  }
  private updateBursts(dt: number) {
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      const p = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      const drift = this.speed() * dt;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, p.getX(i) + b.vel[i * 3] * dt, p.getY(i) + b.vel[i * 3 + 1] * dt, p.getZ(i) + b.vel[i * 3 + 2] * dt + drift);
      }
      p.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - k);
      b.flash.position.z += drift;
      b.flash.scale.setScalar(4 * (1 + k * 2.4));
      (b.flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.95 * (1 - k * 2.2));
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.t >= b.life) {
        this.scene.remove(b.pts); b.pts.geometry.dispose(); (b.pts.material as THREE.Material).dispose();
        this.disposeSprite(b.flash);
        return false;
      }
      return true;
    });
  }

  // Per-frame ship life: thruster pulse, exhaust plume length, warp streaks.
  private animateShip(dt: number) {
    const boostOn = this.boosting && this.state.boost > 0;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 12);
    for (const c of this.engineCores) {
      c.scale.setScalar((boostOn ? 1.55 : 1) * pulse);
      (c.material as THREE.MeshBasicMaterial).opacity = boostOn ? 1 : 0.85;
    }
    if (this.trail) {
      const len = boostOn ? 2.3 : 1;
      this.trail.scale.set(1, len, 1);
      (this.trail.material as THREE.MeshBasicMaterial).opacity = (boostOn ? 0.9 : 0.5) * pulse;
      this.trail.position.z = 1.7 + (len - 1) * 1.3;
    }
    const target = boostOn ? 0.95 : 0.12;
    this.warpAmt += (target - this.warpAmt) * Math.min(1, dt * 6);
    (this.warpLines.material as THREE.LineBasicMaterial).opacity = this.warpAmt;
  }

  private speed() {
    let s = C.BASE_SPEED + (this.state.level - 1) * C.SPEED_PER_LEVEL;
    if (this.boosting && this.state.boost > 0) s *= C.BOOST_MUL;
    else if (this.braking) s *= C.BRAKE_MUL;
    return s;
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 1 / 20) dt = 1 / 20;
    if (this.state.phase === "playing") {
      if (this.loopT > 0) this.stepLoop(dt);
      else this.step(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private scrollTunnel(scroll: number) {
    const base = this.state.loop ? 0.62 : 0.42;
    for (const m of this.tunnelRings) {
      m.position.z += scroll;
      if (m.position.z > C.CAMERA_Z) m.position.z -= C.TUNNEL_RINGS * C.TUNNEL_RING_GAP;
      // Travelling brightness + scale pulse so the chamber breathes.
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = base * (0.55 + 0.45 * Math.sin(this.t * 3 + m.position.z * 0.12));
      const s = 1 + 0.03 * Math.sin(this.t * 4 + m.position.z * 0.1);
      m.scale.set(s, s, 1);
    }
  }

  private parallax(scroll: number) {
    const spos = this.stars.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < spos.count; i++) {
      let z = spos.getZ(i) + scroll;
      if (z > C.CAMERA_Z) z -= 300;
      spos.setZ(i, z);
    }
    spos.needsUpdate = true;
  }

  // ---- wrong-ring TIME LOOP ----
  private startLoop(z: number) {
    this.loopT = C.LOOP_DURATION;
    this.loopAnim = 0;
    this.state.loop = true;
    this.state.loopProgress = 0;
    this.onEvent("loop");
    this.music.thud();
    for (const g of this.gates) if (Math.abs(g.z - z) < 4) g.scored = true;
    this.tintTunnel(0xff2244);
    (this.scene.background as THREE.Color).setHex(0x220008);
    (this.scene.fog as THREE.Fog).color.setHex(0x220008);
  }

  private stepLoop(dt: number) {
    this.t += dt;
    const powering = (this.boosting || this.keys.has("Shift")) && this.state.boost > 0;
    if (powering) this.state.boost = Math.max(0, this.state.boost - C.BOOST_DRAIN * 1.4 * dt);
    this.loopT -= dt * (powering ? 2.6 : 1);
    this.loopAnim += dt;
    this.state.hull -= C.LOOP_DPS * dt * (powering ? 0.7 : 1);

    if (Math.floor(this.loopAnim / 0.6) !== Math.floor((this.loopAnim - dt) / 0.6)) this.music.thud();

    // Escape progress (fills faster while boosting) — surfaced to the HUD so the
    // player can SEE they're breaking free.
    this.state.loopProgress = Math.max(0, Math.min(1, 1 - this.loopT / C.LOOP_DURATION));

    // Tense but READABLE distortion: a gentle bounded wobble + small roll (SET,
    // not accumulated — the old code did `rotation.z +=` and swung ±9 in x, which
    // threw the whole scene across the screen and hid the warning). Calmer while
    // boosting, to reward the escape input.
    const wob = powering ? 0.16 : 0.34;
    this.camera.position.set(
      Math.sin(this.loopAnim * 7) * wob,
      C.CAMERA_Y + Math.sin(this.loopAnim * 5.5) * wob,
      C.CAMERA_Z + Math.sin(this.loopAnim * 2) * 0.5,
    );
    this.camera.lookAt(0, 0, -30);
    this.camera.rotation.z = Math.sin(this.loopAnim * 2.4) * (powering ? 0.06 : 0.1);

    this.scrollTunnel(this.speed() * dt * 0.6);
    this.parallax(this.speed() * dt * 0.6);

    if (this.state.hull <= 0) { this.state.hull = 0; return this.exitLoop(true); }
    if (this.loopT <= 0) return this.exitLoop(false);
    this.emit();
  }

  private exitLoop(dead: boolean) {
    this.loopT = 0;
    this.state.loop = false;
    this.state.loopProgress = 0;
    this.camera.position.set(0, C.CAMERA_Y, C.CAMERA_Z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 0, -30);
    this.tintTunnel(0x3f7fd6);
    (this.scene.background as THREE.Color).setHex(0x05010f);
    (this.scene.fog as THREE.Fog).color.setHex(0x05010f);
    if (dead) return this.gameOver();
    this.onEvent("escaped");
    this.emit();
  }

  private step(dt: number) {
    this.t += dt;
    this.state.timeLeft -= dt;
    if (this.state.timeLeft <= 0) return this.gameOver();

    this.readKeys(dt);
    if (this.boosting && this.state.boost > 0) this.state.boost = Math.max(0, this.state.boost - C.BOOST_DRAIN * dt);

    const sp = this.ship.position;
    const k = Math.min(1, dt * 13); // snappy, frame-rate independent
    sp.x += (this.target.x - sp.x) * k;
    sp.y += (this.target.y - sp.y) * k;
    sp.x = Math.max(-this.boundX, Math.min(this.boundX, sp.x));
    sp.y = Math.max(-this.boundY, Math.min(this.boundY, sp.y));
    const dx = this.target.x - sp.x;
    this.ship.rotation.z += ((-dx * 0.12) - this.ship.rotation.z) * 0.2;
    this.ship.rotation.x += ((this.target.y - sp.y) * -0.05 - this.ship.rotation.x) * 0.2;

    const scroll = this.speed() * dt;
    this.scrollTunnel(scroll);

    this.fireCd -= dt;
    if (this.firing && this.fireCd <= 0) { this.fire(); this.fireCd = C.LASER_COOLDOWN; }

    // spawn director — numbered prime gates (spaced out), enemies fill the gaps.
    while (this.nextSpawnZ > C.SPAWN_Z) {
      const z = this.nextSpawnZ;
      if (this.rand() < 0.42) {
        const block = Math.floor(this.spawnGateCount / C.GATES_PER_LEVEL);
        const p = PATTERNS[block % PATTERNS.length];
        const posInBlock = this.spawnGateCount % C.GATES_PER_LEVEL;
        const expected = p.values[posInBlock];
        if ((this.spawnGateCount + 1) % C.FORK_EVERY === 0) this.spawnFork(z, expected, p);
        else this.spawnGate(z, true, false, expected, p.label);
        this.spawnGateCount++;
        this.nextSpawnZ -= 24 + this.rand() * 12;
      } else {
        this.spawnEnemy(z);
        this.nextSpawnZ -= 12 + this.rand() * 8;
      }
    }
    this.nextSpawnZ += scroll;

    for (const l of this.lasers) { l.z -= C.LASER_SPEED * dt; l.mesh.position.z = l.z; }

    // nearest upcoming correct gate → music crescendo
    let nearest = Infinity;
    for (const g of this.gates) if (!g.scored && g.correct && g.z < C.PLAYER_Z && g.z > -70) nearest = Math.min(nearest, -g.z);
    this.music.setApproach(nearest < Infinity ? 1 - nearest / 70 : 0);

    for (const g of this.gates) {
      g.z += scroll;
      g.mesh.position.z = g.z;
      g.label.position.set(g.x, g.y, g.z);
      g.mesh.rotation.z += dt * (g.correct ? 0.4 : 1.6);
      if (!g.correct) {
        const s = 1 + Math.sin(g.z * 0.5 + performance.now() * 0.004) * 0.12;
        g.mesh.scale.set(s, s, s);
      }
      if (!g.scored && g.z >= C.PLAYER_Z) {
        const inRing = Math.hypot(sp.x - g.x, sp.y - g.y) <= C.GATE_R;
        if (inRing && !g.correct) { g.scored = true; return this.startLoop(g.z); }
        g.scored = true;
        if (inRing) {
          const pts = 100 * this.state.level;
          this.state.score += pts;
          this.state.timeLeft = Math.min(C.START_TIME, this.state.timeLeft + C.GATE_TIME_BONUS);
          this.state.boost = Math.min(C.BOOST_MAX, this.state.boost + C.BOOST_REFILL);
          this.state.gates++;
          this.state.lastNum = g.num;
          this.state.pattern = g.pattern;
          // Golden success pop: recolour the threaded ring gold + gold shockwave + a rising "+score".
          const gold = 0xffd24a;
          (g.mesh.material as THREE.MeshBasicMaterial).color.setHex(gold);
          const shell = g.mesh.children[0] as THREE.Mesh | undefined;
          if (shell) (shell.material as THREE.MeshBasicMaterial).color.setHex(gold);
          g.mesh.scale.setScalar(1.25);
          this.spawnShock(g.x, g.y, g.z, gold);
          this.spawnFloater(g.x, g.y, g.z, "+" + pts, gold);
          this.music.hit();
          this.onEvent("gate");
          if (this.state.gates % C.GATES_PER_LEVEL === 0) { this.state.level++; this.onEvent("level"); }
        } else if (!g.fork) {
          this.state.hull -= C.MISS_GATE_HULL;
          this.music.thud();
          this.onEvent("miss");
          if (this.state.hull <= 0) return this.gameOver();
        }
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.z += scroll;
      e.x += e.vx * dt;
      if (e.x > this.boundX || e.x < -this.boundX) e.vx *= -1;
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.rotation.x += dt * 2;
      e.mesh.rotation.y += dt * 1.4;
      for (const l of this.lasers) {
        if (Math.abs(l.z - e.z) < 2.2 && Math.hypot(l.x - e.x, l.y - e.y) < C.ENEMY_R + 0.6) {
          e.alive = false;
          const pts = 50 * this.state.level;
          this.state.score += pts;
          this.spawnExplosion(e.x, e.y, e.z, 0xff8a3b);
          this.spawnFloater(e.x, e.y + 1, e.z, "+" + pts, 0xffbf6b);
          this.onEvent("kill");
          break;
        }
      }
      if (e.alive && !e.passed && e.z >= C.PLAYER_Z) {
        e.passed = true;
        if (Math.hypot(sp.x - e.x, sp.y - e.y) < C.ENEMY_R + 1.1) {
          this.state.hull -= C.ENEMY_HIT_HULL;
          this.music.thud();
          this.onEvent("hurt");
          if (this.state.hull <= 0) { this.cull(); return this.gameOver(); }
        }
      }
    }

    this.cull();
    this.parallax(scroll);
    // Warp streaks stream toward the camera + wrap; ship + shockwave FX.
    this.warpLines.position.z += scroll;
    if (this.warpLines.position.z > 40) this.warpLines.position.z -= 280;
    this.animateShip(dt);
    this.updateShocks(dt);
    this.updateFloaters(dt);
    this.updateBursts(dt);
    this.emit();
  }

  private cull() {
    const gone = (z: number) => z > C.DESPAWN_Z;
    this.lasers = this.lasers.filter((l) => { if (l.z < C.SPAWN_Z - 20) { this.disposeMesh(l.mesh); return false; } return true; });
    this.gates = this.gates.filter((g) => { if (gone(g.z)) { this.disposeMesh(g.mesh); this.disposeSprite(g.label); return false; } return true; });
    this.enemies = this.enemies.filter((e) => { if (!e.alive || gone(e.z)) { this.disposeMesh(e.mesh); return false; } return true; });
  }

  private disposeMesh(m: THREE.Mesh) {
    this.scene.remove(m);
    // Dispose the mesh AND any additive glow-shell children (gates carry one).
    m.traverse((o) => {
      const mm = o as THREE.Mesh;
      mm.geometry?.dispose?.();
      const mat = mm.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
  }
  private disposeSprite(s: THREE.Sprite) {
    this.scene.remove(s);
    const mat = s.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
  }

  private emit() { this.onState({ ...this.state }); }

  private gameOver() {
    this.state.phase = "over";
    this.state.loop = false;
    this.state.timeLeft = Math.max(0, this.state.timeLeft);
    this.state.hull = Math.max(0, this.state.hull);
    this.music.stop();
    this.onEvent("over");
    this.emit();
  }

  private readKeys(dt: number) {
    const k = this.keys;
    if (!this.pointerActive) {
      // Move toward the edge at a bound-relative rate → crosses the whole
      // playfield in ~0.5s regardless of frame rate (was a fixed 0.9/frame).
      const rx = this.boundX * 4 * dt, ry = this.boundY * 4 * dt;
      let tx = this.target.x, ty = this.target.y;
      if (k.has("ArrowLeft") || k.has("a")) tx -= rx;
      if (k.has("ArrowRight") || k.has("d")) tx += rx;
      if (k.has("ArrowUp") || k.has("w")) ty += ry;
      if (k.has("ArrowDown") || k.has("s")) ty -= ry;
      this.target.x = Math.max(-this.boundX, Math.min(this.boundX, tx));
      this.target.y = Math.max(-this.boundY, Math.min(this.boundY, ty));
    }
    this.boosting = k.has("Shift");
    this.braking = k.has("Control");
  }

  private canvas!: HTMLCanvasElement;
  private bindInput(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.style.touchAction = "none";
  }
  private onKeyDown = (e: KeyboardEvent) => {
    if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    this.music.resume();
    if (e.key === " ") this.firing = true;
    else this.keys.add(e.key);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") this.firing = false;
    else this.keys.delete(e.key);
  };
  private ptToWorld(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((clientY - r.top) / r.height) * 2 - 1);
    this.target.x = Math.max(-this.boundX, Math.min(this.boundX, nx * this.boundX));
    this.target.y = Math.max(-this.boundY, Math.min(this.boundY, ny * this.boundY));
  }
  private onPointerDown = (e: PointerEvent) => { this.pointerActive = true; this.firing = true; this.music.resume(); this.ptToWorld(e.clientX, e.clientY); };
  private onPointerMove = (e: PointerEvent) => { if (this.pointerActive) this.ptToWorld(e.clientX, e.clientY); };
  private onPointerUp = () => { this.pointerActive = false; this.firing = false; };

  setFiring(on: boolean) { this.firing = on; if (on) this.music.resume(); }
  setBoost(on: boolean) { this.boosting = on; }

  private resize = () => {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Playable box = a safe fraction of the visible frustum at the ship plane,
    // so the ship can never leave the screen. Floored so very narrow phones
    // still get a usable width.
    const dist = C.CAMERA_Z - C.PLAYER_Z;
    const halfH = dist * Math.tan((this.camera.fov * Math.PI / 180) / 2);
    const halfW = halfH * this.camera.aspect;
    this.boundY = Math.max(2.6, halfH * 0.68);
    this.boundX = Math.max(2.6, halfW * 0.82);
    // Keep the current target/ship inside the new box (e.g. on rotate).
    this.target.x = Math.max(-this.boundX, Math.min(this.boundX, this.target.x));
    this.target.y = Math.max(-this.boundY, Math.min(this.boundY, this.target.y));
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.music.stop();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    try {
      this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas?.removeEventListener("pointermove", this.onPointerMove);
      this.canvas?.removeEventListener("pointerup", this.onPointerUp);
      this.canvas?.removeEventListener("pointercancel", this.onPointerUp);
    } catch {}
    this.gates.forEach((g) => { this.disposeMesh(g.mesh); this.disposeSprite(g.label); });
    this.shocks.forEach((s) => this.disposeMesh(s.mesh));
    this.floaters.forEach((f) => this.disposeSprite(f.sprite));
    this.bursts.forEach((b) => { this.scene.remove(b.pts); b.pts.geometry.dispose(); (b.pts.material as THREE.Material).dispose(); this.disposeSprite(b.flash); });
    [...this.enemies.map((e) => e.mesh), ...this.lasers.map((l) => l.mesh), ...this.tunnelRings].forEach((m) => this.disposeMesh(m));
    // New FX objects (Group/Line/Points all traverse-dispose fine).
    for (const o of [this.tube, this.tunnelLines, this.warpLines, this.stars, this.ship]) {
      try { if (o) this.disposeMesh(o as unknown as THREE.Mesh); } catch {}
    }
    try { this.renderer?.dispose(); } catch {}
  }
}
