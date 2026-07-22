// GET /api/league/standings — this week's cross-game League (Credits earned). Thin
// public proxy to identity-service; the same board across every game.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export async function GET() {
  const res = await fetch(`${IDENTITY_URL}/api/v1/league/standings`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({ league: [] }));
  return NextResponse.json(body, { status: res.ok ? 200 : res.status });
}
