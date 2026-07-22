import RAPIER from '@dimforge/rapier3d-compat';
import type { BumperHandle } from './bumpers';
import type { SlingshotHandle } from './slingshots';
import { type DropTargetHandle, hitDropTarget } from './drop-targets';
import { sfx } from './audio';
import { triggerShake } from './camera-shake';

export const COMBO_TIMEOUT_MS = 2200;
const BUMPER_KICK = 9.0;
const SLINGSHOT_FORCE_SCALE = 16;

export interface ScoreState {
  score: number;
  comboCount: number;
  comboTimer: number;
}

export interface CollisionContext {
  ballBody: RAPIER.RigidBody;
  bumperByHandle: Map<number, BumperHandle>;
  slingByHandle: Map<number, SlingshotHandle>;
  dropByHandle: Map<number, DropTargetHandle>;
  dropTargets: DropTargetHandle[];
  bumpers: BumperHandle[];
  state: ScoreState;
  renderHud: () => void;
}

export function makeHandleHit(ctx: CollisionContext): (h: number, ts: number) => void {
  const { ballBody, bumperByHandle, slingByHandle, dropByHandle, dropTargets, state, renderHud } = ctx;

  return (collHandle: number, ts: number) => {
    const drop = dropByHandle.get(collHandle);
    if (drop) {
      const pts = hitDropTarget(drop, ts);
      if (pts > 0) {
        sfx.dropTarget(state.comboCount);
        state.comboCount = Math.min(state.comboCount + 1, 9);
        state.comboTimer = COMBO_TIMEOUT_MS;
        state.score += pts * state.comboCount;
        if (dropTargets.every((d) => d.state !== 'up')) {
          state.score += 5000 * state.comboCount;
          sfx.bankClear();
        }
        renderHud();
      }
      return;
    }

    const bump = bumperByHandle.get(collHandle);
    if (bump) {
      if (ts - bump.lastHitAt < 80) return;
      bump.lastHitAt = ts;
      const p = ballBody.translation();
      const dx = p.x - bump.def.x;
      const dz = p.z - bump.def.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        const nx = dx / dist;
        const nz = dz / dist;
        const lv = ballBody.linvel();
        ballBody.setLinvel({
          x: lv.x + nx * BUMPER_KICK,
          y: lv.y + 0.8,
          z: lv.z + nz * BUMPER_KICK,
        }, true);
      }
      sfx.bumper(state.comboCount);
      triggerShake(0.12, 140, ts);
      state.comboCount = Math.min(state.comboCount + 1, 9);
      state.comboTimer = COMBO_TIMEOUT_MS;
      state.score += bump.def.points * state.comboCount;
      renderHud();
      return;
    }

    const sling = slingByHandle.get(collHandle);
    if (sling) {
      if (ts - sling.lastHitAt < 80) return;
      sling.lastHitAt = ts;
      const p = ballBody.translation();
      const p1 = sling.hypoStart;
      const p2 = sling.hypoEnd;
      const dx = p2.x - p1.x;
      const dz = p2.y - p1.y;
      const segLen2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1,
        ((p.x - p1.x) * dx + (p.z - p1.y) * dz) / segLen2
      ));
      const u = 2 * t - 1;
      const forceCurve = 0.5 * (1 - u * u);
      const force = forceCurve * SLINGSHOT_FORCE_SCALE;
      const lv = ballBody.linvel();
      ballBody.setLinvel({
        x: lv.x + sling.hypoNormal.x * force,
        y: lv.y + 2.0,
        z: lv.z + sling.hypoNormal.y * force,
      }, true);
      sfx.slingshot(state.comboCount);
      triggerShake(0.18 * (0.4 + forceCurve), 120, ts);
      state.comboCount = Math.min(state.comboCount + 1, 9);
      state.comboTimer = COMBO_TIMEOUT_MS;
      state.score += Math.floor(400 + forceCurve * 700) * state.comboCount;
      renderHud();
    }
  };
}
