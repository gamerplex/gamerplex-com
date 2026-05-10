// GET /api/og/snake-challenge?sig=<txSig>
//
// Renders a 1200×630 OG image for a Cyber Snake challenge link. Used by
// `<meta property="og:image">` on /play/cyber-snake?mode=arcade&challenge=<sig>.
// The on-chain score memo IS the source of truth — we fetch from the
// resolver instead of trusting query params, so the image can't be forged
// by altering the URL.

import { ImageResponse } from "next/og";

// Node runtime — Edge has a 1MB bundle ceiling on Hobby plan and `next/og`
// pulls in enough to bust it. Node has a 50MB ceiling and `next/og` runs
// happily there. Cold-start is a touch slower but social platforms cache
// OG images aggressively, so the perf delta doesn't matter.
export const runtime = "nodejs";

const RESOLVER_URL =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

function shortAddr(addr: string): string {
  if (!addr || addr.length <= 8) return addr || "?";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sig = url.searchParams.get("sig");

  let score: number | null = null;
  let player: string | null = null;
  if (sig && sig.length >= 32 && sig.length <= 128) {
    try {
      const r = await fetch(`${RESOLVER_URL}/arcade/score/${sig}`, {
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.ok) {
          score = Number(j.score);
          player = String(j.player || "");
        }
      }
    } catch { /* fall through to generic card */ }
  }

  const isChallenge = score != null && player != null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #050514 0%, #0a0a28 35%, #1a0830 100%)",
          color: "#e8e8f0",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Top: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, color: "#7cd1ff", letterSpacing: 4 }}>
          <span style={{ fontSize: 56 }}>🐍</span>
          <span style={{ fontWeight: 800 }}>CYBER SNAKE</span>
          <span style={{ marginLeft: "auto", fontSize: 22, color: "#5a5a70", letterSpacing: 2 }}>
            gamerplex.com
          </span>
        </div>

        {/* Spacer */}
        <div style={{ display: "flex", flexGrow: 1 }} />

        {/* Headline */}
        {isChallenge ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 54, fontWeight: 800, color: "#ff9a40", letterSpacing: 2 }}>
              Beat this score.
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
              <span style={{ fontSize: 28, color: "#8a8aa0" }}>{shortAddr(player!)}</span>
              <span style={{ fontSize: 28, color: "#5a5a70" }}>·</span>
              <span style={{ fontSize: 144, fontWeight: 900, color: "#ffd24a", lineHeight: 1, fontFamily: "monospace" }}>
                {score!.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: 26, color: "#8a8aa0", marginTop: 12 }}>
              Same seed · same food spawns · pure skill
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#14F195", letterSpacing: 2 }}>
              Save your score.
            </div>
            <div style={{ fontSize: 32, color: "#8a8aa0" }}>
              On-chain leaderboard. Free to play.
            </div>
          </div>
        )}

        {/* Footer */}
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
          {isChallenge
            ? "Click to play the same run on /play/cyber-snake"
            : "/play/cyber-snake"}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
