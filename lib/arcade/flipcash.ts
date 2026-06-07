// Flipcash Reserve Contract integration — buy $GAME from the bonding curve
// directly inside an arcade payment tx. Lets a first-time player who holds
// only USDF (or any swappable stable) pay in $GAME and get the 20% discount
// without pre-holding $GAME.
//
// Program source: github.com/getcode-wallet/flipcash-program
// Mainnet:  ccJYP5gjZqcEHaphcxAZvkxCrnTVfYMjyhSYkpQtf8Z
// Devnet:   FLip3dQVfpeUKg5fUNfFhcHvQvG3HoXqYw5XDDx8Wo9i
//
// IMPORTANT: this is a 3rd-party program. We treat it as an external CPI
// invoked from the player's tx (not from inside our arcade program). Our
// `record_payment` introspection only verifies the final SPL TransferChecked
// of $GAME → treasury, NOT how the player acquired the $GAME.

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { ARCADE_NETWORK, GAME_MAINNET_MINT, GAME_DEVNET_MINT } from "./client";

export const FLIPCASH_PROGRAM_MAINNET = new PublicKey("ccJYP5gjZqcEHaphcxAZvkxCrnTVfYMjyhSYkpQtf8Z");
export const FLIPCASH_PROGRAM_DEVNET = new PublicKey("FLip3dQVfpeUKg5fUNfFhcHvQvG3HoXqYw5XDDx8Wo9i");
export const FLIPCASH_PROGRAM_ID =
  ARCADE_NETWORK === "mainnet" ? FLIPCASH_PROGRAM_MAINNET : FLIPCASH_PROGRAM_DEVNET;

// USDF — the curve's base mint.
export const USDF_MAINNET_MINT = new PublicKey("5AMAA9JV9H97YYVxx8F6FsCMmTwXSuTTQneiup4RYAUQ");
export const USDF_DEVNET_MINT = new PublicKey("USDFBnpup7jXV8DZ9jvz3cR4syDYegoSBnarmxMeLgT");
export const USDF_MINT = ARCADE_NETWORK === "mainnet" ? USDF_MAINNET_MINT : USDF_DEVNET_MINT;
export const USDF_DECIMALS = 6;

// $GAME (target currency for buy_tokens).
export const FLIPCASH_GAME_MINT =
  ARCADE_NETWORK === "mainnet" ? GAME_MAINNET_MINT : GAME_DEVNET_MINT;

// buy_tokens ix discriminator from the Flipcash IDL. NOT a standard 8-byte
// Anchor discriminator — single byte = 4.
const BUY_TOKENS_DISC: number = 4;

export function flipcashCurrencyPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("currency"), mint.toBuffer()],
    FLIPCASH_PROGRAM_ID
  );
}

export function flipcashPoolPda(currency: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), currency.toBuffer()],
    FLIPCASH_PROGRAM_ID
  );
}

export function flipcashVaultPda(pool: PublicKey, mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), pool.toBuffer(), mint.toBuffer()],
    FLIPCASH_PROGRAM_ID
  );
}

export interface FlipcashGamePdas {
  currency: PublicKey;
  pool: PublicKey;
  currencyVault: PublicKey; // holds $GAME
  baseVault: PublicKey;     // holds USDF
}

export function flipcashGamePdas(): FlipcashGamePdas {
  const [currency] = flipcashCurrencyPda(FLIPCASH_GAME_MINT);
  const [pool] = flipcashPoolPda(currency);
  const [currencyVault] = flipcashVaultPda(pool, FLIPCASH_GAME_MINT);
  const [baseVault] = flipcashVaultPda(pool, USDF_MINT);
  return { currency, pool, currencyVault, baseVault };
}

/**
 * Build a raw Flipcash `buy_tokens` instruction.
 *
 * @param buyer           wallet signing the swap
 * @param buyerCurrencyAta buyer's $GAME ATA (receives output)
 * @param buyerBaseAta     buyer's USDF ATA (debited)
 * @param inAmount        USDF micro-units to spend (with slippage buffer)
 * @param minAmountOut    minimum $GAME quarks acceptable (slippage protection)
 */
export function buildFlipcashBuyTokensIx(
  buyer: PublicKey,
  buyerCurrencyAta: PublicKey,
  buyerBaseAta: PublicKey,
  inAmount: BN,
  minAmountOut: BN
): TransactionInstruction {
  const { pool, currencyVault, baseVault } = flipcashGamePdas();

  // Encode args: BuyTokensArgs { in_amount: u64, min_amount_out: u64 }
  const data = Buffer.alloc(1 + 8 + 8);
  data.writeUInt8(BUY_TOKENS_DISC, 0);
  data.writeBigUInt64LE(BigInt(inAmount.toString()), 1);
  data.writeBigUInt64LE(BigInt(minAmountOut.toString()), 1 + 8);

  return new TransactionInstruction({
    programId: FLIPCASH_PROGRAM_ID,
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: FLIPCASH_GAME_MINT, isSigner: false, isWritable: false },
      { pubkey: USDF_MINT, isSigner: false, isWritable: false },
      { pubkey: currencyVault, isSigner: false, isWritable: true },
      { pubkey: baseVault, isSigner: false, isWritable: true },
      { pubkey: buyerCurrencyAta, isSigner: false, isWritable: true },
      { pubkey: buyerBaseAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}
