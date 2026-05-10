// Leaderboard MVP — on-chain-sourced top scores per game.
//
// Strategy: query getSignaturesForAddress(ARCADE_PROGRAM_ID) for candidate txs,
// then fetch each tx and parse the GPX5 memo from the program logs.
//
// Why we can't read sig.memo directly: the arcade contract emits the GPX5
// memo as a *CPI* to the SPL Memo program from inside submit_score (see
// lib.rs:449). Solana RPC's getSignaturesForAddress only populates `memo` for
// top-level memo instructions — CPI memos land in the tx's logMessages and
// innerInstructions, NOT in the signature's top-level memo field. Scanning
// sig.memo always returns 0 results for arcade saves; we have to fetch full
// txs and parse the "Program log: Memo (len N): \"GPX5|...\"" log lines.
// (Bug found 2026-05-05; previous strategy returned an empty leaderboard
// despite real saves on chain.)
//
// Memo format (from lib.rs submit_score):
//   GPX5|<game_slug>|<variant>|<player>|<score>|<continues>|<powerups>|<seed_b58>|<duration>|<move_hash_b58>[|<meta>]
//
// VERIFIED entries emit an extra GPX5R memo on a separate tx. We track which
// players have GPX5R memos and mark them as verified in the leaderboard.
//
// Upgrade path (post-MVP): dedicated resolver that indexes events into SQLite,
// exposes /api/leaderboard?game=cyber-snake. Same output shape.

import { Connection, ConfirmedSignatureInfo } from "@solana/web3.js";
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

// Cap signatures aggressively. Public devnet RPC rate-limits hard
// (~5–10 req/sec sustained, with 429 retries adding multiplicative cost);
// 25 sigs sequential fits within the rate window and finishes in ~6–10s
// even when half the requests retry. Production: switch to Helius/Triton
// (configurable via NEXT_PUBLIC_RPC_URL) and the cap can be raised.
const MAX_SIGNATURES = 25;

// Sequential fetch with delay between calls. Parallelism just generates
// more 429s on public RPC and the client auto-retries them, doubling the
// call count. Sequential keeps us under the rate limit.
const TX_FETCH_DELAY_MS = 150;

// Memo for the parsed leaderboard, keyed by gameSlug. Avoids re-fetching
// the same 60 sigs every 30s when the polling component re-runs.
const CACHE_TTL_MS = 60_000;
type CachedResult = { at: number; entries: LeaderboardEntry[] };
const memCache = new Map<string, CachedResult>();
const SS_KEY_PREFIX = "gp.arcade.leaderboard.v2.";

function readCache(gameSlug: string): LeaderboardEntry[] | null {
  const m = memCache.get(gameSlug);
  if (m && Date.now() - m.at < CACHE_TTL_MS) return m.entries;
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(SS_KEY_PREFIX + gameSlug);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedResult;
        if (Date.now() - parsed.at < CACHE_TTL_MS) {
          memCache.set(gameSlug, parsed);
          return parsed.entries;
        }
      }
    } catch {}
  }
  return null;
}

function writeCache(gameSlug: string, entries: LeaderboardEntry[]) {
  const c = { at: Date.now(), entries };
  memCache.set(gameSlug, c);
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(SS_KEY_PREFIX + gameSlug, JSON.stringify(c)); } catch {}
  }
}

// Match `Program log: Memo (len 168): "GPX5|...|..."` lines from the SPL
// memo program's CPI. Memo program logs the entire memo string verbatim.
// Capture group 1 = the memo string itself.
const MEMO_LOG_RE = /Program log: Memo \(len \d+\): "(.+)"$/;

function extractMemosFromLogs(logs: readonly string[] | null | undefined): string[] {
  if (!logs) return [];
  const out: string[] = [];
  for (const l of logs) {
    const m = l.match(MEMO_LOG_RE);
    if (m) out.push(m[1]);
  }
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  // Cache hit — return immediately. CACHE_TTL_MS bounds staleness.
  const cached = readCache(gameSlug);
  if (cached) return cached.slice(0, limit);

  // Single page of recent signatures. MAX_SIGNATURES capped low (60)
  // for public devnet RPC compatibility — see top-of-file comment.
  let allSigs: ConfirmedSignatureInfo[];
  try {
    allSigs = await connection.getSignaturesForAddress(ARCADE_PROGRAM_ID, {
      limit: MAX_SIGNATURES,
    });
  } catch {
    return cached ?? [];
  }

  const candidates = allSigs.filter((s) => !s.err);

  // Sequential fetch with delay between calls. See top-of-file rationale.
  type FetchedTx = { sig: ConfirmedSignatureInfo; memos: string[] };
  const fetched: FetchedTx[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const sig = candidates[i];
    try {
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (tx) {
        const memos = extractMemosFromLogs(tx.meta?.logMessages);
        if (memos.length > 0) fetched.push({ sig, memos });
      }
    } catch {
      // Per-tx errors (429s, timeouts) are non-fatal — continue with what we have.
    }
    if (i < candidates.length - 1) await sleep(TX_FETCH_DELAY_MS);
  }

  const gameTag = `|${gameSlug}|`;
  const bestByPlayer = new Map<string, LeaderboardEntry>();
  const verifiedPlayers = new Set<string>();

  // First pass: collect GPX5 (scores). One tx may have multiple memos
  // (defensive — current contract emits one per submit_score, but a bundled
  // tx could have more).
  for (const f of fetched) {
    for (const memo of f.memos) {
      if (!memo.includes(gameTag)) continue; // fast filter
      const parsed = parseGpx5(memo);
      if (!parsed) continue;
      const existing = bestByPlayer.get(parsed.player);
      if (!existing || parsed.score > existing.score) {
        bestByPlayer.set(parsed.player, {
          ...parsed,
          tx: f.sig.signature,
          blockTime: f.sig.blockTime ?? null,
          verified: false, // updated in second pass
        });
      }
    }
  }

  // Second pass: mark verified players by checking for any GPX5R memo.
  // GPX5R memos don't include game_slug in the header, so we scan every
  // memo we fetched and cross-reference by player address.
  const knownPlayers = new Set(bestByPlayer.keys());
  for (const f of fetched) {
    for (const memo of f.memos) {
      for (const player of knownPlayers) {
        if (isGpx5rForPlayer(memo, player)) {
          verifiedPlayers.add(player);
        }
      }
    }
  }

  // Merge verified flag into entries.
  for (const [player, entry] of bestByPlayer.entries()) {
    entry.verified = verifiedPlayers.has(player);
  }

  const result = Array.from(bestByPlayer.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: fewer continues = more skill
      if (a.continues !== b.continues) return a.continues - b.continues;
      // Then: earlier blockTime wins
      return (a.blockTime ?? 0) - (b.blockTime ?? 0);
    });

  writeCache(gameSlug, result);
  return result.slice(0, limit);
}

// ── Single-score fetch (challenge-link flow) ─────────────────────────
// Resolver-backed: `GET /arcade/score/:sig`. Returns the parsed GPX5 memo
// for one tx so the snake page can preload a challenger's score banner +
// reuse the SAME deterministic seed, making "beat my run" a real apples-
// to-apples skill comparison rather than a different RNG.

export type ArcadeScoreDetail = {
  tx: string;
  blockTime: number | null;
  gameSlug: string;
  variant: string;
  player: string;
  score: number;
  continues: number;
  powerups: number;
  duration: number;
  seedB58: string;
};

const RESOLVER_URL =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

export async function fetchArcadeScore(sig: string): Promise<ArcadeScoreDetail | null> {
  if (!sig || sig.length < 32 || sig.length > 128) return null;
  try {
    const r = await fetch(`${RESOLVER_URL}/arcade/score/${sig}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    return {
      tx: j.tx,
      blockTime: j.blockTime ?? null,
      gameSlug: j.gameSlug,
      variant: j.variant,
      player: j.player,
      score: j.score,
      continues: j.continues,
      powerups: j.powerups,
      duration: j.duration,
      seedB58: j.seedB58,
    };
  } catch {
    return null;
  }
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
