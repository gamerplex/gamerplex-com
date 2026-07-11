import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYFIELD_CENTER_X } from './playfield';

// v0.2.48: scoop is a left-side feature, anchored to playfield center
// (was hardcoded -2.5 = ~1.825u left of OLD geometric center).
export const SCOOP_X = PLAYFIELD_CENTER_X - 1.825;
export const SCOOP_Y = 0.4;
export const SCOOP_Z = -3.5;
const SCOOP_HOLD_MS = 1400;
const SCOOP_COOLDOWN_MS = 2000;
const SCOOP_EJECT_IMPULSE = { x: 2.5, y: 1.5, z: 10.0 };
const SCOOP_POINTS = 1500;

export interface ScoopHandle {
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
  catchAt: number;
  active: boolean;
}

export function buildScoop(world: RAPIER.World, scene: THREE.Scene): ScoopHandle {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(SCOOP_X, SCOOP_Y, SCOOP_Z)
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.4, 0.5)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body
  );

  const pitMat = new THREE.MeshStandardMaterial({
    color: 0x05000d, roughness: 0.95, metalness: 0.1,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24), pitMat);
  mesh.position.set(SCOOP_X, 0.01, SCOOP_Z);
  scene.add(mesh);

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 1.0,
  });
  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 10, 28),
    ringMat
  );
  ringMesh.position.set(SCOOP_X, 0.05, SCOOP_Z);
  ringMesh.rotation.x = Math.PI / 2;
  scene.add(ringMesh);

  return { collider, mesh, ringMesh, ringMat, catchAt: 0, active: false };
}

export function catchBall(h: ScoopHandle, ts: number, ballBody: RAPIER.RigidBody): number {
  if (h.active) return 0;
  if (h.catchAt > 0 && ts - h.catchAt < SCOOP_COOLDOWN_MS) return 0;
  h.active = true;
  h.catchAt = ts;
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  ballBody.setTranslation({ x: SCOOP_X, y: SCOOP_Y, z: SCOOP_Z }, true);
  return SCOOP_POINTS;
}

export function tickScoop(h: ScoopHandle, ts: number, ballBody: RAPIER.RigidBody): boolean {
  if (h.active) {
    const pulse = 1.0 + Math.sin(ts / 60) * 0.8;
    h.ringMat.emissiveIntensity = pulse;
    if (ts - h.catchAt >= SCOOP_HOLD_MS) {
      h.active = false;
      ballBody.applyImpulse(SCOOP_EJECT_IMPULSE, true);
      return true;
    }
  } else {
    h.ringMat.emissiveIntensity = 1.0;
  }
  return false;
}
