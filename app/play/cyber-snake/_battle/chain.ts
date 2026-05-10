/**
 * Cyber Snake Battle on-chain client — wraps the deployed Anchor program at
 * `EK8gFE1ojW61QuLTvy6dHyLxCq5yjCnauJz8eisNPTk3` for 2-player wagered play.
 *
 * Differs from app/play/magic-chess/chain.ts (which uses an AI resolver pool):
 * here both players sign their OWN transactions with their connected wallet —
 * there's no server-side custody of session keys. Player A creates the lobby
 * on L1 devnet; player B joins; then `delegate_game` sends the lobby PDA to
 * MagicBlock ER where both sides spam `submit_direction`. A permissionless
 * cranker advances ticks every ~200ms. When the game finishes, anyone calls
 * `finish_game` which commits + undelegates the state back to L1.
 *
 * Wagering / CM v2.1 settlement is intentionally out of scope here — that
 * happens via a separate market PDA bound to this game state. See the
 * companion CyberSnakeBattle.tsx for the UI-level "stake / claim" wiring
 * (currently shown as "free devnet play" pending v2.1 binding work).
 */

import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

// ── Constants ─────────────────────────────────────────────────────────
export const CYBER_SNAKE_PROGRAM_ID = new PublicKey(
  "EK8gFE1ojW61QuLTvy6dHyLxCq5yjCnauJz8eisNPTk3",
);
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111",
);
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111",
);

export const L1_RPC =
  process.env.NEXT_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com";
export const ER_RPC = "https://devnet.magicblock.app";

const GAME_SEED = Buffer.from("cyber_snake");
const BUFFER_SEED = Buffer.from("buffer");
const DELEGATION_SEED = Buffer.from("delegation");
const DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");

// Direction constants (match Rust program)
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;
export type Direction = 0 | 1 | 2 | 3;

// Status constants
export const STATUS_WAITING = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_FINISHED = 2;

// Winner flags
export const WINNER_DRAW = 0;
export const WINNER_P1 = 1;
export const WINNER_P2 = 2;

// Match grid + buffer sizes — match the on-chain program.
export const GRID_W = 32;
export const GRID_H = 32;
export const MAX_LEN = 256;

// ── Anchor instruction discriminators (precomputed from cyber-snake-idl.json
// to avoid pulling in a sync sha256 dep). Don't edit — these match
// `sha256("global:<ix_name>")[..8]` from the on-chain program. ──────────
const D_CREATE_GAME = Buffer.from([124, 69, 75, 66, 184, 220, 72, 206]);
const D_JOIN_GAME = Buffer.from([107, 112, 18, 38, 56, 173, 60, 128]);
const D_DELEGATE_GAME = Buffer.from([116, 183, 70, 107, 112, 223, 122, 210]);
const D_SUBMIT_DIRECTION = Buffer.from([39, 61, 110, 222, 168, 16, 74, 2]);
const D_ADVANCE_TICK = Buffer.from([141, 62, 18, 121, 9, 101, 116, 91]);
const D_FINISH_GAME = Buffer.from([168, 120, 86, 113, 64, 116, 2, 146]);

const ACCOUNT_DISCRIMINATOR_GAME_STATE = Buffer.from([
  144, 94, 208, 172, 248, 99, 134, 120,
]);

// ── PDAs ──────────────────────────────────────────────────────────────
export function gamePda(gameId: bigint): [PublicKey, number] {
  const idLe = Buffer.alloc(8);
  idLe.writeBigUInt64LE(gameId, 0);
  return PublicKey.findProgramAddressSync(
    [GAME_SEED, idLe],
    CYBER_SNAKE_PROGRAM_ID,
  );
}

export function delegationBufferPda(game: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [BUFFER_SEED, game.toBuffer()],
    CYBER_SNAKE_PROGRAM_ID,
  )[0];
}

export function delegationRecordPda(game: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, game.toBuffer()],
    DELEGATION_PROGRAM_ID,
  )[0];
}

export function delegationMetadataPda(game: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_METADATA_SEED, game.toBuffer()],
    DELEGATION_PROGRAM_ID,
  )[0];
}

// ── Decoded GameState — mirrors the Rust account layout ───────────────
export interface GameStateDecoded {
  gameId: bigint;
  p1: PublicKey;
  p2: PublicKey;
  status: number;
  winnerFlag: number;
  tick: number;
  dirP1: number;
  dirP2: number;
  queuedDirP1: number;
  queuedDirP2: number;
  foodPos: number;
  lenP1: number;
  lenP2: number;
  headIdxP1: number;
  headIdxP2: number;
  rng: bigint;
  bodyP1: number[];
  bodyP2: number[];
  grid: number[];
}

export function decodeGameState(data: Buffer): GameStateDecoded {
  // Account layout: 8-byte disc, then fields per IDL.
  let o = 0;
  if (
    !data
      .subarray(0, 8)
      .equals(ACCOUNT_DISCRIMINATOR_GAME_STATE)
  ) {
    throw new Error("Account is not a cyber-snake GameState");
  }
  o = 8;
  const gameId = data.readBigUInt64LE(o); o += 8;
  const p1 = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const p2 = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const status = data.readUInt8(o); o += 1;
  const winnerFlag = data.readUInt8(o); o += 1;
  const tick = data.readUInt32LE(o); o += 4;
  const dirP1 = data.readUInt8(o); o += 1;
  const dirP2 = data.readUInt8(o); o += 1;
  const queuedDirP1 = data.readUInt8(o); o += 1;
  const queuedDirP2 = data.readUInt8(o); o += 1;
  const foodPos = data.readUInt16LE(o); o += 2;
  const lenP1 = data.readUInt16LE(o); o += 2;
  const lenP2 = data.readUInt16LE(o); o += 2;
  const headIdxP1 = data.readUInt16LE(o); o += 2;
  const headIdxP2 = data.readUInt16LE(o); o += 2;
  const rng = data.readBigUInt64LE(o); o += 8;

  const bodyP1: number[] = new Array(MAX_LEN);
  for (let i = 0; i < MAX_LEN; i++) {
    bodyP1[i] = data.readUInt16LE(o);
    o += 2;
  }
  const bodyP2: number[] = new Array(MAX_LEN);
  for (let i = 0; i < MAX_LEN; i++) {
    bodyP2[i] = data.readUInt16LE(o);
    o += 2;
  }
  const grid: number[] = new Array(GRID_W * GRID_H);
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    grid[i] = data.readUInt8(o);
    o += 1;
  }

  return {
    gameId, p1, p2, status, winnerFlag, tick,
    dirP1, dirP2, queuedDirP1, queuedDirP2,
    foodPos, lenP1, lenP2, headIdxP1, headIdxP2,
    rng, bodyP1, bodyP2, grid,
  };
}

// ── Wallet helper ─────────────────────────────────────────────────────
async function signAndSend(
  conn: Connection,
  wallet: WalletContextState,
  ix: TransactionInstruction,
  extraSigners: Keypair[] = [],
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;
  if (extraSigners.length > 0) tx.partialSign(...extraSigners);
  const signed = await wallet.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  });
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

// ── Public API ────────────────────────────────────────────────────────

/** Pick a random 64-bit game id. */
export function newGameId(): bigint {
  // Use crypto.getRandomValues for unbiased u64.
  const u8 = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(u8);
  } else {
    for (let i = 0; i < 8; i++) u8[i] = Math.floor(Math.random() * 256);
  }
  // Avoid 0 — program XORs it with a constant for the food RNG seed and 0 is
  // technically valid, but harder to debug. (Use BigInt() rather than `0n`
  // literals since this project's tsconfig targets ES2017.)
  let id = BigInt(0);
  const SHIFT = BigInt(8);
  for (let i = 7; i >= 0; i--) id = (id << SHIFT) | BigInt(u8[i]);
  if (id === BigInt(0)) id = BigInt(1);
  return id;
}

/** Player A creates a new lobby on devnet. Returns gameId + game PDA. */
export async function createLobby(
  conn: Connection,
  wallet: WalletContextState,
  gameId: bigint,
): Promise<{ gameId: bigint; game: PublicKey; sig: string }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const [game] = gamePda(gameId);

  const data = Buffer.alloc(8 + 8);
  D_CREATE_GAME.copy(data, 0);
  data.writeBigUInt64LE(gameId, 8);

  const ix = new TransactionInstruction({
    programId: CYBER_SNAKE_PROGRAM_ID,
    keys: [
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const sig = await signAndSend(conn, wallet, ix);
  return { gameId, game, sig };
}

/** Player B joins an existing lobby. */
export async function joinLobby(
  conn: Connection,
  wallet: WalletContextState,
  gameId: bigint,
): Promise<{ game: PublicKey; sig: string }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const [game] = gamePda(gameId);

  const data = Buffer.alloc(8 + 8);
  D_JOIN_GAME.copy(data, 0);
  data.writeBigUInt64LE(gameId, 8);

  const ix = new TransactionInstruction({
    programId: CYBER_SNAKE_PROGRAM_ID,
    keys: [
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    ],
    data,
  });

  const sig = await signAndSend(conn, wallet, ix);
  return { game, sig };
}

/**
 * Delegate the lobby PDA to MagicBlock ER. After this, the game account
 * lives on the ER until `finishGame` undelegates it. Either player can
 * call this — typically player B does it right after joining.
 */
export async function delegateToEr(
  conn: Connection,
  wallet: WalletContextState,
  game: PublicKey,
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const buffer = delegationBufferPda(game);
  const record = delegationRecordPda(game);
  const metadata = delegationMetadataPda(game);

  const data = Buffer.alloc(8);
  D_DELEGATE_GAME.copy(data, 0);

  const ix = new TransactionInstruction({
    programId: CYBER_SNAKE_PROGRAM_ID,
    keys: [
      { pubkey: buffer, isSigner: false, isWritable: true },
      { pubkey: record, isSigner: false, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: CYBER_SNAKE_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return signAndSend(conn, wallet, ix);
}

/**
 * Submit a direction change on the ER. Direction is 0=N,1=E,2=S,3=W.
 * 180° reversals are rejected on-chain — caller should pre-filter for UX.
 */
export async function submitDirection(
  erConn: Connection,
  wallet: WalletContextState,
  game: PublicKey,
  dir: Direction,
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const data = Buffer.alloc(8 + 1);
  D_SUBMIT_DIRECTION.copy(data, 0);
  data.writeUInt8(dir, 8);

  const ix = new TransactionInstruction({
    programId: CYBER_SNAKE_PROGRAM_ID,
    keys: [
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  // ER txs use skipPreflight to keep latency low.
  if (!wallet.signTransaction) throw new Error("Wallet cannot sign");
  const { blockhash } = await erConn.getLatestBlockhash("processed");
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;
  const signed = await wallet.signTransaction(tx);
  return erConn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
}

/**
 * Advance one tick. Permissionless — anyone can call this. The cranker
 * pays a tiny ER fee. We let either player crank from their browser at
 * the configured tick rate.
 */
export async function advanceTick(
  erConn: Connection,
  wallet: WalletContextState,
  game: PublicKey,
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }
  const data = Buffer.alloc(8);
  D_ADVANCE_TICK.copy(data, 0);

  const ix = new TransactionInstruction({
    programId: CYBER_SNAKE_PROGRAM_ID,
    keys: [
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const { blockhash } = await erConn.getLatestBlockhash("processed");
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;
  const signed = await wallet.signTransaction(tx);
  return erConn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
}

/**
 * After the game finishes (status=2 on ER), commit + undelegate back to L1.
 * Permissionless — either player or a keeper can call this.
 */
export async function finishGame(
  erConn: Connection,
  wallet: WalletContextState,
  game: PublicKey,
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const data = Buffer.alloc(8);
  D_FINISH_GAME.copy(data, 0);

  const ix = new TransactionInstruction({
    programId: CYBER_SNAKE_PROGRAM_ID,
    keys: [
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ],
    data,
  });

  return signAndSend(erConn, wallet, ix);
}

/**
 * Read game state from whichever connection has it. After delegation the
 * account moves to ER; before/after, it lives on L1. Try both.
 */
export async function pollState(
  l1: Connection,
  er: Connection,
  game: PublicKey,
): Promise<GameStateDecoded | null> {
  try {
    const erInfo = await er.getAccountInfo(game, "processed");
    if (erInfo && erInfo.data.length >= 8) {
      try {
        return decodeGameState(Buffer.from(erInfo.data));
      } catch {
        // Fall through — could be empty / zeroed during delegation flip.
      }
    }
  } catch {
    /* ER may not have it yet */
  }
  try {
    const l1Info = await l1.getAccountInfo(game, "confirmed");
    if (l1Info && l1Info.data.length >= 8) {
      return decodeGameState(Buffer.from(l1Info.data));
    }
  } catch {
    /* not on L1 either */
  }
  return null;
}

/** Subscribe to ER state updates via account subscription. Returns an unsub fn. */
export function subscribeState(
  conn: Connection,
  game: PublicKey,
  onUpdate: (state: GameStateDecoded) => void,
): () => void {
  const id = conn.onAccountChange(
    game,
    (info) => {
      try {
        const decoded = decodeGameState(Buffer.from(info.data));
        onUpdate(decoded);
      } catch {
        /* ignore malformed — ER may post intermediate buffers */
      }
    },
    "processed",
  );
  return () => {
    conn.removeAccountChangeListener(id).catch(() => {});
  };
}

/** Pretty explorer URL for an L1 or ER signature. */
export function explorerUrl(sig: string, isEr: boolean = false): string {
  if (isEr) {
    return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(
      ER_RPC,
    )}`;
  }
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

/** Build a shareable link the second player opens to join. */
export function buildShareLink(gameId: bigint): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://gamerplex.com";
  return `${origin}/play/cyber-snake?mode=battle&match=${gameId.toString()}`;
}
