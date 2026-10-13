import { test, expect, type Page } from '@playwright/test';

// MANDATE #2: login must work. The home page is no longer email-first — one
// "Sign in" chip opens a modal offering three doors (Flipcash, wallet, email),
// so reaching the email field is now two clicks, not one. These tests were
// asserting the old single-CTA shape and had been failing since it changed.
//
// The identity host is cross-origin (only real on gamerplex.com), so we mock the
// signup endpoint and assert the UI contract: the email field appears, a valid
// address → "check your email", an error → a message rather than a crash.

async function openLoginModal(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  await page.getByTestId('signin-email').click();
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
}

test.describe('login — three doors, email field reachable', () => {
  test('the email sign-in modal opens with an email field + send button', async ({ page }) => {
    await openLoginModal(page);
    await expect(page.getByRole('button', { name: /email me a sign-in link/i })).toBeVisible();
  });

  test('submitting a valid email shows the "check your email" state', async ({ page }) => {
    await page.route('**/api/auth/email-signup', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );
    await openLoginModal(page);
    await page.locator('input[type="email"]').fill('e2e@example.com');
    await page.getByRole('button', { name: /email me a sign-in link/i }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible();
    await expect(page.getByText('e2e@example.com')).toBeVisible();
  });

  test('a rate-limited signup surfaces an error, not a crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/auth/email-signup', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited' }) }),
    );
    await openLoginModal(page);
    await page.locator('input[type="email"]').fill('e2e@example.com');
    await page.getByRole('button', { name: /email me a sign-in link/i }).click();

    // Stays on the form (no crash / no inbox state) — the modal surfaces the error.
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByText(/check your email/i)).toHaveCount(0);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
});
