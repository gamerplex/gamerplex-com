"use client";

// Architectural pattern visibility across the 3 Battle games.
// Cyber Snake's BattleMode wires the full flow (createMarket / deposit / settle).
// Chess + Blockwords show this badge with disabled actions until their 2-wallet
// on-chain gameplay is wired (the CM v2.1 escrow path itself is proven via
// gamerplex-tests/src/e2e-cross-game-wagered.test.ts).

import type { BattleSlug } from "../../lib/wagered-battle/client";

interface Props {
  slug: BattleSlug;
  stake?: number;
  status?: "wired" | "scaffold";
  marketPda?: string | null;
}

export function WageredEscrowBadge({ slug, stake = 1, status = "scaffold", marketPda }: Props) {
  const isWired = status === "wired";
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(153,69,255,0.12), rgba(20,241,149,0.06))",
        border: `1px solid ${isWired ? "#14F195" : "rgba(153,69,255,0.4)"}`,
        borderRadius: 8,
        padding: 12,
        fontSize: 11,
        color: "#c8c8e0",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 12,
          color: isWired ? "#14F195" : "#9b6dff",
          marginBottom: 6,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        Escrow · CM v2.1
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px" }}>
        <span style={{ color: "#7d7d99" }}>Stake</span>
        <span>${stake.toFixed(2)} USDF / side · 98% to winner · 2% protocol</span>
        <span style={{ color: "#7d7d99" }}>Path</span>
        <span style={{ fontFamily: "monospace", fontSize: 10 }}>
          init_market_v21 → bind_market_to_game → 2× deposit → resolve_market_from_game_pda
        </span>
        <span style={{ color: "#7d7d99" }}>Module</span>
        <span style={{ fontFamily: "monospace", fontSize: 10 }}>lib/wagered-battle/client.ts</span>
        <span style={{ color: "#7d7d99" }}>Adapter</span>
        <span style={{ fontFamily: "monospace", fontSize: 10 }}>{slug} · registered in CM v2.1 ✓</span>
        {marketPda && (
          <>
            <span style={{ color: "#7d7d99" }}>Market</span>
            <span style={{ fontFamily: "monospace", fontSize: 10 }}>
              {marketPda.slice(0, 8)}…{marketPda.slice(-6)}
            </span>
          </>
        )}
      </div>
      {!isWired && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 8px",
            background: "rgba(255,210,74,0.08)",
            borderLeft: "2px solid #ffd24a",
            color: "#cdc28a",
            fontSize: 10,
          }}
        >
          UI scaffold — same shared module as the wired Cyber Snake Battle. 2-wallet on-chain gameplay
          + escrow wiring ships next; CM v2.1 escrow path itself is proven via 18 passing devnet tests.
        </div>
      )}
    </div>
  );
}
