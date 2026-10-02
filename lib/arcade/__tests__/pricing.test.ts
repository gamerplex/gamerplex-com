import { describe, it, expect } from "vitest";

import { quote, minimumBasePrice, FLIPCASH_MIN_USD, GAME_DISCOUNT, formatGame } from "../pricing";

const RATE = 0.01209351; // live spot, 2026-10-02

describe("the floor the discount has to clear", () => {
  // The trap: the discount is applied before the floor is tested, so a $1 item
  // at 20% off lands at $0.80 — under what Flipcash will transfer.
  it("rejects a $1 base, because $0.80 cannot be sent", () => {
    const q = quote(1, RATE);
    expect(q.usdInGame).toBe(0.8);
    expect(q.payableViaFlipcash).toBe(false);
  });

  it("accepts $1.50, the recommended floor", () => {
    const q = quote(1.5, RATE);
    expect(q.usdInGame).toBe(1.2);
    expect(q.payableViaFlipcash).toBe(true);
  });

  it("puts the break-even base at $1.25", () => {
    expect(minimumBasePrice()).toBe(1.25);
    expect(quote(1.25, RATE).usdInGame).toBe(FLIPCASH_MIN_USD);
    expect(quote(1.25, RATE).payableViaFlipcash).toBe(true);
    expect(quote(1.24, RATE).payableViaFlipcash).toBe(false);
  });

  it("rejects every current shop item priced in whole $GAME", () => {
    // 3 $GAME ≈ $0.04, 22 ≈ $0.27 — far under the floor even before a discount.
    for (const gm of [3, 4, 12, 18, 22]) {
      expect(quote(gm * RATE, RATE).payableViaFlipcash).toBe(false);
    }
  });
});

describe("spot conversion", () => {
  it("derives $GAME from USD rather than fixing it", () => {
    const q = quote(1.5, RATE);
    expect(q.game).toBeCloseTo(1.2 / RATE, 6);   // ≈ 99.2 $GAME
    expect(q.usdPerGame).toBe(RATE);
  });

  it("a cheaper token means more $GAME for the same USD", () => {
    expect(quote(1.5, RATE / 2).game!).toBeCloseTo(quote(1.5, RATE).game! * 2, 6);
  });

  it("still quotes the USD side when no rate is available", () => {
    const q = quote(1.5, null);
    expect(q.game).toBeNull();
    expect(q.usdInGame).toBe(1.2);
    expect(q.payableViaFlipcash).toBe(true);
  });

  it("applies the stated discount", () => {
    expect(GAME_DISCOUNT).toBe(0.2);
    expect(quote(5, RATE).usdInGame).toBe(4);
  });
});

describe("formatGame", () => {
  it("rounds large amounts and keeps cents on small ones", () => {
    expect(formatGame(99.23)).toBe("99.23");
    expect(formatGame(1234.6)).toBe("1,235");
  });
});
