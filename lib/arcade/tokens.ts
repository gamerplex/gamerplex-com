// Aggregate of every payment mint the arcade accepts — stables + native SOL
// + $GAME (with 20% discount). Used by PaymentMethodPicker and quote helpers.

import { PublicKey } from "@solana/web3.js";
import {
  ARCADE_NETWORK,
  GAME_MINT,
  GAME_DECIMALS,
  GAME_DISCOUNT_BPS,
  SOL_NATIVE,
} from "./client";
import { SUPPORTED_STABLES, type StablecoinDef } from "./stables";

export interface PaymentTokenDef {
  symbol: string;
  mint: PublicKey;        // PublicKey.default for native SOL
  decimals: number;
  label: string;
  discountBps: number;    // 0 for stables/SOL, 2000 for $GAME (20% off USD)
  kind: "stable" | "sol" | "game";
}

const stables: PaymentTokenDef[] = SUPPORTED_STABLES.map((s: StablecoinDef) => ({
  symbol: s.symbol,
  mint: s.mint,
  decimals: s.decimals,
  label: s.label,
  discountBps: 0,
  kind: "stable" as const,
}));

const sol: PaymentTokenDef = {
  symbol: "SOL",
  mint: SOL_NATIVE,
  decimals: 9,
  label: "SOL",
  discountBps: 0,
  kind: "sol",
};

const game: PaymentTokenDef = {
  symbol: "GAME",
  mint: GAME_MINT,
  decimals: GAME_DECIMALS,
  label: "$GAME (20% off)",
  discountBps: GAME_DISCOUNT_BPS,
  kind: "game",
};

export const PAYMENT_TOKENS: PaymentTokenDef[] = [...stables, sol, game];

export function findToken(symbol: string): PaymentTokenDef | undefined {
  return PAYMENT_TOKENS.find((t) => t.symbol === symbol);
}

/** Apply the token's discount to a base micro-USD price. */
export function applyDiscount(amountMicroUsd: number, token: PaymentTokenDef): number {
  if (token.discountBps === 0) return amountMicroUsd;
  return Math.floor((amountMicroUsd * (10_000 - token.discountBps)) / 10_000);
}

/** Default network-appropriate token (highest-balance picker is layered on top in UI). */
export function defaultPaymentToken(): PaymentTokenDef {
  return ARCADE_NETWORK === "mainnet" ? stables[0] : stables[0]; // USDC either way
}
