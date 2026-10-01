import { Metadata } from "next";
import Link from "next/link";

import { buildPlayUrl, fetchChallenge, gameMeta, type Challenge } from "../../../lib/arcade/challenge";

const NET = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet";
const CLUSTER = NET === "mainnet" ? "" : `?cluster=${NET}`;
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_ENV === "production"
    ? "https://gamerplex.com"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://gamerplex.com");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await fetchChallenge(id);
  if (!c) {
    return {
      title: "Challenge — gamerplex.com",
      description: "Beat this score on Gamerplex Arcade.",
    };
  }
  const game = gameMeta(c.gameSlug);
  const title = `${game.emoji} Beat ${c.score.toLocaleString()} on ${game.label}`;
  const desc = `${c.who} scored ${c.score.toLocaleString()}. Same seed, same physics. Pure skill.`;
  // Per-challenge OG image for EVERY game (was cyber-snake only → others showed
  // the generic logo). The route re-reads the score server-side, so it can't be forged.
  const ogImage = `${SITE}/api/og/challenge?id=${encodeURIComponent(id)}`;
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

function ProofBadge({ c }: { c: Challenge }) {
  if (c.kind === "onchain" && c.tx) {
    return (
      <a
        href={`https://explorer.solana.com/tx/${c.tx}${CLUSTER}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(20,241,149,0.08)",
          border: "1px solid rgba(20,241,149,0.35)",
          color: "#14F195",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textDecoration: "none",
        }}
      >
        ✓ Verified on-chain ↗
      </a>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid #303050",
        color: "#9090a8",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      Recorded
    </span>
  );
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await fetchChallenge(id);

  if (!c) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "60px 24px", color: "#e8e8f0", fontFamily: "system-ui" }}>
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
            Either the run hasn&apos;t indexed yet, or the link is malformed.
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
      </div>
    );
  }

  const game = gameMeta(c.gameSlug);
  const playUrl = buildPlayUrl(c, id);
  const isExternal = game.route.startsWith("http");
  const ageDays = c.at ? Math.floor((Date.now() / 1000 - c.at) / 86400) : null;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "60px 24px", color: "#e8e8f0", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#9090a8", textTransform: "uppercase" }}>
          Arcade challenge
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
          {c.who} scored
        </div>
        <div style={{ fontSize: 52, fontWeight: 900, color: game.accent, fontFamily: "monospace", letterSpacing: -1, lineHeight: 1 }}>
          {c.score.toLocaleString()}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <ProofBadge c={c} />
          {ageDays !== null && (
            <span style={{ fontSize: 11, color: "#9090a8" }}>
              {ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays} days ago`}
            </span>
          )}
        </div>
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
        BEAT {c.score.toLocaleString()} →
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
        <strong style={{ color: "#e8e8f0" }}>How it works:</strong> play the game free — no signup to
        start. Sign in and you both earn bonus Credits: a welcome bonus for you and a referral bonus for{" "}
        {c.who}, who brought you here. Pure skill — no wager, no lobby, no 1v1.
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
    </div>
  );
}
