"use client";

import AppOnboard from "../../_components/AppOnboard";
import GameGrid from "../../_components/GameGrid";
import { StreakCelebration } from "../../../components/Hype";

export default function AppPlay() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 14px 44px" }}>
      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px" }}><StreakCelebration /></div>
      <AppOnboard />
      <GameGrid />
    </div>
  );
}
