// GET /api/og/challenge?sig=<txSig>
//
// Generic per-challenge OG image (1200×630) for ANY arcade game. Used by the
// og:image on /challenge/[sig] so shared links show the game + score instead of
// a generic logo (the #1 viral fix). The on-chain score memo is the source of
// truth — we fetch from the resolver (never trust query params), so the image
// can't be forged by editing the URL.

import { ImageResponse } from "next/og";

// Node runtime — Edge's 1MB bundle ceiling can't fit next/og on Hobby.
export const runtime = "nodejs";

const RESOLVER_URL =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

const GAME_META: Record<string, { emoji: string; label: string; accent: string; route: string }> = {
  flipball: { emoji: "🎯", label: "FLIPBALL", accent: "#00ffd1", route: "/play/flipball" },
  "cyber-snake": { emoji: "🐍", label: "CYBER SNAKE", accent: "#7cd1ff", route: "/play/cyber-snake" },
  "chess-puzzles": { emoji: "♟", label: "MAGIC CHESS", accent: "#c99aff", route: "/play/magic-chess" },
  blockwords: { emoji: "🔮", label: "BLOCKWORDS", accent: "#ffd24a", route: "/play/blockwords" },
};

function shortAddr(addr: string): string {
  if (!addr || addr.length <= 8) return addr || "?";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sig = url.searchParams.get("sig");

  let score: number | null = null;
  let player: string | null = null;
  let gameSlug = "";
  if (sig && sig.length >= 32 && sig.length <= 128) {
    try {
      const r = await fetch(`${RESOLVER_URL}/arcade/score/${sig}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j?.ok) {
          score = Number(j.score);
          player = String(j.player || "");
          gameSlug = String(j.gameSlug || "");
        }
      }
    } catch { /* fall through to generic card */ }
  }

  const meta = GAME_META[gameSlug] ?? { emoji: "🎮", label: "GAMERPLEX ARCADE", accent: "#9945ff", route: "/arcade" };
  const isChallenge = score != null && player != null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #050514 0%, #0a0a28 35%, #1a0830 100%)",
          color: "#e8e8f0",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top: game brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, color: meta.accent, letterSpacing: 4 }}>
          <span style={{ fontSize: 56 }}>{meta.emoji}</span>
          <span style={{ fontWeight: 800 }}>{meta.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 22, color: "#5a5a70", letterSpacing: 2 }}>gamerplex.com</span>
        </div>

        <div style={{ display: "flex", flexGrow: 1 }} />

        {isChallenge ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 54, fontWeight: 800, color: "#ff9a40", letterSpacing: 2 }}>Beat this score.</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
              <span style={{ fontSize: 28, color: "#8a8aa0" }}>{shortAddr(player!)}</span>
              <span style={{ fontSize: 28, color: "#5a5a70" }}>·</span>
              <span style={{ fontSize: 144, fontWeight: 900, color: meta.accent, lineHeight: 1, fontFamily: "monospace" }}>
                {score!.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 26, color: "#8a8aa0", marginTop: 12 }}>Same seed · same run · pure skill</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#14F195", letterSpacing: 2 }}>Save your score.</div>
            <div style={{ fontSize: 32, color: "#8a8aa0" }}>On-chain leaderboard. Free to play.</div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            marginTop: 50,
            paddingTop: 24,
            borderTop: "2px solid #252540",
            fontSize: 22,
            color: "#5a5a70",
            letterSpacing: 1,
          }}
        >
          {isChallenge ? `Click to play the same run on ${meta.route}` : meta.route}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
