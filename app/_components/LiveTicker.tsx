"use client";

import { useEffect, useState } from "react";

// Real top score from the web2 leaderboard (replaces the old hardcoded ticker).
export default function LiveTicker() {
  const [top, setTop] = useState<{ score: number; handle: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/scores/leaderboard?gameId=blockwords&limit=1&window=all")
      .then((r) => r.json())
      .then((d: { leaderboard?: { score: number; handle: string | null }[] }) => {
        const t = d.leaderboard?.[0];
        if (t) setTop({ score: t.score, handle: t.handle });
      })
      .catch(() => undefined);
  }, []);

  if (!top) return null;

  return (
    <div className="gl-ticker glass">
      🏆 Top Blockwords · <b>{top.score.toLocaleString()}</b>
      {top.handle ? ` by @${top.handle}` : ""}
    </div>
  );
}
