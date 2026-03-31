"use client";

import { useState } from "react";
import Link from "next/link";

// Game registry — any game that uses Contention Markets can be listed here.
// In production this would be fetched from the resolver API or on-chain registry.
const GAMES = [
  {
    id: "reaction-duel",
    name: "Reaction Duel",
    description: "Fastest click wins. Race against an AI agent.",
    category: "arcade",
    stake: 5,
    path: "/play/reaction-duel",
    hosted: "gamerplex.com",
    author: "Gamerplex",
    color: "#ff6b2c",
    emoji: "⚡",
    matches: 47,
    volume: 940,
    status: "live" as const,
  },
  {
    id: "math-race",
    name: "Math Race",
    description: "Solve equations faster than the AI. First to 10 wins.",
    category: "arcade",
    stake: 5,
    path: "/play/math-race",
    hosted: "gamerplex.com",
    author: "Gamerplex",
    color: "#448aff",
    emoji: "🧮",
    matches: 31,
    volume: 620,
    status: "live" as const,
  },
  {
    id: "trivia-battle",
    name: "Trivia Battle",
    description: "8 rounds of Solana trivia. Most correct answers wins.",
    category: "arcade",
    stake: 5,
    path: "/play/trivia-battle",
    hosted: "gamerplex.com",
    author: "Gamerplex",
    color: "#b388ff",
    emoji: "🧠",
    matches: 22,
    volume: 440,
    status: "live" as const,
  },
  {
    id: "pet-legends",
    name: "Pet Legends Arena",
    description: "NFT trait-based battler. Equip pets, trainers, and memecoins. Fight for SOL.",
    category: "nft",
    stake: 10,
    path: null,
    hosted: "arena.petlegends.com",
    author: "Pet Legends",
    color: "#ff007a",
    emoji: "🐾",
    matches: 0,
    volume: 0,
    status: "coming-soon" as const,
  },
  {
    id: "molty-arena",
    name: "Molty Arena",
    description: "Predict which AI copy-trader performs best. Esports for degens.",
    category: "esports",
    stake: 25,
    path: null,
    hosted: "molty.games",
    author: "Gamerplex",
    color: "#ff6b2c",
    emoji: "🦞",
    matches: 0,
    volume: 0,
    status: "coming-soon" as const,
  },
  {
    id: "battleship",
    name: "Battleship",
    description: "Hidden board on MagicBlock ER. Fully on-chain. Provably fair.",
    category: "strategy",
    stake: 10,
    path: null,
    hosted: "gamerplex.com",
    author: "Gamerplex",
    color: "#00e676",
    emoji: "🚢",
    matches: 0,
    volume: 0,
    status: "coming-soon" as const,
  },
];

const CATEGORIES = [
  { id: "all", label: "All Games" },
  { id: "arcade", label: "Arcade" },
  { id: "strategy", label: "Strategy" },
  { id: "nft", label: "NFT" },
  { id: "esports", label: "eSports" },
  { id: "community", label: "Community" },
];

export default function GamesPortal() {
  const [category, setCategory] = useState("all");
  const filtered = category === "all" ? GAMES : GAMES.filter((g) => g.category === category);

  return (
    <div style={{
      minHeight: "100vh", background: "#050508", color: "#e8e8f0",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px", borderBottom: "1px solid #252540",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{
            fontSize: 22, fontWeight: 700,
            background: "linear-gradient(135deg, #ff6b2c, #ffd740)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>GAMERPLEX</span>
        </Link>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <Link href="/" style={{ color: "#555570", textDecoration: "none" }}>Arena</Link>
          <Link href="/games" style={{ color: "#ff6b2c", textDecoration: "none", fontWeight: 600 }}>Games</Link>
          <a href="https://github.com/gamerplex" target="_blank" style={{ color: "#555570", textDecoration: "none" }}>SDK</a>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
        {/* Hero */}
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>Games</h1>
        <p style={{ color: "#555570", fontSize: 14, marginBottom: 8 }}>
          Every game settles on <a href="https://contention.markets" style={{ color: "#18ffff", textDecoration: "none" }}>Contention Markets</a> (Solana). 2% protocol fee.
        </p>
        <p style={{ color: "#555570", fontSize: 13, marginBottom: 24 }}>
          Build your own →{" "}
          <code style={{ background: "#14141f", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
            npx add-skill gamerplex-dev
          </code>
        </p>

        {/* Categories */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              style={{
                background: category === c.id ? "#ff6b2c" : "#14141f",
                color: category === c.id ? "white" : "#555570",
                border: "1px solid #252540", borderRadius: 6,
                padding: "6px 14px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
              }}
            >{c.label}</button>
          ))}
        </div>

        {/* Game Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {filtered.map((game) => (
            <div key={game.id} style={{
              background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
              padding: 20, transition: "border-color 0.2s", cursor: game.status === "live" ? "pointer" : "default",
              opacity: game.status === "live" ? 1 : 0.6,
              position: "relative",
            }}>
              {game.status === "coming-soon" && (
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  background: "#252540", color: "#555570", fontSize: 9,
                  padding: "2px 8px", borderRadius: 4, textTransform: "uppercase",
                  letterSpacing: 1, fontWeight: 600,
                }}>Coming Soon</div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: game.color,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}>{game.emoji}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{game.name}</div>
                  <div style={{ fontSize: 10, color: "#555570" }}>by {game.author}</div>
                </div>
              </div>

              <p style={{ fontSize: 13, color: "#888", marginBottom: 12, lineHeight: 1.4 }}>
                {game.description}
              </p>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555570", marginBottom: 12 }}>
                <span>${game.stake} stake</span>
                <span>{game.matches} matches</span>
                <span>${game.volume} vol</span>
              </div>

              {game.status === "live" && game.path && (
                <Link href={game.path} style={{
                  display: "block", textAlign: "center",
                  background: "linear-gradient(135deg, #ff6b2c, #ff8f35)",
                  color: "white", padding: "10px", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, textDecoration: "none",
                }}>Play Now</Link>
              )}

              {game.status === "live" && !game.path && game.hosted && (
                <a href={`https://${game.hosted}`} target="_blank" style={{
                  display: "block", textAlign: "center",
                  background: "#14141f", border: "1px solid #252540",
                  color: "#e8e8f0", padding: "10px", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, textDecoration: "none",
                }}>Play on {game.hosted}</a>
              )}

              <div style={{ fontSize: 10, color: "#333", marginTop: 8, textAlign: "center" }}>
                Hosted: {game.hosted}
              </div>
            </div>
          ))}

          {/* Create Your Own Card */}
          <div style={{
            background: "linear-gradient(135deg, #1a1028, #0f1a2e)",
            border: "1px dashed #2a2050", borderRadius: 12, padding: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center", minHeight: 200,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Build Your Game</div>
            <div style={{ fontSize: 12, color: "#555570", marginBottom: 16 }}>
              Use Claude Code + Gamerplex Skill to create a wagered game in minutes.
            </div>
            <a href="https://github.com/gamerplex/gamerplex-sdk" target="_blank" style={{
              background: "#14141f", border: "1px solid #252540",
              color: "#e8e8f0", padding: "8px 20px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, textDecoration: "none",
            }}>View SDK →</a>
          </div>
        </div>
      </div>
    </div>
  );
}
