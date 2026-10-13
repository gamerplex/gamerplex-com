import type { Metadata } from "next";
import FlipballShell from "./FlipballShell";

export const metadata: Metadata = {
  title: "FLIPBALL — Pinball on Solana | Gamerplex",
  description:
    "Three.js pinball with slingshots, drop targets, and a free web2 leaderboard. Play instantly on Gamerplex Arcade — no wallet needed.",
  openGraph: {
    title: "FLIPBALL — Pinball on Solana",
    description: "Free pinball. Rank on the leaderboard with just an email; save on-chain optionally. Built on Gamerplex.",
    type: "website",
    url: "https://gamerplex.com/play/flipball",
    images: [{ url: "/games/flipball/og.png", width: 1200, height: 630, alt: "FLIPBALL — pinball gameplay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLIPBALL — Pinball on Solana",
    description: "Free pinball, web2 leaderboard, optional on-chain verified scores. Built on Gamerplex.",
    images: ["/games/flipball/og.png"],
  },
};

export default function FlipballPage() {
  return (
    <>
      <h1 className="sr-only">Flipball</h1>
      <FlipballShell />
    </>
  );
}
