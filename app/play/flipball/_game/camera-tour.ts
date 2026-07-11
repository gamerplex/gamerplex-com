import * as THREE from 'three';

const REST_POS = new THREE.Vector3(0, 22, 24);
const REST_LOOK = new THREE.Vector3(0, 0, 4);
const ORBIT_RADIUS = 28;
const ORBIT_HEIGHT = 17;
const ORBIT_SPEED = 0.18;
const RETURN_MS = 700;

type Mode = 'orbit' | 'returning' | 'rest';
let mode: Mode = 'orbit';
let angle = Math.PI * 1.5;
let returnStart = 0;
const fromPos = new THREE.Vector3();

export function isTouring(): boolean {
  return mode !== 'rest';
}

export function startOrbit(camera: THREE.PerspectiveCamera): void {
  mode = 'orbit';
  angle = Math.PI * 1.5;
  camera.position.set(Math.cos(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(angle) * ORBIT_RADIUS);
  camera.lookAt(0, 0, 0);
}

export function returnToRest(camera: THREE.PerspectiveCamera, ts: number): void {
  if (mode === 'rest') return;
  mode = 'returning';
  returnStart = ts;
  fromPos.copy(camera.position);
}

export function tickCameraTour(camera: THREE.PerspectiveCamera, ts: number, dt: number): boolean {
  if (mode === 'orbit') {
    angle += ORBIT_SPEED * dt;
    const bob = Math.sin(ts / 1100) * 0.6;
    camera.position.set(
      Math.cos(angle) * ORBIT_RADIUS,
      ORBIT_HEIGHT + bob,
      Math.sin(angle) * ORBIT_RADIUS,
    );
    camera.lookAt(0, 0, 0);
    return true;
  }
  if (mode === 'returning') {
    const elapsed = ts - returnStart;
    const t = Math.min(1, elapsed / RETURN_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(fromPos, REST_POS, eased);
    camera.lookAt(REST_LOOK);
    if (t >= 1) {
      mode = 'rest';
      camera.position.copy(REST_POS);
      camera.lookAt(REST_LOOK);
    }
    return true;
  }
  return false;
}
