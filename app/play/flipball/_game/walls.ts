import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TABLE_W, TABLE_D, WALL_T, WALL_H, CEILING_Y, addWallSegment } from './table';

export function buildOuterWalls(world: RAPIER.World, scene: THREE.Scene): void {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x4a2670, roughness: 0.5, metalness: 0.55,
    emissive: 0x9d4dff, emissiveIntensity: 0.55,
  });
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x5a2c80, roughness: 0.4, metalness: 0.6,
    emissive: 0xc89bff, emissiveIntensity: 0.6,
  });

  const halfW = TABLE_W / 2;
  const halfD = TABLE_D / 2;

  // v0.2.39: arch + side walls now meet at (±halfW, archCenterZ) cleanly.
  // Previously archRX=halfW-0.4 left a 0.4 gap in x; side walls ran the full
  // table length so they overshot past the arch. Now arch tips touch the side
  // wall tops, and segment lengths are real chord lengths (+ small overlap)
  // so consecutive arch segments don't gap.
  const archRX = halfW;
  const archRZ = 3.2;
  const archCenterZ = -halfD + archRZ;
  const sideTopZ = archCenterZ;
  const sideLen = halfD - sideTopZ;
  const sideCenterZ = (sideTopZ + halfD) / 2;

  addWallSegment(world, scene, wallMat, -halfW, sideCenterZ, WALL_T / 2, sideLen / 2, 0);
  addWallSegment(world, scene, wallMat,  halfW, sideCenterZ, WALL_T / 2, sideLen / 2, 0);

  const ceilingBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, CEILING_Y, 0)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfW + 1, 0.1, halfD + 1).setRestitution(0.1).setFriction(0.1),
    ceilingBody
  );

  // v0.2.41: arch was 9 fanned-out box panels with visible inter-segment gaps.
  // Now: ONE smooth tube mesh along the elliptical curve (visual), 24
  // invisible cuboid colliders along the same curve (physics). Side walls
  // visually connect to the tube endpoints at (±halfW, archCenterZ).
  const PHYS_SEGS = 24;
  for (let i = 0; i < PHYS_SEGS; i++) {
    const t0 = Math.PI - (Math.PI * i) / PHYS_SEGS;
    const t1 = Math.PI - (Math.PI * (i + 1)) / PHYS_SEGS;
    const x0 = archRX * Math.cos(t0);
    const z0 = archCenterZ - archRZ * Math.sin(t0);
    const x1 = archRX * Math.cos(t1);
    const z1 = archCenterZ - archRZ * Math.sin(t1);
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const chordLen = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    const halfYaw = yaw / 2;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(xm, WALL_H / 2, zm)
        .setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) })
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(chordLen / 2 + 0.05, WALL_H / 2, WALL_T / 2)
        .setRestitution(0.4).setFriction(0.04),
      body
    );
  }

  const archPts: THREE.Vector3[] = [];
  const VIS_SAMPLES = 48;
  for (let i = 0; i <= VIS_SAMPLES; i++) {
    const t = Math.PI - (Math.PI * i) / VIS_SAMPLES;
    archPts.push(new THREE.Vector3(archRX * Math.cos(t), WALL_H / 2, archCenterZ - archRZ * Math.sin(t)));
  }
  const archCurve = new THREE.CatmullRomCurve3(archPts, false);
  const railGeom = new THREE.TubeGeometry(archCurve, 96, 0.35, 16, false);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xc89bff, emissive: 0xc89bff, emissiveIntensity: 0.85,
    metalness: 0.9, roughness: 0.18,
  });
  const rail = new THREE.Mesh(railGeom, railMat);
  rail.castShadow = true;
  rail.receiveShadow = true;
  scene.add(rail);

  const innerRail = new THREE.Mesh(
    new THREE.TubeGeometry(archCurve, 96, 0.06, 10, false),
    new THREE.MeshStandardMaterial({
      color: 0x00ffd1, emissive: 0x00ffd1, emissiveIntensity: 2.2,
      metalness: 0.5, roughness: 0.1,
    })
  );
  innerRail.position.y = -0.4;
  scene.add(innerRail);

  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x0a0018, roughness: 0.8, metalness: 0.3,
    emissive: 0x3a1f5c, emissiveIntensity: 0.4,
  });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W - 0.5, 3.8), apronMat);
  apron.rotation.x = -Math.PI / 2 + 0.18;
  apron.position.set(0, 0.1, halfD - 1.9);
  scene.add(apron);

  // v0.2.21 LEFT outlane defensive post — rubber-banded cylinder near drain.
  // High restitution (1.4) so slow balls bounce back instead of draining.
  const postBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(-6.4, 0.5, halfD - 4.5)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.5, 0.18).setRestitution(1.4).setFriction(0.0),
    postBody
  );
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 1.1,
    metalness: 0.6, roughness: 0.3,
  });
  const postMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.0, 14), postMat);
  postMesh.position.set(-6.4, 0.5, halfD - 4.5);
  postMesh.castShadow = true;
  scene.add(postMesh);
}
