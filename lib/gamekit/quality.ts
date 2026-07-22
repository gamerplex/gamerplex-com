// Adaptive render-quality governor for the live WebGPU worlds. There are NO defensible hardcoded
// device budgets on mobile (Adreno 730 / Mali-G615 etc. vary wildly + thermally throttle over time),
// so instead of guessing we MEASURE: a cheap rolling frame-time average self-tunes quality per device.
//
// Full-screen post (bloom) is the #1 thermal liability on tile-based mobile GPUs (an off-chip memory
// round-trip per frame), so the step-DOWN order matches that cost: shrink DPR first (fewer pixels →
// less of everything), then dial bloom strength down, then cut the post pass entirely. Step back UP
// when there's sustained headroom. Fixed-size ring buffer + running sum → zero per-frame allocation.

import type * as THREE from "three/webgpu";
import type { Look } from "./look";

export interface Governor {
  /** Feed the last frame's delta (seconds, unclamped-ish). Call once per rendered frame. */
  sample: (dtSec: number) => void;
}

interface Step { dprMul: number; bloomMul: number; post: boolean }

// Worst-last ladder (index 0 = best). Each step is applied relative to the scene's base DPR/strength.
const LADDER: Step[] = [
  { dprMul: 1.0, bloomMul: 1.0, post: true },   // 0 — full quality
  { dprMul: 0.83, bloomMul: 1.0, post: true },  // 1 — DPR down (e.g. 1.5 → ~1.25)
  { dprMul: 0.67, bloomMul: 1.0, post: true },  // 2 — DPR down more (e.g. 1.5 → ~1.0)
  { dprMul: 0.67, bloomMul: 0.5, post: true },  // 3 — half bloom
  { dprMul: 0.67, bloomMul: 0.0, post: false }, // 4 — cut post entirely (plain render)
];

export function makeQualityGovernor(
  renderer: THREE.WebGPURenderer,
  look: Look,
  applyDpr: (dpr: number) => void,     // set pixel ratio + re-apply size (scene owns the resize)
  baseDpr: number,
  baseStrength: number,
): Governor {
  void renderer;                       // reserved for future GPU-timer sampling; keep the signature stable
  const N = 90;                        // ~1.5s window at 60fps
  const buf = new Float32Array(N);
  let idx = 0, filled = 0, sum = 0;
  let level = 0, cooldown = 0;         // frames until the next allowed change (hysteresis)

  const apply = (lvl: number) => {
    level = lvl;
    const s = LADDER[lvl]!;
    applyDpr(Math.min(baseDpr, baseDpr * s.dprMul));
    look.setStrength(baseStrength * s.bloomMul);
    look.setPostEnabled(s.post);
    cooldown = 120;                    // ~2s settle before re-evaluating (avoid oscillation/thrash)
  };

  return {
    sample: (dtSec: number) => {
      const ms = dtSec * 1000;
      // Ignore stalls/pauses (tab hidden, GC, off-screen gate) so they don't skew the average.
      if (ms > 40 || ms <= 0) return;
      sum -= buf[idx]!;
      buf[idx] = ms;
      sum += ms;
      idx = (idx + 1) % N;
      if (filled < N) filled++;
      if (cooldown > 0) { cooldown--; return; }
      if (filled < N) return;          // need a full window before judging
      const avg = sum / N;
      // >22ms avg ≈ sustained <45fps → step down. <14ms avg ≈ >70fps headroom → step up.
      if (avg > 22 && level < LADDER.length - 1) apply(level + 1);
      else if (avg < 14 && level > 0) apply(level - 1);
    },
  };
}
