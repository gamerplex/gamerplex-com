import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYFIELD_CENTER_X } from './playfield';

export interface SlingshotDef {
  cx: number; cz: number; side: 'left' | 'right';
}

export interface SlingshotHandle {
  def: SlingshotDef;
  collider: RAPIER.Collider;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  centroid: THREE.Vector3;
  hypoStart: THREE.Vector2;
  hypoEnd: THREE.Vector2;
  hypoNormal: THREE.Vector2;
  lastHitAt: number;
}

// v0.2.48: symmetric around PLAYFIELD center (was hand-tuned asymmetric).
// Outer edges land 0.525u from each wall (left at -7, plunger inner at +5.65).
const SL_C = PLAYFIELD_CENTER_X;
export const SLINGSHOTS: SlingshotDef[] = [
  { cx: SL_C - 5, cz: 7.2, side: 'left' },
  { cx: SL_C + 5, cz: 7.2, side: 'right' },
];

const SL_TRI_W = 1.6;
const SL_TRI_D = 2.4;
const SL_TRI_H = 0.55;
const SL_KICK_THICKNESS = 0.1;

export function buildSlingshots(world: RAPIER.World, scene: THREE.Scene): SlingshotHandle[] {
  const handles: SlingshotHandle[] = [];

  for (const def of SLINGSHOTS) {
    const sign = def.side === 'left' ? 1 : -1;
    const xOuter = def.cx - sign * (SL_TRI_W / 2);
    const xInner = def.cx + sign * (SL_TRI_W / 2);
    const zTop = def.cz - SL_TRI_D / 2;
    const zBot = def.cz + SL_TRI_D / 2;
    const vTopInner = new THREE.Vector2(xInner, zTop);
    const vTopOuter = new THREE.Vector2(xOuter, zTop);
    const vBotOuter = new THREE.Vector2(xOuter, zBot);
    const hypoStart = vTopInner.clone();
    const hypoEnd = vBotOuter.clone();
    const dir = hypoEnd.clone().sub(hypoStart).normalize();
    const hypoNormal = new THREE.Vector2(-dir.y, dir.x);
    if (def.side === 'right') hypoNormal.multiplyScalar(-1);

    const hypoLength = hypoStart.distanceTo(hypoEnd);
    const hypoMidX = (hypoStart.x + hypoEnd.x) / 2;
    const hypoMidZ = (hypoStart.y + hypoEnd.y) / 2;
    const hypoYaw = Math.atan2(dir.y, dir.x);
    const halfYaw = hypoYaw / 2;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(hypoMidX, SL_TRI_H / 2, hypoMidZ)
        .setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) })
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hypoLength / 2, SL_TRI_H / 2, SL_KICK_THICKNESS)
        .setRestitution(1.2).setFriction(0.0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );

    const shape = new THREE.Shape();
    shape.moveTo(vTopInner.x - def.cx, -(vTopInner.y - def.cz));
    shape.lineTo(vTopOuter.x - def.cx, -(vTopOuter.y - def.cz));
    shape.lineTo(vBotOuter.x - def.cx, -(vBotOuter.y - def.cz));
    shape.closePath();
    const triGeom = new THREE.ExtrudeGeometry(shape, { depth: SL_TRI_H, bevelEnabled: false });
    triGeom.rotateX(-Math.PI / 2);

    const slingMat = new THREE.MeshStandardMaterial({
      color: 0xffcc33, roughness: 0.35, metalness: 0.5,
      emissive: 0xff8800, emissiveIntensity: 1.2,
    });
    const slingMesh = new THREE.Mesh(triGeom, slingMat);
    slingMesh.position.set(def.cx, 0, def.cz);
    slingMesh.castShadow = true;
    slingMesh.receiveShadow = true;
    scene.add(slingMesh);

    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 1.8, roughness: 0.3,
    });
    const bandMesh = new THREE.Mesh(new THREE.BoxGeometry(hypoLength, 0.12, 0.1), bandMat);
    bandMesh.position.set(hypoMidX, SL_TRI_H + 0.06, hypoMidZ);
    bandMesh.rotation.y = hypoYaw;
    scene.add(bandMesh);

    handles.push({
      def, collider, mesh: slingMesh, mat: slingMat,
      centroid: new THREE.Vector3(def.cx, SL_TRI_H / 2, def.cz),
      hypoStart, hypoEnd, hypoNormal, lastHitAt: 0,
    });
  }

  return handles;
}
