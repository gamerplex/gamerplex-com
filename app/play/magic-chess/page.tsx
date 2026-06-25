"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { StartPagePicker, type GameMode } from "../../../components/games/StartPagePicker";

const ArcadeMode = dynamic(() => import("./_arcade/ArcadeMode"), { ssr: false });

export default function MagicChessPage() {
  const router = useRouter();
  const [mode, setMode] = useState<GameMode | null>(null);

  // Casual + Ranked are the vs-bot arcade experience (free play + optional
  // on-chain save); Live PvP is the arena match.
  if (mode === "casual" || mode === "ranked") return <ArcadeMode />;

  return (
    <div style={{ padding: 32, maxWidth: 460, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, textAlign: "center", marginBottom: 18 }}>♟ Magic Chess</h1>
      <StartPagePicker
        manifest={{ slug: "magic-chess", supportsArena: true }}
        onSelect={(m) => (m === "live" ? router.push("/play/magic-chess-live") : setMode(m))}
      />
    </div>
  );
}
