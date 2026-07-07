"use client";

// The web2-first arcade leaderboard (shared Arcade Shell component).
// Everyone signed-in-with-email is ranked for FREE. A run the player upgraded
// to a permanent on-chain save ($0.05) carries a "Verified tx↗" badge — the
// flex + anti-cheat proof, and the reason to pay. Fully responsive: a real
// table on wide screens, stacked rows on phones.

import { useEffect, useState, useCallback } from "react";

export type LbRow = {
  rank: number;
  userId: string;
  handle: string | null;
  score: number;
  verified: boolean;
  txSig: string | null;
  at: string;
};

const EXPLORER = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}${process.env.NEXT_PUBLIC_ARCADE_NETWORK === "mainnet" ? "" : "?cluster=devnet"}`;

const short = (h: string | null, id: string) => h || `player_${id.slice(0, 4)}`;

export default function ShellLeaderboard({
  gameId,
  highlightUserId,
  limit = 25,
}: {
  gameId: string;
  highlightUserId?: string | null;
  limit?: number;
}) {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/scores/leaderboard?gameId=${encodeURIComponent(gameId)}&limit=${limit}&verifiedOnly=${verifiedOnly ? 1 : 0}&window=${weekly ? "week" : "all"}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({ leaderboard: [] }));
      setRows(Array.isArray(body.leaderboard) ? body.leaderboard : []);
    } finally {
      setLoading(false);
    }
  }, [gameId, limit, verifiedOnly, weekly]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: "#e8e8f0", margin: 0, textTransform: "uppercase" }}>
          🏆 Leaderboard
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)" }}>
            {([["week", "This week"], ["all", "All-time"]] as const).map(([w, label]) => {
              const active = (w === "week") === weekly;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeekly(w === "week")}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 9px",
                    border: "none",
                    cursor: "pointer",
                    userSelect: "none",
                    color: active ? "#0a0a12" : "#b388ff",
                    background: active ? "#b388ff" : "transparent",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#b388ff", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} style={{ accentColor: "#14F195" }} />
            Verified only
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>
          {verifiedOnly ? "No verified scores yet — be the first to save on-chain." : weekly ? "No scores this week yet — play now to top the board." : "No scores yet — play a game to get on the board."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {rows.map((r) => {
            const me = highlightUserId && r.userId === highlightUserId;
            return (
              <div
                key={r.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: me ? "rgba(20,241,149,0.10)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${me ? "rgba(20,241,149,0.4)" : "rgba(153,69,255,0.14)"}`,
                }}
              >
                <span style={{ color: r.rank <= 3 ? "#ffd740" : "#777", fontWeight: 800, fontFamily: "monospace" }}>{r.rank}</span>
                <span style={{ color: "#e8e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {short(r.handle, r.userId)}{me ? " (you)" : ""}
                </span>
                <span style={{ color: "#14F195", fontWeight: 800, fontFamily: "monospace" }}>{r.score.toLocaleString()}</span>
                {r.verified && r.txSig ? (
                  <a
                    href={EXPLORER(r.txSig)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Verified on-chain — provably legit, permanent"
                    style={{ fontSize: 10, fontWeight: 700, color: "#14F195", textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    ✓ tx↗
                  </a>
                ) : (
                  <span style={{ fontSize: 10, color: "#444", whiteSpace: "nowrap" }}>—</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
