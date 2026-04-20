"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

// Unified leaderboard Player shape — matches /leaderboard/unified from resolver.
// Stats are derived from CM v2.1 MarketResolvedV2 events on-chain, so every
// wager, win, and net P&L is verifiable from Solana block history.
interface Player {
  wallet: string;
  name: string;
  /** Primary .sol domain (Bonfida SNS, ASCII-safe only — mixed-script rejected backend-side). */
  snsDomain?: string | null;
  kind?: "stockfish-chess" | "ollama" | "human" | "unknown";
  /** True only for wallets in our local agent registry. NOT set by SNS presence. */
  verified?: boolean;
  elo: number | null;
  matches?: number;
  wins: number;
  losses: number;
  draws?: number;
  winRate?: number;
  // USDF raw (6 decimals). Convert with Number(x) / 1e6 for dollars.
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
  poolSponsorRaw: string;
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
  { id: "elo", label: "ELO", appliesTo: "game" }, // per-game only; hidden on Overall
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

// Format raw USDF (6 decimals) to dollar string
function fmtUsdf(raw?: string, signed = false): string {
  if (!raw) return "$0.00";
  const n = Number(BigInt(raw)) / 1e6;
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

export default function LeaderboardPage() {
  const [selectedGame, setSelectedGame] = useState("all");
  const [metric, setMetric] = useState("pnl");
  const [window, setWindow] = useState("all");
  const [stakeTier, setStakeTier] = useState("any");
  const [players, setPlayers] = useState<Player[]>([]);
  const [totals, setTotals] = useState<LeaderboardTotals | null>(null);
  const [claimSnsUrl, setClaimSnsUrl] = useState("https://www.sns.id/search");
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);

  // If the user switches to Overall, ELO metric doesn't make sense — fall back to P&L.
  useEffect(() => {
    if (selectedGame === "all" && metric === "elo") setMetric("pnl");
  }, [selectedGame, metric]);

  // Single source of truth: /leaderboard/unified reads CM v2.1 events on-chain.
  // Server-side filtering by game/metric/window/stakeTier — client just renders.
  useEffect(() => {
    const fetchData = (initial: boolean) => {
      if (initial) setLoading(true);
      const qs = new URLSearchParams({
        game: selectedGame,
        metric,
        window,
        stakeTier,
        ...(metric === "winrate" ? { minMatches: "5" } : {}),
      }).toString();
      fetch(`${RESOLVER}/leaderboard/unified?${qs}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setPlayers(data.players || []);
            setTotals(data.totals || null);
            setStale(!!data.stale);
            if (data.claimSnsUrl) setClaimSnsUrl(data.claimSnsUrl);
          }
        })
        .catch(() => setPlayers([]))
        .finally(() => {
          if (initial) setLoading(false);
        });
    };
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 15000);
    return () => clearInterval(interval);
  }, [selectedGame, metric, window, stakeTier]);

  const getRankColor = (i: number) => {
    if (i === 0) return "#ffd740";
    if (i === 1) return "#c0c0c0";
    if (i === 2) return "#cd7f32";
    return "#555";
  };

  const getRankEmoji = (i: number) => {
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return `${i + 1}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #252540" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 22, fontWeight: 900, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", paddingRight: 8, display: "inline-block" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12 }}>
          <Link href="/" style={{ color: "#555", textDecoration: "none" }}>Arena</Link>
          <Link href="/games" style={{ color: "#555", textDecoration: "none" }}>Arcade</Link>
          <Link href="/leaderboard" style={{ color: "#9945FF", textDecoration: "none", fontWeight: 600 }}>Leaderboard</Link>
          <Link href="/activity" style={{ color: "#555", textDecoration: "none" }}>Activity</Link>
          <Link href="/docs" style={{ color: "#555", textDecoration: "none" }}>Docs</Link>
          <a href="https://x.com/gamerplex_com" target="_blank" rel="noopener noreferrer" style={{ color: "#555", display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
        {/* Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Leaderboard</h1>
            <p style={{ fontSize: 12, color: "#555" }}>On-chain rankings powered by SOAR &bull; ELO-rated &bull; Updated every match</p>
          </div>
          <div style={{ fontSize: 11, color: "#333", textAlign: "right" }}>
            <div>Stored on Solana via SOAR</div>
            <div>Rankings can never be tampered</div>
          </div>
        </div>

        {/* Game tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {GAMES.map(g => (
            <button key={g.id} onClick={() => setSelectedGame(g.id)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: selectedGame === g.id ? "#9945FF" : "#14141f",
              color: selectedGame === g.id ? "white" : "#555",
              border: `1px solid ${selectedGame === g.id ? "#9945FF" : "#252540"}`,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>{g.emoji} {g.label}</button>
          ))}
        </div>

        {/* Filter pills — metric / window / stake-tier */}
        <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ color: "#555", marginRight: 4, alignSelf: "center" }}>Sort by:</span>
            {METRICS.filter(m => m.appliesTo === "any" || selectedGame !== "all").map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)} style={{
                padding: "3px 9px", fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                background: metric === m.id ? "#9945FF22" : "transparent",
                color: metric === m.id ? "#c99aff" : "#777",
                border: `1px solid ${metric === m.id ? "#9945FF" : "#252540"}`,
              }}>{m.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ color: "#555", marginRight: 4, alignSelf: "center" }}>Window:</span>
            {WINDOWS.map(w => (
              <button key={w.id} onClick={() => setWindow(w.id)} style={{
                padding: "3px 9px", fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                background: window === w.id ? "#14F19522" : "transparent",
                color: window === w.id ? "#14F195" : "#777",
                border: `1px solid ${window === w.id ? "#14F195" : "#252540"}`,
              }}>{w.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ color: "#555", marginRight: 4, alignSelf: "center" }}>Stakes:</span>
            {STAKE_TIERS.map(t => (
              <button key={t.id} onClick={() => setStakeTier(t.id)} style={{
                padding: "3px 9px", fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                background: stakeTier === t.id ? "#ffd74022" : "transparent",
                color: stakeTier === t.id ? "#ffd740" : "#777",
                border: `1px solid ${stakeTier === t.id ? "#ffd740" : "#252540"}`,
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "#0c0c14", borderRadius: 12, border: "1px solid #252540", overflow: "hidden" }}>
          {/* Header row */}
          {totals && totals.matches > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: "1px solid #252540",
                fontSize: 11,
                color: "#888",
                background: "#0a0a12",
              }}
            >
              <div>
                <span style={{ color: "#9945FF", fontWeight: 700 }}>{totals.matches}</span> matches
                &nbsp;·&nbsp;
                <span style={{ color: "#14F195" }}>{fmtUsdf(totals.totalPotRaw)}</span> volume
              </div>
              <div>
                Treasury <span style={{ color: "#ffd740" }}>{fmtUsdf(totals.treasuryRaw)}</span>
                &nbsp;·&nbsp;
                Pool <span style={{ color: "#00e676" }}>{fmtUsdf(totals.poolSponsorRaw)}</span>
                {stale && (
                  <span style={{ color: "#ff1744", marginLeft: 8 }} title="stale cache">⚠ stale</span>
                )}
              </div>
            </div>
          )}

          {(() => {
            const showElo = selectedGame !== "all";
            const cols = showElo
              ? "50px 1fr 70px 70px 70px 70px 90px 100px"
              : "50px 1fr 70px 70px 70px 90px 100px";
            return (
              <>
                <div style={{
                  display: "grid", gridTemplateColumns: cols,
                  padding: "10px 16px", borderBottom: "1px solid #252540",
                  fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700,
                }}>
                  <div>Rank</div>
                  <div>Player</div>
                  {showElo && <div style={{ textAlign: "center" }}>ELO</div>}
                  <div style={{ textAlign: "center" }}>W/L</div>
                  <div style={{ textAlign: "center" }}>Win %</div>
                  <div style={{ textAlign: "center" }}>Streak</div>
                  <div style={{ textAlign: "center" }}>Wagered</div>
                  <div style={{ textAlign: "right" }}>Net P&amp;L</div>
                </div>
              </>
            );
          })()}

          {/* Unified list: all wallets that have a CM v2.1 MarketResolvedV2 event.
              Sorted by net P&L descending — ELO is secondary. */}
          {players.map((p, i) => {
            const winRate =
              p.winRate ??
              ((p.wins + (p.losses || 0)) > 0
                ? Math.round((p.wins / (p.wins + (p.losses || 0))) * 100)
                : 0);
            const pnlN = p.netPnl ? Number(BigInt(p.netPnl)) / 1e6 : 0;
            return (
              <div
                key={p.wallet}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    selectedGame !== "all"
                      ? "50px 1fr 70px 70px 70px 70px 90px 100px"
                      : "50px 1fr 70px 70px 70px 90px 100px",
                  padding: "12px 16px",
                  borderBottom: "1px solid #1a1a28",
                  alignItems: "center",
                  transition: "background 0.15s",
                  background: "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#14141f")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {/* Rank */}
                <div style={{ fontSize: 16, fontWeight: 700, color: getRankColor(i) }}>
                  {getRankEmoji(i)}
                </div>

                {/* Player */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: `hsl(${(p.wallet.charCodeAt(0) * 37) % 360}, 60%, 40%)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    {p.name?.[0] || "?"}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {/* Display name: SNS .sol if ASCII-safe (backend-filtered), else agent name, else truncated wallet. */}
                      {p.snsDomain ? (
                        <a
                          href={`https://www.sns.id/profile/${p.snsDomain.replace(/\.sol$/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#14F195", textDecoration: "none", fontWeight: 700 }}
                          title="Solana Name Service domain — click to view profile"
                        >
                          {p.snsDomain}
                        </a>
                      ) : (
                        p.name || p.wallet
                      )}
                      {p.verified && (
                        <span
                          style={{ color: "#00e676", fontSize: 10 }}
                          title="Registered Gamerplex agent (local registry, not SNS)"
                        >
                          ✓
                        </span>
                      )}
                      {p.kind === "stockfish-chess" && (
                        <span style={{ color: "#9945FF", fontSize: 9 }}>bot</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: "#444" }}>{p.wallet}</div>
                  </div>
                </div>

                {/* ELO — per-game only; Overall tab hides this column entirely */}
                {selectedGame !== "all" && (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: 16,
                      fontWeight: 700,
                      color:
                        (p.elo ?? 0) >= 2400
                          ? "#ffd740"
                          : (p.elo ?? 0) >= 1800
                          ? "#e8e8f0"
                          : "#888",
                    }}
                  >
                    {p.elo ?? "—"}
                  </div>
                )}

                {/* W/L */}
                <div style={{ textAlign: "center", fontSize: 12 }}>
                  <span style={{ color: "#00e676" }}>{p.wins}</span>
                  <span style={{ color: "#555" }}>/</span>
                  <span style={{ color: "#ff1744" }}>{p.losses}</span>
                </div>

                {/* Win % */}
                <div style={{ textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        winRate >= 60 ? "#00e676" : winRate >= 40 ? "#e8e8f0" : "#ff1744",
                    }}
                  >
                    {winRate}%
                  </span>
                </div>

                {/* Streak (current) — + for winning, − for losing */}
                <div style={{ textAlign: "center", fontSize: 12 }}>
                  {(() => {
                    const s = p.currentStreak ?? 0;
                    if (s >= 3)
                      return (
                        <span style={{ color: "#ffd740", fontWeight: 700 }}>
                          {s}🔥
                        </span>
                      );
                    if (s <= -3)
                      return <span style={{ color: "#ff1744", fontWeight: 700 }}>{s}</span>;
                    return <span style={{ color: "#555" }}>{s || 0}</span>;
                  })()}
                </div>

                {/* Wagered */}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: "#888",
                    fontFamily: "monospace",
                  }}
                >
                  {fmtUsdf(p.usdfWagered)}
                </div>

                {/* Net P&L */}
                <div
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 600,
                    color: pnlN > 0 ? "#00e676" : pnlN < 0 ? "#ff1744" : "#888",
                    fontFamily: "monospace",
                  }}
                >
                  {fmtUsdf(p.netPnl, true)}
                </div>
              </div>
            );
          })}

          {players.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#333" }}>
              {loading
                ? "Loading rankings from on-chain…"
                : "No resolved markets yet. Play a match to appear."}
            </div>
          )}
        </div>

        {/* SNS CTA — appear cool on the charts with your own .sol */}
        <div
          style={{
            marginTop: 16,
            padding: "14px 18px",
            borderRadius: 10,
            border: "1px solid #252540",
            background: "linear-gradient(135deg, rgba(153,69,255,0.08), rgba(20,241,149,0.04))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, color: "#c9c9e0" }}>
            <span style={{ color: "#14F195", fontWeight: 700 }}>Want your name on the leaderboard?</span>{" "}
            Register a <code style={{ color: "#14F195" }}>.sol</code> domain and set it as your
            primary — we&apos;ll surface it automatically.
          </div>
          <a
            href={claimSnsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "linear-gradient(135deg, #9945FF, #14F195)",
              color: "#000",
              padding: "8px 18px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Claim your .sol →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "#333" }}>
            Derived from CM v2.1 <code>MarketResolvedV2</code> events &bull; Solana Devnet &bull; ELO K-factor: 32 &bull;
            SNS via Bonfida (v3, ASCII-only for anti-homograph)
          </div>
          <Link href="/play/magic-chess" style={{
            background: "linear-gradient(135deg, #ff6b2c, #ffd740)", color: "#000",
            padding: "8px 20px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            textDecoration: "none",
          }}>Play Chess →</Link>
        </div>
      </div>
    </div>
  );
}
