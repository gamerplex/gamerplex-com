import { test, expect } from '@playwright/test';
import { installMockWallet, mockSiwsBackend } from './fixtures/mock-wallet';

// Full wallet CONNECT via the real wallet-adapter modal, driven by the injected
// mock Phantom. Proves "Select Wallet → pick Phantom → connected" works end-to-end.

test('connects a wallet via the modal (mock Phantom)', async ({ page }, testInfo) => {
  // The "Select Wallet" button lives in the game-page nav, which collapses on
  // mobile — mobile wallet entry is the autoConnect path (covered by the SIWS test).
  test.skip(testInfo.project.name === 'mobile', 'wallet modal button is desktop-only on game pages');

  await installMockWallet(page);
  await page.goto('/play/cyber-snake');

  // Open the wallet-adapter modal.
  await page.getByRole('button', { name: /select wallet/i }).first().click();

  // Phantom is detected (our mock) — pick it.
  await page.getByRole('button', { name: /phantom/i }).first().click();

  // After connecting, the "Select Wallet" affordance is gone (replaced by the
  // connected address button).
  await expect(page.getByRole('button', { name: /select wallet/i })).toHaveCount(0, { timeout: 10_000 });
});

test('full SIWS sign-in on the homepage (email-verified + wallet)', async ({ page }) => {
  await installMockWallet(page);
  await mockSiwsBackend(page, { emailVerified: true });
  // Pre-select Phantom so autoConnect wires up the wallet on mount.
  await page.addInitScript(() => window.localStorage.setItem('walletName', '"Phantom"'));

  await page.goto('/');

  const siws = page.locator('.siws-wallet');
  await expect(siws).toBeEnabled({ timeout: 10_000 });
  await siws.click();

  // SIWS POST sets the wallet; the refreshed session shows the signed-in state.
  await expect(page.getByText(/Signed in/i)).toBeVisible({ timeout: 10_000 });
});
