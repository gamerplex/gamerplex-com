// Small texture + teardown helpers, harvested from the near-identical copies in
// VRFC / Time Gate. Disposing geometries/materials/textures on unmount matters:
// three does not GC GPU resources for you, so a game that mounts/unmounts (SPA
// navigation) leaks VRAM without this.

import * as THREE from "three/webgpu";

/** A soft radial-gradient canvas texture — the workhorse for glow sprites/particles. */
export function softTex(inner: string, outer = "rgba(0,0,0,0)"): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/** Remove a sprite from the scene and dispose its material + map. */
export function disposeSprite(scene: THREE.Scene, s: THREE.Sprite): void {
  scene.remove(s);
  const mat = s.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.dispose();
}

/** Remove an object (and its subtree) from the scene, disposing every geometry/material/map. */
export function disposeObject(scene: THREE.Scene, o: THREE.Object3D): void {
  scene.remove(o);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as (THREE.Material & { map?: THREE.Texture }) | undefined;
    if (mat) { mat.map?.dispose?.(); mat.dispose?.(); }
  });
}
