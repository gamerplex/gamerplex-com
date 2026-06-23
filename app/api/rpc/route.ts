// POST /api/rpc — same-origin JSON-RPC proxy to the keyed Solana endpoint.
//
// Audit G-1: the keyed upstream RPC URL (e.g. Helius `?api-key=…`) must NEVER
// ship in the client bundle. Set it in the SERVER-only `SOLANA_RPC_URL` env;
// the browser talks to this route instead (point `NEXT_PUBLIC_RPC_URL` at
// `https://<host>/api/rpc`). The key then lives only on the server.
//
// Note: this proxies HTTP JSON-RPC only (not WebSocket subscriptions). If a
// client uses WS, give the Connection an explicit keyless `wsEndpoint`.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const UPSTREAM =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC || // transition fallback; prefer SOLANA_RPC_URL
  'https://api.devnet.solana.com';

// Stop other websites from scripting our (paid) RPC quota. Same-origin browser
// requests carry a gamerplex.com Origin/Referer; a request with NEITHER header
// is allowed (fail-open) so a stray same-origin fetch never breaks wallet reads.
function foreignOrigin(req: NextRequest): boolean {
  const src = req.headers.get('origin') || req.headers.get('referer');
  if (!src) return false;
  try {
    const h = new URL(src).hostname;
    return !(h === 'localhost' || h === '127.0.0.1' || h.endsWith('gamerplex.com'));
  } catch {
    return true;
  }
}

export async function POST(req: NextRequest) {
  if (foreignOrigin(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.text();
  if (body.length > 200_000) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
