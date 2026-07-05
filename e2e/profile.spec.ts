import { test, expect } from '@playwright/test';
import { installMockWallet } from './fixtures/mock-wallet';

// /profile with a connected wallet must render the profile view (not crash on the
// on-chain lookups). Uses the mock wallet + autoConnect.

test('profile renders with a connected wallet (no hydration mismatch)', async ({ page }) => {
  // The wallet-dependent render is gated behind a `mounted` flag so SSR (wallet-less)
  // and the first client render match — there must be ZERO page errors, including the
  // previously-tolerated React #418 hydration warning.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await installMockWallet(page);
  await page.addInitScript(() => window.localStorage.setItem('walletName', '"Phantom"'));

  await page.goto('/profile');

  await expect(page.getByRole('link', { name: 'GAMERPLEX' }).first()).toBeVisible();
  const body = (await page.locator('body').innerText()) || '';
  expect(body.trim().length).toBeGreaterThan(40);
  expect(errors, `/profile threw page errors: ${errors.join(' | ')}`).toHaveLength(0);
});
