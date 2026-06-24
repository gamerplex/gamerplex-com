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
import { originForbidden, methodAllowed } from '../../../lib/rpc-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPSTREAM =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC || // transition fallback; prefer SOLANA_RPC_URL
  'https://api.devnet.solana.com';

// Expensive methods that let one caller burn the (paid) quota. Blocked by
// default; override the whole policy with a strict allowlist via env.
const ALLOWLIST = (process.env.RPC_ALLOWED_METHODS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const DENYLIST = new Set(['getProgramAccounts']);

export async function POST(req: NextRequest) {
  const src = req.headers.get('origin') || req.headers.get('referer');
  if (originForbidden(src)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.text();
  if (body.length > 200_000) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  // Single JSON-RPC request only (no batch arrays), with an allowed method.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (Array.isArray(parsed)) {
    return NextResponse.json({ error: 'batch_not_allowed' }, { status: 400 });
  }
  if (!methodAllowed((parsed as { method?: unknown })?.method, ALLOWLIST, DENYLIST)) {
    return NextResponse.json({ error: 'method_not_allowed' }, { status: 403 });
  }

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    cache: 'no-store',
    redirect: 'error',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
