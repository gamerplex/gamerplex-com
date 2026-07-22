// POST /api/streak/ping — bump the server-authoritative daily streak (session-authed).
// Thin proxy: forwards the session cookie to identity-service, which owns the streak
// state (count / freeze / milestones). Origin-checked (it mutates). Credits stay a
// separate award (this route never touches $GAME).

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

const ALLOWED_ORIGINS = ['https://gamerplex.com', 'https://www.gamerplex.com'].concat(
  process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [],
);

function badOrigin(req: NextRequest): boolean {
  let origin = req.headers.get('origin');
  if (!origin) {
    const ref = req.headers.get('referer');
    try { origin = ref ? new URL(ref).origin : null; } catch { origin = null; }
  }
  return !origin || !ALLOWED_ORIGINS.includes(origin);
}

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
  const cookie = req.headers.get('cookie') ?? '';
  const r = await fetch(`${IDENTITY_URL}/api/v1/streak/ping`, {
    method: 'POST', headers: { cookie }, cache: 'no-store',
  });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json(body, { status: r.ok ? 200 : r.status });
}
