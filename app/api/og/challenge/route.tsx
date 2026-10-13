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

// A challenge's score never changes, so the CDN can keep the render; X's card fetcher times out on slow cold renders.
const CACHE_CHALLENGE = "public, max-age=86400, s-maxage=31536000, immutable";
const CACHE_FALLBACK = "public, max-age=300, s-maxage=3600";

const BANNERS = new Set(["blockwords", "cyber-snake", "flipball", "magic-chess", "netherlevel", "tcg-quiz", "time-gate", "vrfc"]);

function banner(route: string, origin: string): string | null {
  const slug = route.split("/").filter(Boolean).pop() ?? "";
  return BANNERS.has(slug) ? `${origin}/games/${slug}/banner.png` : null;
}

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
  const art = isChallenge ? banner(meta.route, url.origin) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#07061a", color: "#f4f2ff", fontFamily: "system-ui, sans-serif" }}>
        {art && <img src={art} width={1200} height={675} style={{ position: "absolute", left: 0, top: -22, width: 1200, height: 675, objectFit: "cover" }} />}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, display: "flex", background: art ? "linear-gradient(90deg, rgba(7,6,26,0.97) 0%, rgba(7,6,26,0.9) 45%, rgba(7,6,26,0.35) 75%, rgba(7,6,26,0.15) 100%)" : "linear-gradient(135deg, #050514 0%, #0a0a28 40%, #1a0830 100%)" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "64px 72px", width: 760, height: 630 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: meta.accent, letterSpacing: 4, fontWeight: 800 }}>
            <span style={{ fontSize: 44 }}>{meta.emoji}</span>
            <span>{meta.label}</span>
          </div>

          {isChallenge ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
              <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: 1 }}>Beat this score.</div>
              <div style={{ display: "flex", fontSize: 168, fontWeight: 900, color: meta.accent, lineHeight: 1, marginTop: 6 }}>
                {c!.score.toLocaleString()}
              </div>
              <div style={{ display: "flex", fontSize: 30, color: "#c9c3ea", marginTop: 14 }}>
                set by {c!.who}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 60, gap: 16 }}>
              <div style={{ fontSize: 72, fontWeight: 900, color: "#14F195" }}>Play free.</div>
              <div style={{ fontSize: 34, color: "#c9c3ea" }}>10+ skill games. Scores on Solana.</div>
            </div>
          )}

          <div style={{ display: "flex", flexGrow: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", background: meta.accent, color: "#07061a", fontSize: 26, fontWeight: 900, padding: "12px 26px", borderRadius: 999 }}>
              {isChallenge ? "Play the same run →" : "Play now →"}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#9a93c4" }}>
              {isChallenge ? (c!.kind === "onchain" ? "verified on-chain · pure skill" : "same seed · pure skill") : "gamerplex.com"}
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", right: 40, top: 40, display: "flex", fontSize: 24, fontWeight: 800, color: "#f4f2ff", background: "rgba(7,6,26,0.7)", padding: "10px 20px", borderRadius: 999 }}>
          gamerplex.com
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": isChallenge ? CACHE_CHALLENGE : CACHE_FALLBACK } }
  );
}
