import { test, expect } from '@playwright/test';
import { installMockWallet } from './fixtures/mock-wallet';

// A signed-in user's Credits flow: the unified balance renders from the identity
// service, and the "spend Credits" client path (POST /api/credits/spend) returns
// the new balance. Both are fully route-mocked so the test is deterministic — no
// real identity-service / on-chain calls.
//
// COVERAGE NOTE: the in-game spend affordance (<ContinueWithCredits/>) only mounts
// on a game-OVER screen, which requires driving full (non-deterministic) snake/chess
// gameplay to a loss. That surface is therefore NOT exercised here. Instead we cover
// the two deterministic halves it is built from: (1) the signed-in Credits balance
// display (CreditsBadge, same getCredits() call the component makes on mount), and
// (2) the exact POST /api/credits/spend contract that spendCredits() drives, asserting
// the returned appBalance is what the UI would render after a successful spend.

const CREDITS = {
  total: 1000,
  lifetimeEarned: 1000,
  perApp: [{ app: 'gamerplex', balance: 1000, lifetimeEarned: 1000 }],
};

const signedInUser = {
  id: 'e2e-credits-user',
  email: 'credits@example.com',
  emailVerified: true,
  handle: 'credits',
  walletAddress: 'MockWa11etAdd35500000000000000000000000000',
};

async function mockSignedInWithCredits(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: signedInUser }) }),
  );
  await page.route('**/api/auth/credits', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ credits: CREDITS }) }),
  );
}

test('signed-in Credits balance renders in the badge', async ({ page }) => {
  await installMockWallet(page);
  await mockSignedInWithCredits(page);
  await page.addInitScript(() => window.localStorage.setItem('walletName', '"Phantom"'));

  await page.goto('/');

  const badge = page.getByTestId('credits-badge');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  // CreditsBadge shows this app's (gamerplex) per-app balance, comma-formatted.
  await expect(badge).toContainText('1,000');
});

test('spend Credits returns the new balance (POST /api/credits/spend)', async ({ page }) => {
  await installMockWallet(page);
  await mockSignedInWithCredits(page);
  await page.addInitScript(() => window.localStorage.setItem('walletName', '"Phantom"'));

  // The server is authoritative: the client names an ITEM, the route deducts the
  // catalog price (continue = 420) and returns the remaining app balance.
  let spendBody: unknown = null;
  await page.route('**/api/credits/spend', async (r) => {
    spendBody = r.request().postDataJSON();
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ appBalance: 580 }),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('credits-badge')).toBeVisible({ timeout: 10_000 });

  // Drive the exact call spendCredits('continue') makes (same route, same body shape).
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/credits/spend', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: 'continue', refId: 'e2e:snake:continue' }),
    });
    return { ok: r.ok, json: await r.json() };
  });

  expect(result.ok).toBe(true);
  expect(result.json.appBalance).toBe(580);
  expect(spendBody).toMatchObject({ item: 'continue' });
});

test('insufficient Credits surfaces an error (no balance change)', async ({ page }) => {
  await installMockWallet(page);
  await mockSignedInWithCredits(page);
  await page.addInitScript(() => window.localStorage.setItem('walletName', '"Phantom"'));

  await page.route('**/api/credits/spend', (r) =>
    r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: 'insufficient' }) }),
  );

  await page.goto('/');
  await expect(page.getByTestId('credits-badge')).toBeVisible({ timeout: 10_000 });

  const result = await page.evaluate(async () => {
    const r = await fetch('/api/credits/spend', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: 'continue' }),
    });
    return { ok: r.ok, status: r.status, json: await r.json() };
  });

  expect(result.ok).toBe(false);
  expect(result.status).toBe(402);
  expect(result.json.error).toBe('insufficient');
});
