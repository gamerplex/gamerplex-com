"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type SnakeView = "top" | "fpv-p1" | "fpv-p2" | "tps-p1";

export interface SnakeSceneState {
  bodyP1: number[];
  bodyP2: number[];
  headIdxP1: number;
  headIdxP2: number;
  lenP1: number;
  lenP2: number;
  dirP1: number;
  dirP2: number;
  foodPos: number;
  status: number;
  winnerFlag: number;
  tick: number;
}

interface Props {
  state: SnakeSceneState | null;
  view: SnakeView;
}

const GRID = 32;
const MAX_LEN = 256;

const COLOR_P1 = 0x4fc3f7;
const COLOR_P1_HEAD = 0xd9f2ff;
const COLOR_P2 = 0xff5230;
const COLOR_P2_HEAD = 0xffb07a;
const COLOR_FOOD = 0xffd24a;
const COLOR_GRID = 0x0f2a5c;
const COLOR_GRID_MAJOR = 0x4fa0ff;
const COLOR_BG = 0x020614;
const COLOR_EDGE = 0x9945ff;

const EDGE_PARTICLES_PER_SIDE = 48;
const EDGE_PARTICLE_HEIGHT = 3.8;
const EDGE_PARTICLE_PERIOD = 2.1;

function isMobileLike(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent)) return true;
  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches) return true;
  return false;
}

function packToXZ(pos: number): { x: number; z: number } {
  const r = Math.floor(pos / GRID);
  const c = pos % GRID;
  return { x: c - (GRID - 1) / 2, z: r - (GRID - 1) / 2 };
}

function dirToAngle(d: number): number {
  switch (d) {
    case 0: return Math.PI;
    case 1: return Math.PI / 2;
    case 2: return 0;
    case 3: return -Math.PI / 2;
    default: return 0;
  }
}

function dirUnit(d: number): { x: number; z: number } {
  switch (d) {
    case 0: return { x: 0, z: -1 };
    case 1: return { x: 1, z: 0 };
    case 2: return { x: 0, z: 1 };
    case 3: return { x: -1, z: 0 };
    default: return { x: 0, z: 1 };
  }
}

function bodyCells(body: number[], headIdx: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= len; i++) {
    const idx = (headIdx + MAX_LEN - i) % MAX_LEN;
    out.push(body[idx]);
  }
  return out;
}

export default function CyberSnake3DScene({ state, view }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls | null;
    instancedP1: THREE.InstancedMesh;
    instancedP2: THREE.InstancedMesh;
    headP1: THREE.Mesh;
    headP2: THREE.Mesh;
    food: THREE.Mesh;
    edgeParticles: THREE.InstancedMesh;
    edgeParticleMat: THREE.MeshBasicMaterial;
    edgePhases: Float32Array;
    clock: THREE.Clock;
    prevCellsP1: number[];
    currCellsP1: number[];
    prevCellsP2: number[];
    currCellsP2: number[];
    lastTick: number;
    tickProgress: number;
    camDir: THREE.Vector3;
    camInitialised: boolean;
    time: number;
    disposed: boolean;
    view: SnakeView;
    mobile: boolean;
  } | null>(null);

  const stateRef = useRef(state);
  const viewRef = useRef(view);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { viewRef.current = view; if (sceneRef.current) sceneRef.current.view = view; }, [view]);

  useEffect(() => {
    if (!mountRef.current || sceneRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR_BG);
    scene.fog = new THREE.FogExp2(COLOR_BG, 0.02);

    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200
    );
    camera.position.set(0, 30, 24);
    camera.lookAt(0, 0, 0);

    const mobile = isMobileLike();
    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 0, 0);

    const groundMat = new THREE.MeshBasicMaterial({ color: 0x070018 });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID + 2, GRID + 2),
      groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const gridLines = new THREE.Group();
    const minorMat = new THREE.LineBasicMaterial({ color: COLOR_GRID, transparent: true, opacity: 0.5 });
    const majorMat = new THREE.LineBasicMaterial({ color: COLOR_GRID_MAJOR, transparent: true, opacity: 0.9 });
    const half = GRID / 2;
    for (let i = 0; i <= GRID; i++) {
      const t = i - half;
      const mat = i === 0 || i === GRID ? majorMat : (i % 8 === 0 ? majorMat : minorMat);
      const gx = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-half, 0.001, t),
        new THREE.Vector3(half, 0.001, t),
      ]);
      gridLines.add(new THREE.Line(gx, mat));
      const gz = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(t, 0.001, -half),
        new THREE.Vector3(t, 0.001, half),
      ]);
      gridLines.add(new THREE.Line(gz, mat));
    }
    scene.add(gridLines);

    const edgeMat = new THREE.MeshBasicMaterial({ color: COLOR_GRID_MAJOR, transparent: true, opacity: 0.6 });
    for (const [x, z, lenX, lenZ] of [
      [0, -half, GRID, 0.2],
      [0, half, GRID, 0.2],
      [-half, 0, 0.2, GRID],
      [half, 0, 0.2, GRID],
    ] as [number, number, number, number][]) {
      const g = new THREE.BoxGeometry(lenX, 0.05, lenZ);
      const m = new THREE.Mesh(g, edgeMat);
      m.position.set(x, 0.025, z);
      scene.add(m);
    }

    scene.add(new THREE.AmbientLight(0x404080, 0.6));
    const dir = new THREE.DirectionalLight(0x8080ff, 0.4);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    const edgePerSide = mobile ? 24 : EDGE_PARTICLES_PER_SIDE;
    const edgeTotal = edgePerSide * 4;
    const edgeParticleGeom = new THREE.BoxGeometry(0.12, 0.22, 0.12);
    const edgeParticleMat = new THREE.MeshBasicMaterial({
      color: COLOR_EDGE,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const edgeParticles = new THREE.InstancedMesh(edgeParticleGeom, edgeParticleMat, edgeTotal);
    const edgePhases = new Float32Array(edgeTotal * 2);
    for (let s = 0; s < 4; s++) {
      for (let p = 0; p < edgePerSide; p++) {
        const i = s * edgePerSide + p;
        edgePhases[i * 2]     = Math.random();
        edgePhases[i * 2 + 1] = s;
      }
    }
    scene.add(edgeParticles);

    const bodyGeom = new THREE.BoxGeometry(0.85, 0.55, 0.85);
    const bodyMatP1 = new THREE.MeshStandardMaterial({
      color: COLOR_P1,
      emissive: COLOR_P1,
      emissiveIntensity: 1.4,
      metalness: 0.2,
      roughness: 0.3,
    });
    const bodyMatP2 = new THREE.MeshStandardMaterial({
      color: COLOR_P2,
      emissive: COLOR_P2,
      emissiveIntensity: 1.4,
      metalness: 0.2,
      roughness: 0.3,
    });
    const instancedP1 = new THREE.InstancedMesh(bodyGeom, bodyMatP1, MAX_LEN);
    const instancedP2 = new THREE.InstancedMesh(bodyGeom, bodyMatP2, MAX_LEN);
    instancedP1.count = 0;
    instancedP2.count = 0;
    // Disable frustum culling; origin-centred bounding sphere causes false culls in TPS.
    instancedP1.frustumCulled = false;
    instancedP2.frustumCulled = false;
    scene.add(instancedP1);
    scene.add(instancedP2);

    const headGeomP1 = new THREE.BoxGeometry(0.95, 0.75, 0.95);
    const headGeomP2 = new THREE.BoxGeometry(0.95, 0.75, 0.95);
    const headMatP1 = new THREE.MeshStandardMaterial({
      color: COLOR_P1_HEAD,
      emissive: COLOR_P1_HEAD,
      emissiveIntensity: 2.2,
      metalness: 0.4,
      roughness: 0.2,
    });
    const headMatP2 = new THREE.MeshStandardMaterial({
      color: COLOR_P2_HEAD,
      emissive: COLOR_P2_HEAD,
      emissiveIntensity: 2.2,
      metalness: 0.4,
      roughness: 0.2,
    });
    const headP1 = new THREE.Mesh(headGeomP1, headMatP1);
    const headP2 = new THREE.Mesh(headGeomP2, headMatP2);
    scene.add(headP1);
    scene.add(headP2);

    const foodMat = new THREE.MeshStandardMaterial({
      color: COLOR_FOOD,
      emissive: COLOR_FOOD,
      emissiveIntensity: 2.0,
      metalness: 0.1,
      roughness: 0.3,
    });
    const food = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), foodMat);
    scene.add(food);
    const foodLight = new THREE.PointLight(COLOR_FOOD, 2.0, 6);
    food.add(foodLight);

    const dummy = new THREE.Object3D();

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      instancedP1,
      instancedP2,
      headP1,
      headP2,
      food,
      edgeParticles,
      edgeParticleMat,
      edgePhases,
      clock: new THREE.Clock(),
      prevCellsP1: [],
      currCellsP1: [],
      prevCellsP2: [],
      currCellsP2: [],
      lastTick: -1,
      tickProgress: 1,
      camDir: new THREE.Vector3(0, 0, 1),
      camInitialised: false,
      time: 0,
      disposed: false,
      view,
      mobile,
    };

    const onResize = () => {
      if (!mount || !sceneRef.current) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      sceneRef.current.camera.aspect = w / h;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const tmpColor = new THREE.Color();

    // Keep TICK_SEC in sync with CyberSnakeSolo TICK_MS.
    const TICK_SEC = 0.140;

    // Linear progression keeps optical flow constant in FPS/TPS.
    const easeProgress = (t: number) => t;

    function applySmoothBody(
      instanced: THREE.InstancedMesh,
      prevCells: number[],
      currCells: number[],
      progress: number,
    ): { headX: number; headZ: number } | null {
      const len = currCells.length;
      instanced.count = len;
      const p = easeProgress(Math.max(0, Math.min(1, progress)));
      let headX = 0, headZ = 0;
      for (let i = 0; i < len; i++) {
        const currIdx = currCells[i];
        const prevIdx = i < prevCells.length ? prevCells[i] : currIdx;
        const cc = packToXZ(currIdx);
        const pc = packToXZ(prevIdx);
        const x = pc.x + (cc.x - pc.x) * p;
        const z = pc.z + (cc.z - pc.z) * p;
        dummy.position.set(x, 0.3, z);
        dummy.rotation.set(0, 0, 0);
        // Hide body[0]; head is rendered as its own mesh.
        dummy.scale.setScalar(i === 0 ? 0.0 : 1.0);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
        if (i === 0) { headX = x; headZ = z; }
      }
      instanced.instanceMatrix.needsUpdate = true;
      return len > 0 ? { headX, headZ } : null;
    }

    const animate = () => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      const s = stateRef.current;
      const ctx = sceneRef.current;
      // Clamp dt to avoid tab-resume spikes.
      const rawDt = ctx.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      ctx.time += dt;

      ctx.food.rotation.y = ctx.time * 1.2;
      ctx.food.rotation.x = ctx.time * 0.8;
      const pulse = 0.35 + Math.sin(ctx.time * 4) * 0.05;
      ctx.food.scale.setScalar(pulse / 0.35);

      let headP1World: { x: number; z: number } | null = null;

      if (s) {
        if (s.tick !== ctx.lastTick) {
          ctx.prevCellsP1 = ctx.currCellsP1.length ? ctx.currCellsP1 : bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
          ctx.currCellsP1 = bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
          ctx.prevCellsP2 = ctx.currCellsP2.length ? ctx.currCellsP2 : bodyCells(s.bodyP2, s.headIdxP2, s.lenP2);
          ctx.currCellsP2 = bodyCells(s.bodyP2, s.headIdxP2, s.lenP2);
          ctx.tickProgress = 0;
          ctx.lastTick = s.tick;
        }
        ctx.tickProgress = Math.min(1, ctx.tickProgress + dt / TICK_SEC);

        const p1Head = applySmoothBody(ctx.instancedP1, ctx.prevCellsP1, ctx.currCellsP1, ctx.tickProgress);
        const p2Head = applySmoothBody(ctx.instancedP2, ctx.prevCellsP2, ctx.currCellsP2, ctx.tickProgress);

        if (p1Head) {
          ctx.headP1.position.set(p1Head.headX, 0.4, p1Head.headZ);
          ctx.headP1.rotation.y = dirToAngle(s.dirP1);
          ctx.headP1.visible = true;
          headP1World = { x: p1Head.headX, z: p1Head.headZ };
        } else {
          ctx.headP1.visible = false;
        }
        if (p2Head) {
          ctx.headP2.position.set(p2Head.headX, 0.4, p2Head.headZ);
          ctx.headP2.rotation.y = dirToAngle(s.dirP2);
          ctx.headP2.visible = true;
        } else {
          ctx.headP2.visible = false;
        }

        const fp = packToXZ(s.foodPos);
        ctx.food.position.set(fp.x, 0.8 + Math.sin(ctx.time * 3) * 0.15, fp.z);
      } else {
        ctx.instancedP1.count = 0;
        ctx.instancedP2.count = 0;
        ctx.headP1.visible = false;
        ctx.headP2.visible = false;
        ctx.lastTick = -1;
        ctx.prevCellsP1 = [];
        ctx.currCellsP1 = [];
        ctx.prevCellsP2 = [];
        ctx.currCellsP2 = [];
      }

      const halfGrid = GRID / 2;
      const phases = ctx.edgePhases;
      const totalParticles = ctx.edgeParticles.count || (phases.length / 2);
      ctx.edgeParticles.count = phases.length / 2;
      for (let i = 0; i < totalParticles; i++) {
        const phase = phases[i * 2];
        const side  = phases[i * 2 + 1];
        const t = ((ctx.time + phase * EDGE_PARTICLE_PERIOD) % EDGE_PARTICLE_PERIOD) / EDGE_PARTICLE_PERIOD;
        const y = t * EDGE_PARTICLE_HEIGHT;
        const sideLen = GRID;
        const along = ((phase * 37 + i * 0.7) % 1) * sideLen - halfGrid;
        let px = 0, pz = 0;
        switch (side) {
          case 0: px = along;      pz = -halfGrid; break;
          case 1: px = halfGrid;   pz = along;     break;
          case 2: px = along;      pz = halfGrid;  break;
          default: px = -halfGrid; pz = along;     break;
        }
        const scale = 0.6 + (1 - t) * 0.8;
        dummy.position.set(px, y + 0.1, pz);
        dummy.scale.set(scale, scale * 1.6, scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        ctx.edgeParticles.setMatrixAt(i, dummy.matrix);
      }
      ctx.edgeParticles.instanceMatrix.needsUpdate = true;

      const v = ctx.view;
      ctx.edgeParticleMat.opacity = v === "top" ? 0.1 : 0.9;

      if (v === "top") {
        if (ctx.controls) {
          ctx.controls.enabled = true;
          ctx.controls.update();
        }
      } else if (s && headP1World) {
        if (ctx.controls) ctx.controls.enabled = false;
        const isTps = v === "tps-p1";
        const dir = s.dirP1;
        const du = dirUnit(dir);
        const tgtDir = new THREE.Vector3(du.x, 0, du.z);

        if (!ctx.camInitialised) {
          ctx.camDir.copy(tgtDir);
          ctx.camInitialised = true;
        }

        // FPS uses a tighter tau so view rotation tracks input without lag.
        const dirTau = isTps ? 0.14 : 0.06;
        const alphaDir = 1 - Math.exp(-dt / dirTau);
        ctx.camDir.lerp(tgtDir, alphaDir);
        const dirLen = ctx.camDir.length();
        if (dirLen > 0.001) ctx.camDir.multiplyScalar(1 / dirLen);

        const bobble = Math.sin(ctx.time * 9) * (isTps ? 0.08 : 0.06);
        const headX = headP1World.x;
        const headZ = headP1World.z;

        let eyeX: number, eyeY: number, eyeZ: number;
        let lookX: number, lookY: number, lookZ: number;
        if (isTps) {
          // TPS — further back + higher up so head sits small near the
          // bottom of the frame. 8 cells behind, 5.5 up, looking ~4 cells
          // past the head. FOV of 60° with these values puts head at roughly
          // 15-20% of the frame height.
          const BACK = 8.0;
          const UP   = 5.5;
          const LOOK_AHEAD = 4.0;
          eyeX = headX - ctx.camDir.x * BACK;
          eyeZ = headZ - ctx.camDir.z * BACK;
          eyeY = UP + bobble;
          lookX = headX + ctx.camDir.x * LOOK_AHEAD;
          lookZ = headZ + ctx.camDir.z * LOOK_AHEAD;
          lookY = 0.0;
        } else {
          // FPS — at the head, looking forward with a gentle down-pitch so
          // the player sees the grid floor ahead, not a flat horizon.
          const EYE_HEIGHT = 1.0;
          const LOOK_AHEAD = 6.0;
          eyeX = headX;
          eyeZ = headZ;
          eyeY = EYE_HEIGHT + bobble;
          lookX = headX + ctx.camDir.x * LOOK_AHEAD;
          lookZ = headZ + ctx.camDir.z * LOOK_AHEAD;
          lookY = 0.3;
        }
        ctx.camera.position.set(eyeX, eyeY, eyeZ);
        ctx.camera.lookAt(lookX, lookY, lookZ);
      } else {
        ctx.camInitialised = false; // reset for next game
      }

      ctx.renderer.render(ctx.scene, ctx.camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      if (sceneRef.current) {
        sceneRef.current.disposed = true;
        sceneRef.current.renderer.dispose();
        try {
          sceneRef.current.renderer.domElement.remove();
        } catch {}
        sceneRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "600px",
        borderRadius: "12px",
        overflow: "hidden",
        background: "#03000f",
      }}
    />
  );
}
