import { describe, it, expect } from "vitest";
import {
  ARCADE_BOTS,
  botById,
  TIMER_PRESETS,
  DEFAULT_TIMER_SEC,
  computeScore,
  encodeMoveLog,
  encodeMoveLogV2,
  MAX_MOVES_INLINE,
  generateSeed,
  type MoveLogEntry,
} from "../score";

describe("chess: botById", () => {
  it("returns null for null/unknown id", () => {
    expect(botById(null)).toBeNull();
    expect(botById("9999")).toBeNull();
  });
  it("resolves a known bot", () => {
    expect(botById("1600")?.elo).toBe(1600);
  });
  it("has a consistent, ascending ELO ladder", () => {
    const elos = ARCADE_BOTS.map((b) => b.elo);
    expect(elos).toEqual([...elos].sort((a, b) => a - b));
    expect(TIMER_PRESETS.some((p) => p.sec === DEFAULT_TIMER_SEC)).toBe(true);
  });
});

describe("chess: computeScore", () => {
  it("loss scores 0, draw scores 250", () => {
    expect(computeScore(1600, false, 10, 30)).toBe(0);
    expect(computeScore(1600, null, 10, 30)).toBe(250);
  });

  it("win = 1000 + elo + speedBonus + pressureBonus", () => {
    // duration 30s -> speedBonus = (60-30)*50 = 1500 ; turnTime 5 -> (60-5)*20 = 1100
    expect(computeScore(1600, true, 20, 30, 5)).toBe(1000 + 1600 + 1500 + 1100);
  });

  it("clamps speed/pressure bonuses to zero past 60s", () => {
    // duration 90s and turnTime 90s -> both bonuses clamp to 0
    expect(computeScore(600, true, 40, 90, 90)).toBe(1000 + 600);
  });

  it("uses DEFAULT_TIMER_SEC when turnTime omitted", () => {
    const withDefault = computeScore(900, true, 5, 30);
    const explicit = computeScore(900, true, 5, 30, DEFAULT_TIMER_SEC);
    expect(withDefault).toBe(explicit);
  });
});

const mv = (from: number, to: number, promotion = 0): MoveLogEntry => ({ from, to, promotion });

describe("chess: encodeMoveLog (v1, 4 bytes/move)", () => {
  it("packs from/to/promotion + pad byte in order", () => {
    const buf = encodeMoveLog([mv(12, 28), mv(6, 21, 5)]);
    expect(buf.length).toBe(8);
    expect([...buf]).toEqual([12, 28, 0, 0, 6, 21, 5, 0]);
  });

  it("masks bytes to 0xff", () => {
    const buf = encodeMoveLog([mv(256 + 3, 256 + 7, 256 + 1)]);
    expect([...buf]).toEqual([3, 7, 1, 0]);
  });

  it("caps at MAX_MOVES_INLINE moves", () => {
    const moves = Array.from({ length: MAX_MOVES_INLINE + 20 }, (_, i) => mv(i, i));
    expect(encodeMoveLog(moves).length).toBe(MAX_MOVES_INLINE * 4);
  });
});

describe("chess: encodeMoveLogV2 (5 bytes/move with delta_sec)", () => {
  it("packs delta_sec in byte 3, clamped to 0..255", () => {
    const buf = encodeMoveLogV2([mv(1, 2), mv(3, 4)], [7, 999]);
    expect(buf.length).toBe(10);
    expect([...buf]).toEqual([1, 2, 0, 7, 0, 3, 4, 0, 255, 0]);
  });

  it("floors and clamps negative deltas to 0", () => {
    const buf = encodeMoveLogV2([mv(1, 2)], [-5.9]);
    expect([...buf]).toEqual([1, 2, 0, 0, 0]);
  });

  it("throws when deltas length mismatches moves length", () => {
    expect(() => encodeMoveLogV2([mv(1, 2)], [1, 2])).toThrow(/deltas length/);
  });

  it("caps both moves and deltas at MAX_MOVES_INLINE", () => {
    const moves = Array.from({ length: MAX_MOVES_INLINE + 5 }, (_, i) => mv(i, i));
    const deltas = moves.map(() => 1);
    expect(encodeMoveLogV2(moves, deltas).length).toBe(MAX_MOVES_INLINE * 5);
  });
});

describe("chess: generateSeed", () => {
  it("returns 32 fresh bytes (non all-zero in practice)", () => {
    const s = generateSeed();
    expect(s.length).toBe(32);
    expect(s.some((b) => b !== 0)).toBe(true);
  });
});
