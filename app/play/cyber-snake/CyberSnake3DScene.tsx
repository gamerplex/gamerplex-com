"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type SnakeView = "top" | "fpv-p1" | "fpv-p2";

export interface SnakeSceneState {
  bodyP1: number[];    // ring buffer of u16 positions (len 256)
  bodyP2: number[];
  headIdxP1: number;   // ring write cursor
  headIdxP2: number;
  lenP1: number;
  lenP2: number;
  dirP1: number;       // 0=N,1=E,2=S,3=W
  dirP2: number;
  foodPos: number;
  status: number;      // 0=waiting,1=active,2=finished
  winnerFlag: number;  // 0=draw,1=p1,2=p2
  tick: number;
}

interface Props {
  state: SnakeSceneState | null;
  view: SnakeView;
}

const GRID = 32;
const MAX_LEN = 256;

// Authentic Tron palette — Sam Flynn blue-white vs CLU red-orange.
const COLOR_P1 = 0x4fc3f7;       // electric blue
const COLOR_P1_HEAD = 0xd9f2ff;  // near-white glow
const COLOR_P2 = 0xff5230;       // warm red-orange
const COLOR_P2_HEAD = 0xffb07a;  // amber glow
const COLOR_FOOD = 0xffd24a;     // gold
const COLOR_GRID = 0x0f2a5c;     // subtle deep-blue grid lines
const COLOR_GRID_MAJOR = 0x4fa0ff; // bright cyan major lines
const COLOR_BG = 0x020614;       // deep midnight

function packToXZ(pos: number): { x: number; z: number } {
  const r = Math.floor(pos / GRID);
  const c = pos % GRID;
  // Center grid on origin. Cell (r,c) → world (c - 15.5, 0, r - 15.5).
  return { x: c - (GRID - 1) / 2, z: r - (GRID - 1) / 2 };
}

function dirToAngle(d: number): number {
  // Angle in radians around +Y. 0 rad = facing +Z (south on grid).
  switch (d) {
    case 0: return Math.PI;       // N → -Z
    case 1: return Math.PI / 2;   // E → +X
    case 2: return 0;             // S → +Z
    case 3: return -Math.PI / 2;  // W → -X
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

// Read back the most recent N cells in a player's ring-buffer body.
// Returns positions head-first (index 0 = head, index len-1 = tail tip).
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
    time: number;
    disposed: boolean;
    view: SnakeView;
  } | null>(null);

  const stateRef = useRef(state);
  const viewRef = useRef(view);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { viewRef.current = view; if (sceneRef.current) sceneRef.current.view = view; }, [view]);

  // Init scene
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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    // Ground plate (slightly translucent dark)
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x070018 });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID + 2, GRID + 2),
      groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    // Neon grid lines — 33 lines each direction (32 cells + bound)
    const gridLines = new THREE.Group();
    const minorMat = new THREE.LineBasicMaterial({ color: COLOR_GRID, transparent: true, opacity: 0.5 });
    const majorMat = new THREE.LineBasicMaterial({ color: COLOR_GRID_MAJOR, transparent: true, opacity: 0.9 });
    const half = GRID / 2;
    for (let i = 0; i <= GRID; i++) {
      const t = i - half;
      const mat = i === 0 || i === GRID ? majorMat : (i % 8 === 0 ? majorMat : minorMat);
      // Line along X (constant z=t)
      const gx = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-half, 0.001, t),
        new THREE.Vector3(half, 0.001, t),
      ]);
      gridLines.add(new THREE.Line(gx, mat));
      // Line along Z (constant x=t)
      const gz = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(t, 0.001, -half),
        new THREE.Vector3(t, 0.001, half),
      ]);
      gridLines.add(new THREE.Line(gz, mat));
    }
    scene.add(gridLines);

    // Neon glow bars under the edges (atmosphere)
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

    // Lights — subtle, most lighting comes from emissive materials.
    scene.add(new THREE.AmbientLight(0x404080, 0.6));
    const dir = new THREE.DirectionalLight(0x8080ff, 0.4);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    // InstancedMesh for bodies
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
    scene.add(instancedP1);
    scene.add(instancedP2);

    // Heads — slightly taller, with "eye" light
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

    // Food — octahedron + point light
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
      time: 0,
      disposed: false,
      view,
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

    function applyBody(
      instanced: THREE.InstancedMesh,
      cells: number[],
      mat: THREE.MeshStandardMaterial,
      tail_fade: boolean
    ) {
      instanced.count = cells.length;
      for (let i = 0; i < cells.length; i++) {
        const p = packToXZ(cells[i]);
        dummy.position.set(p.x, 0.3, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(i === 0 ? 0.0 : 1.0); // head drawn separately
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      // fade tail slightly (lower emissive on last cells)
      // For InstancedMesh we'd need instance colors — skipping, tail already
      // visually distinct from head.
    }

    const animate = () => {
      if (!sceneRef.current || sceneRef.current.disposed) return;
      const s = stateRef.current;
      const ctx = sceneRef.current;
      ctx.time += 0.016;

      // Food bob + pulse
      ctx.food.rotation.y = ctx.time * 1.2;
      ctx.food.rotation.x = ctx.time * 0.8;
      const pulse = 0.35 + Math.sin(ctx.time * 4) * 0.05;
      ctx.food.scale.setScalar(pulse / 0.35);

      if (s) {
        const p1Cells = bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
        const p2Cells = bodyCells(s.bodyP2, s.headIdxP2, s.lenP2);

        applyBody(ctx.instancedP1, p1Cells, bodyMatP1, true);
        applyBody(ctx.instancedP2, p2Cells, bodyMatP2, true);

        if (p1Cells.length > 0) {
          const hp = packToXZ(p1Cells[0]);
          ctx.headP1.position.set(hp.x, 0.4, hp.z);
          ctx.headP1.rotation.y = dirToAngle(s.dirP1);
          ctx.headP1.visible = true;
        } else {
          ctx.headP1.visible = false;
        }
        if (p2Cells.length > 0) {
          const hp = packToXZ(p2Cells[0]);
          ctx.headP2.position.set(hp.x, 0.4, hp.z);
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
      }

      // View mode
      const v = ctx.view;
      if (v === "top") {
        if (ctx.controls) {
          ctx.controls.enabled = true;
          ctx.controls.update();
        }
      } else if (s) {
        // FPV — disable orbit controls, follow a player's head
        if (ctx.controls) ctx.controls.enabled = false;
        const target = v === "fpv-p1" ? ctx.headP1 : ctx.headP2;
        const dir = v === "fpv-p1" ? s.dirP1 : s.dirP2;
        const du = dirUnit(dir);
        // Camera: 4 cells behind head, 3.5 cells up. Look 6 cells ahead.
        const cx = target.position.x - du.x * 4;
        const cz = target.position.z - du.z * 4;
        ctx.camera.position.set(cx, 3.5, cz);
        const lx = target.position.x + du.x * 6;
        const lz = target.position.z + du.z * 6;
        ctx.camera.lookAt(lx, 0.4, lz);
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
