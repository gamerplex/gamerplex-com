// POST /api/credits/referral — award referral Credits to BOTH sides when a NEW user
// signs up having arrived via a challenge link. SERVER-authoritative: the client only
// names the referrer (a Solana pubkey from the challenge link); the amounts + categories
// live here and the IDENTITY_API_KEY never reaches the browser.
//
// CREDITS ONLY (R2) — this is the growth faucet, NOT a $GAME emission and NOT a save-fee
// cut. Credits never convert to $GAME (R7).
//
// Flow:
//   1. Resolve the CALLER (the referred user) from their forwarded session cookie.
//   2. Resolve the REFERRER wallet pubkey -> referrer userId via the federated
//      by-wallet lookup (same gamerplex app key).
//   3. Award a welcome grant to the referred user (category "referral_welcome") and a
//      referral grant to the referrer (category "referral").
//
// Idempotency ("one payout per (referrer, referred) ever") is enforced entirely by the
// identity-service award refId (its (userId, app, refId) unique index, onConflictDoNothing):
//   - welcome:  refId = referral_welcome:<referredUserId>            (once per referred user)
//   - referrer: refId = referral:<referrerUserId>:<referredUserId>   (once per pair)
// A repeat call (retry / re-sign-in) inserts nothing and re-returns the balance. No local
// table needed — the DB unique index is the idempotency key.
//
// Body: { referrer: string }  ->  { ok, deduped } | { error }

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
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

// Server-fixed reward amounts (never client-proposed). LEAN by design.
const WELCOME_GRANT = 50; // to the NEW (referred) user
const REFERRER_GRANT = 50; // to the referrer who brought them

function validReferrer(raw: string): string | null {
  try {
    const pk = new PublicKey(raw);
    if (pk.equals(PublicKey.default)) return null;
    if (!PublicKey.isOnCurve(pk.toBytes())) return null;
    return pk.toBase58();
  } catch {
    return null;
  }
}

async function award(
  apiKey: string,
  userId: string,
  delta: number,
  category: string,
  reason: string,
  refId: string,
): Promise<boolean> {
  const res = await fetch(`${IDENTITY_URL}/api/v1/credits/award`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({
      userId,
      app: 'gamerplex',
      delta,
      category,
      reason,
      refId,
      idempotent: true,
    }),
  });
  return res.ok;
}

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });

  // Per-app scoped key (audit C2) — gamerplex namespace only. Also authorizes the
  // read-only by-wallet lookup.
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { referrer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const referrerPubkey = typeof body.referrer === 'string' ? validReferrer(body.referrer) : null;
  if (!referrerPubkey) return NextResponse.json({ error: 'bad_referrer' }, { status: 400 });

  // Resolve the CALLER (the referred user) from their forwarded session cookie.
  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const referredUserId: string | undefined = me?.user?.id;
  if (!referredUserId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  // Best-effort per-instance rate limit (identity-service holds the authoritative cap +
  // the refId idempotency is the real anti-farm).
  if (rateLimited(`referral:${clientKey(referredUserId, req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // Resolve the referrer wallet -> referrer userId (federated by-wallet lookup).
  const rRes = await fetch(
    `${IDENTITY_URL}/api/v1/users/by-wallet/${encodeURIComponent(referrerPubkey)}`,
    { headers: { 'x-identity-api-key': apiKey }, cache: 'no-store' },
  );
  const rBody = await rRes.json().catch(() => ({}));
  const referrerUserId: string | undefined = rBody?.user?.id;
  // Unknown referrer wallet (never signed up) — nothing to attribute to. Treat as a no-op
  // success so the client doesn't retry, but skip both grants (can't reward a non-user).
  if (!referrerUserId) return NextResponse.json({ ok: true, deduped: false, referrerFound: false });

  // Self-referral guard: a user can't refer themselves.
  if (referrerUserId === referredUserId) {
    return NextResponse.json({ ok: true, deduped: false, referrerFound: true, selfReferral: true });
  }

  // Both grants are idempotent via their deterministic refIds. Run sequentially so a partial
  // failure is retry-safe (a second call re-attempts only the ungranted side).
  const welcomeOk = await award(
    apiKey,
    referredUserId,
    WELCOME_GRANT,
    'referral_welcome',
    'welcome bonus for joining via a challenge link',
    `referral_welcome:${referredUserId}`,
  );
  const referrerOk = await award(
    apiKey,
    referrerUserId,
    REFERRER_GRANT,
    'referral',
    'referred a new player via a challenge link',
    `referral:${referrerUserId}:${referredUserId}`,
  );

  if (!welcomeOk || !referrerOk) {
    return NextResponse.json({ error: 'award_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, referrerFound: true });
}
