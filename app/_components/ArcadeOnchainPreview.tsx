"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Lean "Live on-chain" home-page section. Reads the 4 arcade leaderboards
// from the resolver (cron-warmed, ~0.4s) and aggregates:
//   - total scores saved across all games
//   - top scorers across all games (one row per wallet, best game)
//   - recent saves feed (last 6, newest first)
//
// Replaces the older CM v2.1 MarketResolvedV2 reader. Arcade-only.

const RESOLVER =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

const GAMES = [
  { slug: "flipball",      label: "Flipball",      emoji: "🎯", color: "#00ffd1", route: "https://flipball.gamerplex.com" },
  { slug: "cyber-snake",   label: "Cyber Snake",   emoji: "🐍", color: "#4fc3f7", route: "/play/cyber-snake?mode=arcade" },
  { slug: "chess-puzzles", label: "Magic Chess",   emoji: "♟",  color: "#c99aff", route: "/play/magic-chess?mode=arcade" },
  { slug: "blockwords",    label: "Blockwords",    emoji: "🔮", color: "#ffd24a", route: "/play/blockwords?mode=arcade" },
] as const;

interface Entry {
  player: string;
  score: number;
  tx: string;
  blockTime: number | null;
  gameSlug: string;
  gameLabel: string;
  gameEmoji: string;
  gameColor: string;
}

function shortPk(b: string): string {
  return b.length > 8 ? `${b.slice(0, 4)}…${b.slice(-4)}` : b;
}

function timeAgo(blockTime: number | null): string {
  if (!blockTime) return "—";
  const delta = Math.floor(Date.now() / 1000 - blockTime);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export default function ArcadeOnchainPreview() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const responses = await Promise.all(
          GAMES.map(async (g) => {
            try {
              const r = await fetch(
                `${RESOLVER}/arcade/leaderboard/${g.slug}`,
                { signal: ac.signal }
              );
              if (!r.ok) return [];
              const j = await r.json();
              const list = (j.entries ?? []) as Array<{
                player: string; score: number; tx: string; blockTime: number | null;
              }>;
              return list.map((e) => ({
                ...e,
                gameSlug: g.slug,
                gameLabel: g.label,
                gameEmoji: g.emoji,
                gameColor: g.color,
              }));
            } catch {
              return [];
            }
          })
        );
        const flat = responses.flat();
        setEntries(flat);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // Recent saves: newest first by blockTime, top 6
  const recent = [...entries]
    .filter((e) => e.blockTime !== null)
    .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
    .slice(0, 6);

  // Top scorers: one row per (player, gameSlug) at their best score, top 5 overall by score
  const bestByPair = new Map<string, Entry>();
  for (const e of entries) {
    const key = `${e.player}::${e.gameSlug}`;
    const cur = bestByPair.get(key);
    if (!cur || e.score > cur.score) bestByPair.set(key, e);
  }
  const topScorers = [...bestByPair.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const totalSaves = entries.length;

  return (
    <section className="arena-section" style={{ paddingTop: 30, paddingBottom: 10 }}>
      <div className="arena-header">
        <h2>📡 Live on-chain</h2>
        <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}>
          ARCADE · GPX5 SCORE MEMOS · DEVNET
          {loading && (
            <span style={{ marginLeft: 10, color: "#9945FF", letterSpacing: 0, textTransform: "none" }}>
              (syncing…)
            </span>
          )}
        </span>
      </div>

      {/* Top-line: total saves */}
      <div style={{
        maxWidth: 900, margin: "0 auto 12px",
        textAlign: "center", padding: "10px 16px",
        background: "rgba(20,241,149,0.06)",
        border: "1px solid rgba(20,241,149,0.25)",
        borderRadius: 10,
        fontSize: 12, color: "rgba(255,255,255,0.85)",
      }}>
        <strong style={{ color: "#14F195", fontSize: 18, fontFamily: "monospace" }}>
          {totalSaves.toLocaleString()}
        </strong>
        {" "}scores saved on-chain across 4 games
      </div>

      <div style={{
        maxWidth: 900, margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}>
        {/* Top scorers panel */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid #252540",
          borderRadius: 10,
          padding: "14px 16px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9945FF", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            🏆 Top scorers
          </div>
          {topScorers.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>
              {loading ? "Loading…" : "No scores yet — be the first."}
            </div>
          ) : (
            <ol style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
              {topScorers.map((e, i) => (
                <li key={`${e.player}-${e.gameSlug}`} style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "5px 0",
                  borderBottom: i < topScorers.length - 1 ? "1px solid #1a1a28" : "none",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", width: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 14 }}>{e.gameEmoji}</span>
                    <Link href={`/profile/${e.player}`} style={{
                      color: "#fff", textDecoration: "none", fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {shortPk(e.player)}
                    </Link>
                  </span>
                  <span style={{ color: e.gameColor, fontFamily: "monospace", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {e.score.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Recent saves panel */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid #252540",
          borderRadius: 10,
          padding: "14px 16px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            ⚡ Recent saves
          </div>
          {recent.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>
              {loading ? "Loading…" : "No saves yet."}
            </div>
          ) : (
            <ol style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
              {recent.map((e) => (
                <li key={e.tx} style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "5px 0",
                  borderBottom: "1px solid #1a1a28",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 14 }}>{e.gameEmoji}</span>
                    <Link href={`/profile/${e.player}`} style={{
                      color: "#fff", textDecoration: "none", fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {shortPk(e.player)}
                    </Link>
                    <span style={{ color: e.gameColor, fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
                      {e.score.toLocaleString()}
                    </span>
                  </span>
                  <a
                    href={`https://explorer.solana.com/tx/${e.tx}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textDecoration: "none", flexShrink: 0 }}
                    title="View on Solana Explorer"
                  >
                    {timeAgo(e.blockTime)} ↗
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
