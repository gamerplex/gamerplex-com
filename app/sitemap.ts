import type { MetadataRoute } from "next";
import { ASSETS } from "./assets/_data/assets";

const BASE = "https://gamerplex.com";
const GAMES = ["netherlevel", "vrfc", "flipball", "cyber-snake", "magic-chess", "blockwords", "time-gate", "tcg-quiz", "chess"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/build`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/assets`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...ASSETS.map((a) => ({ url: `${BASE}/assets/${a.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${BASE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/download`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    ...GAMES.map((g) => ({ url: `${BASE}/play/${g}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
