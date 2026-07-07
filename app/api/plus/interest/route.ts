// POST /api/plus/interest — records willingness-to-pay interest for "Gamerplex Plus"
// ($4.99/mo). This is a FAKE-DOOR money-test (Test 2): it measures INTENT to pay
// before the subscription is built. It NEVER charges and NEVER collects payment.
//
// Hardened like app/api/credits/* : first-party Origin check + in-memory rate-limit +
// strict validation. Fires a SERVER-side PostHog `plus_interest` capture (independent of
// the browser) so the funnel is auditable even if the client event is blocked. The client
// ALSO track()s it; PostHog dedups on the shared refId-style event if needed.
//
// R6: revenue = subscription + cosmetics + sinks. This tests the subscription leg. No $GAME,
// no charge, no faucet.
//
// Body: { source?: string, email?: string, signedIn?: boolean }  →  { ok } | { error }

import { NextRequest, NextResponse } from 'next/server';
import { rateLimited, clientKey } from '../../_lib/ratelimit';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://ph001.gamerplex.com';
const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });

  let body: { source?: unknown; email?: unknown; signedIn?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const source = typeof body.source === 'string' ? body.source.slice(0, 40) : 'unknown';
  const bodyEmail =
    typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';

  // Prefer the authoritative session email (signed-in users); fall back to the
  // small email field the fake-door collects for signed-out users.
  const cookie = req.headers.get('cookie') ?? '';
  let sessionEmail = '';
  let signedIn = false;
  try {
    const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
    const me = await meRes.json().catch(() => ({} as any));
    if (me?.user?.email) sessionEmail = String(me.user.email).toLowerCase();
    signedIn = !!me?.user?.id;
  } catch {
    // identity unreachable — still record the interest with the provided email.
  }

  const email = sessionEmail || bodyEmail;
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'bad_email' }, { status: 400 });
  }

  if (rateLimited(`plus:${clientKey(sessionEmail || undefined, req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // Server-side PostHog capture — independent of the browser, so ad-blockers can't hide
  // the money signal. Best-effort; never blocks or leaks failure to the client.
  if (PH_KEY) {
    try {
      await fetch(`${PH_HOST}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          api_key: PH_KEY,
          event: 'plus_interest',
          distinct_id: email,
          properties: {
            source,
            signedIn,
            product: 'gamerplex-plus',
            price_usd: 4.99,
            server_side: true,
            network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
          },
        }),
      });
    } catch {
      // swallow — the client also track()s plus_interest as a fallback.
    }
  }

  return NextResponse.json({ ok: true });
}
