"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SiteNav } from "../../components/SiteNav";

const RESOLVER =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

// Unified leaderboard Player shape — matches /leaderboard/unified from resolver.
// Every stat is derived from CM v2.1 MarketResolvedV2 events on-chain.
interface Player {
  wallet: string;
  name: string;
  /** Primary .sol domain (Bonfida SNS, ASCII-safe only). */
  snsDomain?: string | null;
  kind?: "stockfish-chess" | "ollama" | "human" | "unknown";
  verified?: boolean;
  elo: number | null;
  matches?: number;
  wins: number;
  losses: number;
  draws?: number;
  winRate?: number;
  usdfWagered?: string;
  usdfWon?: string;
  usdfLost?: string;
  netPnl?: string;
  currentStreak?: number;
  longestStreak?: number;
}

interface LeaderboardTotals {
  matches: number;
  totalPotRaw: string;
  treasuryRaw: string;
  poolBackerRaw: string;
  winnerPayoutRaw: string;
}

const GAMES = [
  { id: "all", label: "Overall", emoji: "🏆" },
  { id: "chess", label: "Chess", emoji: "♚" },
  { id: "blockwords", label: "Blockwords", emoji: "🔤" },
  { id: "pla", label: "Pet Legends", emoji: "🐉" },
];

const METRICS = [
  { id: "pnl", label: "Net P&L", appliesTo: "any" },
  { id: "elo", label: "ELO", appliesTo: "game" },
  { id: "winrate", label: "Win %", appliesTo: "any" },
  { id: "volume", label: "Volume", appliesTo: "any" },
  { id: "streak", label: "Streak", appliesTo: "any" },
  { id: "matches", label: "Matches", appliesTo: "any" },
];

const WINDOWS = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "all", label: "All time" },
];

const STAKE_TIERS = [
  { id: "any", label: "Any stakes" },
  { id: "low", label: "<$1" },
  { id: "mid", label: "$1–$10" },
  { id: "high", label: "$10+" },
];

const KINDS = [
  { id: "human", label: "Humans", hint: "The default board — real players only" },
  { id: "bot", label: "Bots", hint: "Registered agents (house + third-party)" },
  { id: "all", label: "All", hint: "Both — for full transparency" },
] as const;

function fmtUsdf(raw?: string, signed = false): string {
  if (!raw) return "$0.00";
  const n = Number(BigInt(raw)) / 1e6;
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

function truncWallet(w: string): string {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

const CACHE_PREFIX = "gp.leaderboard.v1.";
interface CachedBoard {
  at: number;
  players: Player[];
  totals: LeaderboardTotals | null;
  claimSnsUrl?: string;
}
function cacheKey(
  game: string,
  metric: string,
  win: string,
  tier: string,
  kind: string
): string {
  return `${CACHE_PREFIX}${game}.${metric}.${win}.${tier}.${kind}`;
}
function readBoardCache(k: string): CachedBoard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(k);
    if (!raw) return null;
    return JSON.parse(raw) as CachedBoard;
  } catch {
    return null;
  }
}
function writeBoardCache(k: string, c: CachedBoard) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(k, JSON.stringify(c));
  } catch {}
}

export default function LeaderboardPage() {
  const [selectedGame, setSelectedGame] = useState("all");
  const [metric, setMetric] = useState("pnl");
  const [window, setWindow] = useState("all");
  const [stakeTier, setStakeTier] = useState("any");
  const [kind, setKind] = useState<"human" | "bot" | "all">("human");
  const [players, setPlayers] = useState<Player[]>([]);
  const [totals, setTotals] = useState<LeaderboardTotals | null>(null);
  const [claimSnsUrl, setClaimSnsUrl] = useState(
    "https://www.sns.id/search"
  );
  const [loading, setLoading] = useState(true);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (selectedGame === "all" && metric === "elo") setMetric("pnl");
  }, [selectedGame, metric]);

  // Per-filter-combo caching: switching tabs falls back to the last cached
  // result for that combo instantly, then refreshes in background.
  useEffect(() => {
    const k = cacheKey(selectedGame, metric, window, stakeTier, kind);
    const cached = readBoardCache(k);
    if (cached) {
      setPlayers(cached.players);
      setTotals(cached.totals);
      if (cached.claimSnsUrl) setClaimSnsUrl(cached.claimSnsUrl);
      setLastFetchedAt(cached.at);
      setHydratedFromCache(true);
      setLoading(false);
    } else {
      setPlayers([]);
      setTotals(null);
      setLoading(true);
      setHydratedFromCache(false);
    }

    let cancelled = false;
    const fetchData = async () => {
      const qs = new URLSearchParams({
        game: selectedGame,
        metric,
        window,
        stakeTier,
        kind,
        ...(metric === "winrate" ? { minMatches: "5" } : {}),
      }).toString();
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(`${RESOLVER}/leaderboard/unified?${qs}`, {
          signal: ctrl.signal,
        });
        const data = await r.json();
        if (cancelled) return;
        if (data.ok) {
          const nextPlayers: Player[] = data.players || [];
          const nextTotals: LeaderboardTotals | null = data.totals || null;
          setPlayers(nextPlayers);
          setTotals(nextTotals);
          setStale(!!data.stale);
          if (data.claimSnsUrl) setClaimSnsUrl(data.claimSnsUrl);
          const now = Date.now();
          setLastFetchedAt(now);
          setHydratedFromCache(false);
          writeBoardCache(k, {
            at: now,
            players: nextPlayers,
            totals: nextTotals,
            claimSnsUrl: data.claimSnsUrl,
          });
          // Key aliased by kind — `k` is per-combo so switching tabs is instant.
        }
      } catch {
        // Leave cached data in place on fetch failure.
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedGame, metric, window, stakeTier, kind]);

  const hasData = players.length > 0 || totals !== null;
  const showSkeleton = loading && !hasData;

  const podium = players.slice(0, 3);
  const rest = players.slice(3);
  const showElo = selectedGame !== "all";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050508",
        color: "#e8e8f0",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Nav */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 24px",
          borderBottom: "1px solid #252540",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              fontSize: 24,
              fontWeight: 900,
              fontStyle: "italic",
              background: "linear-gradient(135deg, #9945FF, #14F195)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              paddingRight: 8,
              display: "inline-block",
            }}
          >
            GAMERPLEX
          </Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <SiteNav
          links={[
            { href: "/#featured", label: "Play" },
            { href: "/docs", label: "Build" },
            { href: "/leaderboard", label: "Leaderboard", active: true },
            { href: "/profile", label: "Profile" },
          ]}
        />
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* Hero title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontSize: 48,
              fontWeight: 800,
              margin: 0,
              background: "linear-gradient(135deg, #9945FF, #14F195)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              lineHeight: 1.05,
            }}
          >
            Leaderboard
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "#a8a8c0",
              margin: "8px 0 0",
              maxWidth: 780,
              lineHeight: 1.5,
            }}
          >
            Rankings derived directly from CM v2.1{" "}
            <code style={{ color: "#c99aff" }}>MarketResolvedV2</code> events
            on Solana. Every match, win, and net P&amp;L is independently
            verifiable — the resolver is a cache, not a source of truth.
          </p>
        </div>

        {/* Stat strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <StatCard
            label="Resolved matches"
            value={totals ? totals.matches.toLocaleString() : null}
            accent="#14F195"
            loading={showSkeleton}
          />
          <StatCard
            label="Pool volume"
            value={totals ? fmtUsdf(totals.totalPotRaw) : null}
            accent="#9945FF"
            loading={showSkeleton}
          />
          <StatCard
            label="Treasury collected"
            value={totals ? fmtUsdf(totals.treasuryRaw) : null}
            accent="#ffd740"
            loading={showSkeleton}
          />
          <StatCard
            label="PoolBacker inflow"
            value={totals ? fmtUsdf(totals.poolBackerRaw) : null}
            accent="#00e676"
            loading={showSkeleton}
          />
        </div>

        {/* Freshness indicator */}
        {(hydratedFromCache || loading) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
              fontSize: 12,
              color: "#8a8aa0",
            }}
          >
            {loading && !hasData ? (
              <>
                <Spinner />
                <span>Indexing CM v2.1 events from devnet…</span>
              </>
            ) : hydratedFromCache && loading ? (
              <>
                <Spinner />
                <span>
                  Showing cached rankings · fetching update from indexer…
                </span>
              </>
            ) : null}
          </div>
        )}

        {/* Humans / Bots / All tabs — humans is the default board. Bots are
            registered agents (house + third-party). See /bots and
            /docs/agents for the registration contract. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {KINDS.map((k) => {
            const active = kind === k.id;
            return (
              <button
                key={k.id}
                onClick={() => setKind(k.id as "human" | "bot" | "all")}
                title={k.hint}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: active ? "#14F195" : "#0c0c14",
                  color: active ? "#050508" : "#a8a8c0",
                  border: `1px solid ${active ? "#14F195" : "#252540"}`,
                  fontFamily: "'Space Grotesk', sans-serif",
                  transition: "all 0.15s",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {k.label}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "#6a6a80", marginLeft: 4 }}>
            Default is Humans · see{" "}
            <Link href="/bots" style={{ color: "#9945FF", textDecoration: "underline" }}>
              /bots
            </Link>{" "}
            for the registered agent directory
          </span>
        </div>

        {/* Game tabs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              style={{
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 8,
                cursor: "pointer",
                background: selectedGame === g.id ? "#9945FF" : "#14141f",
                color: selectedGame === g.id ? "white" : "#a8a8c0",
                border: `1px solid ${
                  selectedGame === g.id ? "#9945FF" : "#252540"
                }`,
                fontFamily: "'Space Grotesk', sans-serif",
                transition: "all 0.15s",
              }}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>

        {/* Filter pills */}
        <div
          style={{
            display: "flex",
            gap: 18,
            marginBottom: 24,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <FilterGroup label="Sort by" color="#9945FF">
            {METRICS.filter(
              (m) => m.appliesTo === "any" || selectedGame !== "all"
            ).map((m) => (
              <Pill
                key={m.id}
                active={metric === m.id}
                activeColor="#9945FF"
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </Pill>
            ))}
          </FilterGroup>
          <FilterGroup label="Window" color="#14F195">
            {WINDOWS.map((w) => (
              <Pill
                key={w.id}
                active={window === w.id}
                activeColor="#14F195"
                onClick={() => setWindow(w.id)}
              >
                {w.label}
              </Pill>
            ))}
          </FilterGroup>
          <FilterGroup label="Stakes" color="#ffd740">
            {STAKE_TIERS.map((t) => (
              <Pill
                key={t.id}
                active={stakeTier === t.id}
                activeColor="#ffd740"
                onClick={() => setStakeTier(t.id)}
              >
                {t.label}
              </Pill>
            ))}
          </FilterGroup>
        </div>

        {/* Podium (top 3) */}
        {showSkeleton ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              marginBottom: 20,
            }}
          >
            {[0, 1, 2].map((i) => (
              <PodiumSkeleton key={i} rank={i} />
            ))}
          </div>
        ) : (
          podium.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
                marginBottom: 20,
              }}
            >
              {podium.map((p, i) => (
                <PodiumCard
                  key={p.wallet}
                  player={p}
                  rank={i}
                  showElo={showElo}
                />
              ))}
            </div>
          )
        )}

        {/* Table — rest */}
        {rest.length > 0 && (
          <div
            style={{
              background: "#0c0c14",
              borderRadius: 14,
              border: "1px solid #252540",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: showElo
                  ? "60px 1.6fr 80px 90px 80px 80px 120px 120px"
                  : "60px 1.6fr 90px 80px 80px 120px 120px",
                padding: "14px 20px",
                borderBottom: "1px solid #252540",
                fontSize: 11,
                color: "#8a8aa0",
                textTransform: "uppercase",
                letterSpacing: 1.3,
                fontWeight: 700,
                background: "#0a0a12",
              }}
            >
              <div>#</div>
              <div>Player</div>
              {showElo && <div style={{ textAlign: "center" }}>ELO</div>}
              <div style={{ textAlign: "center" }}>W / L</div>
              <div style={{ textAlign: "center" }}>Win %</div>
              <div style={{ textAlign: "center" }}>Streak</div>
              <div style={{ textAlign: "right" }}>Pool</div>
              <div style={{ textAlign: "right" }}>Net P&amp;L</div>
            </div>
            {rest.map((p, idx) => {
              const i = idx + 3;
              const winRate =
                p.winRate ??
                (p.wins + (p.losses || 0) > 0
                  ? Math.round((p.wins / (p.wins + (p.losses || 0))) * 100)
                  : 0);
              const pnlN = p.netPnl ? Number(BigInt(p.netPnl)) / 1e6 : 0;
              return (
                <div
                  key={p.wallet}
                  style={{
                    display: "grid",
                    gridTemplateColumns: showElo
                      ? "60px 1.6fr 80px 90px 80px 80px 120px 120px"
                      : "60px 1.6fr 90px 80px 80px 120px 120px",
                    padding: "16px 20px",
                    borderBottom: "1px solid #1a1a28",
                    alignItems: "center",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#14141f")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#6a6a80",
                      fontFamily: "monospace",
                    }}
                  >
                    {i + 1}
                  </div>
                  <PlayerCell p={p} />
                  {showElo && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 18,
                        fontWeight: 800,
                        color:
                          (p.elo ?? 0) >= 2400
                            ? "#ffd740"
                            : (p.elo ?? 0) >= 1800
                            ? "#e8e8f0"
                            : "#a8a8c0",
                        fontFamily: "monospace",
                      }}
                    >
                      {p.elo ?? "—"}
                    </div>
                  )}
                  <div style={{ textAlign: "center", fontSize: 14 }}>
                    <span style={{ color: "#00e676", fontWeight: 700 }}>
                      {p.wins}
                    </span>
                    <span style={{ color: "#3a3a50" }}> / </span>
                    <span style={{ color: "#ff5252", fontWeight: 700 }}>
                      {p.losses}
                    </span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color:
                          winRate >= 60
                            ? "#00e676"
                            : winRate >= 40
                            ? "#e8e8f0"
                            : "#ff5252",
                      }}
                    >
                      {winRate}%
                    </span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {(() => {
                      const s = p.currentStreak ?? 0;
                      if (s >= 3)
                        return (
                          <span
                            style={{
                              color: "#ffd740",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            {s}🔥
                          </span>
                        );
                      if (s <= -3)
                        return (
                          <span
                            style={{
                              color: "#ff5252",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            {s}
                          </span>
                        );
                      return (
                        <span
                          style={{ color: "#6a6a80", fontWeight: 600, fontSize: 14 }}
                        >
                          {s || 0}
                        </span>
                      );
                    })()}
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 13,
                      color: "#a8a8c0",
                      fontFamily: "monospace",
                    }}
                  >
                    {fmtUsdf(p.usdfWagered)}
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 15,
                      fontWeight: 700,
                      color:
                        pnlN > 0 ? "#00e676" : pnlN < 0 ? "#ff5252" : "#a8a8c0",
                      fontFamily: "monospace",
                    }}
                  >
                    {fmtUsdf(p.netPnl, true)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state (only when loading is complete and still zero players) */}
        {!showSkeleton && players.length === 0 && (
          <div
            style={{
              background: "#0c0c14",
              border: "1px dashed #252540",
              borderRadius: 14,
              padding: 56,
              textAlign: "center",
              color: "#6a6a80",
            }}
          >
            <div style={{ fontSize: 38, marginBottom: 10 }}>🏁</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#a8a8c0" }}>
              No matches yet
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Play a match to appear on the board.
            </div>
          </div>
        )}

        {/* Stale warning */}
        {stale && totals && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "#2a1406",
              border: "1px solid #ff6b2c",
              borderRadius: 8,
              fontSize: 12,
              color: "#ffb380",
            }}
          >
            ⚠ Indexer cache is stale. Numbers will refresh shortly.
          </div>
        )}

        {/* SNS CTA */}
        <div
          style={{
            marginTop: 28,
            padding: "18px 22px",
            borderRadius: 12,
            border: "1px solid #252540",
            background:
              "linear-gradient(135deg, rgba(153,69,255,0.10), rgba(20,241,149,0.05))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, color: "#d4d4e8", lineHeight: 1.5 }}>
            <span style={{ color: "#14F195", fontWeight: 700 }}>
              Want your name on the board?
            </span>{" "}
            Register a <code style={{ color: "#14F195" }}>.sol</code> domain
            and set it as your primary — we&apos;ll surface it automatically.
          </div>
          <a
            href={claimSnsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "linear-gradient(135deg, #9945FF, #14F195)",
              color: "#000",
              padding: "10px 22px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Claim your .sol →
          </a>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 11,
            color: "#55556a",
          }}
        >
          <div>
            Derived from CM v2.1 <code>MarketResolvedV2</code> · ELO K=32 ·
            SNS via Bonfida v3 (ASCII-only, anti-homograph)
          </div>
          <Link
            href="/play/magic-chess"
            style={{
              background: "linear-gradient(135deg, #ff6b2c, #ffd740)",
              color: "#000",
              padding: "10px 22px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Play Chess →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Small building blocks ───────────────────────────────────────────── */

function StatCard({
  label,
  value,
  accent,
  loading = false,
}: {
  label: string;
  value: string | number | null;
  accent: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        padding: "18px 20px",
        background: "#0c0c14",
        border: "1px solid #252540",
        borderRadius: 12,
        boxShadow: `inset 0 -2px 0 ${accent}40`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#8a8aa0",
          letterSpacing: 1.3,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {loading && value === null ? (
        <ShimmerBar width={110} height={30} />
      ) : (
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: accent,
            fontFamily: "monospace",
            lineHeight: 1,
          }}
        >
          {value ?? "—"}
        </div>
      )}
    </div>
  );
}

function ShimmerBar({
  width,
  height,
}: {
  width: number | string;
  height: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, #1a1a2a 0%, #2a2a40 50%, #1a1a2a 100%)",
        backgroundSize: "200% 100%",
        animation: "gp-shimmer 1.4s ease-in-out infinite",
      }}
    />
  );
}

function Spinner() {
  return (
    <>
      <span
        style={{
          width: 12,
          height: 12,
          border: "2px solid #2a2a40",
          borderTopColor: "#9945FF",
          borderRadius: "50%",
          display: "inline-block",
          animation: "gp-spin 0.9s linear infinite",
        }}
      />
      <style>{`
        @keyframes gp-spin { to { transform: rotate(360deg); } }
        @keyframes gp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </>
  );
}

function PodiumSkeleton({ rank }: { rank: number }) {
  const accent = rank === 0 ? "#ffd740" : rank === 1 ? "#c0c0c0" : "#cd7f32";
  return (
    <div
      style={{
        padding: "20px 22px",
        background: "#0c0c14",
        border: `1px solid ${accent}40`,
        borderRadius: 14,
        boxShadow: `inset 0 -3px 0 ${accent}80`,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 32, opacity: 0.5 }}>
          {rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}
        </span>
        <span
          style={{
            fontSize: 11,
            color: accent,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          Rank #{rank + 1}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "#1a1a2a",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ShimmerBar width={120} height={14} />
          <ShimmerBar width={80} height={10} />
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <ShimmerBar width={40} height={8} />
            <ShimmerBar width={60} height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span
        style={{
          color,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginRight: 4,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Pill({
  active,
  activeColor,
  onClick,
  children,
}: {
  active: boolean;
  activeColor: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 6,
        cursor: "pointer",
        background: active ? `${activeColor}22` : "transparent",
        color: active ? activeColor : "#a8a8c0",
        border: `1px solid ${active ? activeColor : "#252540"}`,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function PodiumCard({
  player,
  rank,
  showElo,
}: {
  player: Player;
  rank: number;
  showElo: boolean;
}) {
  const accent =
    rank === 0 ? "#ffd740" : rank === 1 ? "#c0c0c0" : "#cd7f32";
  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉";
  const pnlN = player.netPnl ? Number(BigInt(player.netPnl)) / 1e6 : 0;
  const winRate =
    player.winRate ??
    (player.wins + (player.losses || 0) > 0
      ? Math.round(
          (player.wins / (player.wins + (player.losses || 0))) * 100
        )
      : 0);
  return (
    <div
      style={{
        padding: "20px 22px",
        background: "#0c0c14",
        border: `1px solid ${accent}60`,
        borderRadius: 14,
        boxShadow: `0 0 22px ${accent}20, inset 0 -3px 0 ${accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 32 }}>{medal}</span>
        <span
          style={{
            fontSize: 11,
            color: accent,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          Rank #{rank + 1}
        </span>
      </div>
      <PlayerCell p={player} big />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: showElo ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
          gap: 8,
          fontSize: 11,
        }}
      >
        {showElo && (
          <MiniStat
            label="ELO"
            value={player.elo ?? "—"}
            color="#e8e8f0"
          />
        )}
        <MiniStat
          label="W/L"
          value={`${player.wins}/${player.losses}`}
          color="#e8e8f0"
        />
        <MiniStat
          label="Win %"
          value={`${winRate}%`}
          color={
            winRate >= 60 ? "#00e676" : winRate >= 40 ? "#e8e8f0" : "#ff5252"
          }
        />
        <MiniStat
          label="Net P&L"
          value={fmtUsdf(player.netPnl, true)}
          color={pnlN > 0 ? "#00e676" : pnlN < 0 ? "#ff5252" : "#a8a8c0"}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#6a6a80",
          letterSpacing: 1.1,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color,
          fontFamily: "monospace",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PlayerCell({ p, big = false }: { p: Player; big?: boolean }) {
  const avatarSize = big ? 44 : 36;
  const nameSize = big ? 16 : 14;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: "50%",
          background: `hsl(${(p.wallet.charCodeAt(0) * 37) % 360}, 62%, 46%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: big ? 20 : 16,
          fontWeight: 800,
          color: "white",
          flexShrink: 0,
        }}
      >
        {(p.snsDomain?.[0] || p.name?.[0] || "?").toUpperCase()}
      </div>
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div
          style={{
            fontSize: nameSize,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#f0f0ff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {p.snsDomain ? (
            <a
              href={`https://www.sns.id/profile/${p.snsDomain.replace(
                /\.sol$/,
                ""
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#14F195",
                textDecoration: "none",
                fontWeight: 800,
              }}
              title="Solana Name Service domain"
            >
              {p.snsDomain}
            </a>
          ) : (
            <span>{p.name || truncWallet(p.wallet)}</span>
          )}
          {p.verified && (
            <span
              style={{ color: "#00e676", fontSize: 12 }}
              title="Registered Gamerplex agent"
            >
              ✓
            </span>
          )}
          {p.kind === "stockfish-chess" && (
            <span
              style={{
                color: "#9945FF",
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 6px",
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
            fontSize: 11,
            color: "#6a6a80",
            fontFamily: "monospace",
            marginTop: 2,
          }}
        >
          {truncWallet(p.wallet)}
        </div>
      </div>
    </div>
  );
}
