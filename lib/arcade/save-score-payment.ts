// Shared multi-token save-score payment builder. Used by every gamerplex.com
// arcade game (blockwords / magic-chess / cyber-snake) so each game gets the
// same payment-token support (USDC / SOL / $GAME) with the same UX and the
// same discount logic without duplicating per-game.
//
// Mirrors the pattern flipball uses in src/arcade/integration.ts.
//
// Contract v1.4 enforces the $GAME 20% discount on amount_micro_usd, so
// callers MUST pass the discounted amount declared by quotePaymentAmount().

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program, BN } from "@coral-xyz/anchor";

import {
  ARCADE_PROGRAM_ID,
  GAME_MINT,
  GAME_DECIMALS,
  GAME_DISCOUNT_BPS,
  SOL_NATIVE,
  USDC_MINT,
  buildRecordPaymentIx,
  fetchExchangeRates,
  quotePaymentAmount,
  type PaymentQuote,
} from "./client";
import type { PaymentTokenDef } from "./tokens";

const STABLE_DECIMALS = 6;

export interface SaveScorePaymentArgs {
  token: PaymentTokenDef;
  category: number;
  basePriceMicroUsd: BN; // e.g. SCORE_COMMIT_MICRO_USD ($0.05)
  gameId: number;
  externalRef?: string;
  treasury: PublicKey; // pre-fetched via getTreasuryWallet
}

export interface BuiltPayment {
  ixs: TransactionInstruction[];
  quote: PaymentQuote;
}

/**
 * Build the {transfer ix(s) + record_payment ix} bundle for a save-score
 * payment in the user's chosen token. Caller appends to a tx that also
 * contains open_profile (if needed) and submit_score.
 *
 * Token routing:
 *  - "stable" (USDC / USDT / USDF): one SPL TransferChecked + record
 *  - "sol":                          one SystemProgram.transfer + record
 *  - "game":                         ATA-idempotent + SPL TransferChecked + record
 *                                    (assumes user already holds $GAME — Flipcash
 *                                     atomic-buy path lives in flipcash.ts)
 *
 * Discount: contract v1.4 enforces amount_micro_usd == base * 0.8 for $GAME on
 * fixed-tier categories. quotePaymentAmount handles this; we just forward.
 */
export async function buildSaveScorePaymentIxs(
  program: Program,
  connection: Connection,
  player: PublicKey,
  args: SaveScorePaymentArgs,
): Promise<BuiltPayment> {
  const { token, category, basePriceMicroUsd, gameId, externalRef = "", treasury } = args;

  const rates = await fetchExchangeRates(program);
  const quote = quotePaymentAmount(
    rates,
    basePriceMicroUsd,
    token.mint,
    token.discountBps,
  );

  const ixs: TransactionInstruction[] = [];

  if (token.kind === "sol") {
    ixs.push(SystemProgram.transfer({
      fromPubkey: player,
      toPubkey: treasury,
      lamports: quote.paymentAmountRaw.toNumber(),
    }));
  } else {
    // SPL path — stablecoin or $GAME
    const decimals = token.kind === "game" ? GAME_DECIMALS : STABLE_DECIMALS;
    const fromAta = getAssociatedTokenAddressSync(token.mint, player);
    const toAta = getAssociatedTokenAddressSync(token.mint, treasury);
    // Idempotent ATA — only emits if missing, cheaper than getAccountInfo round-trip
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(
      player, toAta, treasury, token.mint,
    ));
    ixs.push(createTransferCheckedInstruction(
      fromAta, token.mint, toAta, player,
      BigInt(quote.paymentAmountRaw.toString()),
      decimals, [], TOKEN_PROGRAM_ID,
    ));
  }

  ixs.push(
    await buildRecordPaymentIx(program, player, {
      category,
      amountMicroUsd: quote.amountMicroUsdToRecord,
      paymentMint: token.mint,
      paymentAmountRaw: quote.paymentAmountRaw,
      paymentTxSig: new Uint8Array(64),
      externalRef,
      gameId,
    }),
  );

  return { ixs, quote };
}

/**
 * Format a user-facing price string for a token+base combo. Returns e.g.
 * "$0.04 · $GAME" or "$0.05 · USDC". Use for picker labels and confirm CTAs.
 */
export function formatPrice(token: PaymentTokenDef, basePriceMicroUsd: BN): string {
  const discounted = basePriceMicroUsd
    .mul(new BN(10_000 - token.discountBps))
    .div(new BN(10_000));
  const dollars = discounted.toNumber() / 1_000_000;
  return `$${dollars.toFixed(2)} · ${token.symbol}${token.discountBps > 0 ? " (-20%)" : ""}`;
}
