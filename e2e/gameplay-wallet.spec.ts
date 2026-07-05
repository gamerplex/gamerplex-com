import { test, expect } from '@playwright/test';
import { installMockWallet } from './fixtures/mock-wallet';

// Connect the mock Phantom on a GAME page and confirm the game stays playable with
// a wallet attached: the "Start Game" affordance is present and the page doesn't
// crash. On-chain scoring is optional (game over), so no RPC is needed to prove the
// game is startable.
//
// COVERAGE NOTE: this proves connect + Start is present/enabled/clickable without a
// crash. It does NOT assert the run visibly advances (canvas game-loop timing is racy
// headlessly), nor a full on-chain score-save — that save path needs a live Solana RPC
// (or a mocked connection) to build/submit the tx and is out of scope for a
// deterministic headless test.

test('game is startable with a wallet connected (mock Phantom)', async ({ page }, testInfo) => {
  // The nav "Select Wallet" button is desktop-only on game pages (mobile collapses it);
  // mobile wallet entry is the autoConnect path covered by wallet-connect.spec.ts.
  test.skip(testInfo.project.name === 'mobile', 'wallet modal button is desktop-only on game pages');

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await installMockWallet(page);
  await page.goto('/play/cyber-snake');

  // The game boots (client-only dynamic import) to a ready screen with a Start button.
  const startBtn = page.getByRole('button', { name: /start game/i });
  await expect(startBtn).toBeVisible({ timeout: 15_000 });

  // Connect the wallet via the real wallet-adapter modal.
  await page.getByRole('button', { name: /select wallet/i }).first().click();
  await page.getByRole('button', { name: /phantom/i }).first().click();

  // Connected: the "Select Wallet" affordance is replaced by the address button.
  await expect(page.getByRole('button', { name: /select wallet/i })).toHaveCount(0, { timeout: 10_000 });

  // Game is still startable with the wallet attached (no crash, button clickable).
  await expect(startBtn).toBeVisible();
  await expect(startBtn).toBeEnabled();
  // The Start button has a cosmetic pulse animation (scale transform) so it never
  // settles "stable" for Playwright — force past the stability wait. Starting kicks
  // off the game loop; we assert it doesn't throw rather than racing the canvas.
  await startBtn.click({ force: true });
  await page.waitForTimeout(500);

  expect(errors, `game page threw: ${errors.join(' | ')}`).toHaveLength(0);
});
