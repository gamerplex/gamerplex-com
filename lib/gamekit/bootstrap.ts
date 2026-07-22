// Renderer bootstrap — the one hardened way to stand up a WebGPU renderer with a
// WebGL2 fallback, plus the mobile-aware DPR policy. Harvested from the copies in
// VRFC / Time Gate / PLG (which each had their own slightly-different version).

import * as THREE from "three/webgpu";

/** True on touch / coarse-pointer devices (phones, tablets). Used to pick tighter budgets. */
export function isTouch(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
}

/**
 * Device pixel ratio, clamped. Phones cap tighter (thermal budget — bloom/post is
 * the #1 mobile heat source; fewer pixels is the cheapest first lever). Defaults:
 * desktop ≤2, touch ≤1.5 (matches PLG's coarse-pointer cap).
 */
export function clampedDpr(desktopMax = 2, touchMax = 1.5): number {
  const want = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  return Math.min(want, isTouch() ? touchMax : desktopMax);
}

/**
 * Create a WebGPU renderer, hardened: try WebGPU, and on any init failure fall back
 * to the WebGL2 backend (`forceWebGL`). Applies the clamped DPR. The same code path
 * then runs on WebGPU-capable browsers AND on WebViews / blocklisted drivers that
 * only have WebGL2 — which is why setupLook() also guards its post stack.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: { antialias?: boolean; desktopMaxDpr?: number; touchMaxDpr?: number } = {},
): Promise<THREE.WebGPURenderer> {
  const antialias = opts.antialias ?? true;
  let renderer: THREE.WebGPURenderer;
  try {
    renderer = new THREE.WebGPURenderer({ canvas, antialias });
    await renderer.init();
  } catch {
    renderer = new THREE.WebGPURenderer({ canvas, antialias, forceWebGL: true } as never);
    await renderer.init();
  }
  renderer.setPixelRatio(clampedDpr(opts.desktopMaxDpr, opts.touchMaxDpr));
  return renderer;
}
