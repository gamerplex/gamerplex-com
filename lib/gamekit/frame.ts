// Deterministic PRNG + seed helpers — the basis every game's sim uses so a shared
// challenge link (and any server replay) produces the identical run. Never use
// Math.random in sim. Pure JS, zero deps — usable client-side AND in a headless
// replay/verify path. Harvested from the byte-identical copies in VRFC/Time Gate.

/** Deterministic PRNG (mulberry32). Returns a function producing floats in [0,1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string → a u32 seed. */
export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * FNV-1a hash of raw bytes → a u32 seed. Use with the 32-byte session seed from
 * `@gamerplex/sdk` `openSession()` so an on-chain-verifiable replay uses the same
 * deterministic basis the game rendered with.
 */
export function seedFromBytes(bytes: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
