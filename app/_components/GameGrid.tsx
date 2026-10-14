"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GAMES } from "../_data/games";

// Games grid ordered by all-time play volume.
//
// The order and counts used to arrive AFTER first paint — a client fetch that proxies to
// own1 (~1-3s) — so the grid rendered in one order and then rearranged itself under the
// reader. That reads as broken even though nothing is wrong.
//
// So: never re-sort while someone is looking. Paint immediately from the last known
// order (localStorage), fetch in the background, and apply what comes back to the NEXT
// visit. A first-ever visitor sees the static order, which is a defensible order anyway;
// everyone else sees the real one instantly. Counts render into reserved space so even
// the badge appearing does not move a card.
const CACHE_KEY = "gamerplex:game-order:v1";

type Cached = { order: string[]; plays: Record<string, number> };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null; // private window, blocked storage — fall back to the static order
  }
}

function applyOrder(order: string[]) {
  if (!order.length) return GAMES;
  const rank = new Map(order.map((slug, i) => [slug, i] as const));
  return [...GAMES].sort((a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999));
}

export default function GameGrid() {
  // Initialised from cache during the first render, so there is no second paint.
  const [cached] = useState<Cached | null>(() => (typeof window === "undefined" ? null : readCache()));
  const ordered = cached ? applyOrder(cached.order) : GAMES;
  const plays = cached?.plays ?? {};

  useEffect(() => {
    // Refresh for next time. Deliberately does NOT touch what is on screen.
    fetch("/api/games/trending")
      .then((r) => r.json())
      .then((d: { order?: string[]; plays?: Record<string, number> }) => {
        if (!Array.isArray(d.order) || !d.order.length) return;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ order: d.order, plays: d.plays ?? {} }));
        } catch {
          // Storage unavailable; the grid simply stays on the static order.
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
