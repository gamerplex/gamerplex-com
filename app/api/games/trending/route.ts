// GET /api/games/trending — recent play volume per game ("trending" + live counts).
// Source = PostHog play events (play_started/game_started), the only complete play
// signal (game_scores undercounts: saved runs only). Queried via HogQL through a
// server-side personal key (never exposed to the browser) and cached 1h so the grid
// never blocks on analytics. Test traffic excluded. Returns
// { order: string[], plays: Record<slug, count> }; empty on any failure so the grid
// falls back to its static order with no counts.

import { NextResponse } from 'next/server';

const PH_HOST = process.env.POSTHOG_HOST || 'https://ph001.gamerplex.com';
const PH_KEY = process.env.POSTHOG_PERSONAL_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID || '1';

const HOGQL = `SELECT properties.game AS game, count() AS plays
  FROM events
  WHERE event IN ('play_started','game_started')
    AND timestamp > now() - INTERVAL 14 DAY
    AND ifNull(properties.test_traffic, false) = false
  GROUP BY game ORDER BY plays DESC`;

export async function GET() {
  if (!PH_KEY) return NextResponse.json({ order: [], plays: {} });
  try {
    const r = await fetch(`${PH_HOST}/api/projects/${PROJECT}/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PH_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: HOGQL } }),
      next: { revalidate: 3600 }, // cache the analytics query for an hour
    });
    if (!r.ok) return NextResponse.json({ order: [], plays: {} });
    const d = await r.json();
    const rows = (Array.isArray(d.results) ? d.results : []).filter(
      (row: [string, number]) => typeof row?.[0] === 'string' && row[0].length > 0,
    );
    const order = rows.map((row: [string, number]) => row[0]);
    const plays: Record<string, number> = {};
    for (const [game, count] of rows) plays[game] = Number(count) || 0;
    return NextResponse.json({ order, plays });
  } catch {
    return NextResponse.json({ order: [], plays: {} });
  }
}
