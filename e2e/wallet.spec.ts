import { test, expect } from '@playwright/test';

// The web2→web3 gate: a wallet can only be linked AFTER email verification. This
// verifies the gating both ways. (The actual SIWS message-signing needs a real
// injected wallet — see the note at the bottom — so we cover the gate logic here,
// which is the security-relevant part: no wallet path before email.)

test.describe('wallet gating (email-first)', () => {
  test('anon: wallet step is locked', async ({ page }) => {
    // No session → getIdentity() returns null (identity host is cross-origin here).
    await page.goto('/');
    const wallet = page.locator('.siws-wallet');
    await expect(wallet).toBeDisabled();
    await expect(wallet).toContainText(/email first/i);
    await expect(page.getByText(/Complete step 1 first/i)).toBeVisible();
  });

  test('email-verified: wallet step unlocks', async ({ page }) => {
    // Mock a verified email session WITHOUT a linked wallet.
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'e2e', email: 'e2e@example.com', emailVerified: true, walletAddress: null, handle: 'e2e' } }),
      }),
    );
    await page.goto('/');

    // Step 1 now shows as signed-in, and the "complete step 1 first" lock is gone.
    await expect(page.getByText(/Signed in/i)).toBeVisible();
    await expect(page.getByText(/Complete step 1 first/i)).toHaveCount(0);
  });
});

// NOT covered here (needs a mock injected wallet / on-chain harness): the actual
// SIWS signature round-trip, gameplay-to-on-chain-score, and credits spend during
// a game-over. Tracked as follow-up coverage.
