import { WORDS, WORD_SET } from "./words";

export const RUN_DURATION_SEC = 90;
export const WORD_LENGTH = 5;
// Hard cap on ladder length (start word + this many added steps). Bounds the
// move-log size for inline on-chain storage and mirrors the resolver.
export const MAX_LADDER_STEPS = 60;

// xorshift64 — first 8 bytes fold into u64; matches resolver verifier.
export function makeRng(seedBytes: Uint8Array): () => number {
  const ZERO = BigInt(0);
  const U64 = BigInt("0xffffffffffffffff");
  const U32 = BigInt("0xffffffff");
  let state = ZERO;
  for (let i = 0; i < 8; i++) {
    state = (state << BigInt(8)) | BigInt(seedBytes[i] || 0);
  }
  if (state === ZERO) state = BigInt("0xdeadbeef");
  return () => {
    state ^= state << BigInt(13);
    state &= U64;
    state ^= state >> BigInt(7);
    state ^= state << BigInt(17);
    state &= U64;
    return Number(state & U32);
  };
}

/** True iff `w` has at least one valid one-letter-change neighbor in the dictionary. */
function hasLadderNeighbor(w: string): boolean {
  for (let i = 0; i < w.length; i++) {
    for (let c = 65; c <= 90; c++) {
      const ch = String.fromCharCode(c);
      if (ch === w[i]) continue;
      if (WORD_SET.has(w.slice(0, i) + ch + w.slice(i + 1))) return true;
    }
  }
  return false;
}

/**
 * Deterministic subset of WORDS guaranteed to have >=1 valid ladder step — the
 * ~10% of dead-end words (no one-letter neighbor) are excluded so no run ever
 * starts on an unplayable board. Computed identically in the resolver mirror.
 */
export const PLAYABLE_STARTS: string[] = WORDS.filter(hasLadderNeighbor);

export function startWordIndex(seed: Uint8Array): number {
  const rng = makeRng(seed);
  rng();
  return rng() % PLAYABLE_STARTS.length;
}

/** Deterministic START word of the ladder, derived from the session seed. */
export function startWordForSeed(seed: Uint8Array): string {
  return PLAYABLE_STARTS[startWordIndex(seed)];
}

/** True iff `w` is a real word in the fixed dictionary (case-insensitive). */
export function isRealWord(w: string): boolean {
  return WORD_SET.has(w.toUpperCase());
}

/** Count of letter positions where two equal-length words differ. */
export function letterDiffCount(a: string, b: string): number {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  if (x.length !== y.length) return -1;
  let diff = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff++;
  return diff;
}

/**
 * A valid word-ladder step: `next` must be a real dictionary word, the same
 * length as `prev`, and differ from `prev` in EXACTLY one position (classic
 * Doublets rule). Case-insensitive. No dictionary membership is assumed for
 * `prev` — the ladder start is seed-derived and every accepted step is checked.
 */
export function isValidLadderStep(prev: string, next: string): boolean {
  const p = prev.toUpperCase();
  const n = next.toUpperCase();
  if (n.length !== WORD_LENGTH || p.length !== WORD_LENGTH) return false;
  if (!isRealWord(n)) return false;
  return letterDiffCount(p, n) === 1;
}

/** Distinct-letter count of a word (used for the rarity bonus). */
function distinctLetters(w: string): number {
  return new Set(w.toUpperCase().split("")).size;
}

// Letter rarity weights (integer). Common letters score low, rare letters high.
// Frequency-inspired but fixed constants so the score is fully deterministic and
// identical in the resolver. Values are for A..Z.
const LETTER_RARITY: Readonly<Record<string, number>> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5,
  L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4,
  W: 4, X: 8, Y: 3, Z: 10,
};

function rarityOf(letter: string): number {
  return LETTER_RARITY[letter.toUpperCase()] ?? 1;
}

/** The letter that changed between prev and next (the single differing slot). */
function changedLetter(prev: string, next: string): string {
  const p = prev.toUpperCase();
  const n = next.toUpperCase();
  for (let i = 0; i < n.length; i++) if (p[i] !== n[i]) return n[i];
  return "";
}

/**
 * Score a completed ladder run. `ladder` is the ORDERED list of words including
 * the seed-derived start word at index 0; each subsequent entry is one accepted
 * step. Pure integer math (deterministic; mirrored exactly in the resolver).
 *
 *   perStepBase (20) for every step
 * + rarityOf(changed letter) for every step   (rewards using rare letters)
 * + speed bonus: max(0, RUN_DURATION_SEC - secondsUsed) once, only if any steps
 *
 * A ladder with only the start word (no steps) scores 0.
 */
const PER_STEP_BASE = 20;

export function computeScore(ladder: string[], secondsUsed: number): number {
  const steps = Math.max(0, ladder.length - 1);
  if (steps === 0) return 0;
  let score = 0;
  for (let i = 1; i < ladder.length; i++) {
    score += PER_STEP_BASE;
    score += rarityOf(changedLetter(ladder[i - 1], ladder[i]));
  }
  const secs = Math.max(0, Math.floor(secondsUsed));
  const speedBonus = Math.max(0, RUN_DURATION_SEC - secs);
  return score + speedBonus;
}

// Move-log: 6 bytes per STEP word (5 uppercase letters + 1-byte delta_sec since
// the previous step, or since run start for the first step). The seed-derived
// start word is NOT stored — the resolver re-derives it from the seed. This is
// byte-compatible with the prior v2 format so the on-chain plumbing is unchanged.
const BYTES_PER_STEP = WORD_LENGTH + 1;

/**
 * Encode the ladder STEPS (words the player added AFTER the start word) plus a
 * per-step delta_sec. `steps.length` must equal `deltas.length`.
 */
export function encodeLadderLog(steps: string[], deltas: number[]): Uint8Array {
  if (deltas.length !== steps.length) {
    throw new Error(`encodeLadderLog: deltas length ${deltas.length} != steps length ${steps.length}`);
  }
  const buf = new Uint8Array(steps.length * BYTES_PER_STEP);
  for (let i = 0; i < steps.length; i++) {
    const w = steps[i].toUpperCase();
    if (w.length !== WORD_LENGTH) {
      throw new Error(`encodeLadderLog: step[${i}] must be ${WORD_LENGTH} letters`);
    }
    for (let j = 0; j < WORD_LENGTH; j++) {
      const code = w.charCodeAt(j);
      buf[i * BYTES_PER_STEP + j] = code >= 65 && code <= 90 ? code : 65;
    }
    buf[i * BYTES_PER_STEP + WORD_LENGTH] = Math.min(255, Math.max(0, Math.floor(deltas[i])));
  }
  return buf;
}

export interface DecodedLadder {
  steps: string[];
  deltasSec: number[];
}

/** Decode a move-log into the ordered STEP words + per-step deltas. */
export function decodeLadderLog(buf: Uint8Array): DecodedLadder {
  if (buf.length % BYTES_PER_STEP !== 0) {
    throw new Error(`ladder log length ${buf.length} not a multiple of ${BYTES_PER_STEP}`);
  }
  const n = Math.floor(buf.length / BYTES_PER_STEP);
  const steps: string[] = [];
  const deltasSec: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = "";
    for (let j = 0; j < WORD_LENGTH; j++) {
      const code = buf[i * BYTES_PER_STEP + j];
      s += code >= 65 && code <= 90 ? String.fromCharCode(code) : "A";
    }
    steps.push(s);
    deltasSec.push(buf[i * BYTES_PER_STEP + WORD_LENGTH]);
  }
  return { steps, deltasSec };
}

/**
 * Replay + validate a ladder from its seed-derived start word and the ordered
 * step words. Returns the full ladder (start + valid steps) and whether every
 * step was legal + non-repeating. Mirrored exactly by the resolver.
 */
export function replayLadder(
  seed: Uint8Array,
  steps: string[],
): { ladder: string[]; valid: boolean; reason: string | null } {
  const start = startWordForSeed(seed);
  const ladder: string[] = [start];
  const used = new Set<string>([start]);
  for (let i = 0; i < steps.length; i++) {
    const next = steps[i].toUpperCase();
    const prev = ladder[ladder.length - 1];
    if (!isValidLadderStep(prev, next)) {
      return { ladder, valid: false, reason: `step[${i}] "${next}" is not a valid one-letter move from "${prev}"` };
    }
    if (used.has(next)) {
      return { ladder, valid: false, reason: `step[${i}] "${next}" already used in this ladder` };
    }
    used.add(next);
    ladder.push(next);
  }
  return { ladder, valid: true, reason: null };
}
