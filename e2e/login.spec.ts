import { test, expect } from '@playwright/test';

// MANDATE #2: login must work. The email-first flow is mocked at the network
// boundary (the identity host is cross-origin and only resolves on the real
// gamerplex.com domain), so these tests deterministically cover the UI contract:
// email step first, wallet locked until verified, success + error transitions.

test.describe('login — email-first', () => {
  test('login card renders; wallet is locked until email', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sign in with email')).toBeVisible();
    await expect(page.locator('.siws-input')).toBeVisible();

    const wallet = page.locator('.siws-wallet');
    await expect(wallet).toBeDisabled();
    await expect(wallet).toContainText(/email first/i);
  });

  test('submitting a valid email shows the "check your inbox" state', async ({ page }) => {
    await page.route('**/api/auth/email-signup', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent' }) }),
    );
    await page.goto('/');
    await page.locator('.siws-input').fill('e2e@example.com');
    await page.locator('.siws-primary').click();

    await expect(page.getByText(/sent a sign-in link/i)).toBeVisible();
    await expect(page.getByText('e2e@example.com')).toBeVisible();
  });

  test('a rate-limited signup surfaces an error, not a crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/auth/email-signup', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited' }) }),
    );
    await page.goto('/');
    await page.locator('.siws-input').fill('e2e@example.com');
    await page.locator('.siws-primary').click();

    await expect(page.locator('.siws-error')).toBeVisible();
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
});
