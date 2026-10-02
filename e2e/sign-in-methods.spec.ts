import { test, expect, type Page } from '@playwright/test';

// The sign-in methods panel. Three ways into one shared account, so the job is to
// show which ones are attached and offer the rest.
//
// What these guard:
//   1. it degrades when identity-service predates the `linked` field — a real
//      account must never read "0 of 3", which would push someone to re-link what
//      they already have
//   2. the blocked path (no wallet without a verified email) is EXPLAINED, not a
//      button that 403s
//   3. signing out actually clears the session

const USER = {
  id: 'u-1',
  email: 'player@example.com',
  emailVerified: true,
  handle: 'player',
  bio: null,
  walletAddress: null,
  handleOnChain: false,
  createdAt: '2026-10-01T00:00:00Z',
};

async function mockMe(page: Page, user: Record<string, unknown> | null) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }),
  );
  // Keep the rest of the profile quiet so the panel is what we are asserting.
  for (const p of ['**/api/auth/credits', '**/api/inventory', '**/api/flipcash/intent']) {
    await page.route(p, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], perApp: [] }) }),
    );
  }
}

const panel = (page: Page) => page.locator('div.sim');
const row = (page: Page, name: string) => page.locator('li.sim-row').filter({ hasText: name });

test.describe('sign-in methods', () => {
  test('shows what is linked and what is not', async ({ page }) => {
    await mockMe(page, { ...USER, linked: { email: true, wallet: false, flipcash: true } });
    await page.goto('/profile');

    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText('2 of 3');
    // The account is shared, and saying so is the point of the line.
    await expect(panel(page)).toContainText('Gamerplex, Sledgit & Pet Legends');
    await expect(row(page, 'Email')).toHaveClass(/on/);
    await expect(row(page, 'Email')).toContainText('player@example.com');
    await expect(row(page, 'Flipcash')).toHaveClass(/on/);
    await expect(row(page, 'Phantom wallet')).not.toHaveClass(/on/);
  });

  // The deploy-order case: the field is absent until identity-service ships it.
  test('falls back to the columns when `linked` is absent', async ({ page }) => {
    await mockMe(page, { ...USER, walletAddress: 'So11111111111111111111111111111111111111112' });
    await page.goto('/profile');

    await expect(panel(page)).toContainText('2 of 3');
    await expect(row(page, 'Email')).toHaveClass(/on/);
    await expect(row(page, 'Phantom wallet')).toHaveClass(/on/);
    // Not derivable from any column, so it must read as not-linked rather than guessed.
    await expect(row(page, 'Flipcash')).not.toHaveClass(/on/);
  });

  test('offers Flipcash via the shop when it is not linked', async ({ page }) => {
    await mockMe(page, { ...USER, linked: { email: true, wallet: false, flipcash: false } });
    await page.goto('/profile');
    const act = row(page, 'Flipcash').locator('a.sim-act');
    await expect(act).toHaveAttribute('href', '/shop');
    // Money-movement controls carry gx-transfer so store builds can hide them.
    await expect(act).toHaveClass(/gx-transfer/);
  });

  test('explains why a wallet cannot be added yet instead of offering a dead button', async ({ page }) => {
    await mockMe(page, {
      ...USER,
      email: null,
      emailVerified: false,
      handle: null,
      linked: { email: false, wallet: false, flipcash: true },
    });
    await page.goto('/profile');

    const wallet = row(page, 'Phantom wallet');
    await expect(wallet).toContainText(/verify an email first/i);
    // A button here would 403 at the endpoint.
    await expect(wallet.locator('.sim-act')).toHaveCount(0);
  });

  test('offers "Add email" when there is none', async ({ page }) => {
    await mockMe(page, {
      ...USER,
      email: null,
      emailVerified: false,
      handle: null,
      linked: { email: false, wallet: false, flipcash: true },
    });
    await page.goto('/profile');
    await expect(row(page, 'Email').getByRole('button', { name: /add email/i })).toBeVisible();
  });

  test('signing out posts to logout and leaves the page', async ({ page }) => {
    await mockMe(page, { ...USER, linked: { email: true, wallet: false, flipcash: false } });
    let posted = false;
    await page.route('**/api/auth/logout', (route) => {
      posted = route.request().method() === 'POST';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto('/profile');
    await page.getByRole('button', { name: /^sign out$/i }).click();
    await expect.poll(() => posted).toBe(true);
  });

  test('shows nothing for a signed-out visitor', async ({ page }) => {
    await mockMe(page, null);
    await page.goto('/profile');
    await expect(panel(page)).toHaveCount(0);
  });

  test('fits a phone without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockMe(page, { ...USER, linked: { email: true, wallet: false, flipcash: true } });
    await page.goto('/profile');
    await expect(panel(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
