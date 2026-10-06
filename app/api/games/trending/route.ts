// GET /api/games/trending — all-time cumulative play count per game (+ order).
//
// Source = identity-service's analytics_events (play_started/game_started), which
// replaced PostHog when ph001 was deleted 2026-09-15. game_scores is NOT the source:
// it only counts SAVED runs and therefore undercounts plays.
//
// The historical PostHog data (14,196 events, 2026-06-12 → 2026-09-12) was imported
// into that table, so counts are continuous across the migration.
//
// Cached 1h so the grid never blocks on analytics. Returns
// { order: string[], plays: Record<slug, count> }; empty on any failure so the grid
// falls back to its static order with no counts.

import { NextResponse } from 'next/server';

const IDENTITY_URL =
  process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET() {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/v1/analytics/trending`, {
      next: { revalidate: 3600 }, // cache the analytics query for an hour
    });
    if (!r.ok) return NextResponse.json({ order: [], plays: {} });
    const d = (await r.json()) as { order?: unknown; plays?: unknown };
    const order = Array.isArray(d.order) ? (d.order as string[]) : [];
    const plays =
      d.plays && typeof d.plays === 'object' ? (d.plays as Record<string, number>) : {};
    return NextResponse.json({ order, plays });
  } catch {
    return NextResponse.json({ order: [], plays: {} });
  }
}
