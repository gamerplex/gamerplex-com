"use client";

// Reusable save-tier mode picker for a game's start page: Casual / Ranked / Live
// PvP (/ Wager). Data-driven from a game manifest — every game renders the same
// front door, and the modes map to the shared contracts (web2 / arcade / arena).
//
// The mode model mirrors @gamerplex/sdk/save (getGameModes); kept local until
// gamerplex-com's @gamerplex/sdk dep is bumped to include the save/ subpath, then
// this should import { getGameModes } from "@gamerplex/sdk/save".

export type GameMode = "casual" | "ranked" | "live" | "wager";

export interface GameManifest {
  slug: string;
  supportsArena?: boolean;
  supportsWager?: boolean;
}

const CARDS: Record<GameMode, { title: string; cost: string; blurb: string; icon: string }> = {
  casual: { title: "Casual", cost: "Free", blurb: "Play free — score saved to your profile.", icon: "▶" },
  ranked: { title: "Ranked", cost: "$0.05", blurb: "Save your score on-chain (arcade).", icon: "🏆" },
  live: { title: "Live PvP", cost: "gas-light", blurb: "Real-time match on the arena contract.", icon: "⚔" },
  wager: { title: "Wager", cost: "stake", blurb: "Stake to play (coming later).", icon: "💰" },
};

export function getGameModes(m: GameManifest): GameMode[] {
  const modes: GameMode[] = ["casual", "ranked"];
  if (m.supportsArena) modes.push("live");
  if (m.supportsWager) modes.push("wager");
  return modes;
}

export function StartPagePicker({
  manifest,
  onSelect,
}: {
  manifest: GameManifest;
  onSelect: (mode: GameMode) => void;
}) {
  return (
    <div
      data-testid="start-page-picker"
      style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420, margin: "0 auto" }}
    >
      <p style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>How do you want to play?</p>
      {getGameModes(manifest).map((mode) => {
        const c = CARDS[mode];
        return (
          <button
            key={mode}
            data-mode={mode}
            onClick={() => onSelect(mode)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "#14141f",
              border: "1px solid #252540",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              color: "#e8e8f0",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#14F195")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#252540")}
          >
            <span style={{ fontSize: 22 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
              <div style={{ fontSize: 10, color: "#888" }}>{c.blurb}</div>
            </div>
            <span style={{ fontSize: 12, color: "#14F195", fontWeight: 700 }}>{c.cost}</span>
          </button>
        );
      })}
    </div>
  );
}
