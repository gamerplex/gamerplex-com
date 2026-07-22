import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const TABLE_W = 14;
export const TABLE_D = 28;
export const WALL_H = 2.4;
export const WALL_T = 0.25;
export const CEILING_Y = 3.0;

export function addWallSegment(
  world: RAPIER.World,
  scene: THREE.Scene,
  mat: THREE.MeshStandardMaterial,
  x: number, z: number,
  hx: number, hz: number,
  yaw: number,
): void {
  const halfYaw = yaw / 2;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(x, WALL_H / 2, z)
      .setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) })
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, WALL_H / 2, hz).setRestitution(0.35).setFriction(0.05),
    body
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, WALL_H, hz * 2), mat);
  mesh.position.set(x, WALL_H / 2, z);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// NOTE: do NOT re-export from walls/bumpers/slingshots here.
// Those modules import PLAYFIELD_CENTER_X from playfield.ts, which imports
// TABLE_W from this file — re-exports create a circular dep + TDZ crash at
// boot ("Cannot access 'mC' before initialization"). v0.2.49 fixed by
// making consumers import directly from each module.
