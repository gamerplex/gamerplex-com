"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RESOLVER =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

// Reuse the same cache keys as /activity + /leaderboard so the home-page
// preview shares cached data with the dedicated pages.
const ACTIVITY_CACHE_KEY = "gp.activity.v1";
const LEADERBOARD_CACHE_KEY = "gp.leaderboard.v1.all.pnl.all.any";

interface ActivityRow {
  blockTime: number;
  gameSlug: string;
  market: string;
  p1Name: string;
  p2Name: string;
  totalPotRaw: string;
  winnerPayoutRaw: string;
  winningOutcome: number;
  winnerName: string | null;
}

interface Totals {
  matches: number;
  volumeRaw?: string;
  totalPotRaw?: string;
  treasuryRaw: string;
  poolSponsorRaw: string;
}
interface TotalsBucket {
  matches: number;
  volumeRaw: string;
  treasuryRaw: string;
  poolSponsorRaw: string;
}
interface TotalsByKind {
  humanOnly: TotalsBucket;
  botOnly: TotalsBucket;
  humanVsBot: TotalsBucket;
}

interface Player {
  wallet: string;
  name: string;
  snsDomain?: string | null;
  wins: number;
  losses: number;
  netPnl?: string;
  elo?: number | null;
  kind?: string;
}

function fmtUsd(raw?: string, signed = false): string {
  if (!raw) return "$0.00";
  try {
    const n = Number(BigInt(raw)) / 1e6;
    const sign = signed && n > 0 ? "+" : "";
    return `${sign}$${n.toFixed(2)}`;
  } catch {
    return "$0.00";
  }
}

function timeAgo(blockTime: number): string {
  const secs = Math.floor(Date.now() / 1000 - blockTime);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export default function OnchainPreview() {
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [totalsByKind, setTotalsByKind] = useState<TotalsByKind | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  // Hydrate instantly from whatever the dedicated pages already cached.
  useEffect(() => {
    const act = readCache<{
      at: number;
      onchain: ActivityRow[];
      onchainTotals: Totals | null;
      totalsByKind?: TotalsByKind | null;
    }>(ACTIVITY_CACHE_KEY);
    const lb = readCache<{
      at: number;
      players: Player[];
      totals: Totals | null;
    }>(LEADERBOARD_CACHE_KEY);
    if (act) {
      setActivity(act.onchain || []);
      setTotals(act.onchainTotals || null);
      if (act.totalsByKind) setTotalsByKind(act.totalsByKind);
    }
    if (lb) {
      setPlayers(lb.players || []);
      if (!act) setTotals(lb.totals || null);
    }
    if (act || lb) {
      setFromCache(true);
      setLoading(false);
    }
  }, []);

  // Background refresh on mount + every 15s.
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const [act, lb] = await Promise.all([
          fetch(`${RESOLVER}/activity/onchain?limit=5`)
            .then((r) => r.json())
            .catch(() => null),
          fetch(
            `${RESOLVER}/leaderboard/unified?game=all&metric=pnl&window=all&stakeTier=any`
          )
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (cancelled) return;
        if (act && act.ok) {
          setActivity(act.activity || []);
          setTotals(act.totals || null);
          if (act.totalsByKind) setTotalsByKind(act.totalsByKind);
          // Refresh activity cache too (preserves other fields from full page)
          const existing = readCache<any>(ACTIVITY_CACHE_KEY) || {};
          writeCache(ACTIVITY_CACHE_KEY, {
            ...existing,
            at: Date.now(),
            onchain: act.activity || [],
            onchainTotals: act.totals || null,
            totalsByKind: act.totalsByKind || null,
            liveGames: existing.liveGames || [],
          });
        }
        if (lb && lb.ok) {
          setPlayers(lb.players || []);
          if (!act || !act.ok) setTotals(lb.totals || null);
        }
        setFromCache(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const hasData = activity.length > 0 || players.length > 0 || totals !== null;
  const showSkeleton = loading && !hasData;
  const topPlayers = players.slice(0, 5);

  return (
    <section
      className="arena-section"
      style={{ paddingTop: 30, paddingBottom: 10 }}
    >
      <div className="arena-header">
        <h2>📡 Live on-chain</h2>
        <span
          style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}
        >
          HUMANS ONLY · CM V2.1 MARKETRESOLVEDV2 · DEVNET
          {fromCache && !loading && (
            <span
              style={{
                marginLeft: 10,
                color: "#ff9a40",
                letterSpacing: 0,
                textTransform: "none",
              }}
            >
              (cached)
            </span>
          )}
          {loading && (
            <span
              style={{
                marginLeft: 10,
                color: "#9945FF",
                letterSpacing: 0,
                textTransform: "none",
              }}
            >
              (syncing…)
            </span>
          )}
        </span>
      </div>

      {/* Stat strip — humans-only headline. Registered agents (house +
          third-party per GAMERPLEX-SKILLS.md) are reported separately below. */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto 6px",
          padding: "0 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <MiniStat
          label="Human matches"
          value={
            showSkeleton
              ? null
              : totalsByKind
              ? totalsByKind.humanOnly.matches.toLocaleString()
              : totals
              ? totals.matches.toLocaleString()
              : "0"
          }
          accent="#14F195"
        />
        <MiniStat
          label="Human volume"
          value={
            showSkeleton
              ? null
              : totalsByKind
              ? fmtUsd(totalsByKind.humanOnly.volumeRaw)
              : totals
              ? fmtUsd(totals.volumeRaw || totals.totalPotRaw)
              : "$0.00"
          }
          accent="#9945FF"
        />
        <MiniStat
          label="Treasury"
          value={
            showSkeleton
              ? null
              : totalsByKind
              ? fmtUsd(totalsByKind.humanOnly.treasuryRaw)
              : totals
              ? fmtUsd(totals.treasuryRaw)
              : "$0.00"
          }
          accent="#ffd740"
        />
        <MiniStat
          label="Pool inflow"
          value={
            showSkeleton
              ? null
              : totalsByKind
              ? fmtUsd(totalsByKind.humanOnly.poolSponsorRaw)
              : totals
              ? fmtUsd(totals.poolSponsorRaw)
              : "$0.00"
          }
          accent="#00e676"
        />
      </div>

      {/* Bot-seed disclosure — shown whenever bot matches exist. Never hidden. */}
      {totalsByKind && (totalsByKind.botOnly.matches > 0 || totalsByKind.humanVsBot.matches > 0) && (
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto 18px",
            padding: "0 20px",
            fontSize: 11,
            color: "#8a8aa0",
            textAlign: "center",
          }}
        >
          + {totalsByKind.botOnly.matches + totalsByKind.humanVsBot.matches} registered-agent matches (
          {fmtUsd(totalsByKind.botOnly.volumeRaw)} seed volume · {fmtUsd(totalsByKind.botOnly.treasuryRaw)} treasury) ·{" "}
          <Link href="/bots" style={{ color: "#9945FF", textDecoration: "underline" }}>
            directory
          </Link>
        </div>
      )}
      {!totalsByKind && <div style={{ marginBottom: 12 }} />}

      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 20,
        }}
      >
        {/* Recent wagered matches */}
        <div
          style={{
            background: "#0c0c14",
            border: "1px solid #252540",
            borderRadius: 12,
            padding: "18px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#9945FF",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              💰 Recent wagered matches
            </div>
            <Link
              href="/activity"
              style={{
                fontSize: 10,
                color: "#8a8aa0",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              All →
            </Link>
          </div>
          {showSkeleton ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: i < 3 ? "1px solid #1a1a28" : "none",
                }}
              >
                <Shimmer w={40} h={10} />
                <div style={{ flex: 1 }}>
                  <Shimmer w={"70%"} h={12} />
                </div>
                <Shimmer w={50} h={12} />
              </div>
            ))
          ) : activity.length === 0 ? (
            <div
              style={{
                padding: "28px 8px",
                textAlign: "center",
                color: "#6a6a80",
                fontSize: 12,
              }}
            >
              No resolved matches yet — play to appear.
            </div>
          ) : (
            activity.slice(0, 5).map((a, i) => {
              const isDraw =
                a.winningOutcome === 255 || a.winningOutcome === null;
              return (
                <a
                  key={a.market}
                  href={`https://explorer.solana.com/address/${a.market}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < Math.min(activity.length, 5) - 1
                        ? "1px solid #1a1a28"
                        : "none",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6a6a80",
                      fontFamily: "monospace",
                    }}
                  >
                    {timeAgo(a.blockTime)}
                  </span>
                  <span style={{ fontSize: 12, color: "#e8e8f0" }}>
                    <span
                      style={{
                        color:
                          a.winningOutcome === 0 ? "#00e676" : "#8a8aa0",
                        fontWeight: a.winningOutcome === 0 ? 700 : 500,
                      }}
                    >
                      {a.p1Name}
                    </span>
                    <span style={{ color: "#55556a", margin: "0 4px" }}>
                      vs
                    </span>
                    <span
                      style={{
                        color:
                          a.winningOutcome === 1 ? "#00e676" : "#8a8aa0",
                        fontWeight: a.winningOutcome === 1 ? 700 : 500,
                      }}
                    >
                      {a.p2Name}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#c99aff",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    {a.gameSlug}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: isDraw ? "#8a8aa0" : "#14F195",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {isDraw ? "draw" : fmtUsd(a.totalPotRaw)}
                  </span>
                </a>
              );
            })
          )}
        </div>

        {/* Top earners */}
        <div
          style={{
            background: "#0c0c14",
            border: "1px solid #252540",
            borderRadius: 12,
            padding: "18px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#14F195",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              🏆 Top earners (on-chain)
            </div>
            <Link
              href="/leaderboard"
              style={{
                fontSize: 10,
                color: "#8a8aa0",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              All →
            </Link>
          </div>
          {showSkeleton ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: i < 4 ? "1px solid #1a1a28" : "none",
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: "#1a1a2a",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <Shimmer w={"60%"} h={12} />
                </div>
                <Shimmer w={50} h={12} />
              </div>
            ))
          ) : topPlayers.length === 0 ? (
            <div
              style={{
                padding: "28px 8px",
                textAlign: "center",
                color: "#6a6a80",
                fontSize: 12,
              }}
            >
              No earners yet — first player to the top.
            </div>
          ) : (
            topPlayers.map((p, i) => {
              const pnlN = p.netPnl ? Number(BigInt(p.netPnl)) / 1e6 : 0;
              const display =
                p.snsDomain || p.name || p.wallet.slice(0, 6) + "…";
              return (
                <div
                  key={p.wallet}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < topPlayers.length - 1 ? "1px solid #1a1a28" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background:
                        i === 0
                          ? "#ffd74020"
                          : i === 1
                          ? "#c0c0c020"
                          : i === 2
                          ? "#cd7f3220"
                          : "#25254020",
                      border: `1px solid ${
                        i === 0
                          ? "#ffd740"
                          : i === 1
                          ? "#c0c0c0"
                          : i === 2
                          ? "#cd7f32"
                          : "#55556a"
                      }60`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color:
                        i === 0
                          ? "#ffd740"
                          : i === 1
                          ? "#c0c0c0"
                          : i === 2
                          ? "#cd7f32"
                          : "#8a8aa0",
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ minWidth: 0, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: p.snsDomain ? "#14F195" : "#e8e8f0",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {display}
                      {p.kind === "stockfish-chess" && (
                        <span
                          style={{
                            color: "#9945FF",
                            fontSize: 9,
                            fontWeight: 800,
                            marginLeft: 6,
                            padding: "1px 5px",
                            border: "1px solid #9945FF60",
                            borderRadius: 4,
                            letterSpacing: 0.8,
                            textTransform: "uppercase",
                          }}
                        >
                          bot
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#6a6a80",
                        fontFamily: "monospace",
                      }}
                    >
                      {p.wins}W · {p.losses}L
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color:
                        pnlN > 0
                          ? "#00e676"
                          : pnlN < 0
                          ? "#ff5252"
                          : "#8a8aa0",
                      fontFamily: "monospace",
                    }}
                  >
                    {fmtUsd(p.netPnl, true)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes gp-shim { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </section>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number | null;
  accent: string;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#0c0c14",
        border: "1px solid #252540",
        borderRadius: 10,
        boxShadow: `inset 0 -2px 0 ${accent}40`,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#8a8aa0",
          letterSpacing: 1.3,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {value === null ? (
        <Shimmer w={"78%"} h={20} />
      ) : (
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: accent,
            fontFamily: "monospace",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function Shimmer({ w, h }: { w: number | string; h: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        background:
          "linear-gradient(90deg, #1a1a2a 0%, #2a2a40 50%, #1a1a2a 100%)",
        backgroundSize: "200% 100%",
        animation: "gp-shim 1.4s ease-in-out infinite",
      }}
    />
  );
}
