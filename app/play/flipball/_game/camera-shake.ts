import * as THREE from 'three';

const CAM_REST = new THREE.Vector3();
let shakeAmount = 0;
let shakeUntil = 0;
let wasShaking = false;

export function rememberRest(camera: THREE.PerspectiveCamera): void {
  CAM_REST.copy(camera.position);
}

export function triggerShake(amount: number, durationMs: number, ts: number): void {
  if (amount > shakeAmount || ts > shakeUntil) {
    shakeAmount = amount;
    shakeUntil = ts + durationMs;
  }
}

export function tickShake(camera: THREE.PerspectiveCamera, ts: number): void {
  if (ts >= shakeUntil || shakeAmount <= 0) {
    if (wasShaking) {
      camera.position.copy(CAM_REST);
      wasShaking = false;
    }
    shakeAmount = 0;
    return;
  }
  wasShaking = true;
  const remaining = (shakeUntil - ts) / 200;
  const decay = Math.max(0, Math.min(1, remaining));
  const k = shakeAmount * decay;
  camera.position.x = CAM_REST.x + (Math.random() - 0.5) * k * 2;
  camera.position.y = CAM_REST.y + (Math.random() - 0.5) * k * 2;
  camera.position.z = CAM_REST.z + (Math.random() - 0.5) * k * 2;
}
