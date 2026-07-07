import { describe, it, expect } from "vitest";
import { WORDS } from "../words";
import {
  LetterState,
  MAX_GUESSES,
  RUN_DURATION_SEC,
  WORD_LENGTH,
  makeRng,
  nextWordIndex,
  answerForSeed,
  gradeGuess,
  isWinningGuess,
  encodeGuessLog,
  encodeGuessLogV2,
  decodeGuessLog,
  computeScore,
} from "../engine";

const seedOf = (bytes: number[]): Uint8Array => {
  const s = new Uint8Array(32);
  s.set(bytes.slice(0, 32));
  return s;
};

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

  it("recovers from an all-zero seed (uses deadbeef fallback, non-degenerate)", () => {
    const rng = makeRng(seedOf([]));
    const first = rng();
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    // second value should differ from the first (not stuck at 0)
    expect(rng()).not.toBe(first);
  });

  it("returns unsigned 32-bit values", () => {
    const rng = makeRng(seedOf([9, 9, 9, 9, 9, 9, 9, 9]));
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("blockwords: word selection", () => {
  it("nextWordIndex is in-range and deterministic", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]);
    const i = nextWordIndex(seed);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(WORDS.length);
    expect(nextWordIndex(seed)).toBe(i);
  });

  it("answerForSeed returns the WORDS entry at nextWordIndex", () => {
    const seed = seedOf([42, 7, 1, 9, 200, 3, 88, 15]);
    expect(answerForSeed(seed)).toBe(WORDS[nextWordIndex(seed)]);
    expect(answerForSeed(seed).length).toBe(WORD_LENGTH);
  });
});

describe("blockwords: gradeGuess", () => {
  it("marks all green on an exact match", () => {
    expect(gradeGuess("CRANE", "CRANE")).toEqual([2, 2, 2, 2, 2]);
  });

  it("marks all grey when no letters match", () => {
    expect(gradeGuess("CRANE", "SLOTH")).toEqual([0, 0, 0, 0, 0]);
  });

  it("marks yellow for present-but-misplaced letters", () => {
    // answer STORE, guess ROTES: R present, O present, T present...
    const g = gradeGuess("STORE", "TREND");
    // T(present->yellow) R(present->yellow) E(present->yellow) N(absent) D(absent)
    expect(g[0]).toBe(LetterState.YELLOW); // T
    expect(g[1]).toBe(LetterState.YELLOW); // R
    expect(g[3]).toBe(LetterState.GREY); // N
    expect(g[4]).toBe(LetterState.GREY); // D
  });

  it("does not over-credit duplicate guess letters beyond answer count", () => {
    // answer ABIDE has a single A. Guess AAHED: first A green, second A must be grey.
    const g = gradeGuess("ABIDE", "AAHED");
    expect(g[0]).toBe(LetterState.GREEN); // A matches position 0
    expect(g[1]).toBe(LetterState.GREY); // second A: no more A left in answer
    expect(g[3]).toBe(LetterState.YELLOW); // E present in answer, wrong spot
    expect(g[4]).toBe(LetterState.YELLOW); // D present in answer (index 3), wrong spot
  });

  it("is case-insensitive", () => {
    expect(gradeGuess("crane", "CRANE")).toEqual([2, 2, 2, 2, 2]);
  });

  it("throws on wrong-length inputs", () => {
    expect(() => gradeGuess("CRANE", "CAT")).toThrow();
    expect(() => gradeGuess("CAT", "CRANE")).toThrow();
  });
});

describe("blockwords: isWinningGuess", () => {
  it("is true only on a full case-insensitive match", () => {
    expect(isWinningGuess("CRANE", "crane")).toBe(true);
    expect(isWinningGuess("CRANE", "CRANK")).toBe(false);
  });
});

describe("blockwords: guess-log encode/decode", () => {
  it("v1 packs 5 uppercase bytes per guess and round-trips", () => {
    const buf = encodeGuessLog(["crane", "SLOTH"]);
    expect(buf.length).toBe(2 * WORD_LENGTH);
    expect(decodeGuessLog(buf)).toEqual(["CRANE", "SLOTH"]);
  });

  it("v1 throws on a wrong-length guess", () => {
    expect(() => encodeGuessLog(["CAT"])).toThrow();
  });

  it("v2 packs 6 bytes/guess (letters + delta) and decodes the letters back", () => {
    const buf = encodeGuessLogV2(["CRANE", "SLOTH"], [3, 400]);
    expect(buf.length).toBe(2 * (WORD_LENGTH + 1));
    // delta clamps: 3 stays, 400 -> 255
    expect(buf[WORD_LENGTH]).toBe(3);
    expect(buf[2 * (WORD_LENGTH + 1) - 1]).toBe(255);
    // decode prefers v2 stride (mod 6 & not mod 5)
    expect(decodeGuessLog(buf)).toEqual(["CRANE", "SLOTH"]);
  });

  it("v2 throws when deltas length mismatches", () => {
    expect(() => encodeGuessLogV2(["CRANE"], [1, 2])).toThrow(/deltas length/);
    expect(() => encodeGuessLogV2(["CAT"], [1])).toThrow();
  });

  it("v1 substitutes 'A' (65) for non-A-Z characters in a guess", () => {
    // digits survive toUpperCase() and hit the non-letter fallback branch.
    const buf = encodeGuessLog(["12345"]);
    expect([...buf]).toEqual([65, 65, 65, 65, 65]);
  });

  it("v2 substitutes 'A' (65) for non-A-Z characters and keeps the delta byte", () => {
    const buf = encodeGuessLogV2(["1a-3!"], [9]);
    // '1'->65, 'a'->'A'=65, '-'->65, '3'->65, '!'->65, then delta 9
    expect([...buf]).toEqual([65, 65, 65, 65, 65, 9]);
  });

  it("decode substitutes 'A' for non-A-Z bytes", () => {
    const raw = new Uint8Array([65, 66, 67, 68, 69]); // ABCDE, valid -> passes through
    expect(decodeGuessLog(raw)).toEqual(["ABCDE"]);
    const bad = new Uint8Array([48, 66, 67, 68, 69]); // leading '0' -> 'A'
    expect(decodeGuessLog(bad)).toEqual(["ABCDE"]);
  });
});

describe("blockwords: computeScore", () => {
  it("scores 0 when unsolved", () => {
    expect(computeScore(false, 3, 20)).toBe(0);
  });

  it("rewards fewer guesses and faster time", () => {
    // solved in 1 guess, 0s: base 900 + timeBonus 300 = 1200
    expect(computeScore(true, 1, 0)).toBe(1200);
    // solved in 6 guesses, 300s: base 400 + timeBonus 0 = 400
    expect(computeScore(true, 6, 300)).toBe(400);
  });

  it("clamps time bonus at 0 past 300s and never returns negative", () => {
    expect(computeScore(true, 1, 10_000)).toBe(900); // base only
    // pathological: many guesses, no time bonus -> floored at 0
    expect(computeScore(true, 100, 10_000)).toBe(0);
  });

  it("exposes stable game constants", () => {
    expect(MAX_GUESSES).toBe(6);
    expect(RUN_DURATION_SEC).toBe(90);
    expect(WORD_LENGTH).toBe(5);
  });
});
