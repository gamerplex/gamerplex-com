import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export interface BumperDef {
  x: number; z: number; r: number;
  points: number; color: number; glow: number;
}

export interface BumperHandle {
  def: BumperDef;
  collider: RAPIER.Collider;
  mesh: THREE.Group;
  capMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  lastHitAt: number;
}

import { PLAYFIELD_CENTER_X } from './playfield';

// v0.2.38: classic 3-bumper triangle. v0.2.48: derived from playfield center
// (not table center) so the triangle reads as truly centered to the player.
const C = PLAYFIELD_CENTER_X;
export const BUMPERS: BumperDef[] = [
  { x: C,       z: -7.5, r: 0.95, points: 250, color: 0x9d4dff, glow: 0xc89bff },
  { x: C - 3,   z: -4.5, r: 0.9,  points: 200, color: 0x3399ff, glow: 0x7fc1ff },
  { x: C + 3,   z: -4.5, r: 0.9,  points: 200, color: 0x00ffd1, glow: 0x9bf5e3 },
];

export function buildBumpers(world: RAPIER.World, scene: THREE.Scene): BumperHandle[] {
  const handles: BumperHandle[] = [];
  for (const def of BUMPERS) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(def.x, 0.55, def.z));
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.55, def.r).setRestitution(1.2).setFriction(0.0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );

    const group = new THREE.Group();
    group.position.set(def.x, 0, def.z);

    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x1a0335, roughness: 0.4, metalness: 0.7,
      emissive: def.color, emissiveIntensity: 0.25,
    });
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(def.r * 0.95, def.r * 1.1, 0.55, 28), skirtMat);
    skirt.position.y = 0.275;
    skirt.castShadow = true;
    group.add(skirt);

    const ringMat = new THREE.MeshStandardMaterial({
      color: def.glow, emissive: def.glow, emissiveIntensity: 1.4,
      roughness: 0.2, metalness: 0.2,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(def.r * 0.92, 0.12, 12, 32), ringMat);
    ring.position.y = 0.6;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const capMat = new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.glow, emissiveIntensity: 0.9,
      roughness: 0.25, metalness: 0.5,
    });
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(def.r * 0.7, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      capMat
    );
    cap.position.y = 0.62;
    group.add(cap);

    const pip = new THREE.Mesh(
      new THREE.SphereGeometry(def.r * 0.18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    pip.position.y = 1.05;
    group.add(pip);

    const light = new THREE.PointLight(def.glow, 0.7, 4);
    light.position.y = 1.2;
    group.add(light);

    scene.add(group);
    handles.push({ def, collider, mesh: group, capMat, ringMat, light, lastHitAt: 0 });
  }
  return handles;
}
