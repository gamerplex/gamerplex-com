"use client";

// Web2-first leaderboard. Every signed-in (email) player is ranked for FREE from
// the shared game_scores board (identity-service on kx002) — the same source the
// in-game ShellLeaderboard reads. On-chain is NOT a separate board: a score the
// player upgraded to a permanent save just carries a ✓ Verified badge (same
// score, provably legit). No indexer, no ELO memos, no "cache stale".

import { useState } from "react";
import Link from "next/link";
import { SiteNav } from "../../components/SiteNav";
import ShellLeaderboard from "../../components/arcade/ShellLeaderboard";

const GAMES = [
  { id: "cyber-snake", label: "Cyber Snake", emoji: "🐍", color: "#4fc3f7" },
  { id: "magic-chess", label: "Magic Chess", emoji: "♟️", color: "#c99aff" },
  { id: "blockwords", label: "Blockwords", emoji: "📝", color: "#ffd24a" },
  { id: "flipball", label: "Flipball", emoji: "🎯", color: "#ff5edb" },
];

export default function LeaderboardPage() {
  const [game, setGame] = useState("cyber-snake");
  const active = GAMES.find((g) => g.id === game) ?? GAMES[0];

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: "1px solid #252540" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 24, fontWeight: 900, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", paddingRight: 8, display: "inline-block" }}>
            GAMERPLEX
          </Link>
        </div>
        <SiteNav
          links={[
            { href: "/#featured", label: "Play" },
            { href: "/docs", label: "Build" },
            { href: "/leaderboard", label: "Leaderboard", active: true },
            { href: "/profile", label: "Profile" },
          ]}
        />
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 56px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: "clamp(34px,8vw,48px)", fontWeight: 800, margin: 0, background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.05 }}>
            Leaderboard
          </h1>
          <p style={{ fontSize: 14, color: "#a8a8c0", margin: "8px auto 0", maxWidth: 520, lineHeight: 1.5 }}>
            Every signed-in player is ranked for <b style={{ color: "#14F195" }}>free</b> — just your email.
            A <b style={{ color: "#14F195" }}>✓</b> means that score was also saved on-chain: same score, provably permanent.
          </p>
        </div>

        {/* Game tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap", justifyContent: "center" }}>
          {GAMES.map((g) => {
            const on = g.id === game;
            return (
              <button
                key={g.id}
                onClick={() => setGame(g.id)}
                style={{
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 10,
                  cursor: "pointer",
                  background: on ? g.color : "#14141f",
                  color: on ? "#050508" : "#a8a8c0",
                  border: `1px solid ${on ? g.color : "#252540"}`,
                  fontFamily: "'Space Grotesk', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {g.emoji} {g.label}
              </button>
            );
          })}
        </div>

        {/* The board — web2-first, reused shell component (This week / All-time + Verified filter built in) */}
        <div style={{ background: "#0c0c14", borderRadius: 16, border: "1px solid #252540", padding: "20px 16px" }}>
          <ShellLeaderboard key={game} gameId={game} limit={50} />
        </div>

        {/* Play CTA */}
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <Link
            href={`/play/${active.id}`}
            style={{ display: "inline-block", background: `linear-gradient(135deg, ${active.color}, #14F195)`, color: "#03121a", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 800, textDecoration: "none" }}
          >
            ▶ Play {active.label} — top the board
          </Link>
        </div>
      </div>
    </div>
  );
}
