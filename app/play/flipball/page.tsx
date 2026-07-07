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
    images: [{ url: "/play/flipball/banner.jpeg", width: 1956, height: 1080, alt: "FLIPBALL — pinball gameplay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLIPBALL — Pinball on Solana",
    description: "Free pinball, web2 leaderboard, optional on-chain verified scores. Built on Gamerplex.",
    images: ["/play/flipball/banner.jpeg"],
  },
};

export default function FlipballPage() {
  return <FlipballShell />;
}
