// GET /api/og/challenge?id=<challengeId>   (legacy: ?sig=<txSig>)
//
// Generic per-challenge OG image (1200×630) for ANY arcade game. Used by the
// og:image on /challenge/[id] so shared links show the game + score instead of
// a generic logo (the #1 viral fix). The run is re-read server-side from the
// resolver (on-chain) or identity (free web2 row) — never from query params —
// so the image can't be forged by editing the URL.

import { ImageResponse } from "next/og";

import { fetchChallenge, gameMeta } from "../../../../lib/arcade/challenge";

// Node runtime — Edge's 1MB bundle ceiling can't fit next/og on Hobby.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // ?id is the current param; ?sig kept so links already shared keep rendering.
  const id = url.searchParams.get("id") || url.searchParams.get("sig") || "";

  const c = await fetchChallenge(id);
  const g = c ? gameMeta(c.gameSlug) : null;
  const meta = {
    emoji: g?.emoji ?? "🎮",
    label: (g?.label ?? "Gamerplex Arcade").toUpperCase(),
    accent: g?.accent ?? "#9945ff",
    route: g?.route ?? "/arcade",
  };
  const isChallenge = c != null;
  const score = c?.score ?? null;
  const who = c?.who ?? null;

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
              <span style={{ fontSize: 28, color: "#8a8aa0" }}>{who}</span>
              <span style={{ fontSize: 28, color: "#5a5a70" }}>·</span>
              <span style={{ fontSize: 144, fontWeight: 900, color: meta.accent, lineHeight: 1, fontFamily: "monospace" }}>
                {score!.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 26, color: "#8a8aa0", marginTop: 12 }}>
              {c!.kind === "onchain" ? "Verified on-chain · pure skill" : "Same seed · same run · pure skill"}
            </div>
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
