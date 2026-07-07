import { describe, it, expect } from "vitest";
import { WORDS, WORD_SET, isAcceptableGuess } from "../words";
import {
  RUN_DURATION_SEC,
  WORD_LENGTH,
  MAX_LADDER_STEPS,
  makeRng,
  startWordIndex,
  startWordForSeed,
  isRealWord,
  letterDiffCount,
  isValidLadderStep,
  computeScore,
  encodeLadderLog,
  decodeLadderLog,
  replayLadder,
} from "../engine";

const seedOf = (bytes: number[]): Uint8Array => {
  const s = new Uint8Array(32);
  s.set(bytes.slice(0, 32));
  return s;
};

// A hand-verified real-word ladder from the shipped dictionary (seed-independent).
// STARE → SCARE → SHARE → CHARE → PHARE, each exactly one letter apart.
const STARE_LADDER = ["STARE", "SCARE", "SHARE", "CHARE", "PHARE"];

describe("blockwords: makeRng (xorshift64, resolver-mirrored)", () => {
  it("is deterministic for the same seed", () => {
    const a = makeRng(seedOf([1, 2, 3, 4, 5, 6, 7, 8]));
    const b = makeRng(seedOf([1, 2, 3, 4, 5, 6, 7, 8]));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs across seeds", () => {
    const a = makeRng(seedOf([1, 2, 3, 4, 5, 6, 7, 8]));
    const b = makeRng(seedOf([8, 7, 6, 5, 4, 3, 2, 1]));
    expect(a()).not.toBe(b());
  });

  it("recovers from an all-zero seed (deadbeef fallback, non-degenerate)", () => {
    const rng = makeRng(seedOf([]));
    const first = rng();
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(rng()).not.toBe(first);
  });
});

describe("blockwords: start word derivation (deterministic from seed)", () => {
  it("startWordIndex is in-range and deterministic", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]);
    const i = startWordIndex(seed);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(WORDS.length);
    expect(startWordIndex(seed)).toBe(i);
  });

  it("same seed → same start word (fixed vector)", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]);
    expect(startWordForSeed(seed)).toBe("KALON");
    expect(startWordForSeed(seed)).toBe(WORDS[startWordIndex(seed)]);
    expect(startWordForSeed(seed).length).toBe(WORD_LENGTH);
  });

  it("the derived start word is always a real dictionary word", () => {
    for (const bytes of [[1], [255, 0, 128], [42, 7, 1, 9, 200, 3, 88, 15], [9, 9, 9]]) {
      expect(isRealWord(startWordForSeed(seedOf(bytes)))).toBe(true);
    }
  });
});

describe("blockwords: word/dictionary predicates", () => {
  it("isRealWord matches the fixed dictionary, case-insensitively", () => {
    expect(isRealWord("STARE")).toBe(true);
    expect(isRealWord("stare")).toBe(true);
    expect(isRealWord("ZZZZZ")).toBe(false);
    expect(WORD_SET.has("STARE")).toBe(true);
  });

  it("isAcceptableGuess requires a real 5-letter A-Z word", () => {
    expect(isAcceptableGuess("STARE")).toBe(true);
    expect(isAcceptableGuess("WXYZQ")).toBe(false); // shape ok, not a word
    expect(isAcceptableGuess("CAT")).toBe(false); // wrong length
    expect(isAcceptableGuess("st4re")).toBe(false); // not A-Z uppercase
  });
});

describe("blockwords: letterDiffCount", () => {
  it("counts differing positions", () => {
    expect(letterDiffCount("STARE", "STARE")).toBe(0);
    expect(letterDiffCount("STARE", "SCARE")).toBe(1);
    expect(letterDiffCount("STARE", "SHORE")).toBe(2);
    expect(letterDiffCount("STARE", "PLUMB")).toBe(5);
  });

  it("is case-insensitive and returns -1 for length mismatch", () => {
    expect(letterDiffCount("stare", "SCARE")).toBe(1);
    expect(letterDiffCount("STARE", "CAT")).toBe(-1);
  });
});

describe("blockwords: isValidLadderStep (one-letter word-ladder rule)", () => {
  it("accepts a real word exactly one letter away", () => {
    expect(isValidLadderStep("STARE", "SCARE")).toBe(true);
    expect(isValidLadderStep("SCARE", "SHARE")).toBe(true);
  });

  it("rejects a zero-letter change (identical word)", () => {
    expect(isValidLadderStep("STARE", "STARE")).toBe(false);
  });

  it("rejects a two-letter change even if the target is real", () => {
    // SHORE is a real word but differs from STARE in two positions.
    expect(isRealWord("SHORE")).toBe(true);
    expect(letterDiffCount("STARE", "SHORE")).toBe(2);
    expect(isValidLadderStep("STARE", "SHORE")).toBe(false);
  });

  it("rejects a one-letter change to a NON-word", () => {
    // STARE → STARZ is one letter apart but not a dictionary word.
    expect(letterDiffCount("STARE", "STARZ")).toBe(1);
    expect(isRealWord("STARZ")).toBe(false);
    expect(isValidLadderStep("STARE", "STARZ")).toBe(false);
  });

  it("rejects wrong-length inputs", () => {
    expect(isValidLadderStep("STARE", "SCAR")).toBe(false);
    expect(isValidLadderStep("CAT", "COT")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isValidLadderStep("stare", "scare")).toBe(true);
  });

  it("every consecutive pair of the sample ladder is a valid step", () => {
    for (let i = 1; i < STARE_LADDER.length; i++) {
      expect(isValidLadderStep(STARE_LADDER[i - 1], STARE_LADDER[i])).toBe(true);
    }
  });
});

describe("blockwords: computeScore (deterministic integer math)", () => {
  it("scores 0 for a ladder with no steps (start word only)", () => {
    expect(computeScore(["STARE"], 5)).toBe(0);
    expect(computeScore([], 5)).toBe(0);
  });

  it("rewards ladder length + rare letters + speed (fixed vectors)", () => {
    // STARE→SCARE→SHARE→CHARE→PHARE: 4 steps, changed letters C,H,C,P
    // = 4*20 + (3+4+3+3) = 80 + 13 = 93 base; + speed bonus max(0, 90 - secs).
    expect(computeScore(STARE_LADDER, 10)).toBe(93 + 80); // 173
    expect(computeScore(STARE_LADDER, 0)).toBe(93 + 90); // 183
  });

  it("floors the speed bonus at 0 once the run duration is exceeded", () => {
    expect(computeScore(STARE_LADDER, 200)).toBe(93); // base only
    expect(computeScore(STARE_LADDER, RUN_DURATION_SEC)).toBe(93);
  });

  it("a longer ladder always beats a shorter prefix at the same time", () => {
    const short = computeScore(STARE_LADDER.slice(0, 3), 10);
    const long = computeScore(STARE_LADDER, 10);
    expect(long).toBeGreaterThan(short);
  });

  it("exposes stable game constants", () => {
    expect(RUN_DURATION_SEC).toBe(90);
    expect(WORD_LENGTH).toBe(5);
    expect(MAX_LADDER_STEPS).toBe(60);
  });
});

describe("blockwords: ladder move-log encode/decode round-trip", () => {
  it("packs 6 bytes/step (5 letters + delta) and round-trips the steps", () => {
    const steps = STARE_LADDER.slice(1); // the 4 added rungs
    const deltas = [3, 7, 4, 12];
    const buf = encodeLadderLog(steps, deltas);
    expect(buf.length).toBe(steps.length * (WORD_LENGTH + 1));
    const decoded = decodeLadderLog(buf);
    expect(decoded.steps).toEqual(steps);
    expect(decoded.deltasSec).toEqual(deltas);
  });

  it("clamps deltas into a byte", () => {
    const buf = encodeLadderLog(["SCARE"], [400]);
    expect(buf[WORD_LENGTH]).toBe(255);
    expect(decodeLadderLog(buf).deltasSec).toEqual([255]);
  });

  it("throws on delta/step length mismatch and wrong-length words", () => {
    expect(() => encodeLadderLog(["SCARE"], [1, 2])).toThrow(/deltas length/);
    expect(() => encodeLadderLog(["CAT"], [1])).toThrow();
  });

  it("decode rejects a buffer that is not a multiple of the step stride", () => {
    expect(() => decodeLadderLog(new Uint8Array(5))).toThrow(/not a multiple/);
  });

  it("empty ladder log round-trips to no steps", () => {
    const buf = encodeLadderLog([], []);
    expect(buf.length).toBe(0);
    expect(decodeLadderLog(buf)).toEqual({ steps: [], deltasSec: [] });
  });
});

describe("blockwords: replayLadder (start word + step validation + no-repeat)", () => {
  it("replays a valid ladder from a seed whose start matches the first prev", () => {
    // Seed → KALON; a hand-verified continuation.
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]);
    expect(startWordForSeed(seed)).toBe("KALON");
    const steps = ["SALON", "TALON", "TAXON", "CAXON", "CANON"];
    const { ladder, valid, reason } = replayLadder(seed, steps);
    expect(valid).toBe(true);
    expect(reason).toBeNull();
    expect(ladder).toEqual(["KALON", ...steps]);
  });

  it("fails when a step is more than one letter from the previous rung", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]); // KALON
    const { valid, reason } = replayLadder(seed, ["SALON", "MELON"]); // SALON→MELON = 2 diffs
    expect(valid).toBe(false);
    expect(reason).toMatch(/not a valid one-letter move/);
  });

  it("fails when a step repeats an already-used word", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]); // KALON
    const { valid, reason } = replayLadder(seed, ["SALON", "TALON", "SALON"]);
    expect(valid).toBe(false);
    expect(reason).toMatch(/already used/);
  });

  it("fails when a step is not a real word", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]); // KALON
    const { valid, reason } = replayLadder(seed, ["KALOZ"]); // one letter off, not a word
    expect(valid).toBe(false);
    expect(reason).toMatch(/not a valid one-letter move/);
  });

  it("an empty step list is a valid (zero-rung) ladder of just the start word", () => {
    const seed = seedOf([1, 2, 3, 4, 5, 6, 7, 8]);
    const { ladder, valid } = replayLadder(seed, []);
    expect(valid).toBe(true);
    expect(ladder).toEqual([startWordForSeed(seed)]);
  });
});
