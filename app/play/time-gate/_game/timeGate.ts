// Time Gate — WebGPU on-rails space flight (Level 1: gates + enemies).
// Follows the gamerplex web stack: three/webgpu (0.183, PLG-proven import),
// Frame basis, mobile budget (DPR<=2, clamped dt, no postprocessing pass-1),
// deterministic seeded spawns (challenge-link replayable). The wormhole-fork /
// math-pattern / death-loop systems (see ENGINEERING/GAMES/TIME_GATE.md) are
// L2+; this is the flight-feel + shoot prototype.

import * as THREE from "three/webgpu";
import { FORWARD, rng } from "./frame";

export interface HudState {
  phase: "playing" | "over";
  score: number;
  timeLeft: number; // seconds
  hull: number; // 0..100
  gates: number;
  level: number;
}

const C = {
  // world scroll — objects travel from far -Z toward the player at +Z.
  BASE_SPEED: 42, // units/sec at level 1
  SPEED_PER_LEVEL: 7,
  BOOST_MUL: 1.7,
  BRAKE_MUL: 0.55,
  PLAYER_Z: 0,
  CAMERA_Z: 7,
  SPAWN_Z: -230,
  DESPAWN_Z: 12,
  BOUND_X: 13, // steering half-extent
  BOUND_Y: 8,
  STEER_SPEED: 26, // units/sec follow toward target
  GATE_R: 3.4, // ring inner radius the ship must be within to pass
  ENEMY_R: 1.5,
  LASER_SPEED: 180,
  LASER_COOLDOWN: 0.14,
  START_TIME: 30,
  GATE_TIME_BONUS: 2.2,
  HULL_MAX: 100,
  ENEMY_HIT_HULL: 18, // enemy reaches you
  MISS_GATE_HULL: 7, // fly past a gate outside the ring
  GATES_PER_LEVEL: 6,
};

type Gate = { mesh: THREE.Mesh; x: number; y: number; z: number; scored: boolean };
type Enemy = { mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; alive: boolean; passed: boolean };
type Laser = { mesh: THREE.Mesh; z: number; x: number; y: number };

export class TimeGateGame {
  private renderer!: THREE.WebGPURenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
  private ship = new THREE.Group();
  private stars!: THREE.Points;
  private gates: Gate[] = [];
  private enemies: Enemy[] = [];
  private lasers: Laser[] = [];

  private rand: () => number;
  private onState: (s: HudState) => void;
  private onEvent: (e: string) => void;

  // input
  private target = { x: 0, y: 0 }; // desired ship pos
  private keys = new Set<string>();
  private firing = false;
  private boost = 0; // -1 brake .. +1 boost
  private pointerActive = false;

  // sim state
  private state: HudState = { phase: "playing", score: 0, timeLeft: C.START_TIME, hull: C.HULL_MAX, gates: 0, level: 1 };
  private fireCd = 0;
  private nextSpawnZ = -40;
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
    // Renderer — WebGPU with automatic WebGL2 fallback (three/webgpu 0.183).
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

    this.camera.position.set(0, 1.4, C.CAMERA_Z);
    this.camera.lookAt(0, 0, -30);

    this.scene.add(new THREE.AmbientLight(0x8899ff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 8);
    this.scene.add(key);

    this.buildStars();
    this.buildShip();
    this.scene.add(this.ship);

    this.bindInput(canvas);
    this.resize();
    window.addEventListener("resize", this.resize);

    this.running = true;
    this.lastT = performance.now();
    this.loop();
  }

  private buildStars() {
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (this.rand() - 0.5) * 120;
      pos[i * 3 + 1] = (this.rand() - 0.5) * 80;
      pos[i * 3 + 2] = -this.rand() * 300;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fd0ff, size: 0.5, transparent: true, opacity: 0.8 }));
    this.scene.add(this.stars);
  }

  private buildShip() {
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.6, roughness: 0.3, emissive: 0x101830 })
    );
    body.rotation.x = -Math.PI / 2; // nose toward -Z (FORWARD)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x35e0ff })
    );
    glow.position.z = 1.1;
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x14f195, emissive: 0x0a5a3a, metalness: 0.4, roughness: 0.4 });
    const wl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.7), wingMat);
    wl.position.set(0, -0.1, 0.4);
    this.ship.add(body, glow, wl);
    this.ship.position.set(0, 0, C.PLAYER_Z);
  }

  private neonRing(color: number, r: number) {
    return new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.28, 10, 40),
      new THREE.MeshBasicMaterial({ color })
    );
  }

  private spawnGate(z: number) {
    const x = (this.rand() - 0.5) * 2 * (C.BOUND_X - C.GATE_R);
    const y = (this.rand() - 0.5) * 2 * (C.BOUND_Y - C.GATE_R);
    const mesh = this.neonRing(0x14f195, C.GATE_R);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.gates.push({ mesh, x, y, z, scored: false });
  }

  private spawnEnemy(z: number) {
    const x = (this.rand() - 0.5) * 2 * C.BOUND_X;
    const y = (this.rand() - 0.5) * 2 * C.BOUND_Y;
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(C.ENEMY_R, 0),
      new THREE.MeshStandardMaterial({ color: 0xff3b6b, emissive: 0x7a0a24, metalness: 0.3, roughness: 0.5 })
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const vx = (this.rand() - 0.5) * 6;
    this.enemies.push({ mesh, x, y, z, vx, alive: true, passed: false });
  }

  private fire() {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6),
      new THREE.MeshBasicMaterial({ color: 0x35e0ff })
    );
    m.rotation.x = Math.PI / 2;
    const x = this.ship.position.x;
    const y = this.ship.position.y;
    m.position.set(x, y, C.PLAYER_Z - 1);
    this.scene.add(m);
    this.lasers.push({ mesh: m, z: C.PLAYER_Z - 1, x, y });
    this.onEvent("shot");
  }

  private speed() {
    let s = C.BASE_SPEED + (this.state.level - 1) * C.SPEED_PER_LEVEL;
    if (this.boost > 0) s *= C.BOOST_MUL;
    else if (this.boost < 0) s *= C.BRAKE_MUL;
    return s;
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 1 / 20) dt = 1 / 20; // clamp (tab-switch) per mobile budget
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private step(dt: number) {
    if (this.state.phase !== "playing") return;

    // resources
    this.state.timeLeft -= dt;
    if (this.state.timeLeft <= 0) return this.gameOver();

    // input → target
    this.readKeys();
    // steer ship toward target
    const sp = this.ship.position;
    sp.x += (this.target.x - sp.x) * Math.min(1, C.STEER_SPEED * dt * 0.15);
    sp.y += (this.target.y - sp.y) * Math.min(1, C.STEER_SPEED * dt * 0.15);
    sp.x = Math.max(-C.BOUND_X, Math.min(C.BOUND_X, sp.x));
    sp.y = Math.max(-C.BOUND_Y, Math.min(C.BOUND_Y, sp.y));
    // bank on lateral movement
    const dx = this.target.x - sp.x;
    this.ship.rotation.z += ((-dx * 0.12) - this.ship.rotation.z) * 0.2;
    this.ship.rotation.x += ((this.target.y - sp.y) * -0.05 - this.ship.rotation.x) * 0.2;

    const scroll = this.speed() * dt;

    // fire
    this.fireCd -= dt;
    if (this.firing && this.fireCd <= 0) {
      this.fire();
      this.fireCd = C.LASER_COOLDOWN;
    }

    // spawn director — deterministic cadence along Z
    while (this.nextSpawnZ > C.SPAWN_Z) {
      const z = this.nextSpawnZ;
      // ~55% gate, 45% enemy; every run seeded
      if (this.rand() < 0.55) this.spawnGate(z);
      else this.spawnEnemy(z);
      this.nextSpawnZ -= 14 + this.rand() * 10;
    }
    // the world's spawn frontier scrolls with us
    this.nextSpawnZ += scroll;

    // lasers
    for (const l of this.lasers) {
      l.z -= C.LASER_SPEED * dt;
      l.mesh.position.z = l.z;
    }

    // gates
    for (const g of this.gates) {
      g.z += scroll;
      g.mesh.position.z = g.z;
      (g.mesh.material as THREE.MeshBasicMaterial).color.setHex(g.scored ? 0x2a7d5a : 0x14f195);
      g.mesh.rotation.z += dt * 0.4;
      if (!g.scored && g.z >= C.PLAYER_Z) {
        const inRing = Math.hypot(sp.x - g.x, sp.y - g.y) <= C.GATE_R;
        g.scored = true;
        if (inRing) {
          this.state.score += 100 * this.state.level;
          this.state.timeLeft = Math.min(C.START_TIME, this.state.timeLeft + C.GATE_TIME_BONUS);
          this.state.gates++;
          this.onEvent("gate");
          if (this.state.gates % C.GATES_PER_LEVEL === 0) {
            this.state.level++;
            this.onEvent("level");
          }
        } else {
          this.state.hull -= C.MISS_GATE_HULL;
          this.onEvent("miss");
          if (this.state.hull <= 0) return this.gameOver();
        }
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.z += scroll;
      e.x += e.vx * dt;
      if (e.x > C.BOUND_X || e.x < -C.BOUND_X) e.vx *= -1;
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.rotation.x += dt * 2;
      e.mesh.rotation.y += dt * 1.4;

      // laser hits
      for (const l of this.lasers) {
        if (Math.abs(l.z - e.z) < 2.2 && Math.hypot(l.x - e.x, l.y - e.y) < C.ENEMY_R + 0.6) {
          e.alive = false;
          this.state.score += 50 * this.state.level;
          this.onEvent("kill");
          break;
        }
      }
      // reached the player?
      if (e.alive && !e.passed && e.z >= C.PLAYER_Z) {
        e.passed = true;
        if (Math.hypot(sp.x - e.x, sp.y - e.y) < C.ENEMY_R + 1.1) {
          this.state.hull -= C.ENEMY_HIT_HULL;
          this.onEvent("hurt");
          if (this.state.hull <= 0) {
            this.cull();
            return this.gameOver();
          }
        }
      }
    }

    this.cull();

    // parallax stars
    const spos = this.stars.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < spos.count; i++) {
      let z = spos.getZ(i) + scroll;
      if (z > C.CAMERA_Z) z -= 300;
      spos.setZ(i, z);
    }
    spos.needsUpdate = true;

    this.emit();
  }

  private cull() {
    const gone = (z: number) => z > C.DESPAWN_Z;
    this.lasers = this.lasers.filter((l) => {
      if (l.z < C.SPAWN_Z - 20) { this.disposeMesh(l.mesh); return false; }
      return true;
    });
    this.gates = this.gates.filter((g) => {
      if (gone(g.z)) { this.disposeMesh(g.mesh); return false; }
      return true;
    });
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive || gone(e.z)) { this.disposeMesh(e.mesh); return false; }
      return true;
    });
  }

  private disposeMesh(m: THREE.Mesh) {
    this.scene.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }

  private emit() {
    this.onState({ ...this.state });
  }

  private gameOver() {
    this.state.phase = "over";
    this.state.timeLeft = Math.max(0, this.state.timeLeft);
    this.state.hull = Math.max(0, this.state.hull);
    this.onEvent("over");
    this.emit();
  }

  // ---- input ----
  private readKeys() {
    let tx = this.target.x;
    let ty = this.target.y;
    const k = this.keys;
    const step = 0.9;
    if (!this.pointerActive) {
      if (k.has("ArrowLeft") || k.has("a")) tx -= step;
      if (k.has("ArrowRight") || k.has("d")) tx += step;
      if (k.has("ArrowUp") || k.has("w")) ty += step;
      if (k.has("ArrowDown") || k.has("s")) ty -= step;
      this.target.x = Math.max(-C.BOUND_X, Math.min(C.BOUND_X, tx));
      this.target.y = Math.max(-C.BOUND_Y, Math.min(C.BOUND_Y, ty));
    }
    this.boost = k.has("Shift") ? 1 : k.has("Control") ? -1 : 0;
  }

  private bindInput(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.style.touchAction = "none";
    this.canvas = canvas;
  }
  private canvas!: HTMLCanvasElement;

  private onKeyDown = (e: KeyboardEvent) => {
    if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
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
  private onPointerDown = (e: PointerEvent) => {
    this.pointerActive = true;
    this.firing = true; // tap/hold fires while steering (StarFox-style)
    this.ptToWorld(e.clientX, e.clientY);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerActive) this.ptToWorld(e.clientX, e.clientY);
  };
  private onPointerUp = () => {
    this.pointerActive = false;
    this.firing = false;
  };

  // external control (HUD fire button on mobile / boost)
  setFiring(on: boolean) { this.firing = on; }
  setBoost(b: number) { this.boost = b; }

  private resize = () => {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
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
    try {
      this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas?.removeEventListener("pointermove", this.onPointerMove);
      this.canvas?.removeEventListener("pointerup", this.onPointerUp);
      this.canvas?.removeEventListener("pointercancel", this.onPointerUp);
    } catch {}
    [...this.gates.map((g) => g.mesh), ...this.enemies.map((e) => e.mesh), ...this.lasers.map((l) => l.mesh)].forEach((m) => this.disposeMesh(m));
    try { this.renderer?.dispose(); } catch {}
  }
}
