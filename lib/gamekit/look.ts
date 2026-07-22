// Shared "Z effect" render layer for WebGPU worlds. Renders the scene through a
// stylized post stack — soft BLOOM (a luminous glow on highlights) + a warm
// color-grade + a gentle vignette — instead of renderer.render(scene, camera).
// The single biggest stylized-look lift, and mobile-budgeted (bloom kept modest).
// Wire once per world:
//   const look = setupLook(renderer, scene, camera);
//   ...loop: look.render();   ...cleanup: look.dispose();
//
// The `setStrength`/`setPostEnabled` hooks let makeQualityGovernor() dial bloom
// down (and cut post) on hot/weak devices; render() also degrades to a plain
// render permanently if the TSL post throws once (some WebGL2 drivers).
//
// WATER option: pass { water:{ level } } to add a depth-based screen-space
// WATERLINE. Each pixel's world-Y is reconstructed from the depth buffer; pixels
// below `level` get a cool tint and a bright meniscus band draws where the surface
// crosses geometry — a true split view (air above / water below) for sea scenes.

import * as THREE from "three/webgpu";
import {
  pass, uv, vec2, vec3, vec4, float, smoothstep, mix, luminance, abs,
  screenUV, getViewPosition, cameraProjectionMatrixInverse, cameraWorldMatrix,
} from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";

export interface Look {
  render: () => void;
  setStrength: (s: number) => void;      // adaptive governor: dial bloom strength down/up at runtime
  setPostEnabled: (on: boolean) => void; // adaptive governor: cut the full-screen post entirely
  dispose: () => void;
}

export interface LookOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
  /** Gentle brightness/exposure raise (0 = off) for scenes that want a brighter, more magical read. */
  lift?: number;
  /** Depth-based screen-space waterline at this world-Y level (sea scenes). */
  water?: { level: number };
}

export function setupLook(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: LookOptions = {},
): Look {
  const baseStrength = opts.strength ?? 0.2;
  const post = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode();

  // Bloom only the brighter pixels (threshold) so highlights/sun/water-sparkle glow without blowing out.
  // `glow.strength` is a live uniform → the adaptive quality governor dials it down on hot devices.
  const glow = bloom(color, baseStrength, opts.radius ?? 0.55, opts.threshold ?? 0.84);

  // Compose: base + bloom → a GENTLE grade (a little saturation + warmth) → a soft vignette. Subtle by
  // design — aggressive grading muddies/darkens; the real "Z" pop comes from materials/lighting.
  let out = color.add(glow);
  // Optional brightness LIFT (0 = off): a gentle exposure raise + tiny black floor so midtones
  // never go muddy — used by scenes that want a brighter, more magical read.
  const l = opts.lift ?? 0;
  if (l > 0) out = out.mul(1 + l).add(l * 0.15);
  out = mix(vec3(luminance(out)), out, float(1.1));           // gentle saturation → a touch more vivid
  out = out.mul(vec3(1.04, 1.005, 0.965));                    // mild warm highlights

  // ---- depth-based waterline (optional) — a real screen-space split at the sea surface ----
  if (opts.water) {
    const depthTex = scenePass.getTextureNode("depth");
    const viewPos = getViewPosition(screenUV, depthTex, cameraProjectionMatrixInverse);
    const worldY = cameraWorldMatrix.mul(vec4(viewPos, 1.0)).y;   // per-pixel world height
    const d = worldY.sub(float(opts.water.level));               // >0 air, <0 underwater (world units)
    const below = smoothstep(float(0.06), float(-0.06), d);      // 1 below the line, 0 above (thin edge)
    out = mix(out, out.mul(vec3(0.82, 0.94, 1.08)), below.mul(0.3)); // cool the submerged half of the frame
    const line = smoothstep(float(0.18), float(0.0), abs(d));    // bright band right at the crossing
    out = out.add(vec3(0.55, 0.8, 0.9).mul(line).mul(0.4));      // the foam/refraction meniscus
  }

  const vd = uv().sub(vec2(0.5, 0.5)).length();
  out = out.mul(float(1).sub(smoothstep(0.5, 0.92, vd).mul(0.15))); // subtle vignette (~15% at corners)

  post.outputNode = out;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = post as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = glow as any;
  let postEnabled = true;   // governor / WebGL2-safety can flip this to a plain render
  let postBroken = false;   // set if the TSL post throws once (some WebGL2 drivers) → permanent fallback
  return {
    render: () => {
      // When post is disabled (hot device) or has proven unsupported (WebGL2 driver), render plain.
      if (!postEnabled || postBroken) { renderer.render(scene, camera); return; }
      try { if (typeof p.render === "function") p.render(); else p.renderAsync(); }
      catch (e) {
        // Gracefully degrade instead of erroring: fall back to a plain render for the rest of the session.
        postBroken = true;
        // eslint-disable-next-line no-console
        console.warn("[game-kit/look] post stack failed — falling back to plain render", e);
        renderer.render(scene, camera);
      }
    },
    setStrength: (s: number) => { try { if (g.strength) g.strength.value = s; } catch { /* ignore */ } },
    setPostEnabled: (on: boolean) => { postEnabled = on; },
    dispose: () => { try { p.dispose?.(); } catch { /* ignore */ } },
  };
}
