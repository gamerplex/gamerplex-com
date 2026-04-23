"use client";

import Link from "next/link";
import ArcadeStats from "./_components/ArcadeStats";
import { SiteNav } from "../../components/SiteNav";

// Arcade landing — first-party solo games, F2P, microtransactions for
// continues + powerups + score commits. Full spec: ENGINEERING/PRODUCT/GAMERPLEX_ARCADE.md

const ARCADE_GAMES = [
  {
    id: "cyber-snake",
    slug: "cyber-snake",
    name: "Cyber Snake",
    tagline: "Classic Snake with a Tron aesthetic. Eat, grow, don't crash.",
    emoji: "🐍",
    color: "#4fc3f7",
    status: "playable",
    controls: "arrow keys · WASD · V for view",
  },
  {
    id: "beeline",
    slug: "beeline",
    name: "Beeline",
    tagline: "Fly a bee. Your pollen trail can't touch any other. Last bee flying wins.",
    emoji: "🐝",
    color: "#ffd24a",
    status: "building",
  },
  {
    id: "hexman",
    slug: "hexman",
    name: "Hexman",
    tagline: "Hexagonal word puzzle. Reveal letters, form words under pressure.",
    emoji: "🔤",
    color: "#9945FF",
    status: "designing",
  },
  {
    id: "polyball",
    slug: "polyball",
    name: "Polyball",
    tagline: "Physics-driven ball play. Rotating polygons, deterministic chaos.",
    emoji: "⚙️",
    color: "#14F195",
    status: "designing",
  },
  {
    id: "blocks",
    slug: "blocks",
    name: "Blocks",
    tagline: "2048-style merge puzzle. Hit 4096 for verified glory.",
    emoji: "🧱",
    color: "#ff6b2c",
    status: "designing",
  },
];

export default function ArcadePage() {
  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #252540", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 24, fontWeight: 900, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", paddingRight: 8 }}>GAMERPLEX</Link>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: "rgba(79,195,247,0.15)", border: "1px solid rgba(79,195,247,0.4)", color: "#4fc3f7", letterSpacing: 1, textTransform: "uppercase" }}>Arcade</span>
        </div>
        <SiteNav
          links={[
            { href: "/", label: "Arena" },
            { href: "/arcade", label: "Arcade", active: true },
            { href: "/games", label: "Tournaments" },
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/activity", label: "Activity" },
            { href: "/docs", label: "Docs" },
          ]}
        />
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 64px" }}>
        {/* Hero */}
        <h1 style={{ fontSize: 52, fontWeight: 800, margin: 0, letterSpacing: -1, background: "linear-gradient(135deg, #4fc3f7, #14F195, #ffd24a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.05 }}>
          Arcade
        </h1>
        <p style={{ fontSize: 17, color: "#a8a8c0", maxWidth: 720, margin: "14px 0 8px", lineHeight: 1.55 }}>
          Free-to-play solo arcade games on Solana mainnet. Climb on-chain leaderboards. Pay for continues if you want to keep going. Leaderboard glory is cosmetic, not cash — and 1CC (zero-continues) runs are gold-badged.
        </p>
        <p style={{ fontSize: 13, color: "#6a6a80", margin: "0 0 16px", lineHeight: 1.55 }}>
          The viral acquisition layer that validates the stack and powers Tournaments + $GAMER flywheels.
        </p>
        <ArcadeStats />

        {/* Games grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {ARCADE_GAMES.map(game => {
            const isPlayable = game.status === "playable";
            const Card = isPlayable ? Link : "div";
            const cardProps = isPlayable ? { href: `/arcade/${game.slug}` } : {};
            return (
              <Card
                key={game.id}
                {...(cardProps as any)}
                style={{
                  background: "#0c0c14",
                  border: `1px solid ${isPlayable ? game.color + "60" : "#252540"}`,
                  borderRadius: 14,
                  padding: "22px 22px 20px",
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                  cursor: isPlayable ? "pointer" : "default",
                  opacity: isPlayable ? 1 : 0.55,
                  position: "relative",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  boxShadow: isPlayable ? `0 0 28px ${game.color}20` : "none",
                }}
                onMouseEnter={isPlayable ? (e: any) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 0 40px ${game.color}35`; } : undefined}
                onMouseLeave={isPlayable ? (e: any) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 0 28px ${game.color}20`; } : undefined}
              >
                <div style={{ position: "absolute", top: 12, right: 12, fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 10, letterSpacing: 1.2, textTransform: "uppercase",
                  background: isPlayable ? game.color + "22" : "rgba(255,170,0,0.12)",
                  color: isPlayable ? game.color : "#ffaa00",
                  border: `1px solid ${isPlayable ? game.color + "50" : "rgba(255,170,0,0.35)"}`,
                }}>{isPlayable ? "▶ Play" : game.status}</div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: game.color + "1f", border: `1px solid ${game.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                    {game.emoji}
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#f0f0ff" }}>{game.name}</div>
                    <div style={{ fontSize: 10, color: game.color, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>Arcade · Solo</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#a8a8c0", lineHeight: 1.5, marginBottom: 10 }}>
                  {game.tagline}
                </div>
                {game.controls && (
                  <div style={{ fontSize: 10, color: "#555570", fontFamily: "monospace", marginTop: 8, paddingTop: 10, borderTop: "1px solid #1a1a28" }}>
                    {game.controls}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* How it works strip */}
        <div style={{ marginTop: 52, padding: "22px 26px", background: "linear-gradient(135deg, rgba(153,69,255,0.08), rgba(20,241,149,0.04))", border: "1px solid #252540", borderRadius: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            How the arcade works
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, fontSize: 13, color: "#c0c0d4", lineHeight: 1.6 }}>
            <div><strong style={{ color: "#4fc3f7" }}>Free to play.</strong> Gameplay is client-side. No wallet required. Local top-10 in your browser.</div>
            <div><strong style={{ color: "#4fc3f7" }}>Save score — $0.05.</strong> Commit your score on-chain as a GPX5 memo. Permanent, cross-platform, yours forever.</div>
            <div><strong style={{ color: "#ffd740" }}>Save replay — $0.15.</strong> 3× the base — full move log on-chain. Anyone can replay + cryptographically verify → 🏆.</div>
            <div><strong style={{ color: "#9945FF" }}>Mint cNFT — $0.25.</strong> 5× the base — tradeable compressed NFT of your replay. (v1.2)</div>
            <div><strong style={{ color: "#4fc3f7" }}>Continue ($0.05 × 2ⁿ).</strong> Exponential pricing — pay to resurrect after a crash.</div>
          </div>
        </div>

        {/* Not-for-arcade callout */}
        <div style={{ marginTop: 20, fontSize: 12, color: "#6a6a80", textAlign: "center", lineHeight: 1.6 }}>
          Looking for wagered matches with prize pools? → <Link href="/games" style={{ color: "#9945FF", textDecoration: "underline" }}>Tournaments</Link>
          <br />
          Arcade leaderboards are cosmetic prizes only. Cash prizes live on Tournaments (skill-contest doctrine, geofenced where required).
        </div>
      </div>
    </div>
  );
}
