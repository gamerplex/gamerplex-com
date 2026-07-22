"use client";

// 🔥 Top Referrers — ranks players by how many friends they brought in (each a
// successful Credits referral). Credits-only growth mechanic (R2); nothing here
// is cashable. Mobile-first, mirrors ShellLeaderboard's look.

import { useEffect, useMemo, useState, useCallback } from "react";

type RefRow = { rank: number; userId: string; handle: string | null; referrals: number };

const short = (h: string | null, id: string) => h ? `@${h}` : `player_${id.slice(0, 4)}`;

export default function ReferrersBoard({
  highlightUserId,
  limit = 25,
}: {
  highlightUserId?: string | null;
  limit?: number;
}) {
  const [rows, setRows] = useState<RefRow[]>([]);
  const [weekly, setWeekly] = useState(false);   // referrers are all-time by default (a durable brag)
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/referrals/leaderboard?window=${weekly ? "week" : "all"}&limit=${limit}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({ leaderboard: [] }));
      setRows(Array.isArray(body.leaderboard) ? body.leaderboard : []);
    } finally {
      setLoading(false);
    }
  }, [weekly, limit]);

  useEffect(() => { void load(); }, [load]);

  const { top, pinned } = useMemo(() => {
    const visible = rows.slice(0, limit);
    const meRow = highlightUserId ? rows.find((r) => r.userId === highlightUserId) : undefined;
    const meInView = meRow ? visible.some((r) => r.userId === highlightUserId) : true;
    return { top: visible, pinned: !meInView && meRow ? meRow : null };
  }, [rows, highlightUserId, limit]);

  return (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: "#e8e8f0", margin: 0, textTransform: "uppercase" }}>
          🔥 Top Referrers
        </h3>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)" }}>
          {([["all", "All-time"], ["week", "This week"]] as const).map(([w, label]) => {
            const active = (w === "week") === weekly;
            return (
              <button key={w} type="button" onClick={() => setWeekly(w === "week")}
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", border: "none", cursor: "pointer", color: active ? "#0a0a12" : "#b388ff", background: active ? "#b388ff" : "transparent", whiteSpace: "nowrap" }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>Loading…</div>
      ) : top.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>
          No referrals yet — share your link and be the first. 🔗
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {top.map((r) => <Row key={r.userId} r={r} me={!!highlightUserId && r.userId === highlightUserId} />)}
          {pinned && (
            <>
              <div style={{ textAlign: "center", color: "#555", fontSize: 11, padding: "2px 0" }}>···</div>
              <Row r={pinned} me />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ r, me }: { r: RefRow; me: boolean }) {
  const top1 = me && r.rank === 1;
  const bg = top1 ? "rgba(255,215,64,0.14)" : me ? "rgba(20,241,149,0.12)" : "rgba(255,255,255,0.03)";
  const border = top1 ? "rgba(255,215,64,0.55)" : me ? "rgba(20,241,149,0.45)" : "rgba(153,69,255,0.14)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, fontSize: 13, background: bg, border: `1px solid ${border}` }}>
      <span style={{ color: r.rank <= 3 ? "#ffd740" : "#777", fontWeight: 800, fontFamily: "monospace" }}>
        {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
      </span>
      <span style={{ color: me ? "#fff" : "#e8e8f0", fontWeight: me ? 800 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {me ? "You" : short(r.handle, r.userId)}
      </span>
      <span style={{ color: top1 ? "#ffd740" : "#14F195", fontWeight: 800, fontFamily: "monospace" }}>
        {r.referrals.toLocaleString()} 🔗
      </span>
    </div>
  );
}
