// VENDORED copy of @gamerplex/game-kit src (package unpublished; keep in sync with gamerplex-sdk/packages/game-kit).
// @gamerplex/game-kit — the thin shared layer ABOVE three/webgpu (not an engine).
// The single canonical copies of what every Gamerplex 3D game re-derives. Web-only.
// See ENGINEERING/GAME_KIT_EVALUATION.md + WEB_3D_STANDARDS.md.

export { createRenderer, clampedDpr, isTouch } from "./bootstrap";
export { setupLook } from "./look";
export type { Look, LookOptions } from "./look";
export { makeQualityGovernor } from "./quality";
export type { Governor } from "./quality";
export { rng, seedFrom, seedFromBytes } from "./frame";
export { RIGHT, UP, FORWARD } from "./basis";
export { softTex, disposeSprite, disposeObject } from "./teardown";
export { makeKeySet } from "./input";
export type { KeySet } from "./input";
export type { GameSim, GameSimCtor } from "./types";
