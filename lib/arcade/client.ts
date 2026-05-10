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
export function receiptPda(originalPlayer: PublicKey, nonce: BN): [PublicKey, number] {
  // Nonce is serialized as little-endian 8 bytes to match Rust's &nonce.to_le_bytes()
  const nonceLe = nonce.toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), originalPlayer.toBuffer(), nonceLe],
    ARCADE_PROGRAM_ID
  );
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

/** Record a payment tied to a specific category (continue, powerup, VERIFIED commit, etc.).
 *  v1.2 hardening: now requires config + stablecoin_config + instructions_sysvar
 *  so the contract can introspect for the matching SPL TransferChecked. */
export async function buildRecordPaymentIx(
  program: Program,
  player: PublicKey,
  params: {
    category: number;
    amountMicroUsd: BN;
    paymentTxSig: Uint8Array; // 64 bytes
    gamerPaid: boolean;
    externalRef: string;
    referrerProfile?: PublicKey; // only if player has an active referrer
    gameId?: number;
  }
): Promise<TransactionInstruction> {
  const [cfg] = configPda();
  const [stablecoinConfig] = stablecoinConfigPda();
  const [game] = gamePda(params.gameId ?? CYBER_SNAKE_GAME_ID);
  const [profile] = profilePda(player);
  const accounts: any = {
    config: cfg,
    stablecoinConfig,
    game,
    profile,
    wallet: player,
    // Anchor's TS client requires Optional accounts to be passed explicitly —
    // `null` means "not present", a PublicKey means "here's the referrer".
    referrerProfile: params.referrerProfile ?? null,
    player,
    instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
  };
  return await program.methods
    .recordPayment(
      params.category,
      params.amountMicroUsd,
      Array.from(params.paymentTxSig),
      params.gamerPaid,
      params.externalRef
    )
    .accounts(accounts)
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
 *  Returns a list of instructions; may include an ATA-create ix if the
 *  destination's token account doesn't exist yet. */
export async function buildUsdcTransferIxs(
  connection: Connection,
  payer: PublicKey,
  from: PublicKey,
  to: PublicKey,
  amountMicroUsd: BN
): Promise<TransactionInstruction[]> {
  const mint = USDC_MINT;
  const fromAta = getAssociatedTokenAddressSync(mint, from);
  const toAta = getAssociatedTokenAddressSync(mint, to);
  const ixs: TransactionInstruction[] = [];
  // Create destination ATA if it doesn't exist.
  const toAtaInfo = await connection.getAccountInfo(toAta);
  if (!toAtaInfo) {
    ixs.push(
      createAssociatedTokenAccountInstruction(payer, toAta, to, mint)
    );
  }
  ixs.push(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      from,
      BigInt(amountMicroUsd.toString()),
      6, // USDC decimals
      [],
      TOKEN_PROGRAM_ID
    )
  );
  return ixs;
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
