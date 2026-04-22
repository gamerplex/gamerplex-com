// Profile helpers — SNS lookup, stats aggregation, receipt enumeration.
//
// All data is pulled live from Solana RPC + Bonfida SNS. No database required.
// Where we can, we reuse the leaderboard memo-scan helper to keep the mental
// model consistent across pages.

import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getFavoriteDomain } from "@bonfida/spl-name-service";
import {
  ARCADE_PROGRAM_ID,
  makeProgram,
  CYBER_SNAKE_GAME_ID,
} from "./client";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

// ── SNS ────────────────────────────────────────────────────────────────

/** Reject anything that isn't plain ASCII — guards against homograph spoofs. */
function isAsciiSafeDomain(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}\.sol$/.test(name);
}

export async function lookupSns(
  connection: Connection,
  wallet: PublicKey,
): Promise<string | null> {
  try {
    const res = await getFavoriteDomain(connection, wallet);
    const raw = res?.reverse ? `${res.reverse}.sol` : null;
    return raw && isAsciiSafeDomain(raw) ? raw : null;
  } catch {
    return null;
  }
}

// ── Receipts ───────────────────────────────────────────────────────────

// ReplayReceipt layout (see lib.rs #[account] struct):
//   [8 disc][32 original_player][1 game_id][8 score][1 cont][1 pow]
//   [32 seed][32 hash][4 dur][64 gpx5r_tx][8 minted][2 season][8 nonce]
//   [32 owner][1 cnft_wrapped][32 cnft_asset_id][1 bump]
// Offsets (post-discriminator):
const OFFSET_ORIGINAL_PLAYER = 8;
const OFFSET_OWNER = 201;

export type ReceiptSummary = {
  pda: string;
  originalPlayer: string;
  owner: string;
  gameId: number;
  score: number;
  continues: number;
  powerups: number;
  duration: number;
  mintedAt: number;       // unix seconds
  season: number;
  nonce: string;          // BN.toString to avoid losing precision
  cnftWrapped: boolean;
};

function summarizeReceipt(pda: PublicKey, raw: any): ReceiptSummary {
  return {
    pda: pda.toBase58(),
    originalPlayer: raw.originalPlayer.toBase58(),
    owner: raw.owner.toBase58(),
    gameId: raw.gameId,
    score: typeof raw.score === "number" ? raw.score : Number((raw.score as BN).toString()),
    continues: raw.continuesUsed,
    powerups: raw.powerupsUsed,
    duration: raw.durationSec,
    mintedAt: typeof raw.mintedAt === "number" ? raw.mintedAt : Number((raw.mintedAt as BN).toString()),
    season: raw.season,
    nonce: (raw.nonce as BN).toString(),
    cnftWrapped: !!raw.cnftWrapped,
  };
}

/** Fetch all receipts where the wallet is the CURRENT owner (transferable set). */
export async function fetchReceiptsOwned(
  connection: Connection,
  wallet: AnchorWallet,
  walletPubkey: PublicKey,
): Promise<ReceiptSummary[]> {
  const program = makeProgram(connection, wallet);
  const accounts = await (program.account as any).replayReceipt.all([
    { memcmp: { offset: OFFSET_OWNER, bytes: walletPubkey.toBase58() } },
  ]);
  return accounts.map((a: any) => summarizeReceipt(a.publicKey, a.account));
}

/** Fetch all receipts where the wallet was the ORIGINAL player (immutable set). */
export async function fetchReceiptsOriginal(
  connection: Connection,
  wallet: AnchorWallet,
  walletPubkey: PublicKey,
): Promise<ReceiptSummary[]> {
  const program = makeProgram(connection, wallet);
  const accounts = await (program.account as any).replayReceipt.all([
    { memcmp: { offset: OFFSET_ORIGINAL_PLAYER, bytes: walletPubkey.toBase58() } },
  ]);
  return accounts.map((a: any) => summarizeReceipt(a.publicKey, a.account));
}

// ── Stats from GPX5 memo scan ──────────────────────────────────────────

// We reuse getSignaturesForAddress and parse GPX5 memos directly. Same
// strategy as the leaderboard — cheap, one RPC call, good enough for MVP.
//
// Per-player stats we want:
//   - total GPX5 memos (count of games played / scores saved)
//   - total GPX5R memos (count of verified replays)
//   - best score per game_slug
//   - approximate total USDC spent (derived from memo count × tier pricing)
//     Note: this is a lower bound — it counts observable memo-emitting actions
//     but doesn't see close_receipt rent refunds or continue purchases that
//     don't emit memos.

type GpxEntry = { gameSlug: string; score: number; continues: number; duration: number; tx: string; blockTime: number | null };

const MAX_SIGS_FOR_PROFILE = 500;

function parseGpx5(memo: string): GpxEntry | null {
  const stripped = memo.replace(/^\[\d+\]\s*/, "");
  if (!stripped.startsWith("GPX5|")) return null;
  const parts = stripped.split("|");
  if (parts.length < 9) return null;
  const gameSlug = parts[1];
  const score = Number(parts[4]);
  const continues = Number(parts[5]);
  const duration = Number(parts[8]);
  if (!gameSlug || !Number.isFinite(score)) return null;
  return { gameSlug, score, continues, duration, tx: "", blockTime: null };
}

function isGpx5rForPlayer(memo: string, playerB58: string): boolean {
  const stripped = memo.replace(/^\[\d+\]\s*/, "");
  if (!stripped.startsWith("GPX5R|")) return false;
  const parts = stripped.split("|");
  return parts[1] === playerB58;
}

export type PlayerStats = {
  gamesPlayed: number;
  verifiedRuns: number;
  bestByGame: Record<string, { score: number; continues: number; duration: number; tx: string; blockTime: number | null }>;
  recentPlays: Array<{ gameSlug: string; score: number; continues: number; tx: string; blockTime: number | null }>;
  approxSpendUsd: number;
};

// We match GPX5 memos to their originating tx by scanning signatures returned
// by getSignaturesForAddress for the specific player wallet. Unlike the
// leaderboard path (which scans the program), we scan the player — so every
// hit is guaranteed to be "this player's action".
export async function fetchPlayerStats(
  connection: Connection,
  walletPubkey: PublicKey,
): Promise<PlayerStats> {
  const sigs = await connection.getSignaturesForAddress(walletPubkey, {
    limit: MAX_SIGS_FOR_PROFILE,
  });

  const player = walletPubkey.toBase58();
  const bestByGame: PlayerStats["bestByGame"] = {};
  const recentPlays: PlayerStats["recentPlays"] = [];
  let gamesPlayed = 0;
  let verifiedRuns = 0;
  let approxSpendUsd = 0;

  for (const sig of sigs) {
    if (!sig.memo) continue;
    if (sig.err) continue;
    const parsed = parseGpx5(sig.memo);
    if (parsed) {
      gamesPlayed++;
      approxSpendUsd += 0.05; // T1 save fee
      const existing = bestByGame[parsed.gameSlug];
      if (!existing || parsed.score > existing.score) {
        bestByGame[parsed.gameSlug] = {
          score: parsed.score,
          continues: parsed.continues,
          duration: parsed.duration,
          tx: sig.signature,
          blockTime: sig.blockTime ?? null,
        };
      }
      if (recentPlays.length < 10) {
        recentPlays.push({
          gameSlug: parsed.gameSlug,
          score: parsed.score,
          continues: parsed.continues,
          tx: sig.signature,
          blockTime: sig.blockTime ?? null,
        });
      }
    } else if (isGpx5rForPlayer(sig.memo, player)) {
      verifiedRuns++;
      approxSpendUsd += 0.15; // T2 replay fee
    }
  }

  return { gamesPlayed, verifiedRuns, bestByGame, recentPlays, approxSpendUsd };
}

// ── Formatting helpers ─────────────────────────────────────────────────

export function shortAddr(addr: string): string {
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function gameDisplayName(slug: string): string {
  if (slug === "cyber-snake") return "Cyber Snake";
  // Title-case the slug as a default
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTimeAgo(unixSec: number | null): string {
  if (!unixSec) return "";
  const delta = Math.floor(Date.now() / 1000 - unixSec);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export { CYBER_SNAKE_GAME_ID };
