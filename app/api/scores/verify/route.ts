// POST /api/scores/verify — after the player upgrades a run to a permanent
// on-chain arcade save, stitch its tx signature onto their web2 leaderboard row
// (→ the "Verified tx↗" column). Session-authed, server-only per-app key.
//
// Body: { gameId, refId, txSig } → { ok, updated }

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

const ALLOWED_ORIGINS = (process.env.AWARD_ALLOWED_ORIGINS
  ? process.env.AWARD_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['https://gamerplex.com', 'https://www.gamerplex.com']
).concat(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3055'] : []);

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
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { gameId?: unknown; refId?: unknown; txSig?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  // Forward only the client fields, with server-controlled userId/app set LAST so
  // a client-supplied `userId`/`app` can't override them (that would let a caller
  // attach a tx / flip verified on another user's leaderboard row).
  const res = await fetch(`${IDENTITY_URL}/api/v1/scores/attach-tx`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({ gameId: body.gameId, refId: body.refId, txSig: body.txSig, userId, app: 'gamerplex' }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: result.error ?? 'verify_failed' }, { status: res.status });
  return NextResponse.json({ ok: true, updated: result.updated ?? false });
}
