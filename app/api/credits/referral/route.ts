// POST /api/credits/referral — the browser-facing door to a referral payout.
//
// This used to own the whole thing: resolving the code, the self-referral guard,
// the both-sides completion gate, the amounts, and idempotency. That was the bug.
// credit_ledger's idempotency is (user_id, app, ref_id), so a referral refId is
// unique only WITHIN an app — and with gamerplex, petlegends and sledgit each able
// to pay, one fake friend could be claimed once per app.
//
// All of that now lives in identity's /api/v1/referrals/claim, whose `referrals`
// table enforces ONE payout per referred user, ever, ecosystem-wide. What stays
// here is what only a first-party web origin can do: prove WHO is calling (session
// cookie), reject foreign origins, rate-limit, and keep IDENTITY_API_KEY off the
// browser. Sister apps on *.gamerplex.com share the session cookie and may call
// this route cross-origin (see ALLOWED_ORIGINS).
//
// CREDITS ONLY (R2). Never $GAME, never convertible (R7).
//
// Body: { referrer: string }  ->  { ok, paid|deduped|pending|... } | { error }

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
)
  // Sister apps on the same parent domain share the `gpx_id` cookie, so they can
  // reuse this route rather than each duplicating the award logic and the API key.
  .concat(['https://omega.gamerplex.com'])
  .concat(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3200'] : []);

/** Echo the origin back only when it is allowlisted; credentialed CORS forbids '*'. */
function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

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


export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);
  if (badOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403, headers: cors });

  // Per-app scoped key (audit C2) — gamerplex namespace only. Also authorizes the
  // read-only by-wallet lookup.
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500, headers: cors });

  let body: { referrer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: cors });
  }

  const rawRef = typeof body.referrer === 'string' ? body.referrer.trim() : '';
  if (!rawRef) return NextResponse.json({ error: 'bad_referrer' }, { status: 400, headers: cors });

  // Resolve the CALLER (the referred user) from their forwarded session cookie.
  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const referredUserId: string | undefined = me?.user?.id;
  if (!referredUserId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401, headers: cors });

  if (rateLimited(`referral:${clientKey(referredUserId, req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: cors });
  }

  // Everything else — resolving the code, the self-referral guard, both-sides proof
  // of life, the amounts, and the GLOBAL one-payout-per-pair rule — lives in the
  // identity service. It used to live here, which meant each app enforced its own
  // copy: credit_ledger's idempotency is (user_id, app, ref_id), so the same pair
  // could be paid once per app. identity's `referrals` table is now the single
  // authority and its INSERT is what authorises a payout.
  const claim = await fetch(`${IDENTITY_URL}/api/v1/referrals/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({ referrerCode: rawRef, referredUserId, app: 'gamerplex' }),
  });
  const out = await claim.json().catch(() => ({}));
  if (!claim.ok) return NextResponse.json({ error: 'award_failed' }, { status: 502, headers: cors });
  return NextResponse.json(out, { headers: cors });
}
