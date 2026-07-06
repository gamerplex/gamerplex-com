// Live prod-smoke for gamerplex.com — asserts DEPLOYED, env-dependent things
// that unit/Playwright-on-localhost can't see. Run as a deploy gate:
//   node scripts/smoke-prod.mjs
// Exit 0 = healthy, 1 = a regression.
//
// Covers the two P0s that shipped broken:
//   1. /api/credits/earn 500'd because IDENTITY_API_KEY_GAMERPLEX was missing
//      from Vercel — it must be CONFIGURED (401 not_signed_in for anon = healthy;
//      500 "misconfigured" = the key is gone again).
//   2. the app home + a verified-landing path must resolve (200), so email
//      verify never dead-ends.

const BASE = process.env.SMOKE_BASE || 'https://gamerplex.com';
const timeout = (ms) => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));
const fetchT = (u, o = {}) => Promise.race([fetch(u, o), timeout(15000)]);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` — ${detail}`}`); if (!ok) failed++; };

console.log(BASE);

// 1. credits endpoint is configured (not the misconfigured 500).
try {
  const res = await fetchT(`${BASE}/api/credits/earn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ action: 'daily_streak' }),
  });
  const body = await res.json().catch(() => ({}));
  check('credits/earn is configured (not 500 misconfigured)', res.status !== 500 && body.error !== 'misconfigured', `HTTP ${res.status} ${JSON.stringify(body)}`);
} catch (e) { check('credits/earn reachable', false, String(e.message || e)); }

// 2. home + a post-verify landing path resolve (email verify must not dead-end).
for (const path of ['/', '/?verified=1', '/arcade']) {
  try {
    const res = await fetchT(`${BASE}${path}`, { redirect: 'manual' });
    check(`${path} resolves`, res.status < 404, `HTTP ${res.status}`);
  } catch (e) { check(`${path} reachable`, false, String(e.message || e)); }
}

console.log(`\n${failed === 0 ? 'PASS — prod healthy' : `FAIL — ${failed} check(s) regressed`}`);
process.exit(failed === 0 ? 0 : 1);
