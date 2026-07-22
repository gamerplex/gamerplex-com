// Stylized WebGPU post stack for VRFC — the shared soft "Z effect" look (ported
// from PLG's lookDev): modest BLOOM (a luminous glow on highlights that softens
// hard polygon edges and merges forms) + a gentle warm color-grade + a soft
// vignette, rendered instead of renderer.render(scene, camera). Mobile-budgeted
// (bloom kept modest; DPR clamped by the caller). Wire once:
//   const look = setupLook(renderer, scene, camera);
//   ...loop: look.render();   ...cleanup: look.dispose();

import * as THREE from "three/webgpu";
import { pass, uv, vec2, vec3, float, smoothstep, mix, luminance } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";

export interface Look {
  render: () => void;
  dispose: () => void;
}

export function setupLook(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: { strength?: number; radius?: number; threshold?: number } = {},
): Look {
  const post = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode();

  // Bloom only the brighter pixels (threshold) so highlights/neon glow and edges
  // soften without blowing out the HUD-critical contrast.
  const glow = bloom(color, opts.strength ?? 0.26, opts.radius ?? 0.55, opts.threshold ?? 0.82);

  // Compose: base + bloom → a small overall lift so midtones don't go muddy → a
  // gentle saturation + warmth (kept luminance-neutral) → a light vignette.
  let out = color.add(glow);
  out = out.mul(1.12).add(0.02);                    // brighten: lift + tiny floor so nothing crushes to black
  out = mix(vec3(luminance(out)), out, float(1.14)); // a touch more vivid
  out = out.mul(vec3(1.03, 1.005, 0.985));          // mild warm tint (barely dims blue)

  const vd = uv().sub(vec2(0.5, 0.5)).length();
  out = out.mul(float(1).sub(smoothstep(0.62, 0.95, vd).mul(0.08))); // subtle ~8% corner vignette

  post.outputNode = out;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = post as any;
  return {
    render: () => { if (typeof p.render === "function") p.render(); else p.renderAsync(); },
    dispose: () => { try { p.dispose?.(); } catch { /* ignore */ } },
  };
}
