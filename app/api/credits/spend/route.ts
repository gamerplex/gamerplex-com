// POST /api/credits/spend — spend Credits (web2) from the `gamerplex` balance on an
// above-the-money-line item (continue / retry). Mirrors award-play: SERVER-side only (the
// IDENTITY_API_KEY never reaches the browser), resolves the caller from their session, then
// deducts via the api-key-gated identity-service /api/v1/credits/deduct.
//
// The client requests an ITEM by id (not an amount) — the price + category live in a
// server-side catalog here, so a malicious client can never spend an arbitrary amount on
// an arbitrary category. Overspend is rejected (409) by identity-service.
//
// CREDITS ONLY — Credits never convert to $GAME (R7). The $GAME path for these items is
// charged on-chain (never here).
//
// Body: { item: "continue" | "retry", refId?: string }  →  { ok, appBalance, deduped } | { error }

import { NextRequest, NextResponse } from 'next/server';
import { rateLimited, clientKey } from '../../_lib/ratelimit';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

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

// Server-authoritative spend catalog (Credits path of the money-line "above" items).
// Prices are LEAN by design. identity-service holds the authoritative balance + rejects overspend.
const CATALOG: Record<string, { amount: number; category: string; reason: string }> = {
  continue: { amount: 420, category: 'consumable', reason: 'continue after game over' },
  retry: { amount: 100, category: 'perk', reason: 'retry a run' },
};

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });

  // Per-app scoped key (audit C2) — gamerplex namespace only.
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { item?: unknown; refId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const item = typeof body.item === 'string' ? CATALOG[body.item] : undefined;
  if (!item) return NextResponse.json({ error: 'bad_item' }, { status: 400 });
  const refId = typeof body.refId === 'string' ? body.refId.slice(0, 80) : null;

  // Resolve the user from their forwarded session cookie.
  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  if (rateLimited(`spend:${clientKey(userId, req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const res = await fetch(`${IDENTITY_URL}/api/v1/credits/deduct`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({
      userId,
      app: 'gamerplex',
      amount: item.amount,
      category: item.category,
      reason: item.reason,
      refId,
    }),
  });
  if (res.status === 409) return NextResponse.json({ error: 'insufficient' }, { status: 402 });
  if (!res.ok) return NextResponse.json({ error: 'spend_failed' }, { status: 502 });
  const result = await res.json();
  return NextResponse.json({ ok: true, appBalance: result.appBalance ?? null, deduped: result.deduped ?? false });
}
