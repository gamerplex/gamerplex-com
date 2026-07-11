import * as THREE from 'three';
import { TABLE_W, TABLE_D } from './table';

export interface SceneHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  resize: (mountW: number, mountH: number) => void;
  dispose: () => void;
}

export function createScene(mount: HTMLElement): SceneHandles {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04000c);
  scene.fog = new THREE.Fog(0x04000c, 22, 50);

  // v0.2.11 — camera pulled back + tilted to show full TABLE_D=28 deep table.
  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
  camera.position.set(0, 22, 24);
  camera.lookAt(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x4a2670, 0.35));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(8, 22, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 22;
  keyLight.shadow.camera.bottom = -22;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x9d4dff, 0.8, 35);
  fillLight.position.set(-10, 12, -5);
  scene.add(fillLight);

  const accentLight = new THREE.PointLight(0x00ffd1, 0.6, 30);
  accentLight.position.set(10, 12, 5);
  scene.add(accentLight);

  const playfieldGeom = new THREE.PlaneGeometry(TABLE_W, TABLE_D);
  const playfieldMat = new THREE.MeshStandardMaterial({
    color: 0x150232,
    roughness: 0.55,
    metalness: 0.2,
    emissive: 0x0a0020,
    emissiveIntensity: 0.5,
  });
  const playfield = new THREE.Mesh(playfieldGeom, playfieldMat);
  playfield.rotation.x = -Math.PI / 2;
  playfield.receiveShadow = true;
  scene.add(playfield);

  const ringColors = [0x9d4dff, 0x3399ff, 0x00ffd1, 0xffaa00];
  const ringCenters: Array<[number, number]> = [[0, -7], [-3, -4], [3, -4], [0, 0.5]];
  ringCenters.forEach(([cx, cz], i) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.55, 48),
      new THREE.MeshBasicMaterial({
        color: ringColors[i],
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.012, cz);
    scene.add(ring);
  });

  const grid = new THREE.GridHelper(TABLE_W * 2, 14, 0x9d4dff, 0x2a1450);
  (grid.material as THREE.Material).opacity = 0.08;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.008;
  scene.add(grid);

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    renderer.dispose();
    if (mount.contains(renderer.domElement)) {
      mount.removeChild(renderer.domElement);
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  };

  return { scene, camera, renderer, resize, dispose };
}
