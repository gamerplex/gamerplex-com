// GET /api/status — public health summary for /status. Probes real services
// SERVER-SIDE and returns only generic categories + a colour, so the backend
// architecture (hosts, service names, vendors) never reaches the client. Each probe
// treats any HTTP response (incl. 401/403) as "up" — only a 5xx, network error, or
// timeout is "down". Cached briefly so the page can't be used to hammer upstreams.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Light = 'operational' | 'degraded' | 'down';

// Generic, user-facing categories → the (hidden) endpoint that proves each works.
const CHECKS: { category: string; url: string; method?: 'GET' | 'POST' }[] = [
  { category: 'Games & Gameplay', url: 'https://auth.gamerplex.com/api/v1/league/standings' },
  { category: 'Accounts & Sign-in', url: 'https://auth.gamerplex.com/api/auth/me' },
  { category: 'Credits & Leaderboards', url: 'https://auth.gamerplex.com/api/v1/daily' },
  { category: 'Analytics', url: 'https://ph001.gamerplex.com/capture/', method: 'POST' },
];

async function probe(url: string, method: 'GET' | 'POST' = 'GET'): Promise<Light> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      cache: 'no-store',
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? '{"api_key":"health","event":"$health","distinct_id":"health"}' : undefined,
    });
    const ms = Date.now() - started;
    // Any served response (even 401/403/400) means the service is up. Only 5xx = down.
    if (res.status >= 500) return 'down';
    return ms > 2500 ? 'degraded' : 'operational';
  } catch {
    return 'down'; // network error or timeout
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const results = await Promise.all(
    CHECKS.map(async (c) => ({ category: c.category, status: await probe(c.url, c.method) })),
  );
  const overall: Light = results.some((r) => r.status === 'down')
    ? 'down'
    : results.some((r) => r.status === 'degraded')
      ? 'degraded'
      : 'operational';
  return NextResponse.json(
    { overall, categories: results, checkedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } },
  );
}
