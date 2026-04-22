// Leaderboard MVP — on-chain-sourced top scores per game.
//
// Strategy: query getSignaturesForAddress(ARCADE_PROGRAM_ID) which returns
// a list of signatures plus each tx's memo inline. We parse the GPX5 memos
// directly — no need to fetch full transactions. This keeps the leaderboard
// cheap (1 RPC round trip) and fast enough for a v1 MVP.
//
// Memo format (from lib.rs submit_score):
//   GPX5|<game_slug>|<variant>|<player>|<score>|<continues>|<powerups>|<seed_b58>|<duration>|<move_hash_b58>[|<meta>]
//
// VERIFIED entries emit an extra GPX5R memo on a separate tx. We track which
// players have GPX5R memos and mark them as verified in the leaderboard.
//
// Upgrade path (post-MVP): dedicated resolver that indexes events into SQLite,
// exposes /api/leaderboard?game=cyber-snake. Same output shape.

import { Connection, PublicKey, ConfirmedSignatureInfo } from "@solana/web3.js";
import { ARCADE_PROGRAM_ID } from "./client";

export type LeaderboardEntry = {
  player: string;         // base58 wallet
  score: number;
  continues: number;
  powerups: number;
  duration: number;
  tx: string;
  blockTime: number | null;
  verified: boolean;
};

// Chunked RPC pagination — one getSignaturesForAddress call returns up to
// 1000 signatures. For arcade v1 we cap at 500 which is plenty for the
// first few months of volume.
const MAX_SIGNATURES = 500;

function parseGpx5(memo: string): Omit<LeaderboardEntry, "tx" | "blockTime" | "verified"> | null {
  // Memo strings in Solana RPC arrive prefixed with "[N] " where N is the
  // memo index. Strip that prefix if present.
  const stripped = memo.replace(/^\[\d+\]\s*/, "");
  if (!stripped.startsWith("GPX5|")) return null;
  const parts = stripped.split("|");
  // Need at least: GPX5, game, variant, player, score, continues, powerups, seed, duration
  if (parts.length < 9) return null;
  if (parts[0] !== "GPX5") return null;
  const player = parts[3];
  const score = Number(parts[4]);
  const continues = Number(parts[5]);
  const powerups = Number(parts[6]);
  const duration = Number(parts[7 + 1]); // index 8
  if (!player || !Number.isFinite(score) || score < 0) return null;
  return {
    player,
    score,
    continues: Number.isFinite(continues) ? continues : 0,
    powerups: Number.isFinite(powerups) ? powerups : 0,
    duration: Number.isFinite(duration) ? duration : 0,
  };
}

function isGpx5rForPlayer(memo: string, player: string): boolean {
  const stripped = memo.replace(/^\[\d+\]\s*/, "");
  if (!stripped.startsWith("GPX5R|")) return false;
  const parts = stripped.split("|");
  // GPX5R|<player>|<score_nonce>|<seed_b58>|<move_log_b64>
  return parts[1] === player;
}

export async function fetchLeaderboard(
  connection: Connection,
  gameSlug: string,
  limit: number = 10,
): Promise<LeaderboardEntry[]> {
  let allSigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;

  // Two pages max = 2000 signatures. Breaks out early if the RPC returns
  // fewer than a page (end of history).
  for (let page = 0; page < 2; page++) {
    const sigs = await connection.getSignaturesForAddress(ARCADE_PROGRAM_ID, {
      limit: Math.min(1000, MAX_SIGNATURES - allSigs.length),
      before,
    });
    if (sigs.length === 0) break;
    allSigs = allSigs.concat(sigs);
    if (allSigs.length >= MAX_SIGNATURES) break;
    before = sigs[sigs.length - 1].signature;
  }

  const gameTag = `|${gameSlug}|`;
  const bestByPlayer = new Map<string, LeaderboardEntry>();
  const verifiedPlayers = new Set<string>();

  // First pass: collect GPX5 (scores) and GPX5R (verifications) signals.
  // GPX5R memos mark the player as verified for ANY of their submissions.
  for (const sig of allSigs) {
    if (!sig.memo) continue;
    if (sig.err) continue;
    // Fast-path filter: skip memos that don't contain the game slug at all.
    if (!sig.memo.includes(gameTag)) continue;

    const parsed = parseGpx5(sig.memo);
    if (parsed) {
      const existing = bestByPlayer.get(parsed.player);
      if (!existing || parsed.score > existing.score) {
        bestByPlayer.set(parsed.player, {
          ...parsed,
          tx: sig.signature,
          blockTime: sig.blockTime ?? null,
          verified: false, // updated in second pass
        });
      }
    }
  }

  // Second pass: mark verified players by checking for any GPX5R memo.
  // GPX5R memos don't include game_slug in the header, so we scan all memos
  // and cross-reference by player address.
  const knownPlayers = new Set(bestByPlayer.keys());
  for (const sig of allSigs) {
    if (!sig.memo) continue;
    if (sig.err) continue;
    for (const player of knownPlayers) {
      if (isGpx5rForPlayer(sig.memo, player)) {
        verifiedPlayers.add(player);
      }
    }
  }

  // Merge verified flag into entries.
  for (const [player, entry] of bestByPlayer.entries()) {
    entry.verified = verifiedPlayers.has(player);
  }

  return Array.from(bestByPlayer.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: fewer continues = more skill
      if (a.continues !== b.continues) return a.continues - b.continues;
      // Then: earlier blockTime wins
      return (a.blockTime ?? 0) - (b.blockTime ?? 0);
    })
    .slice(0, limit);
}

export function shortAddr(addr: string): string {
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
