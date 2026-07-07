// POST /api/scores/submit — the Arcade Shell's free web2 leaderboard save.
// Resolves the signed-in user from their session cookie, then submits to the
// identity-service scores endpoint with the server-only per-app key. No wallet
// required — this is the default save every game does on game-over.
//
// Body: { gameId, score, refId, variant?, durationSec?, metadata? } → { ok, best, scoreId }

import { NextRequest, NextResponse } from 'next/server';
import { rateLimited, clientKey } from '../../_lib/ratelimit';

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

  let body: { gameId?: unknown; score?: unknown; refId?: unknown; variant?: unknown; durationSec?: unknown; metadata?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  // Defense-in-depth sanity bounds on the client-asserted score. The FREE web2
  // board is inherently client-trusted; the trustworthy path is the on-chain
  // "✓ Verified" replay (resolver-validated). These bounds reject the egregious
  // spoofs (negatives, non-integers, absurd values, impossible durations).
  const gameId = typeof body.gameId === 'string' ? body.gameId : '';
  const SCORE_CEILING: Record<string, number> = { blockwords: 10_000, 'magic-chess': 100_000, 'cyber-snake': 200_000, flipball: 2_000_000 };
  const ceiling = SCORE_CEILING[gameId] ?? 1_000_000;
  const score = body.score;
  if (typeof score !== 'number' || !Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > ceiling) {
    return NextResponse.json({ error: 'invalid_score' }, { status: 400 });
  }
  const dur = body.durationSec;
  if (dur !== undefined && (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 0 || dur > 3600)) {
    return NextResponse.json({ error: 'invalid_duration' }, { status: 400 });
  }

  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  if (rateLimited(`score:${clientKey(userId, req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const res = await fetch(`${IDENTITY_URL}/api/v1/scores/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({ userId, app: 'gamerplex', ...body }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: result.error ?? 'submit_failed' }, { status: res.status });
  return NextResponse.json({ ok: true, best: result.best ?? null, scoreId: result.scoreId ?? null });
}
