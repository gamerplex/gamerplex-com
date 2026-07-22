import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TABLE_D } from './table';

export const KICKBACK_X = -6.4;
export const KICKBACK_Z = TABLE_D / 2 - 1.5;
const KICKBACK_HALF_W = 0.4;
const KICKBACK_HALF_D = 0.4;
const KICKBACK_Y = 0.4;

export interface KickbackHandle {
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  armed: boolean;
  flashUntil: number;
}

export function buildKickback(world: RAPIER.World, scene: THREE.Scene): KickbackHandle {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(KICKBACK_X, KICKBACK_Y, KICKBACK_Z)
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(KICKBACK_HALF_W, KICKBACK_Y, KICKBACK_HALF_D)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body
  );

  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ffd1, emissive: 0x00ffd1, emissiveIntensity: 0.9,
    transparent: true, opacity: 0.55, metalness: 0.6, roughness: 0.3,
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(KICKBACK_HALF_W * 2, 0.05, KICKBACK_HALF_D * 2),
    mat
  );
  mesh.position.set(KICKBACK_X, 0.05, KICKBACK_Z);
  scene.add(mesh);

  return { collider, mesh, armed: true, flashUntil: 0 };
}

export const KICKBACK_IMPULSE = { x: 6.0, y: 1.0, z: -10.0 };

export function fireKickback(h: KickbackHandle, ts: number): boolean {
  if (!h.armed) return false;
  h.armed = false;
  h.flashUntil = ts + 300;
  (h.mesh.material as THREE.MeshStandardMaterial).opacity = 0.15;
  return true;
}

export function rearmKickback(h: KickbackHandle): void {
  h.armed = true;
  h.flashUntil = 0;
  (h.mesh.material as THREE.MeshStandardMaterial).opacity = 0.55;
}

export function tickKickback(h: KickbackHandle, ts: number): void {
  if (h.flashUntil > 0 && ts < h.flashUntil) {
    const t = (h.flashUntil - ts) / 300;
    (h.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + t * 3;
  } else if (h.flashUntil > 0) {
    (h.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
    h.flashUntil = 0;
  }
}
