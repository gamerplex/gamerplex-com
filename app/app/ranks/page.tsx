"use client";

import ShellLeaderboard, { type LbGame } from "../../../components/arcade/ShellLeaderboard";
import { LeagueWidget } from "../../../components/identity/LeagueWidget";
import { LB_GAMES } from "../../_data/games";
import { useIdentity } from "../../../lib/identity/useIdentity";

export default function AppRanks() {
  const { user } = useIdentity();
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "52px 14px 44px" }}>
      {/* Global cross-game board — ranks players by Credits earned across EVERY game
          (the only metric comparable across games), so "most active overall" is visible. */}
      <h2 style={{ fontSize: 15, fontWeight: 900, color: "#fff", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        🌍 Global <span style={{ fontSize: 12, fontWeight: 600, color: "#8a80b0" }}>· most active across all games</span>
      </h2>
      <div style={{ marginBottom: 26 }}><LeagueWidget /></div>

      <h2 style={{ fontSize: 15, fontWeight: 900, color: "#fff", margin: "0 0 10px" }}>🏆 By game</h2>
      <ShellLeaderboard gameId="blockwords" games={LB_GAMES as LbGame[]} highlightUserId={user?.id} limit={50} defaultWindow="all" />
    </div>
  );
}
