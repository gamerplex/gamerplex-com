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

  const qs = new URLSearchParams({ app: 'gamerplex', gameId, limit, verifiedOnly });
  const res = await fetch(`${IDENTITY_URL}/api/v1/scores/leaderboard?${qs}`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({ leaderboard: [] }));
  return NextResponse.json(body, { status: res.ok ? 200 : res.status });
}
