// GET /api/daily — today's Daily Goal ring (session-authed). Thin read-only proxy:
// forwards the session cookie to identity-service, which computes "Credits earned
// today" vs the goal. Read-only, so no origin gate needed.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('cookie') ?? '';
  const r = await fetch(`${IDENTITY_URL}/api/v1/daily`, { headers: { cookie }, cache: 'no-store' });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json(body, { status: r.ok ? 200 : r.status });
}
