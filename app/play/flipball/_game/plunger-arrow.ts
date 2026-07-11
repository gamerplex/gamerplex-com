import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLUNGER_LANE_X, PLUNGER_REST_Z } from './plunger';

// Bobbing UP arrow shown above the plunger lane when ball is parked there.
// Hides instantly when ball leaves the plunger zone OR plunger is charging.

const ARROW_X = PLUNGER_LANE_X;
const ARROW_BASE_Y = 1.6;
const ARROW_Z = PLUNGER_REST_Z - 0.4;
const BOB_AMPLITUDE = 0.35;
const BOB_HZ = 2.4;

export interface PlungerArrowHandle {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
}

export function buildPlungerArrow(scene: THREE.Scene): PlungerArrowHandle {
  const group = new THREE.Group();
  group.position.set(ARROW_X, ARROW_BASE_Y, ARROW_Z);
  group.visible = false;

  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ffd1, emissive: 0x00ffd1, emissiveIntensity: 1.6,
    metalness: 0.4, roughness: 0.2,
  });
  // Cone points -Z (toward top of table = launch direction) so it reads as
  // a "shoot UP the playfield" hint from the orbit camera.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 4), mat);
  cone.rotation.x = Math.PI / 2;
  cone.rotation.z = Math.PI / 4;
  group.add(cone);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 4),
    new THREE.MeshBasicMaterial({ color: 0x00ffd1, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.55;
  group.add(halo);

  scene.add(group);
  return { group, mat };
}

export function tickPlungerArrow(
  arrow: PlungerArrowHandle,
  ball: RAPIER.RigidBody,
  ts: number,
  inPlungerZone: boolean,
  charging: boolean,
): void {
  const show = inPlungerZone && !charging;
  arrow.group.visible = show;
  if (!show) return;
  const phase = (ts / 1000) * BOB_HZ * Math.PI * 2;
  arrow.group.position.y = ARROW_BASE_Y + Math.sin(phase) * BOB_AMPLITUDE;
  arrow.mat.emissiveIntensity = 1.4 + (Math.sin(phase) + 1) * 0.3;
}
