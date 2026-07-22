"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GAMES } from "../_data/games";

// Games grid ordered by recent play volume, with live play counts (PostHog, cached).
export default function GameGrid() {
  const [ordered, setOrdered] = useState(GAMES);
  const [plays, setPlays] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/games/trending")
      .then((r) => r.json())
      .then((d: { order?: string[]; plays?: Record<string, number> }) => {
        setPlays(d.plays ?? {});
        if (Array.isArray(d.order) && d.order.length) {
          const rank = new Map(d.order.map((slug, i) => [slug, i] as const));
          setOrdered([...GAMES].sort((a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999)));
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="gl-grid">
      {ordered.map((g) => {
        const n = plays[g.slug] ?? 0;
        return (
          <Link key={g.name} href={g.path} className="gl-card" style={{ ["--accent" as string]: g.accent }}>
            <div className="gl-card-img" style={{ backgroundImage: `url(/games/${g.slug}/banner.png)` }} />
            <span className="gl-arrow">↗</span>
            {n > 0 && <span className="gl-card-plays">🔥 {n.toLocaleString()} plays</span>}
            <div className="gl-card-info">
              <div className="gl-card-name">{g.name}{g.sub && <span className="gl-card-sub">{g.sub}</span>}</div>
              <div className="gl-card-row"><span className="gl-card-tag">{g.tag}</span><span className="gl-play">▶ Play free</span></div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
