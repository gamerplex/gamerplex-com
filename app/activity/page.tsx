"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RESOLVER =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

// Launch-stack programs — what a viewer expects to see live.
const PROGRAMS: { name: string; addr: string; tag: string; accent: string }[] = [
  {
    name: "Contention Markets v2.1",
    addr: "69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8",
    tag: "wagering",
    accent: "#9945FF",
  },
  {
    name: "Gamerplex Orchestrator",
    addr: "tsHnDDmYyqpcRyQejKcvai6fECRWyNQ4F87QgKcHg4d",
    tag: "challenges",
    accent: "#9945FF",
  },
  {
    name: "Magic Chess",
    addr: "3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr",
    tag: "game",
    accent: "#14F195",
  },
  {
    name: "Blockwords",
    addr: "3XA1rz4f83FoTyvB7g1XHhsb4bx9SrUSBDtpLtAttU4o",
    tag: "game",
    accent: "#14F195",
  },
  {
    name: "Cyber Snake",
    addr: "EK8gFE1ojW61QuLTvy6dHyLxCq5yjCnauJz8eisNPTk3",
    tag: "game",
    accent: "#14F195",
  },
  {
    name: "Flipcash",
    addr: "FLip3dQVfpeUKg5fUNfFhcHvQvG3HoXqYw5XDDx8Wo9i",
    tag: "token",
    accent: "#ffd740",
  },
  {
    name: "SOAR",
    addr: "SoarNNzwQHMwcfdkdLc6kvbkoMSxcHy89gTHrjhJYkk",
    tag: "rankings",
    accent: "#00f0ff",
  },
  {
    name: "Token Swap",
    addr: "FssSgjG97BMiHi5S2vnicQJbqoiiyLbG5Dt3E4oXM5Zf",
    tag: "swap",
    accent: "#ffd740",
  },
];

interface LiveGame {
  gamePda: string;
  gameId: number;
  moveCount: number;
  whiteTurn: boolean;
  label?: string;
}

interface OnchainActivity {
  blockTime: number;
  gameSlug: string;
  gameProgram: string;
  market: string;
  p1: string;
  p2: string;
  p1Name: string;
  p2Name: string;
  totalPotRaw: string;
  protocolFeeRaw: string;
  partnerFeeRaw: string;
  poolFeeRaw: string;
  winnerPayoutRaw: string;
  winningOutcome: number;
  winnerWallet: string | null;
  winnerName: string | null;
}

interface OnchainTotals {
  matches: number;
  volumeRaw: string;
  treasuryRaw: string;
  poolSponsorRaw: string;
  winnerPayoutRaw: string;
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

function fmtUsdf(raw: string, signed = false): string {
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
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function truncAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const CACHE_KEY = "gp.activity.v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // show cached for up to 5 minutes stamped

interface CachedActivity {
  at: number;
  onchain: OnchainActivity[];
  onchainTotals: OnchainTotals | null;
  totalsByKind: TotalsByKind | null;
  liveGames: LiveGame[];
}

function readCache(): CachedActivity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedActivity;
    if (!parsed.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(c: CachedActivity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}

export default function ActivityPage() {
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [onchain, setOnchain] = useState<OnchainActivity[]>([]);
  const [onchainTotals, setOnchainTotals] = useState<OnchainTotals | null>(
    null
  );
  const [totalsByKind, setTotalsByKind] = useState<TotalsByKind | null>(null);
  const [kind, setKind] = useState<"human" | "bot" | "all">("human");
  // "loading" = fetching AND no prior data (cached or fresh) available.
  // Once we have data (cache or fresh), we show it; background refreshes
  // silently swap in updated numbers.
  const [loading, setLoading] = useState(true);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(0);

  // Hydrate from localStorage on first mount — instant render even before RPC.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setOnchain(cached.onchain);
      setOnchainTotals(cached.onchainTotals);
      setTotalsByKind(cached.totalsByKind || null);
      setLiveGames(cached.liveGames);
      setLastFetchedAt(cached.at);
      setHydratedFromCache(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const [act, live] = await Promise.all([
          fetch(`${RESOLVER}/activity/onchain?limit=50&kind=${kind}`)
            .then((r) => r.json())
            .catch(() => null),
          fetch(`${RESOLVER}/game-pool/live`)
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (cancelled) return;
        const nextOnchain: OnchainActivity[] =
          act && act.ok ? act.activity || [] : [];
        const nextTotals: OnchainTotals | null =
          act && act.ok ? act.totals || null : null;
        const nextByKind: TotalsByKind | null =
          act && act.ok ? act.totalsByKind || null : null;
        const nextLive: LiveGame[] = live && live.ok ? live.games || [] : [];
        // Only overwrite state with fresh data if we actually got a real
        // response. A failed fetch shouldn't wipe out cached data.
        if (act && act.ok) {
          setOnchain(nextOnchain);
          setOnchainTotals(nextTotals);
          setTotalsByKind(nextByKind);
        }
        if (live && live.ok) {
          setLiveGames(nextLive);
        }
        if ((act && act.ok) || (live && live.ok)) {
          const now = Date.now();
          setLastFetchedAt(now);
          setHydratedFromCache(false);
          writeCache({
            at: now,
            onchain: act && act.ok ? nextOnchain : onchain,
            onchainTotals: act && act.ok ? nextTotals : onchainTotals,
            totalsByKind: act && act.ok ? nextByKind : totalsByKind,
            liveGames: live && live.ok ? nextLive : liveGames,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const hasData = onchainTotals !== null || onchain.length > 0;
  const showStaleBadge =
    hydratedFromCache && Date.now() - lastFetchedAt > CACHE_TTL_MS;
  const showSkeleton = loading && !hasData;

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
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <Link href="/" style={{ color: "#8a8aa0", textDecoration: "none" }}>
            Arena
          </Link>
          <Link
            href="/arcade"
            style={{ color: "#8a8aa0", textDecoration: "none" }}
          >
            Arcade
          </Link>
          <Link
            href="/games"
            style={{ color: "#8a8aa0", textDecoration: "none" }}
          >
            Tournaments
          </Link>
          <Link
            href="/leaderboard"
            style={{ color: "#8a8aa0", textDecoration: "none" }}
          >
            Leaderboard
          </Link>
          <Link
            href="/activity"
            style={{
              color: "#c99aff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Activity
          </Link>
          <Link
            href="/docs"
            style={{ color: "#8a8aa0", textDecoration: "none" }}
          >
            Docs
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* Hero */}
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
            Activity
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
            Every resolved match on-chain — reads{" "}
            <code style={{ color: "#c99aff" }}>MarketResolvedV2</code> events
            from Contention Markets v2.1 directly. Anyone can reproduce this
            by scanning the program themselves.
          </p>
        </div>

        {/* Humans / Bots / All tabs — humans default. Registered agents (house
            + third-party via GAMERPLEX-SKILLS.md) are tagged `bot` and live in
            their own bucket for transparency. See /bots for the registry. */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 14,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {(["human", "bot", "all"] as const).map((k) => {
            const label = k === "human" ? "Humans" : k === "bot" ? "Bots" : "All";
            const active = kind === k;
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: active ? "#14F195" : "#0c0c14",
                  color: active ? "#050508" : "#a8a8c0",
                  border: `1px solid ${active ? "#14F195" : "#252540"}`,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "#6a6a80", marginLeft: 4 }}>
            Default Humans · registered agents live at{" "}
            <Link href="/bots" style={{ color: "#9945FF", textDecoration: "underline" }}>
              /bots
            </Link>
          </span>
        </div>

        {/* Stat strip — scoped to selected kind bucket */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 10,
          }}
        >
          <StatCard
            label={kind === "human" ? "Human matches" : kind === "bot" ? "Bot matches" : "All matches"}
            value={(() => {
              if (!totalsByKind) {
                return onchainTotals ? onchainTotals.matches.toLocaleString() : null;
              }
              if (kind === "human") return totalsByKind.humanOnly.matches.toLocaleString();
              if (kind === "bot") return (totalsByKind.botOnly.matches + totalsByKind.humanVsBot.matches).toLocaleString();
              return (onchainTotals ? onchainTotals.matches : 0).toLocaleString();
            })()}
            accent="#14F195"
            loading={showSkeleton}
          />
          <StatCard
            label="Volume wagered"
            value={(() => {
              if (!totalsByKind) {
                return onchainTotals ? fmtUsdf(onchainTotals.volumeRaw) : null;
              }
              if (kind === "human") return fmtUsdf(totalsByKind.humanOnly.volumeRaw);
              if (kind === "bot") return fmtUsdf(totalsByKind.botOnly.volumeRaw);
              return onchainTotals ? fmtUsdf(onchainTotals.volumeRaw) : "$0.00";
            })()}
            accent="#9945FF"
            loading={showSkeleton}
          />
          <StatCard
            label="Treasury collected"
            value={(() => {
              if (!totalsByKind) {
                return onchainTotals ? fmtUsdf(onchainTotals.treasuryRaw) : null;
              }
              if (kind === "human") return fmtUsdf(totalsByKind.humanOnly.treasuryRaw);
              if (kind === "bot") return fmtUsdf(totalsByKind.botOnly.treasuryRaw);
              return onchainTotals ? fmtUsdf(onchainTotals.treasuryRaw) : "$0.00";
            })()}
            accent="#ffd740"
            loading={showSkeleton}
          />
          <StatCard
            label="ER live games"
            value={liveGames.length}
            accent="#00f0ff"
            loading={showSkeleton}
          />
        </div>

        {/* Disclosure line when viewing humans-only — show bot-seed float so
            we never report a misleading headline number. */}
        {kind === "human" && totalsByKind && (
          <div style={{ fontSize: 11, color: "#8a8aa0", marginBottom: 26 }}>
            + {totalsByKind.botOnly.matches + totalsByKind.humanVsBot.matches} bot-seed matches ({fmtUsdf(totalsByKind.botOnly.volumeRaw)} volume ·{" "}
            {fmtUsdf(totalsByKind.botOnly.treasuryRaw)} treasury) · see{" "}
            <Link href="/bots" style={{ color: "#9945FF" }}>/bots</Link>
          </div>
        )}
        {kind !== "human" && <div style={{ marginBottom: 16 }} />}

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
                  Showing cached data · fetching update from indexer…
                </span>
              </>
            ) : showStaleBadge ? (
              <>
                <span style={{ color: "#ff9a40" }}>●</span>
                <span>
                  Showing cached data from{" "}
                  {Math.round((Date.now() - lastFetchedAt) / 60000)}m ago
                </span>
              </>
            ) : null}
          </div>
        )}

        {/* Live Games */}
        {liveGames.length > 0 && (
          <>
            <SectionHeader
              title="🟢 Live games"
              subtitle="Agents playing right now on MagicBlock ER"
            />
            <Table
              cols="1.2fr 120px 90px 1fr 100px"
              header={["Match", "Turn", "Move #", "Game PDA", "Explorer"]}
            >
              {liveGames.map((g) => (
                <TableRow
                  key={g.gamePda}
                  cols="1.2fr 120px 90px 1fr 100px"
                >
                  <Cell>
                    <span style={{ color: "#e8e8f0", fontWeight: 600 }}>
                      {g.label || "Chess Match"}
                    </span>
                  </Cell>
                  <Cell>
                    <span
                      style={{
                        color: g.whiteTurn ? "#e8e8f0" : "#a8a8c0",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {g.whiteTurn ? "⚪ White" : "⚫ Black"}
                    </span>
                  </Cell>
                  <Cell>
                    <span
                      style={{
                        color: "#c99aff",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    >
                      {g.moveCount}
                    </span>
                  </Cell>
                  <Cell>
                    <code
                      style={{
                        fontSize: 12,
                        color: "#a8a8c0",
                        fontFamily: "monospace",
                      }}
                    >
                      {truncAddr(g.gamePda)}
                    </code>
                  </Cell>
                  <Cell>
                    <a
                      href={`https://explorer.solana.com/address/${g.gamePda}?cluster=custom&customUrl=${encodeURIComponent(
                        "https://devnet.magicblock.app"
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#4fa0ff",
                        fontSize: 12,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      View ↗
                    </a>
                  </Cell>
                </TableRow>
              ))}
            </Table>
            <div style={{ height: 28 }} />
          </>
        )}

        {/* Wagered Matches */}
        <SectionHeader
          title="💰 Wagered matches"
          subtitle={`Every CM v2.1 MarketResolvedV2 event — newest first${
            onchain.length ? ` · showing ${onchain.length}` : ""
          }`}
        />
        {showSkeleton ? (
          <TableSkeleton
            cols="110px 100px 1.5fr 100px 1fr 120px 100px"
            rows={6}
            header={[
              "When",
              "Game",
              "Match",
              "Pot",
              "Result",
              "Winner +$",
              "Tx",
            ]}
          />
        ) : onchain.length === 0 ? (
          <EmptyState
            emoji="📡"
            title="No resolved markets indexed yet"
            subtitle="Play a match to appear. Indexer scans every 30s."
          />
        ) : (
          <Table
            cols="110px 100px 1.5fr 100px 1fr 120px 100px"
            header={[
              "When",
              "Game",
              "Match",
              "Pot",
              "Result",
              "Winner +$",
              "Tx",
            ]}
          >
            {onchain.map((a) => {
              const winnerPayoutRaw = BigInt(a.winnerPayoutRaw);
              const wager = BigInt(a.totalPotRaw) / BigInt(2);
              const winnerGain = winnerPayoutRaw - wager;
              const isDraw =
                a.winningOutcome === 255 || a.winningOutcome === null;
              return (
                <TableRow
                  key={a.market}
                  cols="110px 100px 1.5fr 100px 1fr 120px 100px"
                >
                  <Cell>
                    <span style={{ color: "#a8a8c0", fontSize: 13 }}>
                      {timeAgo(a.blockTime)}
                    </span>
                  </Cell>
                  <Cell>
                    <span
                      style={{
                        color: "#c99aff",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        fontSize: 11,
                        fontWeight: 800,
                        background: "#1a0d30",
                        padding: "4px 8px",
                        borderRadius: 5,
                        border: "1px solid #3a1a60",
                      }}
                    >
                      {a.gameSlug}
                    </span>
                  </Cell>
                  <Cell>
                    <span style={{ fontSize: 13, color: "#e8e8f0" }}>
                      <span
                        style={{
                          color:
                            a.winningOutcome === 0 ? "#00e676" : "#a8a8c0",
                          fontWeight: a.winningOutcome === 0 ? 700 : 500,
                        }}
                      >
                        {a.p1Name}
                      </span>
                      <span style={{ color: "#55556a", margin: "0 6px" }}>
                        vs
                      </span>
                      <span
                        style={{
                          color:
                            a.winningOutcome === 1 ? "#00e676" : "#a8a8c0",
                          fontWeight: a.winningOutcome === 1 ? 700 : 500,
                        }}
                      >
                        {a.p2Name}
                      </span>
                    </span>
                  </Cell>
                  <Cell>
                    <span
                      style={{
                        fontSize: 13,
                        color: "#14F195",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    >
                      {fmtUsdf(a.totalPotRaw)}
                    </span>
                  </Cell>
                  <Cell>
                    {isDraw ? (
                      <span
                        style={{
                          color: "#a8a8c0",
                          fontSize: 11,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          background: "#1a1a28",
                          padding: "4px 10px",
                          borderRadius: 5,
                          border: "1px solid #3a3a50",
                        }}
                      >
                        DRAW
                      </span>
                    ) : (
                      <span
                        style={{
                          color: "#00e676",
                          fontSize: 12,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        {a.winnerName} ✓
                      </span>
                    )}
                  </Cell>
                  <Cell>
                    <span
                      style={{
                        fontSize: 13,
                        color: isDraw ? "#55556a" : "#00e676",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    >
                      {isDraw ? "—" : fmtUsdf(winnerGain.toString(), true)}
                    </span>
                  </Cell>
                  <Cell>
                    <a
                      href={`https://explorer.solana.com/address/${a.market}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#4fa0ff",
                        fontSize: 12,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      Market ↗
                    </a>
                  </Cell>
                </TableRow>
              );
            })}
          </Table>
        )}

        {/* Programs */}
        <div style={{ height: 36 }} />
        <SectionHeader
          title="🔗 Deployed programs"
          subtitle="All on-chain contracts powering Gamerplex — devnet"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {PROGRAMS.map((p) => (
            <div
              key={p.addr}
              style={{
                padding: "16px 18px",
                background: "#0c0c14",
                border: "1px solid #252540",
                borderRadius: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = p.accent;
                e.currentTarget.style.boxShadow = `0 0 14px ${p.accent}30`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#252540";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#e8e8f0",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {p.name}
                  <span
                    style={{
                      color: p.accent,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 1.1,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      border: `1px solid ${p.accent}60`,
                      borderRadius: 4,
                    }}
                  >
                    {p.tag}
                  </span>
                </div>
                <code
                  style={{
                    fontSize: 11,
                    color: "#6a6a80",
                    fontFamily: "monospace",
                  }}
                >
                  {p.addr}
                </code>
              </div>
              <a
                href={`https://explorer.solana.com/address/${p.addr}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#4fa0ff",
                  fontSize: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                View ↗
              </a>
            </div>
          ))}
        </div>

        {/* Data source note */}
        <div
          style={{
            marginTop: 32,
            padding: "16px 22px",
            background:
              "linear-gradient(135deg, rgba(153,69,255,0.08), rgba(20,241,149,0.04))",
            border: "1px solid #252540",
            borderRadius: 12,
            fontSize: 13,
            color: "#a8a8c0",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#d0b0ff", fontSize: 14 }}>
            Data sources
          </strong>
          <br />
          The <strong style={{ color: "#e8e8f0" }}>
            Wagered matches
          </strong>{" "}
          feed reads{" "}
          <code style={{ color: "#c99aff" }}>MarketResolvedV2</code> events
          directly from Contention Markets v2.1 on Solana — anyone can
          reproduce by scanning the program themselves.{" "}
          <strong style={{ color: "#e8e8f0" }}>ER live games</strong> reads
          the resolver&apos;s cache of active chess-pool slots (UX
          convenience, not authoritative). If the resolver disappears,
          wagered matches keep resolving; only the free-play UI goes dark
          until re-hosted. See{" "}
          <Link
            href="/docs#decentralization"
            style={{
              color: "#9945FF",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Decentralization
          </Link>{" "}
          for the trust model.
        </div>
      </div>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────── */

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

function TableSkeleton({
  cols,
  rows,
  header,
}: {
  cols: string;
  rows: number;
  header: string[];
}) {
  return (
    <Table cols={cols} header={header}>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} cols={cols}>
          {header.map((_h, j) => (
            <Cell key={j}>
              <ShimmerBar
                width={j === header.length - 1 ? 60 : "78%"}
                height={14}
              />
            </Cell>
          ))}
        </TableRow>
      ))}
    </Table>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: "#e8e8f0",
          margin: 0,
          letterSpacing: 0.3,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: 13,
            color: "#8a8aa0",
            margin: "4px 0 0",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Table({
  cols,
  header,
  children,
}: {
  cols: string;
  header: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#0c0c14",
        border: "1px solid #252540",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          padding: "14px 20px",
          borderBottom: "1px solid #252540",
          fontSize: 11,
          color: "#8a8aa0",
          textTransform: "uppercase",
          letterSpacing: 1.3,
          fontWeight: 800,
          background: "#0a0a12",
        }}
      >
        {header.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
      {children}
    </div>
  );
}

function TableRow({
  cols,
  children,
}: {
  cols: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols,
        padding: "14px 20px",
        borderBottom: "1px solid #1a1a28",
        alignItems: "center",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#14141f")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function EmptyState({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        background: "#0c0c14",
        border: "1px dashed #252540",
        borderRadius: 14,
        padding: 56,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 38, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#a8a8c0" }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "#6a6a80", marginTop: 6 }}>
        {subtitle}
      </div>
    </div>
  );
}
