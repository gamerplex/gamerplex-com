// GET /api/assets/<slug>/download — the full-quality GLB. KEYLESS, on purpose.
//
// This used to require a signed-in session. That defeats the page: /assets exists so AI
// agents can fetch licensed geometry, and an agent cannot sign in. A CC0 asset behind a
// login is a CC0 asset nobody automated can use, and "keyless wins for agents" was already
// the decision — the gate just predated it.
//
// Nothing is lost by removing it. The licence is CC0-1.0: no attribution, no restriction,
// commercial use fine. There is no entitlement to check, so the only thing a session bought
// us was friction. Abuse is handled by rate limiting on the client key instead.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { asset } from '../../../../assets/_data/assets';
import { rateLimited, clientKey } from '../../../_lib/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const a = asset((await params).slug);
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Per-client, not per-user: there is no user. Generous enough that a crawler or an agent
  // pulling a pack never trips it, tight enough that nobody serves their own CDN from ours.
  if (rateLimited(`asset-dl:${clientKey(undefined, req)}`, 120, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const file = await readFile(path.join(process.cwd(), 'private-assets', a.slug, 'model.glb')).catch(() => null);
  if (!file) return NextResponse.json({ error: 'missing_file' }, { status: 500 });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'content-type': 'model/gltf-binary',
      'content-disposition': `attachment; filename="${a.slug}.glb"`,
      // CC0 and immutable per slug: let anyone cache it, including the edge.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-licence': 'CC0-1.0',
    },
  });
}
