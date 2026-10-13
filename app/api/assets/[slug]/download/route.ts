// GET /api/assets/<slug>/download — the full-quality GLB, for signed-in users only.
// The public preview lives in /public/assets/<slug>/preview.glb; the full file is outside /public.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { asset } from '../../../../assets/_data/assets';
import { rateLimited, clientKey } from '../../../_lib/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const a = asset((await params).slug);
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const cookie = req.headers.get('cookie') ?? '';
  const meRes = await fetch(`${IDENTITY_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' }).catch(() => null);
  if (!meRes) return NextResponse.json({ error: 'identity_unreachable' }, { status: 503 });
  const me = await meRes.json().catch(() => ({}));
  const userId: string | undefined = me?.user?.id;
  if (!userId) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  if (rateLimited(`asset-dl:${clientKey(userId, req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const file = await readFile(path.join(process.cwd(), 'private-assets', a.slug, 'model.glb')).catch(() => null);
  if (!file) return NextResponse.json({ error: 'missing_file' }, { status: 500 });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'content-type': 'model/gltf-binary',
      'content-disposition': `attachment; filename="${a.slug}.glb"`,
      'cache-control': 'private, no-store',
    },
  });
}
