import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TABLE_W, TABLE_D } from './table';

export const PLUNGER_LANE_W = 1.2;
export const PLUNGER_LANE_X = TABLE_W / 2 - PLUNGER_LANE_W / 2 - 0.15;
export const PLUNGER_SPAWN = {
  x: PLUNGER_LANE_X,
  y: 0.5,
  z: TABLE_D / 2 - 1.5,
};
export const PLUNGER_MAX_CHARGE_MS = 900;
// Ball mass ~2.09 (density 7.8, r 0.4); lane back-tilt decelerates at ~3.17 u/s²
// over a ~19u climb to the exit. Min impulse must reliably clear the lane into
// the playfield, or a light plunge dribbles up-center and drains immediately.
export const PLUNGER_MIN_IMPULSE_Z = -85;
export const PLUNGER_MAX_IMPULSE_Z = -100;
export const PLUNGER_PULL_BACK_DIST = 0.9;
export const PLUNGER_REST_Z = TABLE_D / 2 - 0.5;

export function buildPlungerLane(world: RAPIER.World, scene: THREE.Scene): THREE.Mesh {
  const halfD = TABLE_D / 2;
  const wallH = 2.4;
  const wallT = 0.2;
  const innerWallX = PLUNGER_LANE_X - PLUNGER_LANE_W / 2;
  const innerWallZStart = -halfD + 8;
  const innerWallZEnd = halfD;
  const innerWallCenterZ = (innerWallZStart + innerWallZEnd) / 2;
  const innerWallLen = innerWallZEnd - innerWallZStart;

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a2670, roughness: 0.5, metalness: 0.6, emissive: 0x9d4dff, emissiveIntensity: 0.5,
  });

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(innerWallX, wallH / 2, innerWallCenterZ)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(wallT / 2, wallH / 2, innerWallLen / 2)
      .setRestitution(0.35).setFriction(0.05),
    body
  );

  const backWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(PLUNGER_LANE_X, wallH / 2, halfD - wallT / 2)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(PLUNGER_LANE_W / 2 + 0.1, wallH / 2, wallT / 2)
      .setRestitution(0.6).setFriction(0.05),
    backWallBody
  );

  const exitGuideLen = 2.6;
  const exitGuideYaw = Math.PI / 4;
  const exitGuideCenterX = innerWallX - Math.cos(exitGuideYaw) * (exitGuideLen / 2);
  const exitGuideCenterZ = innerWallZStart - Math.sin(exitGuideYaw) * (exitGuideLen / 2);
  const halfYaw = exitGuideYaw / 2;
  const exitBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(exitGuideCenterX, wallH / 2, exitGuideCenterZ)
      .setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) })
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(exitGuideLen / 2, wallH / 2, wallT / 2)
      .setRestitution(0.5).setFriction(0.04),
    exitBody
  );
  const exitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(exitGuideLen, wallH, wallT),
    mat
  );
  exitMesh.position.set(exitGuideCenterX, wallH / 2, exitGuideCenterZ);
  exitMesh.rotation.y = exitGuideYaw;
  exitMesh.castShadow = true;
  scene.add(exitMesh);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(wallT, wallH, innerWallLen), mat
  );
  mesh.position.set(innerWallX, wallH / 2, innerWallCenterZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const pistonMat = new THREE.MeshStandardMaterial({
    color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.3,
  });
  const piston = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16), pistonMat
  );
  piston.position.set(PLUNGER_LANE_X, 0.35, PLUNGER_REST_Z);
  piston.rotation.x = Math.PI / 2;
  scene.add(piston);

  return piston;
}

export function chargeRatio(chargeMs: number): number {
  return Math.min(1, Math.max(0, chargeMs / PLUNGER_MAX_CHARGE_MS));
}

export function chargeImpulse(chargeMs: number): { x: number; y: number; z: number } {
  const r = chargeRatio(chargeMs);
  const z = PLUNGER_MIN_IMPULSE_Z + (PLUNGER_MAX_IMPULSE_Z - PLUNGER_MIN_IMPULSE_Z) * r;
  return { x: 0, y: 0, z };
}

export function updatePistonVisual(piston: THREE.Mesh, charging: boolean, chargeMs: number, releaseAt: number, ts: number): void {
  if (charging) {
    const r = chargeRatio(chargeMs);
    piston.position.z = PLUNGER_REST_Z + r * PLUNGER_PULL_BACK_DIST;
  } else if (releaseAt > 0 && ts - releaseAt < 180) {
    const elapsed = ts - releaseAt;
    const t = elapsed / 180;
    const snap = (1 - t) * 0.4;
    piston.position.z = PLUNGER_REST_Z + snap;
  } else {
    piston.position.z = PLUNGER_REST_Z;
  }
}
