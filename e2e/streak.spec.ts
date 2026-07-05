import { test, expect } from '@playwright/test';

// Signed-in coverage for the daily-streak loop — the one path that can't be seen
// while anonymous. We mock a verified session + the credits endpoints so the flow
// is deterministic: the flame + claim button appear, claiming awards +5 and flips
// to the "claimed today" state.

const SESSION = {
  user: {
    id: 'e2e-user',
    email: 'e2e@example.com',
    emailVerified: true,
    walletAddress: null,
    handle: 'e2e',
  },
};

test.describe('daily streak (signed in)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) }),
    );
    await page.route('**/api/auth/credits', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, lifetimeEarned: 0, perApp: [{ app: 'gamerplex', balance: 0, lifetimeEarned: 0 }] }),
      }),
    );
    await page.route('**/api/credits/earn', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, appBalance: 5, deduped: false }) }),
    );
    // Always start from a clean streak so the test is deterministic.
    await page.addInitScript(() => window.localStorage.removeItem('gpx.home.streak.v1'));
  });

  test('claim button appears and awards +5, then shows claimed state', async ({ page }) => {
    await page.goto('/');

    const claim = page.locator('.streak-claim');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText(/Claim \+5/i);

    await claim.click();

    await expect(page.locator('.streak-done')).toBeVisible();
    await expect(page.getByText(/claimed/i)).toBeVisible();
    await expect(page.getByText(/come back tomorrow/i)).toBeVisible();
  });
});
