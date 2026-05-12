"use client";

import Link from "next/link";
import Image from "next/image";
import { SiteNav } from "../../components/SiteNav";

const LAUNCH_GAMES = [
  {
    id: "blockwords",
    name: "Blockwords",
    description: "Hidden-word duel. Host commits a SHA256 word hash; guesser has N lives. PER-encrypted via Intel TDX.",
    path: "/play/blockwords",
    color: "#14F195",
    emoji: "🔤",
    status: "building",
  },
  {
    id: "cyber-snake",
    name: "Cyber Snake",
    description: "Tron-style 2-player snake. Solo version playable now in the Arcade; tournament duel mode ships with CM v2.2.",
    path: "/play/cyber-snake?mode=arcade",
    color: "#4fc3f7",
    emoji: "🐍",
    status: "building",
  },
  {
    id: "pla",
    name: "Pet Legends Arena",
    description: "NFT auto-battler. Deterministic combat, CM v2.1-bound markets, SOAR ladder.",
    path: "/play/pla",
    color: "#ff6b2c",
    emoji: "🐉",
    status: "building",
  },
];

const COMING_SOON = [
  { name: "Checkers", emoji: "🔴" },
  { name: "Go", emoji: "⚫" },
  { name: "Reversi", emoji: "⚪" },
  { name: "Backgammon", emoji: "🎲" },
  { name: "Shogi", emoji: "♜" },
  { name: "Gomoku", emoji: "⬛" },
  { name: "Mancala", emoji: "🫘" },
  { name: "Hex", emoji: "⬡" },
];

export default function GamesPortal() {

  return (
    <div style={{
      minHeight: "100vh", background: "#050508", color: "#e8e8f0",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* 2026 minimalist top nav — matches home */}
      <nav className="top-nav" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <SiteNav
          links={[
            { href: "/#featured", label: "Play", active: true },
            { href: "/docs", label: "Build" },
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/profile", label: "Profile" },
            { href: "https://x.com/gamerplex_com", label: "𝕏", external: true },
          ]}
        />
      </nav>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        {/* Page title */}
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>Tournaments</h1>
        <p style={{ color: "#555570", fontSize: 13, marginBottom: 28 }}>
          Every game runs on-chain via <span style={{ color: "#9945FF" }}>MagicBlock Ephemeral Rollup</span>. Every move is a real Solana transaction.
        </p>

        {/* FEATURED: Magic Chess */}
        <Link href="/play/magic-chess" style={{ textDecoration: "none", display: "block" }}>
          <div style={{
            position: "relative", borderRadius: 16, overflow: "hidden",
            border: "1px solid rgba(153,69,255,0.3)",
            boxShadow: "0 0 40px rgba(153,69,255,0.15), 0 8px 32px rgba(0,0,0,0.4)",
            marginBottom: 32, cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(153,69,255,0.25), 0 12px 40px rgba(0,0,0,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 0 40px rgba(153,69,255,0.15), 0 8px 32px rgba(0,0,0,0.4)"; }}
          >
            {/* Banner image */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "21/9" }}>
              <Image
                src="/magic-chess-banner.jpg"
                alt="Magic Chess"
                fill
                style={{ objectFit: "cover" }}
                priority
              />
              {/* Gradient overlay */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to right, rgba(5,5,8,0.9) 0%, rgba(5,5,8,0.3) 40%, transparent 60%)",
              }} />
              {/* LIVE badge */}
              <div style={{
                position: "absolute", top: 16, right: 16,
                background: "#14F195", color: "#050508",
                padding: "4px 12px", borderRadius: 20,
                fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
                textTransform: "uppercase",
              }}>LIVE</div>
              {/* Featured badge */}
              <div style={{
                position: "absolute", top: 16, left: 16,
                background: "rgba(153,69,255,0.8)", color: "#fff",
                padding: "4px 12px", borderRadius: 20,
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                backdropFilter: "blur(8px)",
              }}>FEATURED</div>
            </div>

            {/* Info bar */}
            <div style={{
              padding: "16px 20px",
              background: "linear-gradient(135deg, rgba(26,10,48,0.95), rgba(12,12,20,0.95))",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 10, color: "#9945FF", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
                  Fully On-Chain Chess
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  3D board &bull; AI opponent &bull; Every move on MagicBlock ER &bull; SOAR leaderboard
                </div>
              </div>
              <div style={{
                background: "linear-gradient(90deg, #9945ff, #00f0ff)",
                color: "#050508", padding: "8px 24px", borderRadius: 8,
                fontSize: 13, fontWeight: 700,
              }}>
                Play Now
              </div>
            </div>
          </div>
        </Link>

        {/* Launch lineup — the games shipping to mainnet on one unified stack */}
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Launch lineup</h2>
        <p style={{ fontSize: 11, color: "#555570", marginBottom: 16 }}>
          One stack: Orchestrator + Contention Markets v2.1 + MagicBlock ER + SOAR. Magic Chess is live; the others are in build.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 32 }}>
          {LAUNCH_GAMES.map(game => (
            <Link key={game.id} href={game.path} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
                padding: 20, transition: "border-color 0.2s, transform 0.2s", cursor: "pointer",
                height: "100%", position: "relative",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = game.color; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#252540"; e.currentTarget.style.transform = ""; }}
              >
                <div style={{ position: "absolute", top: 10, right: 10, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(255,170,0,0.15)", color: "#ffaa00", letterSpacing: 1, textTransform: "uppercase" }}>{game.status}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: game.color + "20",
                    border: `1px solid ${game.color}40`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>{game.emoji}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#e8e8f0" }}>{game.name}</div>
                    <div style={{ fontSize: 10, color: game.color }}>CM v2.1 + Orchestrator</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#888", marginBottom: 12, lineHeight: 1.4 }}>
                  {game.description}
                </p>
              </div>
            </Link>
          ))}

          {/* Build Your Own */}
          <div style={{
            background: "linear-gradient(135deg, #1a1028, #0f1a2e)",
            border: "1px dashed #2a2050", borderRadius: 12, padding: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Build Your Game</div>
            <div style={{ fontSize: 12, color: "#555570", marginBottom: 16 }}>
              Deploy on-chain games with built-in skill-contest settlement, leaderboards, and token economics.
            </div>
            <a href="https://github.com/gamerplex" target="_blank" style={{
              background: "#14141f", border: "1px solid #252540",
              color: "#e8e8f0", padding: "8px 20px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, textDecoration: "none",
            }}>View SDK</a>
          </div>
        </div>

        {/* Coming Soon */}
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Coming Soon</h2>
        <p style={{ fontSize: 11, color: "#555570", marginBottom: 16 }}>
          Public domain games — free forever, on-chain forever.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
          {COMING_SOON.map(g => (
            <div key={g.name} style={{
              background: "#0c0c14", border: "1px solid #1a1a28", borderRadius: 10,
              padding: "12px 20px", display: "flex", alignItems: "center", gap: 8,
              opacity: 0.5,
            }}>
              <span style={{ fontSize: 18 }}>{g.emoji}</span>
              <span style={{ fontSize: 13, color: "#555570", fontWeight: 600 }}>{g.name}</span>
            </div>
          ))}
        </div>

        {/* Two clean CTAs */}
        <div style={{
          marginTop: 60, marginBottom: 40,
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16,
        }}>
          <div style={{
            background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
            padding: "24px 28px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#9945FF", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              Play
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>More games coming soon</div>
            <div style={{ fontSize: 12, color: "#888" }}>Public-domain classics — free forever, on-chain forever.</div>
          </div>

          <a href="https://github.com/gamerplex" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{
              background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
              padding: "24px 28px", cursor: "pointer", transition: "border-color 0.2s",
              height: "100%",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#14F195"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#252540"}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Buidl
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Gamerplex SKILLS.md coming soon</div>
              <div style={{ fontSize: 12, color: "#888" }}>Ship on-chain games in minutes with Claude Code + our skill pack.</div>
            </div>
          </a>
        </div>

        {/* Footer stats */}
        <div style={{
          borderTop: "1px solid #1a1a28", paddingTop: 20,
          display: "flex", justifyContent: "center", gap: 32,
          fontSize: 11, color: "#333",
        }}>
          <span>CM v2.1 + Orchestrator live on devnet</span>
          <span>21+ unit tests passing</span>
          <span>Built on <span style={{ color: "#9945FF" }}>Solana</span> + <span style={{ color: "#14F195" }}>MagicBlock</span></span>
        </div>
      </div>
    </div>
  );
}
