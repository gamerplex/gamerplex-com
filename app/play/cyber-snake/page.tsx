import type { Metadata } from "next";
import CyberSnakeRouter from "./CyberSnakeRouter";

const RESOLVER_URL =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_ENV === "production"
    ? "https://gamerplex.com"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://gamerplex.com");

function shortAddr(addr: string): string {
  if (!addr || addr.length <= 8) return addr || "?";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string | string[] }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const sig = pickFirst(sp?.challenge);

  let challengerScore: number | null = null;
  let challengerPlayer: string | null = null;
  if (sig && sig.length >= 32 && sig.length <= 128) {
    try {
      const r = await fetch(`${RESOLVER_URL}/arcade/score/${sig}`, { next: { revalidate: 60 } });
      if (r.ok) {
        const j = await r.json();
        if (j?.ok) {
          challengerScore = Number(j.score);
          challengerPlayer = String(j.player || "");
        }
      }
    } catch {}
  }

  const ogImage = sig
    ? `${SITE}/api/og/snake-challenge?sig=${encodeURIComponent(sig)}`
    : `${SITE}/api/og/snake-challenge`;

  if (challengerScore != null && challengerPlayer) {
    const title = `🐍 Beat ${challengerScore.toLocaleString()} on Cyber Snake — gamerplex.com`;
    const desc = `${shortAddr(challengerPlayer)} scored ${challengerScore.toLocaleString()}. Same seed, same food spawns. Pure skill.`;
    return {
      title,
      description: desc,
      openGraph: { title, description: desc, images: [{ url: ogImage, width: 1200, height: 630 }], type: "website" },
      twitter: { card: "summary_large_image", title, description: desc, images: [ogImage] },
    };
  }

  return {
    title: "Cyber Snake — gamerplex.com",
    description: "On-chain Snake. Save your score forever. Free to play.",
    openGraph: {
      title: "Cyber Snake — gamerplex.com",
      description: "On-chain Snake. Save your score forever. Free to play.",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Cyber Snake — gamerplex.com",
      description: "On-chain Snake. Save your score forever. Free to play.",
      images: [ogImage],
    },
  };
}

export default function CyberSnakePage() {
  return <CyberSnakeRouter />;
}
