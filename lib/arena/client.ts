// Browser arena client (player-funded wallet model). Players sign submit_action /
// finish_match / commit_match with their OWN wallet (wallet-adapter), not a
// sponsored session key. Match creation + delegation are admin ops done by the
// resolver (POST /arena/match). Ixs are byte-identical to @gamerplex/arena's
// ArenaClient (devnet-tested 13/13); ported here because gamerplex-com can't dep
// the private package.
import {
  Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram,
} from "@solana/web3.js";

export const ARENA_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ARENA_PROGRAM_ID || "6efiRKPtXWCdDTTgH2Qog6BGqbcSBgoLra33UXkGQ3AR",
);
export const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
export const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");
export const ER_RPC = process.env.NEXT_PUBLIC_ARENA_ER_RPC || "https://devnet.magicblock.app";

const MATCH_SEED = Buffer.from("match");
const DISC = {
  submitAction: Buffer.from([222, 59, 32, 151, 194, 137, 175, 150]),
  finishMatch: Buffer.from([65, 193, 5, 71, 16, 64, 11, 186]),
  commitMatch: Buffer.from([175, 146, 74, 234, 39, 25, 248, 114]),
};

const u64le = (n: number): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const u32le = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const vecBytes = (b: Uint8Array): Buffer => Buffer.concat([u32le(b.length), Buffer.from(b)]);
const optPubkey = (k: PublicKey | null): Buffer => (k ? Buffer.concat([Buffer.from([1]), k.toBuffer()]) : Buffer.from([0]));

export const matchPda = (gameId: number, matchId: number): PublicKey =>
  PublicKey.findProgramAddressSync([MATCH_SEED, u64le(gameId), u64le(matchId)], ARENA_PROGRAM_ID)[0];

export interface MatchState {
  players: PublicKey[];
  turnBased: boolean;
  currentTurn: number;
  actionCount: number;
  status: number; // 0 active, 1 finished
  hasWinner: boolean;
  winner: PublicKey;
  lastAction: Uint8Array;
}

export function decodeMatch(data: Buffer): MatchState {
  let o = 8 + 8 + 8 + 32; // disc + game_id + match_id + creator
  const n = data.readUInt32LE(o); o += 4;
  const players: PublicKey[] = [];
  for (let i = 0; i < n; i++) { players.push(new PublicKey(data.subarray(o, o + 32))); o += 32; }
  const turnBased = data[o] === 1; o += 1;
  const currentTurn = data[o]; o += 1;
  const actionCount = Number(data.readBigUInt64LE(o)); o += 8;
  const status = data[o]; o += 1;
  const hasWinner = data[o] === 1; o += 1;
  const winner = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const len = data.readUInt32LE(o); o += 4;
  const lastAction = Uint8Array.from(data.subarray(o, o + len));
  return { players, turnBased, currentTurn, actionCount, status, hasWinner, winner, lastAction };
}

// ── pure ix builders (wallet signs) ──────────────────────────────────────────
export function ixSubmitAction(player: PublicKey, gameId: number, matchId: number, action: Uint8Array): TransactionInstruction {
  return new TransactionInstruction({
    programId: ARENA_PROGRAM_ID,
    keys: [
      { pubkey: matchPda(gameId, matchId), isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([DISC.submitAction, u64le(gameId), u64le(matchId), vecBytes(action)]),
  });
}

export function ixFinishMatch(creator: PublicKey, gameId: number, matchId: number, winner: PublicKey | null): TransactionInstruction {
  return new TransactionInstruction({
    programId: ARENA_PROGRAM_ID,
    keys: [
      { pubkey: matchPda(gameId, matchId), isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([DISC.finishMatch, u64le(gameId), u64le(matchId), optPubkey(winner)]),
  });
}

export function ixCommitMatch(payer: PublicKey, gameId: number, matchId: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: ARENA_PROGRAM_ID,
    keys: [
      { pubkey: matchPda(gameId, matchId), isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([DISC.commitMatch, u64le(gameId), u64le(matchId)]),
  });
}

export type SignTx = (tx: Transaction) => Promise<Transaction>;

/** Sign one ix with the player's wallet + send (skipPreflight for the ER). */
export async function signAndSend(conn: Connection, wallet: PublicKey, signTx: SignTx, ix: TransactionInstruction): Promise<string> {
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  const signed = await signTx(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

/** Matchmaking: ask the resolver (admin) to create + delegate a match. */
export async function requestMatch(resolverUrl: string, gameId: number, players: string[], turnBased = true): Promise<{ gameId: number; matchId: number; matchPda: string }> {
  const r = await fetch(`${resolverUrl}/arena/match`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId, players, turnBased }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "matchmaking failed");
  return j;
}

/** Submit a finished match's move log to the resolver for off-chain validation. */
export async function validateMatch(resolverUrl: string, gameId: number, matchId: number, actionLog: number[][]): Promise<any> {
  const r = await fetch(`${resolverUrl}/arena/chess/${gameId}/${matchId}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actionLog }),
  });
  return r.json();
}

export const erConnection = () => new Connection(ER_RPC, "confirmed");
