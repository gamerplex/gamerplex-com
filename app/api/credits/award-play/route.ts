// POST /api/credits/award-play — grant the daily "you played" engagement credit.
//
// SERVER-side only: the IDENTITY_API_KEY never reaches the browser. Resolves the
// caller from their gpx_id cookie (forwarded to identity-service /api/auth/me),
// then awards via the api-key-gated credits/award with idempotent=true so the
// refId `play:<gameId>:<utcDay>` caps it at ONE credit per game per day —
// engagement (THAT you played), never score-based (Credits ≠ Scores).
//
// Body: { gameId: number }  Returns: { ok, app, appBalance } | { error }

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlayToken, redeemOnce } from '../../../../lib/credits/play-token';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

// CSRF (audit H3): the gpx_id cookie is scoped to .gamerplex.com, so a sibling
// subdomain could issue a credentialed POST. Require an exact first-party Origin.
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

// Engagement games (gamerplex.com surface + flipball). Score lives on-chain;
// this only rewards participation.
const GAME_SLUGS: Record<number, string> = {
  1: 'cyber-snake',
  3: 'magic-chess',
  4: 'blockwords',
  5: 'flipball',
};
const PLAY_CREDIT = 5;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  if (badOrigin(req)) {
    return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
  }
  // Per-app scoped key (audit C2) — gamerplex namespace only.
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  let body: { gameId?: unknown; playToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const gameId = body.gameId;
  if (typeof gameId !== 'number' || !GAME_SLUGS[gameId]) {
    return NextResponse.json({ error: 'bad_game' }, { status: 400 });
  }

  // Resolve the user from their forwarded session cookie.
  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, {
    headers: { cookie },
    cache: 'no-store',
  });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  // Proof of play: a token minted at game start (/api/credits/play-token), bound
  // to this user+game and only valid after the minimum play duration. Without it
  // the daily credit was farmable with a bare POST and zero gameplay.
  const verdict = verifyPlayToken(body.playToken, userId, gameId, Date.now());
  if (!verdict.ok) {
    const status = verdict.reason === 'misconfigured' ? 500 : 403;
    return NextResponse.json({ error: `no_proof_of_play:${verdict.reason}` }, { status });
  }
  if (!verdict.jti || !redeemOnce(verdict.jti, Date.now())) {
    return NextResponse.json({ error: 'token_already_used' }, { status: 409 });
  }

  // Award the daily play credit (idempotent per game per UTC day).
  const awardRes = await fetch(`${IDENTITY_URL}/api/v1/credits/award`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-identity-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({
      userId,
      app: 'gamerplex',
      delta: PLAY_CREDIT,
      category: 'play_engagement',
      reason: `played ${GAME_SLUGS[gameId]}`,
      refId: `play:${gameId}:${utcDay()}`,
      idempotent: true,
    }),
  });
  if (!awardRes.ok) {
    return NextResponse.json({ error: 'award_failed' }, { status: 502 });
  }
  const result = await awardRes.json();
  return NextResponse.json({
    ok: true,
    app: 'gamerplex',
    appBalance: result.appBalance ?? null,
    deduped: result.deduped ?? false,
  });
}
