// GET /api/scores/leaderboard?gameId=&limit=&verifiedOnly= — public web2 leaderboard
// for a game (best-per-user, with the Verified/tx column). Thin proxy to the
// identity-service; no auth (public board).

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const gameId = u.searchParams.get('gameId') ?? '';
  const limit = u.searchParams.get('limit') ?? '50';
  const verifiedOnly = u.searchParams.get('verifiedOnly') === '1' ? '1' : '0';
  const wRaw = u.searchParams.get('window');
  const window = wRaw === 'day' ? 'day' : wRaw === 'week' ? 'week' : 'all';

  // crossApp=1 → federation-wide board, for a game published on more than one
  // property (tcg-quiz runs on sledgit too). users.email is unique so the same
  // player is one user_id everywhere and the service dedupes them across
  // domains. Read-only — writes stay per-app with per-app scoped keys.
  const app = u.searchParams.get('crossApp') === '1' ? '*' : 'gamerplex';

  const qs = new URLSearchParams({ app, gameId, limit, verifiedOnly, window });
  const res = await fetch(`${IDENTITY_URL}/api/v1/scores/leaderboard?${qs}`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({ leaderboard: [] }));
  return NextResponse.json(body, { status: res.ok ? 200 : res.status });
}
