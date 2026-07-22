"use client";

import ShellLeaderboard, { type LbGame } from "../../../components/arcade/ShellLeaderboard";
import { LB_GAMES } from "../../_data/games";
import { useIdentity } from "../../../lib/identity/useIdentity";

export default function AppRanks() {
  const { user } = useIdentity();
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 14px 44px" }}>
      <ShellLeaderboard gameId="blockwords" games={LB_GAMES as LbGame[]} highlightUserId={user?.id} limit={50} defaultWindow="all" />
    </div>
  );
}
