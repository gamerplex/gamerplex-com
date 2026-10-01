// GET /api/inventory — the signed-in account's owned items.
//
// Thin session-authed proxy to the identity-service inventory list, which is
// app-key scoped and so cannot be called from a browser. The shop previously
// hardcoded `owned` to ["pixel"], which meant every visitor saw Pixel Trail as
// owned and nothing they actually bought survived a refresh.
//
// Returns: { items: [{ itemId, itemType, source, createdAt }] }

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest) {
  const apiKey = process.env.IDENTITY_API_KEY_GAMERPLEX || process.env.IDENTITY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  // Signed out is not an error — it is an empty inventory.
  if (!userId) return NextResponse.json({ items: [] });

  const qs = new URLSearchParams({ app: 'gamerplex', userId });
  const res = await fetch(`${IDENTITY_URL}/api/v1/inventory/list?${qs}`, {
    headers: { 'x-identity-api-key': apiKey },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({ items: [] }));
  if (!res.ok) return NextResponse.json({ error: body.error ?? 'list_failed' }, { status: res.status });
  return NextResponse.json({ items: body.items ?? [] });
}
