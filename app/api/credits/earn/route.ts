// POST /api/credits/earn — award Credits (web2) for an in-game ACTION (lean engagement economy).
// Like award-play but a small catalog of actions, each with a server-fixed amount + an
// idempotency refId so a given action can't be farmed. identity-service enforces the per-
// category cap on top (anti-farm). SERVER-side only (the key never reaches the browser).
//
// CREDITS ONLY — this route never emits $GAME (R2). Credits never convert to $GAME (R7).
//
// Body: { action: "game_win" | "daily_streak", refId?: string } → { ok, appBalance, deduped }

import { NextRequest, NextResponse } from 'next/server';
import { rateLimited, clientKey } from '../../_lib/ratelimit';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

// CSRF: the gpx_id cookie is scoped to .gamerplex.com, so a sibling subdomain could
// issue a credentialed POST. Require an exact first-party Origin.
const ALLOWED_ORIGINS = (process.env.AWARD_ALLOWED_ORIGINS
  ? process.env.AWARD_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['https://gamerplex.com', 'https://www.gamerplex.com']
).concat(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : []);

function badOrigin(req: NextRequest): boolean {
  let origin = req.headers.get('origin');
  if (!origin) {
    const ref = req.headers.get('referer');
    try {
      origin = ref ? new URL(ref).origin : null;
    } catch {
      origin = null;
    }
  }
  return !origin || !ALLOWED_ORIGINS.includes(origin);
}

// LEAN arcade earn catalog. Server-fixed small amounts; the refId caps farming per-day, and
// identity-service holds the authoritative per-category cap on top.
const EARN: Record<string, { amount: number; category: string; reason: string }> = {
  game_win: { amount: 5, category: 'game_win', reason: 'won / completed an arcade run' },
  daily_streak: { amount: 5, category: 'streak', reason: 'daily streak bonus' },
};

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });

  // Per-app scoped key (audit C2) — gamerplex namespace only.
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { action?: unknown; refId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? EARN[body.action] : undefined;
  if (!action) return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  const refId = typeof body.refId === 'string' ? body.refId.slice(0, 80) : null;

  // Resolve the user from their forwarded session cookie.
  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  // Best-effort per-instance rate limit (identity-service holds the authoritative cap).
  if (rateLimited(`earn:${clientKey(userId, req)}`, 40, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const awardRes = await fetch(`${IDENTITY_URL}/api/v1/credits/award`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({
      userId,
      app: 'gamerplex',
      delta: action.amount,
      category: action.category,
      reason: action.reason,
      refId,
      idempotent: !!refId,
    }),
  });
  if (!awardRes.ok) return NextResponse.json({ error: 'award_failed' }, { status: 502 });
  const result = await awardRes.json();
  return NextResponse.json({ ok: true, appBalance: result.appBalance ?? null, deduped: result.deduped ?? false });
}
