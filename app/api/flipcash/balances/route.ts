// GET /api/flipcash/balances — the signed-in user's real Flipcash holdings.
//
// The Shop used to show "◆ 0" to someone holding 841M $GAME, because it read an SPL
// associated token account. Flipcash keeps no balance there: every real token sits in
// one omnibus per mint and the user's figure is a u64 inside a Code VM memory
// account. This route reads that.
//
// The Flipcash account key never reaches the browser. It is fetched server-to-server
// from identity with this app's key, used here, and only the numbers are returned —
// because anyone holding that key can read the balance off the chain.

import { NextRequest, NextResponse } from 'next/server';

import { getFlipcashBalances } from '../../../../lib/flipcash/vm-balance';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('cookie') ?? '';
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) {
    // No key means we cannot ask who this is. Report unknown rather than zero: a
    // confident 0 is exactly the bug this route exists to fix.
    return NextResponse.json({ linked: false, game: null, usdf: null, reason: 'unconfigured' });
  }

  let owner: string | null = null;
  try {
    const r = await fetch(`${IDENTITY_URL}/api/apps/flipcash-owner`, {
      headers: { cookie, 'x-identity-api-key': apiKey },
      cache: 'no-store',
    });
    if (r.ok) owner = (await r.json())?.owner ?? null;
  } catch {
    return NextResponse.json({ linked: false, game: null, usdf: null, reason: 'identity_unreachable' });
  }

  if (!owner) {
    return NextResponse.json({ linked: false, game: null, usdf: null, reason: 'not_linked' });
  }

  try {
    const { game, usdf } = await getFlipcashBalances(owner);
    return NextResponse.json(
      { linked: true, game, usdf },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    // An RPC failure is not a zero balance.
    return NextResponse.json({ linked: true, game: null, usdf: null, reason: 'rpc_failed' });
  }
}
