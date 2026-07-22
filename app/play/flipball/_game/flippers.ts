import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TABLE_D } from './table';
import { PLAYFIELD_CENTER_X } from './playfield';

export const FLIPPER_LEN = 2.2;
const FLIPPER_HALF_THICK = 0.18;
const FLIPPER_HALF_DEPTH = 0.32;
const FLIPPER_REST = -0.5;
const FLIPPER_UP = 0.55;
const FLIPPER_SWEEP_HZ = 9;

// v0.2.44: centered on playfield center, not table center.
// v0.2.48: shared PLAYFIELD_CENTER_X moved to playfield.ts for DRY.
const FLIPPER_Z = TABLE_D / 2 - 2.4;
const FLIPPER_HALF_GAP = 3.0;
const LEFT_PIVOT_X = PLAYFIELD_CENTER_X - FLIPPER_HALF_GAP;
const RIGHT_PIVOT_X = PLAYFIELD_CENTER_X + FLIPPER_HALF_GAP;

export interface FlipperHandle {
  body: RAPIER.RigidBody;
  mesh: THREE.Group;
  side: 'left' | 'right';
  pivot: { x: number; z: number };
  baseAngle: number;
  restAngle: number;
  upAngle: number;
  current: number;
  target: number;
}

export interface FlippersHandles {
  left: FlipperHandle;
  right: FlipperHandle;
  setLeftActive: (active: boolean) => void;
  setRightActive: (active: boolean) => void;
  update: (dt: number) => void;
}

export function buildFlippers(world: RAPIER.World, scene: THREE.Scene): FlippersHandles {
  const left = createFlipper(world, scene, 'left', LEFT_PIVOT_X, FLIPPER_Z, 0, FLIPPER_REST, FLIPPER_UP);
  const right = createFlipper(world, scene, 'right', RIGHT_PIVOT_X, FLIPPER_Z, Math.PI, -FLIPPER_REST, -FLIPPER_UP);

  const setLeftActive = (active: boolean) => {
    left.target = active ? left.upAngle : left.restAngle;
  };
  const setRightActive = (active: boolean) => {
    right.target = active ? right.upAngle : right.restAngle;
  };

  const update = (dt: number) => {
    for (const f of [left, right]) {
      const delta = f.target - f.current;
      const maxStep = FLIPPER_SWEEP_HZ * dt;
      if (Math.abs(delta) < maxStep) f.current = f.target;
      else f.current += Math.sign(delta) * maxStep;

      const total = f.baseAngle + f.current;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), total);
      f.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      f.mesh.quaternion.copy(q);
    }
  };

  return { left, right, setLeftActive, setRightActive, update };
}

function createFlipper(
  world: RAPIER.World,
  scene: THREE.Scene,
  side: 'left' | 'right',
  pivotX: number,
  pivotZ: number,
  baseAngle: number,
  restAngle: number,
  upAngle: number,
): FlipperHandle {
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(pivotX, 0.35, pivotZ);
  const body = world.createRigidBody(bodyDesc);

  const colDesc = RAPIER.ColliderDesc.cuboid(FLIPPER_LEN / 2, FLIPPER_HALF_THICK, FLIPPER_HALF_DEPTH)
    .setTranslation(FLIPPER_LEN / 2, 0, 0)
    .setRestitution(0.4)
    .setFriction(0.6);
  world.createCollider(colDesc, body);

  const startQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseAngle + restAngle);
  body.setNextKinematicRotation({ x: startQuat.x, y: startQuat.y, z: startQuat.z, w: startQuat.w });

  const group = new THREE.Group();
  group.position.set(pivotX, 0.35, pivotZ);

  const flipMat = new THREE.MeshStandardMaterial({
    color: 0x00d4b5,
    roughness: 0.28,
    metalness: 0.78,
    emissive: 0x00ffd1,
    emissiveIntensity: 0.55,
  });
  const flipGeom = new THREE.BoxGeometry(FLIPPER_LEN, FLIPPER_HALF_THICK * 2, FLIPPER_HALF_DEPTH * 2);
  const flipMesh = new THREE.Mesh(flipGeom, flipMat);
  flipMesh.position.x = FLIPPER_LEN / 2;
  flipMesh.castShadow = true;
  group.add(flipMesh);

  // Rubber tip — glowing nub at the end of the flipper bat
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xff00aa,
    emissive: 0xff00aa,
    emissiveIntensity: 1.3,
    roughness: 0.3,
    metalness: 0.3,
  });
  const tipMesh = new THREE.Mesh(
    new THREE.SphereGeometry(FLIPPER_HALF_DEPTH * 0.95, 16, 12),
    tipMat,
  );
  tipMesh.position.x = FLIPPER_LEN;
  group.add(tipMesh);

  const pivotMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.9,
    metalness: 0.6,
    roughness: 0.3,
  });
  const pivotMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), pivotMat);
  group.add(pivotMesh);

  group.quaternion.copy(startQuat);
  scene.add(group);

  return {
    body,
    mesh: group,
    side,
    pivot: { x: pivotX, z: pivotZ },
    baseAngle,
    restAngle,
    upAngle,
    current: restAngle,
    target: restAngle,
  };
}
