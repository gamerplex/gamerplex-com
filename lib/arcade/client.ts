// Gamerplex Arcade on-chain client helpers.
//
// Exposes a type-safe Anchor Program instance + builder functions for:
//   - openProfile(referrer)
//   - submitScore(...)          → GPX5 memo + ScoreSubmitted event
//   - recordPayment(category, amount, txSig, gamerPaid, externalRef)
//   - commitSessionReplay(scoreNonce, seed, moveLog)  → GPX5R memo
//   - solanaPayTransfer(amount, mint, from, to)       → USDC transfer ix
//
// All functions return TransactionInstructions ready to be bundled in a single
// tx by the caller. This keeps the UI free to compose flows (e.g. continue =
// USDC transfer + recordPayment in one tx).

import { AnchorProvider, BN, Program, Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import idlJson from "./idl.json";

// ───── Constants ──────────────────────────────────────────────────────
// Network selector: "mainnet" | "devnet". Flip NEXT_PUBLIC_SOLANA_NETWORK
// before build/deploy to point arcade at mainnet. Defaults to devnet so a
// forgotten env var can't accidentally charge real USDC.
export const ARCADE_NETWORK =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "mainnet" | "devnet") || "devnet";

export const ARCADE_PROGRAM_ID = new PublicKey(
  // Same program ID on devnet + mainnet (deterministic keypair redeploy).
  "4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t"
);

// USDC mints per network. Mainnet = Circle official, devnet = Circle official devnet.
export const USDC_MAINNET_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const USDC_DEVNET_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
export const USDC_MINT =
  ARCADE_NETWORK === "mainnet" ? USDC_MAINNET_MINT : USDC_DEVNET_MINT;

// v1.3 — additional stablecoins (mainnet only — no devnet faucets for these)
export const USDT_MAINNET_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
export const USDF_MAINNET_MINT = new PublicKey("5AMAA9JV9H97YYVxx8F6FsCMmTwXSuTTQneiup4RYAUQ");

// v1.3 — $GAME mint per network. Mainnet = Flipcash-issued, devnet = test mint.
export const GAME_MAINNET_MINT = new PublicKey("7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE");
export const GAME_DEVNET_MINT = new PublicKey("8eGnj5jkW6zTGYieGhtejPjLtGmnKfCdk7FamoJ5LLvD");
export const GAME_MINT = ARCADE_NETWORK === "mainnet" ? GAME_MAINNET_MINT : GAME_DEVNET_MINT;
export const GAME_DECIMALS = 10;

// v1.3 — pricing constants matching the on-chain contract.
export const SOL_NATIVE = PublicKey.default; // sentinel for native SOL payment_mint
export const GAME_DISCOUNT_BPS = 2000; // 20% off USD price when paying in $GAME
export const RATE_SCALE_FACTOR = 1_000_000_000_000; // ×1e12 fixed-point on rates
export const RATE_OVERPAY_BPS = 50; // frontend overpays 0.5% to clear 1% slippage floor
export const PAYMENT_SLIPPAGE_BPS = 100; // matches on-chain

// SPL Memo program (used for GPX5 / GPX5R emission by the arcade program itself).
export const SPL_MEMO_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// Max admin-ix deadline (7 days) — must match MAX_DEADLINE_FUTURE_SEC on chain.
export const MAX_ADMIN_DEADLINE_SEC = 7 * 86_400;
// Helper: compute a deadline N seconds in the future for admin txs.
export function adminDeadline(secondsFromNow: number = 3600): BN {
  return new BN(Math.floor(Date.now() / 1000) + secondsFromNow);
}

export const CYBER_SNAKE_GAME_ID = 1;
// Magic Chess Arcade — solo vs Stockfish ELO bots; on-chain slug stays as registered "chess-puzzles".
export const MAGIC_CHESS_GAME_ID = 3;
// Blockwords Arcade — daily Wordle-style word guess. Pick the secret 5-letter
// word in ≤6 guesses against a 90s timer. Registered as game_id=4 on the
// shared arcade contract. Admin must run register_game(4, "blockwords-arcade",
// "Blockwords", deadline) on devnet before saves succeed.
export const BLOCKWORDS_ARCADE_GAME_ID = 4;
// FLIPBALL — Astro+Three.js+Rapier pinball. Registered v1.3.
export const FLIPBALL_GAME_ID = 5;
export const FLIPBALL_SLUG = "flipball";

// Category codes matching on-chain CATEGORY_*.
export const CATEGORY = {
  CONTINUE: 0,
  POWERUP: 1,
  SCORE_COMMIT: 2,       // T1 — Save score
  COSMETIC: 3,
  VERIFIED_COMMIT: 4,    // T2 — Save replay
  REPLAY_RECEIPT: 5,     // T3 — Mint ReplayReceipt PDA (was CNFT_MINT)
  CNFT_WRAP: 6,          // T4 — Wrap receipt as cNFT (v1.3 Bubblegum)
} as const;

// Gamerplex platform fees across the 4 tiers (1× / 3× / 5× / 10× base).
// These go to Gamerplex treasury — distinct from Solana gas (~$0.001/tx)
// and one-time refundable rent deposits (~$0.41 for PlayerProfile,
// ~$0.33 for ReplayReceipt PDA).
export const SCORE_COMMIT_MICRO_USD = 50_000;      // $0.05 — T1
export const VERIFIED_COMMIT_MICRO_USD = 150_000;  // $0.15 — T2
export const REPLAY_RECEIPT_MICRO_USD = 250_000;   // $0.25 — T3
export const CNFT_WRAP_MICRO_USD = 500_000;        // $0.50 — T4 (v1.3)
export const CONTINUE_BASE_MICRO_USD = 50_000;     // $0.05 × 2ⁿ exponential

// ───── PDA derivation ─────────────────────────────────────────────────
export function configPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ARCADE_PROGRAM_ID);
}
export function stablecoinConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoins")],
    ARCADE_PROGRAM_ID
  );
}
export function gamePda(gameId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game"), Buffer.from([gameId])],
    ARCADE_PROGRAM_ID
  );
}
export function profilePda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), wallet.toBuffer()],
    ARCADE_PROGRAM_ID
  );
}
export function profileExtPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile-ext"), wallet.toBuffer()],
    ARCADE_PROGRAM_ID
  );
}
export function handleClaimPda(handle: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("handle-claim"), Buffer.from(handle, "utf8")],
    ARCADE_PROGRAM_ID
  );
}
export function receiptPda(originalPlayer: PublicKey, nonce: BN): [PublicKey, number] {
  // Nonce is serialized as little-endian 8 bytes to match Rust's &nonce.to_le_bytes()
  const nonceLe = nonce.toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), originalPlayer.toBuffer(), nonceLe],
    ARCADE_PROGRAM_ID
  );
}

// v1.3 — ExchangeRatesConfig PDA at seed `["rates"]`.
export function ratesPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("rates")], ARCADE_PROGRAM_ID);
}

// ───── Program instance ───────────────────────────────────────────────
export function makeProgram(connection: Connection, wallet: AnchorWallet): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new Program(idlJson as Idl, provider);
}

// ───── Account fetch helpers ──────────────────────────────────────────
export async function fetchProfile(
  connection: Connection,
  wallet: PublicKey
): Promise<any | null> {
  const [pda] = profilePda(wallet);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  // Return the raw account info; caller can decode via program.account.playerProfile.fetch
  // if they have a program instance.
  return info;
}

// ───── Instruction builders ───────────────────────────────────────────

/** Open a PlayerProfile PDA for `player`. First-time action for each wallet.
 *  Pass `referrer = PublicKey.default` for no referrer. */
export async function buildOpenProfileIx(
  program: Program,
  player: PublicKey,
  referrer: PublicKey
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [profile] = profilePda(player);
  const refProfile = referrer.equals(PublicKey.default)
    ? null
    : profilePda(referrer)[0];
  const accounts: any = {
    config: cfg,
    profile,
    referrerProfile: refProfile,
    player,
    systemProgram: SystemProgram.programId,
  };
  return await program.methods
    .openPlayerProfile(referrer)
    .accounts(accounts)
    .instruction();
}

/** Submit a session score. Emits GPX5 memo via CPI.
 *  `gameId` defaults to Cyber Snake (1) for backwards compat — pass 3 for
 *  Magic Chess Puzzles, etc. */
export async function buildSubmitScoreIx(
  program: Program,
  player: PublicKey,
  params: {
    variant: string;
    score: BN;
    continuesUsed: number;
    powerupsUsed: number;
    sessionSeed: Uint8Array; // 32 bytes
    durationSec: number;
    moveHash: Uint8Array; // 32 bytes (SHA-256 of compact move log)
    meta: string;
    vsChallenger: PublicKey; // PublicKey.default if none
    gameId?: number;
  }
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [game] = gamePda(params.gameId ?? CYBER_SNAKE_GAME_ID);
  const [profile] = profilePda(player);
  return await program.methods
    .submitScore(
      params.variant,
      params.score,
      params.continuesUsed,
      params.powerupsUsed,
      Array.from(params.sessionSeed),
      params.durationSec,
      Array.from(params.moveHash),
      params.meta,
      params.vsChallenger
    )
    .accounts({
      config: cfg,
      game,
      profile,
      wallet: player,
      player,
      memoProgram: SPL_MEMO_ID,
    })
    .instruction();
}

/** Record a payment (v1.3): contract introspects for an SPL TransferChecked
 *  OR a native SOL transfer matching `paymentMint`. `paymentAmountRaw` is the
 *  actual smallest-unit transferred; `amountMicroUsd` is the USD-equivalent
 *  value being claimed (after $GAME discount, if applicable).
 *
 *  Pass `paymentMint = PublicKey.default` for SOL; `paymentMint = GAME_MINT`
 *  for $GAME; else any allowed stablecoin mint. */
export async function buildRecordPaymentIx(
  program: Program,
  player: PublicKey,
  params: {
    category: number;
    amountMicroUsd: BN;
    paymentMint: PublicKey;
    paymentAmountRaw: BN;
    paymentTxSig: Uint8Array; // 64 bytes; new Uint8Array(64) if no prior sig
    externalRef: string;
    referrerProfile?: PublicKey;
    gameId?: number;
  }
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [stablecoinConfig] = stablecoinConfigPda();
  const [rates] = ratesPda();
  const [game] = gamePda(params.gameId ?? CYBER_SNAKE_GAME_ID);
  const [profile] = profilePda(player);
  const accounts: any = {
    config: cfg,
    stablecoinConfig,
    game,
    profile,
    wallet: player,
    referrerProfile: params.referrerProfile ?? null,
    rates,
    player,
    instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
  };
  return await program.methods
    .recordPayment(
      params.category,
      params.amountMicroUsd,
      params.paymentMint,
      params.paymentAmountRaw,
      Array.from(params.paymentTxSig),
      params.externalRef
    )
    .accounts(accounts)
    .instruction();
}

/** v1.3 — admin: open the ExchangeRatesConfig PDA with initial rates.
 *  Rates are scaled ×1e12: micro-USD per smallest unit (lamport or quark). */
export async function buildInitExchangeRatesIx(
  program: Program,
  admin: PublicKey,
  solRateScaled: BN,
  gameRateScaled: BN
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [rates] = ratesPda();
  return await program.methods
    .initializeExchangeRates(solRateScaled, gameRateScaled)
    .accounts({
      config: cfg,
      rates,
      admin,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** v1.3 — admin: update SOL and/or $GAME exchange rate. Pass 0 to skip a
 *  rate. Deadline-gated. */
export async function buildUpdateExchangeRatesIx(
  program: Program,
  admin: PublicKey,
  solRateScaled: BN,
  gameRateScaled: BN,
  deadline: BN
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [rates] = ratesPda();
  return await program.methods
    .updateExchangeRates(solRateScaled, gameRateScaled, deadline)
    .accounts({
      config: cfg,
      rates,
      admin,
    })
    .instruction();
}

/** Commit a full session move log on-chain. Triggers 🏆 VERIFIED badge.
 *  v1.2 hardening: adds instructions_sysvar so the contract can confirm a
 *  paid record_payment(VERIFIED) is bundled in the same tx. */
export async function buildCommitReplayIx(
  program: Program,
  player: PublicKey,
  params: {
    scoreNonce: BN;
    sessionSeed: Uint8Array;
    moveLog: Uint8Array;
  }
): Promise<TransactionInstruction> {
  return await program.methods
    .commitSessionReplay(
      params.scoreNonce,
      Array.from(params.sessionSeed),
      Buffer.from(params.moveLog)
    )
    .accounts({
      player,
      memoProgram: SPL_MEMO_ID,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}

// ───── Admin builders (one-time bootstrap + updates) ──────────────────

/** Admin bootstrap: open the StablecoinConfig PDA with the initial allowlist.
 *  Call once per deployment. Idempotent is not supported — will fail if PDA
 *  already exists (use buildUpdateStablecoinsIx to modify). */
export async function buildInitStablecoinsIx(
  program: Program,
  admin: PublicKey,
  mints: PublicKey[]
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [sc] = stablecoinConfigPda();
  // Pad to 8 slots with PublicKey.default.
  const padded: PublicKey[] = [];
  for (let i = 0; i < 8; i++) {
    padded.push(i < mints.length ? mints[i] : PublicKey.default);
  }
  return await program.methods
    .initializeStablecoins(padded)
    .accounts({
      config: cfg,
      stablecoinConfig: sc,
      admin,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Admin: update the accepted stablecoin allowlist. Deadline-gated. */
export async function buildUpdateStablecoinsIx(
  program: Program,
  admin: PublicKey,
  mints: PublicKey[],
  deadline: BN
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [sc] = stablecoinConfigPda();
  const padded: PublicKey[] = [];
  for (let i = 0; i < 8; i++) {
    padded.push(i < mints.length ? mints[i] : PublicKey.default);
  }
  return await program.methods
    .updateAcceptedStablecoins(padded, deadline)
    .accounts({
      config: cfg,
      stablecoinConfig: sc,
      admin,
    })
    .instruction();
}

// ───── Solana Pay USDC transfer builder ───────────────────────────────

/** Build a USDC transfer from `from` to `to` for `amountMicroUsd`.
 *  Kept for backwards compatibility with v1.2 callers. New code should use
 *  buildSplTransferIxs (generalized to any mint + decimals). */
export async function buildUsdcTransferIxs(
  connection: Connection,
  payer: PublicKey,
  from: PublicKey,
  to: PublicKey,
  amountMicroUsd: BN
): Promise<TransactionInstruction[]> {
  return buildSplTransferIxs(connection, payer, from, to, USDC_MINT, amountMicroUsd, 6);
}

/** v1.3 — generalized SPL TransferChecked builder. Auto-creates the
 *  destination ATA if missing. Caller supplies the raw token amount
 *  (already in smallest unit; not micro-USD). */
export async function buildSplTransferIxs(
  connection: Connection,
  payer: PublicKey,
  from: PublicKey,
  to: PublicKey,
  mint: PublicKey,
  amountRaw: BN,
  decimals: number
): Promise<TransactionInstruction[]> {
  const fromAta = getAssociatedTokenAddressSync(mint, from);
  const toAta = getAssociatedTokenAddressSync(mint, to);
  const ixs: TransactionInstruction[] = [];
  const toAtaInfo = await connection.getAccountInfo(toAta);
  if (!toAtaInfo) {
    ixs.push(createAssociatedTokenAccountInstruction(payer, toAta, to, mint));
  }
  ixs.push(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      from,
      BigInt(amountRaw.toString()),
      decimals,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  return ixs;
}

/** v1.3 — native SOL transfer from player → treasury. Single ix. */
export function buildSolTransferIx(
  from: PublicKey,
  to: PublicKey,
  lamports: BN
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: from,
    toPubkey: to,
    lamports: BigInt(lamports.toString()) as unknown as number,
  });
}

// ───── Small utilities ────────────────────────────────────────────────

/** Compact move-log encoding for arcade session replay.
 *  Each direction change = (u16 tick, u8 dir) = 3 bytes. */
export function encodeMoveLog(
  changes: { tick: number; dir: number }[]
): Uint8Array {
  const buf = new Uint8Array(changes.length * 3);
  for (let i = 0; i < changes.length; i++) {
    const { tick, dir } = changes[i];
    buf[i * 3] = tick & 0xff;
    buf[i * 3 + 1] = (tick >> 8) & 0xff;
    buf[i * 3 + 2] = dir & 0xff;
  }
  return buf;
}

/** Web-Crypto SHA-256 of a byte array. Returns 32-byte Uint8Array. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh ArrayBuffer to satisfy TS's stricter BufferSource type
  // (rejects SharedArrayBuffer-backed Uint8Arrays in newer lib.dom.d.ts).
  const buf = new ArrayBuffer(data.length);
  new Uint8Array(buf).set(data);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}

/** Exponential continue price ($0.05 × 2ⁿ), in micro-USD. */
export function continueCostMicroUsd(n: number): BN {
  return new BN(CONTINUE_BASE_MICRO_USD).mul(new BN(2).pow(new BN(n)));
}

/** Treasury wallet — reads from on-chain config. Cached in-memory. */
let cachedTreasury: PublicKey | null = null;
export async function getTreasuryWallet(
  program: Program
): Promise<PublicKey> {
  if (cachedTreasury) return cachedTreasury;
  const [cfg] = configPda();
  const config: any = await (program.account as any).arcadeConfig.fetch(cfg);
  cachedTreasury = config.treasuryWallet as PublicKey;
  return cachedTreasury;
}

// ───── T3: ReplayReceipt instructions ─────────────────────────────────

/** Mint a ReplayReceipt PDA. Client provides nonce (typically tx timestamp). */
export async function buildMintReceiptIx(
  program: Program,
  player: PublicKey,
  params: {
    nonce: BN;
    score: BN;
    continuesUsed: number;
    powerupsUsed: number;
    sessionSeed: Uint8Array;
    moveHash: Uint8Array;
    durationSec: number;
    gpx5rMemoTx: Uint8Array; // 64 bytes — the commit_session_replay tx signature
    gameId?: number;
  }
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [game] = gamePda(params.gameId ?? CYBER_SNAKE_GAME_ID);
  const [receipt] = receiptPda(player, params.nonce);
  return await program.methods
    .mintReplayReceipt(
      params.nonce,
      params.score,
      params.continuesUsed,
      params.powerupsUsed,
      Array.from(params.sessionSeed),
      Array.from(params.moveHash),
      params.durationSec,
      Array.from(params.gpx5rMemoTx)
    )
    .accounts({
      config: cfg,
      game,
      receipt,
      player,
      systemProgram: SystemProgram.programId,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}

/** Transfer a ReplayReceipt to a new owner. Current owner must sign.
 *  Immutable `original_player` stays unchanged — only `owner` transfers. */
export async function buildTransferReceiptIx(
  program: Program,
  currentOwner: PublicKey,
  receipt: PublicKey,
  newOwner: PublicKey
): Promise<TransactionInstruction> {
  return await program.methods
    .transferReplayReceipt(newOwner)
    .accounts({
      receipt,
      owner: currentOwner,
    })
    .instruction();
}

/** Close a ReplayReceipt and refund rent to owner. Blocked if wrapped as cNFT. */
export async function buildCloseReceiptIx(
  program: Program,
  owner: PublicKey,
  receipt: PublicKey
): Promise<TransactionInstruction> {
  return await program.methods
    .closeReplayReceipt()
    .accounts({
      receipt,
      owner,
    })
    .instruction();
}

/** sig-to-bytes helper: convert a Solana base58 tx signature to 64-byte Uint8Array.
 *  Used when passing a prior tx sig as input to a later instruction. */
export function sigToBytes(sig: string): Uint8Array {
  const out = new Uint8Array(64);
  const decoded = bs58.decode(sig);
  out.set(decoded.slice(0, 64));
  return out;
}

/** Claim or rename a handle. First call also creates the caller's ProfileExtV2.
 *  Pass `currentHandle = ""` if the wallet has no existing handle (first claim);
 *  otherwise pass the current handle so its claim PDA is closed (rent refund). */
export async function buildSetHandleIx(
  program: Program,
  player: PublicKey,
  handle: string,
  currentHandle: string
): Promise<TransactionInstruction> {
  const [profileExt] = profileExtPda(player);
  const [newClaim] = handleClaimPda(handle);
  const oldClaim =
    currentHandle.length > 0 ? handleClaimPda(currentHandle)[0] : null;
  return await program.methods
    .setHandle(handle)
    .accounts({
      profileExt,
      oldHandleClaim: oldClaim,
      newHandleClaim: newClaim,
      player,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Set or update bio. First call also creates the caller's ProfileExtV2. */
export async function buildUpdateBioIx(
  program: Program,
  player: PublicKey,
  bio: string
): Promise<TransactionInstruction> {
  const [profileExt] = profileExtPda(player);
  return await program.methods
    .updateBio(bio)
    .accounts({
      profileExt,
      player,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

// ───── v1.3 — Exchange rates + quote helpers ──────────────────────────

export interface ExchangeRatesSnapshot {
  solMicroUsdPerLamport: BN;  // scaled ×1e12
  gameMicroUsdPerQuark: BN;   // scaled ×1e12
  solUpdatedAt: number;       // unix seconds
  gameUpdatedAt: number;
}

// 30s in-memory cache to avoid hammering RPC on every price preview.
let cachedRates: { at: number; value: ExchangeRatesSnapshot } | null = null;

/** Fetch the on-chain ExchangeRatesConfig (cached 30s). */
export async function fetchExchangeRates(
  program: Program
): Promise<ExchangeRatesSnapshot> {
  const now = Date.now();
  if (cachedRates && now - cachedRates.at < 30_000) return cachedRates.value;
  const [pda] = ratesPda();
  const r: any = await (program.account as any).exchangeRatesConfig.fetch(pda);
  const snapshot: ExchangeRatesSnapshot = {
    solMicroUsdPerLamport: r.solMicroUsdPerLamport as BN,
    gameMicroUsdPerQuark: r.gameMicroUsdPerQuark as BN,
    solUpdatedAt: Number(r.solUpdatedAt),
    gameUpdatedAt: Number(r.gameUpdatedAt),
  };
  cachedRates = { at: now, value: snapshot };
  return snapshot;
}

/** Convert a USD-equivalent micro-amount to the raw smallest-unit using a
 *  scaled rate (×1e12). Mirror of on-chain `convert_usd_to_raw`. */
export function convertUsdToRaw(amountMicroUsd: BN, rateScaled: BN): BN {
  // raw = (amount × 1e12) / rate_scaled
  const num = amountMicroUsd.mul(new BN(RATE_SCALE_FACTOR));
  return num.div(rateScaled);
}

/** Frontend slippage overshoot — pay slightly more than the contract floor
 *  so a single-block rate movement doesn't reject the tx. */
export function applyOverpay(raw: BN, overpayBps: number = RATE_OVERPAY_BPS): BN {
  const num = new BN(10_000 + overpayBps);
  return raw.mul(num).div(new BN(10_000));
}

/** Quote: convert a USD price (micro-USD) into the raw token amount needed
 *  for a chosen payment token, applying any token-side discount and
 *  the frontend overpay buffer.
 *
 *  Returns `{ amountMicroUsdToRecord, paymentAmountRaw }` ready for
 *  `buildRecordPaymentIx`. */
export interface PaymentQuote {
  amountMicroUsdToRecord: BN;
  paymentAmountRaw: BN;
}
export function quotePaymentAmount(
  rates: ExchangeRatesSnapshot,
  basePriceMicroUsd: BN,
  paymentMint: PublicKey,
  discountBps: number = 0
): PaymentQuote {
  const discounted = basePriceMicroUsd
    .mul(new BN(10_000 - discountBps))
    .div(new BN(10_000));

  if (paymentMint.equals(PublicKey.default)) {
    // Native SOL
    const lamports = convertUsdToRaw(discounted, rates.solMicroUsdPerLamport);
    return { amountMicroUsdToRecord: discounted, paymentAmountRaw: applyOverpay(lamports) };
  }
  if (paymentMint.equals(GAME_MINT)) {
    const quarks = convertUsdToRaw(discounted, rates.gameMicroUsdPerQuark);
    return { amountMicroUsdToRecord: discounted, paymentAmountRaw: applyOverpay(quarks) };
  }
  // Stablecoin path — 6-decimal parity, no rate conversion, no overpay
  return { amountMicroUsdToRecord: discounted, paymentAmountRaw: discounted };
}

// ───── v1.3 — Flipcash buy-and-pay bundle (Option B from the plan) ────
//
// Builds a single-tx atomic bundle: buy $GAME on Flipcash curve from USDF,
// then SPL TransferChecked $GAME → arcade treasury, then record_payment.
// Lets first-time players (USDF-only) pay in $GAME and claim the 20%
// discount without pre-holding $GAME.
//
// Caveats: requires the player to hold USDF (~$0.04 + curve slippage).
// If they don't have USDF, swap to USDF first (Jupiter, etc.) — this
// builder does not handle that leg.

export interface BuyGameAndPayParams {
  category: number;
  basePriceMicroUsd: BN;     // pre-discount USD price (e.g. SCORE_COMMIT_MICRO_USD)
  externalRef: string;
  referrerProfile?: PublicKey;
  gameId?: number;
  // USDF in_amount buffer — defaults to 1% over the spot quote
  usdfBufferBps?: number;
}

/** Build the full set of ixs for: buy_tokens(USDF→GAME) +
 *  TransferChecked(GAME→treasury) + record_payment(GAME mint, discounted).
 *
 *  Returns a flat list ready for `new Transaction().add(...ixs)`. */
export async function buildBuyGameAndPayIxs(
  program: Program,
  connection: Connection,
  player: PublicKey,
  params: BuyGameAndPayParams
): Promise<TransactionInstruction[]> {
  // Defer-import Flipcash + USDF constants to avoid a circular import.
  const fc = await import("./flipcash");

  const treasury = await getTreasuryWallet(program);
  const rates = await fetchExchangeRates(program);

  // 1. Quote target $GAME amount at the discounted USD price.
  const quote = quotePaymentAmount(
    rates,
    params.basePriceMicroUsd,
    GAME_MINT,
    GAME_DISCOUNT_BPS
  );

  // 2. Estimate USDF needed: target_game_quarks × game_micro_usd_per_quark / 1e12
  //    in micro-USDF units (6 decimals). Curve slippage is bounded by
  //    min_amount_out + frontend overpay.
  const microUsdEquiv = quote.paymentAmountRaw
    .mul(rates.gameMicroUsdPerQuark)
    .div(new BN(RATE_SCALE_FACTOR));
  const usdfBufferBps = params.usdfBufferBps ?? 100; // 1%
  const usdfInAmount = microUsdEquiv
    .mul(new BN(10_000 + usdfBufferBps))
    .div(new BN(10_000));

  // 3. ATAs for buyer (player) — both GAME and USDF
  const buyerGameAta = getAssociatedTokenAddressSync(GAME_MINT, player);
  const buyerUsdfAta = getAssociatedTokenAddressSync(fc.USDF_MINT, player);

  const ixs: TransactionInstruction[] = [];

  // Ensure buyer's GAME ATA exists (USDF ATA must exist or buy fails — that's
  // the user's problem; we don't auto-fund USDF).
  const gameAtaInfo = await connection.getAccountInfo(buyerGameAta);
  if (!gameAtaInfo) {
    ixs.push(createAssociatedTokenAccountInstruction(player, buyerGameAta, player, GAME_MINT));
  }

  // 4. Flipcash buy_tokens (USDF in → GAME out)
  ixs.push(
    fc.buildFlipcashBuyTokensIx(
      player,
      buyerGameAta,
      buyerUsdfAta,
      usdfInAmount,
      quote.paymentAmountRaw // min_amount_out — refuse worse than the quote
    )
  );

  // 5. SPL TransferChecked: send the GAME we just bought → treasury
  const transferIxs = await buildSplTransferIxs(
    connection,
    player,
    player,
    treasury,
    GAME_MINT,
    quote.paymentAmountRaw,
    GAME_DECIMALS
  );
  ixs.push(...transferIxs);

  // 6. record_payment(GAME mint, discounted USD value, GAME quarks raw)
  ixs.push(
    await buildRecordPaymentIx(program, player, {
      category: params.category,
      amountMicroUsd: quote.amountMicroUsdToRecord,
      paymentMint: GAME_MINT,
      paymentAmountRaw: quote.paymentAmountRaw,
      paymentTxSig: new Uint8Array(64),
      externalRef: params.externalRef,
      referrerProfile: params.referrerProfile,
      gameId: params.gameId,
    })
  );

  return ixs;
}
