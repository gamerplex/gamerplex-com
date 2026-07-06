import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  PAYMENT_TOKENS,
  findToken,
  applyDiscount,
  defaultPaymentToken,
  type PaymentTokenDef,
} from "../tokens";
import { GAME_DISCOUNT_BPS, SOL_NATIVE } from "../client";

const stable = (): PaymentTokenDef => findToken("USDC")!;
const game = (): PaymentTokenDef => findToken("GAME")!;

describe("tokens: PAYMENT_TOKENS aggregate", () => {
  it("includes at least one stable, SOL, and $GAME", () => {
    const kinds = new Set(PAYMENT_TOKENS.map((t) => t.kind));
    expect(kinds.has("stable")).toBe(true);
    expect(kinds.has("sol")).toBe(true);
    expect(kinds.has("game")).toBe(true);
  });

  it("SOL entry uses the native sentinel mint and 9 decimals", () => {
    const sol = findToken("SOL")!;
    expect(sol.mint.equals(SOL_NATIVE)).toBe(true);
    expect(sol.mint.equals(PublicKey.default)).toBe(true);
    expect(sol.decimals).toBe(9);
    expect(sol.discountBps).toBe(0);
  });

  it("$GAME carries the 20% discount bps; stables and SOL carry none", () => {
    expect(game().discountBps).toBe(GAME_DISCOUNT_BPS);
    expect(game().discountBps).toBe(2000);
    expect(stable().discountBps).toBe(0);
    expect(findToken("SOL")!.discountBps).toBe(0);
  });
});

describe("tokens: findToken", () => {
  it("finds a known symbol", () => {
    expect(findToken("GAME")?.symbol).toBe("GAME");
  });
  it("returns undefined for an unknown symbol", () => {
    expect(findToken("DOGE")).toBeUndefined();
    expect(findToken("")).toBeUndefined();
  });
});

describe("tokens: applyDiscount", () => {
  it("is a no-op for a zero-discount token", () => {
    expect(applyDiscount(50_000, stable())).toBe(50_000);
  });

  it("applies the 20% $GAME discount and floors the result", () => {
    // 50_000 * (10000 - 2000) / 10000 = 40_000 exactly
    expect(applyDiscount(50_000, game())).toBe(40_000);
  });

  it("floors fractional discounted amounts (never over-charges up)", () => {
    // 12_345 * 8000 / 10000 = 9876.0 -> 9876 ; use odd number to force floor
    // 12_346 * 8000 / 10000 = 9876.8 -> 9876
    expect(applyDiscount(12_346, game())).toBe(9876);
  });

  it("handles zero amount", () => {
    expect(applyDiscount(0, game())).toBe(0);
  });
});

describe("tokens: defaultPaymentToken", () => {
  it("defaults to a USDC stable", () => {
    const d = defaultPaymentToken();
    expect(d.symbol).toBe("USDC");
    expect(d.kind).toBe("stable");
  });
});
