"use client";

/**
 * Omega City's board, which is NOT a score leaderboard.
 *
 * Omega City submits no web2 scores — it is one persistent war per Solana epoch, so
 * there is no per-run score to rank. Listing it in the score switcher would have shown
 * an empty board, which reads as broken rather than as a different kind of game. Its
 * real standing is districts taken and battles won in the current epoch, served by the
 * resolver.
 *
 * Deliberately NOT showing a "verified" tick here. The tick inside Omega City means the
 * viewer's own browser recomputed the epoch's Merkle root; duplicating that check into
 * this app would duplicate the hashing code and invite exactly the drift that bit the
 * arcade IDL. So this links the record transaction — a fact — and sends anyone who wants
 * the verified view to the game itself.
 */
import { useEffect, useState } from "react";

const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

const FACTION: Record<string, { label: string; emoji: string }> = {
  sol: { label: "Solhackers", emoji: "☀️" },
  lib: { label: "Liberati", emoji: "⚜️" },
  gua: { label: "Guardians", emoji: "🛡️" },
  bot: { label: "BotNet", emoji: "🤖" },
};

type Row = { handle: string; faction: string; captures: number; wins: number; orders: number };
type Hist = { epoch: number; players?: number | null };
type Board = {
  epoch: number;
  current: number;
  players: Row[];
  record: { sig: string | null; cluster: string } | null;
  history?: Hist[];
};

export default function OmegaCityBoard({ highlightHandle, limit = 8 }: { highlightHandle?: string | null; limit?: number }) {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let off = false;
    const get = async (epoch?: number) => {
      const r = await fetch(`${RESOLVER}/oc/leaderboard${epoch ? `?epoch=${epoch}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (!d?.ok) throw new Error("not ok");
      return d as Board;
    };
    (async () => {
      try {
        const live = await get();
        if (off) return;
        if (live.players.length > 0) { setB(live); return; }
        // An epoch runs ~2 days and starts with nobody having moved, so the live board
        // is empty for long stretches — and epoch 1055 went by with zero players at
        // all. Showing that renders as a broken leaderboard. Fall back to the most
        // recent epoch that actually had fighters, labelled as finished, which is also
        // the one with an on-chain record.
        const past = (live.history ?? []).find((h) => (h.players ?? 0) > 0);
        if (!past) { setB(live); return; }
        const final = await get(past.epoch);
        if (!off) setB(final);
      } catch {
        if (!off) setErr(true);
      }
    })();
    return () => { off = true; };
  }, []);

  if (err) return null;

  const rows = (b?.players ?? []).slice(0, limit);
  const live = b ? b.epoch === b.current : true;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#e8e8f0" }}>
          ⬡ Omega City{b ? ` · epoch ${b.epoch}` : ""}
          <span style={{ fontWeight: 500, color: "#8a80b0" }}>
            {b ? (live ? " · being fought" : " · last contested epoch") : ""}
          </span>
        </div>
        <a href="https://omega.gamerplex.com" target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#8ad", textDecoration: "underline", textUnderlineOffset: 2 }}>
          Open the war room →
        </a>
      </div>

      {!b && <div style={{ fontSize: 12.5, color: "#8a80b0" }}>Reading the war…</div>}
      {b && rows.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#8a80b0" }}>
          Nobody has fought here yet. Be the first — pick a side and take a district.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map((r, i) => {
          const f = FACTION[r.faction] ?? { label: r.faction, emoji: "🎮" };
          const mine = !!highlightHandle && r.handle === highlightHandle;
          return (
            <div
              key={`${r.handle}-${i}`}
              style={{
                display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "center",
                padding: "7px 10px", borderRadius: 9, fontSize: 12.5,
                background: mine ? "rgba(20,241,149,0.10)" : "rgba(255,255,255,0.03)",
                border: mine ? "1px solid rgba(20,241,149,0.35)" : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span style={{ color: "#8a80b0", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              <span style={{ color: "#e8e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.emoji} {r.handle}
              </span>
              <span style={{ color: "#14F195", fontWeight: 700, fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
                {r.captures}<span style={{ color: "#6a6a85", fontWeight: 400 }}>/{r.wins}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: "#6a6a85", marginTop: 9, lineHeight: 1.5 }}>
        Districts taken / battles won{live ? " this epoch" : ` in epoch ${b?.epoch}`} — a war, not a high score.{" "}
        {b?.record?.sig ? (
          <>
            This epoch&rsquo;s result is{" "}
            <a
              href={`https://solscan.io/tx/${b.record.sig}${b.record.cluster === "mainnet" ? "" : `?cluster=${b.record.cluster}`}`}
              target="_blank" rel="noreferrer"
              style={{ color: "#ffd740", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              on the chain
            </a>
            .
          </>
        ) : (
          "It records on-chain when the epoch ends."
        )}
      </div>
    </div>
  );
}
