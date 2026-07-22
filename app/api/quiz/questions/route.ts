// GET /api/quiz/questions?mode=&n= — TCG Quiz question bank.
//
// Thin server-side proxy to Sledgit, which owns the card catalog (the data lives
// in ONE place — we don't copy it). Server-side so there's no cross-domain CORS
// and the browser only ever talks to gamerplex.com. Public read.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SLEDGIT_URL = process.env.SLEDGIT_URL || 'https://www.sledgit.com';

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const mode = u.searchParams.get('mode') ?? 'mix';
  const n = u.searchParams.get('n') ?? '5';

  try {
    const qs = new URLSearchParams({ mode, n });
    const r = await fetch(`${SLEDGIT_URL}/api/quiz/questions?${qs}`, { cache: 'no-store' });
    const body = await r.json().catch(() => ({ error: 'bad_upstream' }));
    return NextResponse.json(body, { status: r.ok ? 200 : r.status });
  } catch {
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 });
  }
}
