import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PLUNGER_LANE_X, PLUNGER_LANE_W } from './plunger';

// One-way ball-return gate at the top of the plunger lane.
// Standard pinball part — ball pushes past going UP (out into playfield),
// cannot re-enter going DOWN. We poll the ball each frame: if it's inside
// the gate AABB AND moving with positive z (back into lane), apply an
// impulse to push it left + down into playfield.
const GATE_Z = -10.6;
const GATE_HALF_W = PLUNGER_LANE_W / 2 + 0.25;
const GATE_HALF_D = 0.45;
const GATE_Y = 0.55;
const KICK_X = -7;
const KICK_Z = 4;
const REARM_MS = 250;

export interface OneWayGateHandle {
  centerX: number;
  centerZ: number;
  cooldownUntil: number;
  postL: THREE.Mesh;
  postR: THREE.Mesh;
  bar: THREE.Mesh;
}

export function buildOneWayGate(scene: THREE.Scene): OneWayGateHandle {
  const centerX = PLUNGER_LANE_X;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.25 });
  const barMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee, metalness: 0.95, roughness: 0.15,
    emissive: 0x00ffd1, emissiveIntensity: 0.4,
  });
  const postGeom = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 12);
  const postL = new THREE.Mesh(postGeom, postMat);
  postL.position.set(centerX - GATE_HALF_W, 0.35, GATE_Z);
  const postR = new THREE.Mesh(postGeom, postMat);
  postR.position.set(centerX + GATE_HALF_W, 0.35, GATE_Z);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W * 2, 0.06, 0.06), barMat);
  bar.position.set(centerX, GATE_Y, GATE_Z);
  scene.add(postL, postR, bar);
  return { centerX, centerZ: GATE_Z, cooldownUntil: 0, postL, postR, bar };
}

export function tickOneWayGate(gate: OneWayGateHandle, ball: RAPIER.RigidBody, ts: number): void {
  if (ts < gate.cooldownUntil) return;
  const p = ball.translation();
  if (Math.abs(p.x - gate.centerX) > GATE_HALF_W) return;
  if (Math.abs(p.z - gate.centerZ) > GATE_HALF_D) return;
  const v = ball.linvel();
  if (v.z <= 0) return;
  ball.applyImpulse({ x: KICK_X, y: 0.3, z: KICK_Z }, true);
  gate.cooldownUntil = ts + REARM_MS;
  (gate.bar.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4;
  setTimeout(() => {
    (gate.bar.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
  }, 120);
}
