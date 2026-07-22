"use client";

// The web2-first arcade leaderboard (shared Arcade Shell component).
// Everyone signed-in-with-email is ranked for FREE. A run the player upgraded
// to a permanent on-chain save ($0.05) carries a "Verified" badge — the flex +
// anti-cheat proof, and the reason to pay. Liquid-glass styling: gradient
// avatars, podium medals, a glowing "you" row, mono scores. Fully responsive.

import { useEffect, useMemo, useState, useCallback } from "react";

import { maybeCelebrateBest } from "../Hype";
import { PURPLE, GREEN } from "../glass";

export type LbRow = {
  rank: number;
  userId: string;
  handle: string | null;
  score: number;
  verified: boolean;
  txSig: string | null;
  at: string;
};

// Default empty/unset → mainnet (matches lib/arcade/client.ts). Prevents a
// blank NEXT_PUBLIC_ARCADE_NETWORK from silently pointing verified-tx links at
// the devnet explorer (a 404 for a real mainnet save).
const EXPLORER = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}${(process.env.NEXT_PUBLIC_ARCADE_NETWORK || "mainnet") === "mainnet" ? "" : "?cluster=devnet"}`;

const short = (h: string | null, id: string) => h || `player_${id.slice(0, 4)}`;

export type LbGame = { id: string; label: string; emoji: string };

// ── liquid-glass tokens + micro-interactions ───────────────────────────────
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const GOLD = "#ffd740", SILVER = "#cfd6e6", BRONZE = "#e59a63";

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Deterministic gradient avatar per player — a stable visual identity.
const AV: [string, string][] = [
  [PURPLE, "#f553bf"], [GREEN, "#35e0ff"], ["#f553bf", GOLD],
  ["#35e0ff", PURPLE], [GOLD, GREEN], ["#ff7a3c", "#f553bf"],
];
function avatarGrad(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [a, b] = AV[h % AV.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const SLB_CSS = `
  @keyframes slbIn { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:none; } }
  @keyframes slbSheen { 0% { transform:translateX(-130%); } 55%,100% { transform:translateX(340%); } }
  @keyframes slbSkel { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
  .slb-row { transition:transform .14s ease, box-shadow .14s ease, filter .14s ease; animation:slbIn .34s ease both; }
  .slb-row:hover { transform:translateY(-1px); filter:brightness(1.08); }
  .slb-me { position:relative; overflow:hidden; }
  .slb-me::after { content:""; position:absolute; top:0; left:0; width:34%; height:100%; pointer-events:none;
    background:linear-gradient(100deg, transparent, rgba(255,255,255,0.16), transparent); animation:slbSheen 3.8s ease-in-out infinite; }
  .slb-seg, .slb-pill { font-family:inherit; cursor:pointer; white-space:nowrap; transition:background .15s, color .15s, box-shadow .15s, border-color .15s; }
  .slb-pill:hover { filter:brightness(1.1); }
  .slb-skel { background:linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.11) 37%, rgba(255,255,255,0.04) 63%);
    background-size:200% 100%; animation:slbSkel 1.3s linear infinite; }
  @media (prefers-reduced-motion: reduce){ .slb-row, .slb-me::after, .slb-skel { animation:none !important; } }
`;

export default function ShellLeaderboard({
  gameId,
  games,
  highlightUserId,
  selfScore,
  selfHandle,
  limit = 25,
  defaultWindow = "week",
  fixedWindow,
  crossApp = false,
}: {
  gameId: string;
  games?: LbGame[];            // when provided, renders game-selector tabs; gameId is the default tab
  highlightUserId?: string | null;
  selfScore?: number | null;   // the player's just-played score — merged in optimistically to beat the read-after-write race
  selfHandle?: string | null;
  limit?: number;
  defaultWindow?: "week" | "all"; // initial time window; "all" avoids a blank board when a week has no scores yet
  fixedWindow?: "day" | "week" | "all"; // when set, locks the window (e.g. daily boards) + hides the toggle
  crossApp?: boolean;          // federation-wide board — for a game published on several properties (tcg-quiz)
}) {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [winState, setWinState] = useState<"day" | "week" | "all">(defaultWindow);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState(gameId);
  const win = fixedWindow ?? winState;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/scores/leaderboard?gameId=${encodeURIComponent(activeGame)}&limit=${Math.max(limit, 100)}&verifiedOnly=${verifiedOnly ? 1 : 0}&window=${win}${crossApp ? "&crossApp=1" : ""}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({ leaderboard: [] }));
      setRows(Array.isArray(body.leaderboard) ? body.leaderboard : []);
    } finally {
      setLoading(false);
    }
  }, [activeGame, verifiedOnly, win, limit, crossApp]);

  useEffect(() => { void load(); }, [load]);

  // In a game-over context (selfScore passed): if this run beat the prior best for
  // this game, fire the distinct personal-best effect. No-op on the homepage board.
  useEffect(() => { maybeCelebrateBest(gameId, selfScore); }, [gameId, selfScore]);

  // Merge the player's own fresh score in client-side so a slow save never hides
  // them, re-rank, then split into the visible top-N plus a pinned "you" row if
  // they placed below the cut. verifiedOnly boards skip the merge (self run is
  // web2 until upgraded).
  const { top, pinned } = useMemo(() => {
    let list: LbRow[] = rows.map((r) => ({ ...r }));
    if (highlightUserId && selfScore != null && !verifiedOnly) {
      const i = list.findIndex((r) => r.userId === highlightUserId);
      if (i >= 0) list[i] = { ...list[i], score: Math.max(list[i].score, selfScore) };
      else list.push({ rank: 0, userId: highlightUserId, handle: selfHandle ?? null, score: selfScore, verified: false, txSig: null, at: "" });
      list.sort((a, b) => b.score - a.score || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      list = list.map((r, idx) => ({ ...r, rank: idx + 1 }));
    }
    const visible = list.slice(0, limit);
    const meRow = highlightUserId ? list.find((r) => r.userId === highlightUserId) : undefined;
    const meInView = meRow ? visible.some((r) => r.userId === highlightUserId) : true;
    return { top: visible, pinned: !meInView && meRow ? meRow : null };
  }, [rows, highlightUserId, selfScore, selfHandle, verifiedOnly, limit]);

  const winLabel = win === "day" ? "Today" : win === "week" ? "This week" : "All-time";

  return (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <style>{SLB_CSS}</style>

      {games && games.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
          {games.map((g) => {
            const active = g.id === activeGame;
            return (
              <button
                key={g.id}
                type="button"
                className="slb-pill"
                onClick={() => setActiveGame(g.id)}
                style={{
                  fontSize: 12.5, fontWeight: 800, padding: "7px 14px", borderRadius: 999,
                  color: active ? "#04120b" : "rgba(255,255,255,0.86)",
                  background: active ? `linear-gradient(100deg, ${PURPLE}, ${GREEN})` : "rgba(255,255,255,0.06)",
                  border: active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.14)",
                  boxShadow: active ? "0 6px 18px rgba(20,241,149,0.28)" : "none",
                  backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                }}
              >
                {g.emoji} {g.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 900, letterSpacing: 1.4, color: "#fff", margin: 0, textTransform: "uppercase" }}>
          <span style={{ fontSize: 17, filter: "drop-shadow(0 0 8px rgba(255,215,64,0.5))" }}>🏆</span>
          Leaderboard
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: hexA(GREEN, 0.9), background: hexA(GREEN, 0.1), border: `1px solid ${hexA(GREEN, 0.3)}`, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase" }}>
            {winLabel}
          </span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          {!fixedWindow && (
            <div style={{ display: "flex", padding: 3, gap: 2, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              {([["day", "Today"], ["week", "Week"], ["all", "All-time"]] as const).map(([w, label]) => {
                const active = w === winState;
                return (
                  <button
                    key={w}
                    type="button"
                    className="slb-seg"
                    onClick={() => setWinState(w)}
                    style={{
                      fontSize: 11, fontWeight: 800, padding: "5px 11px", border: "none", borderRadius: 999,
                      color: active ? "#04120b" : "rgba(255,255,255,0.6)",
                      background: active ? `linear-gradient(100deg, ${PURPLE}, ${GREEN})` : "transparent",
                      boxShadow: active ? "0 3px 10px rgba(20,241,149,0.3)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.6)", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} style={{ accentColor: GREEN }} />
            Verified
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="slb-skel" style={{ height: 46, borderRadius: 13, opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : top.length === 0 ? (
        <div style={{ padding: "28px 20px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12.5, fontWeight: 600, lineHeight: 1.5 }}>
          <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.55 }}>🏆</div>
          {verifiedOnly ? "No verified scores yet — be the first to save on-chain." : win === "day" ? "No scores today yet — be the first on today's board." : win === "week" ? "No scores this week yet — play now to top the board." : "No scores yet — play a game to get on the board."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {top.map((r, i) => <Row key={r.userId} r={r} me={!!highlightUserId && r.userId === highlightUserId} i={i} />)}
          {pinned && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 800 }}>
                <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)" }} />
                ⋯
                <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)" }} />
              </div>
              <Row r={pinned} me i={0} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ r, me, i = 0 }: { r: LbRow; me: boolean; i?: number }) {
  const rank = r.rank;
  const podium = rank <= 3;
  const medal = rank === 1 ? GOLD : rank === 2 ? SILVER : BRONZE;

  const bg = me
    ? "linear-gradient(100deg, rgba(20,241,149,0.17), rgba(20,241,149,0.05))"
    : podium
      ? `linear-gradient(100deg, ${hexA(medal, 0.11)}, rgba(255,255,255,0.03))`
      : "rgba(255,255,255,0.035)";
  const border = me ? hexA(GREEN, 0.5) : podium ? hexA(medal, 0.36) : "rgba(255,255,255,0.09)";
  const glow = me ? `0 6px 22px ${hexA(GREEN, 0.2)}` : podium ? `0 6px 20px ${hexA(medal, 0.15)}` : "none";

  return (
    <div
      className={`slb-row${me ? " slb-me" : ""}`}
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr auto auto",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 13,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: glow,
        animationDelay: `${Math.min(i, 12) * 26}ms`,
      }}
    >
      {/* rank */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {podium ? (
          <span style={{ fontSize: 18, lineHeight: 1, filter: `drop-shadow(0 0 6px ${hexA(medal, 0.6)})` }}>
            {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
          </span>
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: "rgba(255,255,255,0.42)" }}>{rank}</span>
        )}
      </div>

      {/* avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: me ? `linear-gradient(135deg, ${GREEN}, #35e0ff)` : avatarGrad(r.userId),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 900, color: "#08120c",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 8px ${hexA(me ? GREEN : PURPLE, 0.3)}`,
          }}
        >
          {me ? "★" : short(r.handle, r.userId).charAt(0).toUpperCase()}
        </div>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: me ? "#fff" : "#eef0f6", fontWeight: me ? 800 : 600, fontSize: 13.5, letterSpacing: "-0.1px" }}>
          {me ? "You" : short(r.handle, r.userId)}
          {me && (
            <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 900, letterSpacing: 0.6, color: "#04120b", background: GREEN, padding: "2px 6px", borderRadius: 999, verticalAlign: "middle" }}>
              YOU
            </span>
          )}
        </span>
      </div>

      {/* score */}
      <span style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.5px", color: rank === 1 ? GOLD : GREEN, textShadow: rank === 1 ? `0 0 12px ${hexA(GOLD, 0.5)}` : "none" }}>
        {r.score.toLocaleString()}
      </span>

      {/* verified */}
      {r.verified && r.txSig ? (
        <a
          href={EXPLORER(r.txSig)}
          target="_blank"
          rel="noopener noreferrer"
          title="Verified on-chain — provably legit, permanent"
          style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9.5, fontWeight: 800, color: GREEN, textDecoration: "none", padding: "3px 7px", borderRadius: 999, background: hexA(GREEN, 0.12), border: `1px solid ${hexA(GREEN, 0.4)}`, whiteSpace: "nowrap" }}
        >
          ✓<span style={{ fontSize: 8 }}>↗</span>
        </a>
      ) : (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.13)", justifySelf: "center" }} />
      )}
    </div>
  );
}
