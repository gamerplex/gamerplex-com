// Frozen spatial basis for a right-handed world: RIGHT=+X, UP=+Y, FORWARD=-Z.
// Deriving every direction from one basis keeps client sim and any server replay
// in agreement. Kept separate from frame.ts so the pure PRNG stays three-free.

import { Vector3 } from "three/webgpu";

export const RIGHT = /* @__PURE__ */ Object.freeze(new Vector3(1, 0, 0));
export const UP = /* @__PURE__ */ Object.freeze(new Vector3(0, 1, 0));
export const FORWARD = /* @__PURE__ */ Object.freeze(new Vector3(0, 0, -1));
