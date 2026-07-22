// GET /api/referrals/leaderboard?window=&limit= — the 🔥 Top Referrers board.
// Thin proxy to identity-service (gamerplex app). Ranks by successful-referral
// COUNT from the credit_ledger. Credits-only growth mechanic (R2). Public read.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const window = u.searchParams.get('window') === 'week' ? 'week' : 'all';
  const limit = String(Math.max(1, Math.min(100, Number(u.searchParams.get('limit') ?? 50) || 50)));
  const qs = new URLSearchParams({ app: 'gamerplex', window, limit });
  try {
    const r = await fetch(`${IDENTITY_URL}/api/v1/referrals/leaderboard?${qs}`, { cache: 'no-store' });
    const body = await r.json().catch(() => ({ leaderboard: [] }));
    return NextResponse.json(body, { status: r.ok ? 200 : r.status });
  } catch {
    return NextResponse.json({ leaderboard: [] }, { status: 200 });
  }
}
