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
  TUNNEL_RING_GAP: 12,
  TUNNEL_RINGS: 18,
  TUNNEL_LINES: 16,
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
  private gates: Gate[] = [];
  private enemies: Enemy[] = [];
  private lasers: Laser[] = [];
  private music = new TimeGateMusic();

  private rand: () => number;
  private onState: (s: HudState) => void;
  private onEvent: (e: string) => void;

  private target = { x: 0, y: 0 };
  private keys = new Set<string>();
  private firing = false;
  private boosting = false;
  private braking = false;
  private pointerActive = false;

  private state: HudState = { phase: "playing", score: 0, timeLeft: C.START_TIME, hull: C.HULL_MAX, boost: C.BOOST_MAX, gates: 0, level: 1, loop: false, lastNum: 0, pattern: PATTERNS[0].label };
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
    this.scene.background = new THREE.Color(0x05010f);
    this.scene.fog = new THREE.Fog(0x05010f, 120, 300);

    this.camera.position.set(0, C.CAMERA_Y, C.CAMERA_Z);
    this.camera.lookAt(0, 0, -30);

    this.scene.add(new THREE.AmbientLight(0x8899ff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 8);
    this.scene.add(key);

    this.buildStars();
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

  private buildStars() {
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (this.rand() - 0.5) * 120;
      pos[i * 3 + 1] = (this.rand() - 0.5) * 80;
      pos[i * 3 + 2] = -this.rand() * 300;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fd0ff, size: 0.45, transparent: true, opacity: 0.7 }));
    this.scene.add(this.stars);
  }

  // Rez depth tunnel — faint wireframe rings streaming toward the camera +
  // longitudinal lines. The biggest depth cue: gates read as a wormhole in a
  // tube, not floating in a void.
  private buildTunnel() {
    const ringGeo = new THREE.TorusGeometry(C.TUNNEL_R, 0.05, 5, 44);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x2f6fb0, transparent: true, opacity: 0.35 });
    for (let i = 0; i < C.TUNNEL_RINGS; i++) {
      const m = new THREE.Mesh(ringGeo, ringMat);
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
    this.tunnelLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2f6fb0, transparent: true, opacity: 0.22 }));
    this.scene.add(this.tunnelLines);
  }

  private tintTunnel(hex: number, ringOp: number, lineOp: number) {
    const rm = this.tunnelRings[0]?.material as THREE.MeshBasicMaterial | undefined;
    if (rm) { rm.color.setHex(hex); rm.opacity = ringOp; }
    const lm = this.tunnelLines.material as THREE.LineBasicMaterial;
    lm.color.setHex(hex);
    lm.opacity = lineOp;
  }

  private buildShip() {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 4), new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.6, roughness: 0.3, emissive: 0x101830 }));
    body.rotation.x = -Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), new THREE.MeshBasicMaterial({ color: 0x35e0ff }));
    glow.position.z = 1.1;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0x14f195, emissive: 0x0a5a3a, metalness: 0.4, roughness: 0.4 }));
    wing.position.set(0, -0.1, 0.4);
    this.ship.add(body, glow, wing);
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
    return new THREE.Mesh(new THREE.TorusGeometry(C.GATE_R, tube, 10, 40), new THREE.MeshBasicMaterial({ color }));
  }

  private spawnGate(z: number, correct: boolean, fork: boolean, num: number, patternLabel: string, xOverride?: number) {
    const x = xOverride ?? (this.rand() - 0.5) * 2 * (C.BOUND_X - C.GATE_R);
    const y = (this.rand() - 0.5) * 2 * (C.BOUND_Y - C.GATE_R);
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
    const side = this.rand() < 0.5 ? 1 : -1;
    const off = 6;
    this.spawnGate(z, true, true, expected, p.label, side * off);
    this.spawnGate(z, false, true, p.decoy(expected), p.label, -side * off);
  }

  private spawnEnemy(z: number) {
    const x = (this.rand() - 0.5) * 2 * C.BOUND_X;
    const y = (this.rand() - 0.5) * 2 * C.BOUND_Y;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(C.ENEMY_R, 0), new THREE.MeshStandardMaterial({ color: 0xff8a3b, emissive: 0x7a3a0a, metalness: 0.3, roughness: 0.5 }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.enemies.push({ mesh, x, y, z, vx: (this.rand() - 0.5) * 6, alive: true, passed: false });
  }

  private fire() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0x35e0ff }));
    m.rotation.x = Math.PI / 2;
    const x = this.ship.position.x, y = this.ship.position.y;
    m.position.set(x, y, C.PLAYER_Z - 1);
    this.scene.add(m);
    this.lasers.push({ mesh: m, z: C.PLAYER_Z - 1, x, y });
    this.onEvent("shot");
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
    for (const m of this.tunnelRings) {
      m.position.z += scroll;
      if (m.position.z > C.CAMERA_Z) m.position.z -= C.TUNNEL_RINGS * C.TUNNEL_RING_GAP;
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
    this.onEvent("loop");
    this.music.thud();
    for (const g of this.gates) if (Math.abs(g.z - z) < 4) g.scored = true;
    this.tintTunnel(0xff2244, 0.6, 0.4);
    (this.scene.background as THREE.Color).setHex(0x220008);
    (this.scene.fog as THREE.Fog).color.setHex(0x220008);
  }

  private stepLoop(dt: number) {
    const powering = (this.boosting || this.keys.has("Shift")) && this.state.boost > 0;
    if (powering) this.state.boost = Math.max(0, this.state.boost - C.BOOST_DRAIN * 1.4 * dt);
    this.loopT -= dt * (powering ? 2.6 : 1);
    this.loopAnim += dt;
    this.state.hull -= C.LOOP_DPS * dt * (powering ? 0.7 : 1);

    if (Math.floor(this.loopAnim / 0.6) !== Math.floor((this.loopAnim - dt) / 0.6)) this.music.thud();

    const a = this.loopAnim * 5.2;
    this.camera.position.set(Math.sin(a) * 9, C.CAMERA_Y + Math.cos(a * 0.9) * 5, C.CAMERA_Z + Math.sin(a * 0.5) * 3);
    this.camera.lookAt(0, 0, -30);
    this.camera.rotation.z += Math.sin(a * 1.3) * 0.7;

    this.scrollTunnel(this.speed() * dt * 0.6);
    this.parallax(this.speed() * dt * 0.6);

    if (this.state.hull <= 0) { this.state.hull = 0; return this.exitLoop(true); }
    if (this.loopT <= 0) return this.exitLoop(false);
    this.emit();
  }

  private exitLoop(dead: boolean) {
    this.loopT = 0;
    this.state.loop = false;
    this.camera.position.set(0, C.CAMERA_Y, C.CAMERA_Z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 0, -30);
    this.tintTunnel(0x2f6fb0, 0.35, 0.22);
    (this.scene.background as THREE.Color).setHex(0x05010f);
    (this.scene.fog as THREE.Fog).color.setHex(0x05010f);
    if (dead) return this.gameOver();
    this.onEvent("escaped");
    this.emit();
  }

  private step(dt: number) {
    this.state.timeLeft -= dt;
    if (this.state.timeLeft <= 0) return this.gameOver();

    this.readKeys();
    if (this.boosting && this.state.boost > 0) this.state.boost = Math.max(0, this.state.boost - C.BOOST_DRAIN * dt);

    const sp = this.ship.position;
    sp.x += (this.target.x - sp.x) * Math.min(1, C.STEER_SPEED * dt * 0.15);
    sp.y += (this.target.y - sp.y) * Math.min(1, C.STEER_SPEED * dt * 0.15);
    sp.x = Math.max(-C.BOUND_X, Math.min(C.BOUND_X, sp.x));
    sp.y = Math.max(-C.BOUND_Y, Math.min(C.BOUND_Y, sp.y));
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
          this.state.score += 100 * this.state.level;
          this.state.timeLeft = Math.min(C.START_TIME, this.state.timeLeft + C.GATE_TIME_BONUS);
          this.state.boost = Math.min(C.BOOST_MAX, this.state.boost + C.BOOST_REFILL);
          this.state.gates++;
          this.state.lastNum = g.num;
          this.state.pattern = g.pattern;
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
      if (e.x > C.BOUND_X || e.x < -C.BOUND_X) e.vx *= -1;
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.rotation.x += dt * 2;
      e.mesh.rotation.y += dt * 1.4;
      for (const l of this.lasers) {
        if (Math.abs(l.z - e.z) < 2.2 && Math.hypot(l.x - e.x, l.y - e.y) < C.ENEMY_R + 0.6) {
          e.alive = false;
          this.state.score += 50 * this.state.level;
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
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
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

  private readKeys() {
    let tx = this.target.x, ty = this.target.y;
    const k = this.keys, step = 0.9;
    if (!this.pointerActive) {
      if (k.has("ArrowLeft") || k.has("a")) tx -= step;
      if (k.has("ArrowRight") || k.has("d")) tx += step;
      if (k.has("ArrowUp") || k.has("w")) ty += step;
      if (k.has("ArrowDown") || k.has("s")) ty -= step;
      this.target.x = Math.max(-C.BOUND_X, Math.min(C.BOUND_X, tx));
      this.target.y = Math.max(-C.BOUND_Y, Math.min(C.BOUND_Y, ty));
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
    this.target.x = Math.max(-C.BOUND_X, Math.min(C.BOUND_X, nx * C.BOUND_X));
    this.target.y = Math.max(-C.BOUND_Y, Math.min(C.BOUND_Y, ny * C.BOUND_Y));
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
    [...this.enemies.map((e) => e.mesh), ...this.lasers.map((l) => l.mesh), ...this.tunnelRings].forEach((m) => this.disposeMesh(m));
    try { this.renderer?.dispose(); } catch {}
  }
}
