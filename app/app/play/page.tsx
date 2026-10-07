"use client";

import GameGrid from "../../_components/GameGrid";
import { StreakCelebration } from "../../../components/Hype";

export default function AppPlay() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 14px 44px" }}>
      {/* The page's name for assistive tech. Play and Community open straight
          into content by design, so the heading is not painted. */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Play</h1>

      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px" }}><StreakCelebration /></div>
      <GameGrid />
    </div>
  );
}
