import * as THREE from 'three';

const EMBER_COUNT = 320;

export interface BackgroundHandle {
  positions: Float32Array;
  velocities: Float32Array;
  embers: THREE.Points;
  auraLight: THREE.PointLight;
}

export function buildBackground(scene: THREE.Scene): BackgroundHandle {
  const positions = new Float32Array(EMBER_COUNT * 3);
  const colors = new Float32Array(EMBER_COUNT * 3);
  const velocities = new Float32Array(EMBER_COUNT);

  for (let i = 0; i < EMBER_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 10;
    positions[i * 3]     = Math.cos(a) * r;
    positions[i * 3 + 1] = -6 + Math.random() * 26;
    positions[i * 3 + 2] = Math.sin(a) * r;
    velocities[i] = 0.4 + Math.random() * 1.1;
    const c = Math.random();
    if (c < 0.45) { colors[i*3]=0.62; colors[i*3+1]=0.30; colors[i*3+2]=1.0; }
    else if (c < 0.75) { colors[i*3]=1.0; colors[i*3+1]=0.0; colors[i*3+2]=0.67; }
    else if (c < 0.92) { colors[i*3]=0.0; colors[i*3+1]=1.0; colors[i*3+2]=0.82; }
    else { colors[i*3]=1.0; colors[i*3+1]=0.67; colors[i*3+2]=0.0; }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.22, vertexColors: true, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const embers = new THREE.Points(geo, mat);
  embers.frustumCulled = false;
  scene.add(embers);

  const auraLight = new THREE.PointLight(0x9945ff, 1.4, 45, 2);
  auraLight.position.set(0, 5, 0);
  scene.add(auraLight);

  return { positions, velocities, embers, auraLight };
}

export function tickBackground(h: BackgroundHandle, ts: number, dt: number): void {
  for (let i = 0; i < EMBER_COUNT; i++) {
    h.positions[i * 3 + 1] += h.velocities[i] * dt;
    if (h.positions[i * 3 + 1] > 22) {
      h.positions[i * 3 + 1] = -8;
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 10;
      h.positions[i * 3]     = Math.cos(a) * r;
      h.positions[i * 3 + 2] = Math.sin(a) * r;
    }
  }
  h.embers.geometry.attributes.position.needsUpdate = true;
  const t = ts / 1000;
  h.auraLight.intensity = 1.2 + Math.sin(t * 0.7) * 0.5;
  h.auraLight.color.setHSL(0.78 + Math.sin(t * 0.4) * 0.05, 0.85, 0.55);
}
