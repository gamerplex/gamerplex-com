import { Metadata } from "next";
import Link from "next/link";

const RESOLVER_URL = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_ENV === "production"
    ? "https://gamerplex.com"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://gamerplex.com");

interface ScoreMemo {
  ok: boolean;
  tx: string;
  blockTime: number | null;
  gameSlug: string;
  variant: string;
  player: string;
  score: number;
  continues: number;
  powerups: number;
  duration: number;
  seedB58: string;
}

const GAME_META: Record<string, { emoji: string; label: string; route: string; accent: string }> = {
  flipball: { emoji: "🎯", label: "Flipball", route: "https://flipball.gamerplex.com", accent: "#00ffd1" },
  "cyber-snake": { emoji: "🐍", label: "Cyber Snake", route: "/play/cyber-snake", accent: "#4fc3f7" },
  "chess-puzzles": { emoji: "♟", label: "Magic Chess Puzzles", route: "/play/magic-chess", accent: "#c99aff" },
  blockwords: { emoji: "🔮", label: "Blockwords", route: "/play/blockwords", accent: "#ffd24a" },
};

function shortWallet(w: string): string {
  return w.length > 8 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

async function fetchScore(sig: string): Promise<ScoreMemo | null> {
  if (!sig || sig.length < 32 || sig.length > 128) return null;
  try {
    const r = await fetch(`${RESOLVER_URL}/arcade/score/${encodeURIComponent(sig)}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as ScoreMemo;
    return j.ok ? j : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const score = await fetchScore(id);
  if (!score) {
    return {
      title: "Challenge — gamerplex.com",
      description: "Beat this score on Gamerplex Arcade.",
    };
  }
  const game = GAME_META[score.gameSlug] ?? { label: score.gameSlug, emoji: "🎮", route: "/", accent: "#9945ff" };
  const title = `${game.emoji} Beat ${score.score.toLocaleString()} on ${game.label}`;
  const desc = `${shortWallet(score.player)} scored ${score.score.toLocaleString()}. Same seed, same physics. Pure skill.`;
  const ogImage =
    score.gameSlug === "cyber-snake"
      ? `${SITE}/api/og/snake-challenge?sig=${encodeURIComponent(id)}`
      : `${SITE}/og.png`;
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
    },
  };
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const score = await fetchScore(id);

  if (!score) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 24px", color: "#e8e8f0", fontFamily: "system-ui" }}>
        <div style={{
          textAlign: "center",
          padding: "32px 28px",
          background: "rgba(255,82,48,0.04)",
          border: "1px solid rgba(255,82,48,0.3)",
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 56, marginBottom: 8, opacity: 0.6 }}>⌛</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Challenge not found</div>
          <div style={{ color: "#9090a8", fontSize: 13, marginBottom: 24 }}>
            Either the score tx hasn&apos;t indexed yet, or the link is malformed.
          </div>
          <Link href="/" style={{
            display: "inline-block",
            padding: "12px 28px",
            background: "linear-gradient(90deg, #9945FF, #14F195)",
            color: "#000",
            borderRadius: 8,
            fontWeight: 900,
            fontSize: 13,
            textDecoration: "none",
          }}>Browse the arcade →</Link>
        </div>
      </main>
    );
  }

  const game = GAME_META[score.gameSlug] ?? { label: score.gameSlug, emoji: "🎮", route: "/", accent: "#9945ff" };
  const playUrl = `${game.route}${game.route.includes("?") ? "&" : "?"}referrer=${encodeURIComponent(score.player)}`;
  const isExternal = game.route.startsWith("http");
  const ageDays = score.blockTime ? Math.floor((Date.now() / 1000 - score.blockTime) / 86400) : null;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 24px", color: "#e8e8f0", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#9090a8", textTransform: "uppercase" }}>
          On-chain challenge
        </div>
        <div style={{ fontSize: 56, marginTop: 12, lineHeight: 1 }}>{game.emoji}</div>
        <div style={{ fontSize: 13, color: game.accent, fontFamily: "monospace", marginTop: 8, letterSpacing: 1, textTransform: "uppercase" }}>
          {game.label}
        </div>
      </div>

      <div style={{
        padding: "26px 24px",
        background: "linear-gradient(180deg, rgba(153,69,255,0.08), rgba(20,241,149,0.04))",
        border: `1px solid ${game.accent}40`,
        borderRadius: 14,
        textAlign: "center",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: "#9090a8", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          {shortWallet(score.player)} scored
        </div>
        <div style={{ fontSize: 52, fontWeight: 900, color: game.accent, fontFamily: "monospace", letterSpacing: -1, lineHeight: 1 }}>
          {score.score.toLocaleString()}
        </div>
        {ageDays !== null && (
          <div style={{ fontSize: 11, color: "#9090a8", marginTop: 8 }}>
            {ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays} days ago`}
            {" · "}
            <a
              href={`https://explorer.solana.com/tx/${score.tx}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#9945ff", textDecoration: "none" }}
            >
              view on chain ↗
            </a>
          </div>
        )}
      </div>

      <a
        href={playUrl}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        style={{
          display: "block",
          padding: "16px 24px",
          background: `linear-gradient(90deg, ${game.accent}, #9945FF)`,
          color: "#0d001a",
          borderRadius: 12,
          fontWeight: 900,
          fontSize: 16,
          textAlign: "center",
          textDecoration: "none",
          letterSpacing: 0.5,
          boxShadow: `0 0 24px ${game.accent}40`,
        }}
      >
        BEAT {score.score.toLocaleString()} →
      </a>

      <div style={{
        marginTop: 18,
        padding: "14px 16px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid #252540",
        borderRadius: 10,
        fontSize: 12,
        color: "#9090a8",
        lineHeight: 1.6,
      }}>
        <strong style={{ color: "#e8e8f0" }}>How it works:</strong> play the game free. When you save a score on-chain ($0.05), {shortWallet(score.player)} earns 20% as the referrer who brought you here. Pure skill — no wager, no lobby, no 1v1.
      </div>

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/arcade" style={{
          fontSize: 12,
          color: "#9090a8",
          textDecoration: "none",
          borderBottom: "1px dotted #9090a8",
        }}>
          ← browse the rest of the arcade
        </Link>
      </div>
    </main>
  );
}
