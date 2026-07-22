// GET /api/scores/recent?userId=&limit= — a player's recent runs across games
// (profile activity feed). Thin proxy to the identity-service; public read.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const userId = u.searchParams.get('userId') ?? '';
  const limit = u.searchParams.get('limit') ?? '20';

  const qs = new URLSearchParams({ app: 'gamerplex', userId, limit });
  const res = await fetch(`${IDENTITY_URL}/api/v1/scores/recent?${qs}`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({ activity: [] }));
  return NextResponse.json(body, { status: res.ok ? 200 : res.status });
}
