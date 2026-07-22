// FLIPBALL v0.2 — drop target bank.
//
// 3 rectangular targets in a row. Each hit = score + target retracts below
// playfield. All 3 hit = bonus multiplier + bank resets after 2s.
//
// Per https://en.wikipedia.org/wiki/Glossary_of_pinball_terms — a drop target
// is "an upright, pressure-sensitive rectangle that drops below the playfield
// when hit by the ball." Bank-clearing typically rewards a mode/multiplier.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYFIELD_CENTER_X } from './playfield';

const TARGET_HALF_W = 0.5;
const TARGET_HALF_H = 0.55;
const TARGET_HALF_D = 0.12;
const TARGET_Y_UP = TARGET_HALF_H;     // sitting on playfield
const TARGET_Y_DOWN = -TARGET_HALF_H - 0.1;  // sunk below
const DROP_DURATION_MS = 220;
const RESET_DELAY_MS = 2000;
const RESET_DURATION_MS = 400;

export interface DropTargetDef {
  x: number;
  z: number;
  points: number;
  color: number;
}

export interface DropTargetHandle {
  def: DropTargetDef;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  glowMat: THREE.MeshStandardMaterial;
  state: 'up' | 'dropping' | 'down' | 'resetting';
  stateChangedAt: number;
  bankResetAt: number;
}

// v0.2.48: centered on playfield (not table) center.
const C = PLAYFIELD_CENTER_X;
export const DROP_TARGETS: DropTargetDef[] = [
  { x: C - 1.4, z: -2.5, points: 200, color: 0xff3b8a },
  { x: C,       z: -2.5, points: 200, color: 0xff8a3b },
  { x: C + 1.4, z: -2.5, points: 200, color: 0x3bd1ff },
];

export function buildDropTargets(
  world: RAPIER.World,
  scene: THREE.Scene,
): DropTargetHandle[] {
  const handles: DropTargetHandle[] = [];
  for (const def of DROP_TARGETS) {
    // Kinematic body — we'll setNextKinematicTranslation to animate up/down
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(def.x, TARGET_Y_UP, def.z);
    const body = world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(TARGET_HALF_W, TARGET_HALF_H, TARGET_HALF_D)
      .setRestitution(0.7)
      .setFriction(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = world.createCollider(colDesc, body);

    const glowMat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.5,
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TARGET_HALF_W * 2, TARGET_HALF_H * 2, TARGET_HALF_D * 2),
      glowMat,
    );
    mesh.position.set(def.x, TARGET_Y_UP, def.z);
    mesh.castShadow = true;
    scene.add(mesh);

    handles.push({
      def,
      body,
      collider,
      mesh,
      glowMat,
      state: 'up',
      stateChangedAt: 0,
      bankResetAt: 0,
    });
  }
  return handles;
}

/** Tick the drop-target animations. Call from the main game loop with
 *  current timestamp. */
export function updateDropTargets(
  handles: DropTargetHandle[],
  now: number,
): void {
  // Check if whole bank is down -> schedule reset
  const allDown = handles.every((h) => h.state === 'down');
  if (allDown && handles[0].bankResetAt === 0) {
    handles.forEach((h) => { h.bankResetAt = now + RESET_DELAY_MS; });
  }

  for (const h of handles) {
    if (h.state === 'dropping') {
      const t = Math.min(1, (now - h.stateChangedAt) / DROP_DURATION_MS);
      const y = TARGET_Y_UP + (TARGET_Y_DOWN - TARGET_Y_UP) * t;
      h.body.setNextKinematicTranslation({ x: h.def.x, y, z: h.def.z });
      h.mesh.position.y = y;
      h.glowMat.emissiveIntensity = 0.9 * (1 - t);
      if (t >= 1) {
        h.state = 'down';
        h.stateChangedAt = now;
        // disable collisions while down so the ball passes through the slot
        h.collider.setEnabled(false);
      }
    } else if (h.state === 'resetting') {
      const t = Math.min(1, (now - h.stateChangedAt) / RESET_DURATION_MS);
      const y = TARGET_Y_DOWN + (TARGET_Y_UP - TARGET_Y_DOWN) * t;
      h.body.setNextKinematicTranslation({ x: h.def.x, y, z: h.def.z });
      h.mesh.position.y = y;
      h.glowMat.emissiveIntensity = 0.9 * t;
      if (t >= 1) {
        h.state = 'up';
        h.stateChangedAt = now;
        h.bankResetAt = 0;
        h.collider.setEnabled(true);
      }
    } else if (h.state === 'down' && h.bankResetAt > 0 && now >= h.bankResetAt) {
      h.state = 'resetting';
      h.stateChangedAt = now;
    }
  }
}

/** Called when a drop target is hit. Drops it + returns the score awarded.
 *  Returns 0 if target was already down. */
export function hitDropTarget(handle: DropTargetHandle, now: number): number {
  if (handle.state !== 'up') return 0;
  handle.state = 'dropping';
  handle.stateChangedAt = now;
  return handle.def.points;
}
