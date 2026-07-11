import { test, expect } from '@playwright/test';

// Flipball now runs SAME-ORIGIN inside gamerplex.com (no iframe, no separate
// subdomain): the raw three.js + Rapier engine is mounted directly
// by FlipballGame and bridges its score to the Arcade Shell via a
// `flipball:gameover` window CustomEvent. These assert (1) the game boots in-page
// across device sizes and (2) the game-over → shell result/save wiring fires.

for (const vp of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 832 },
]) {
  test(`flipball mounts same-origin — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/play/flipball', { waitUntil: 'domcontentloaded' });

    // shell nav home link
    await expect(page.getByRole('link', { name: 'GAMERPLEX', exact: true })).toBeVisible();

    // NO iframe — the game is same-origin now.
    await expect(page.locator('iframe')).toHaveCount(0);

    // The engine booted: its canvas is mounted inside #game-container.
    await expect(page.locator('#game-container canvas')).toBeVisible({ timeout: 15_000 });

    // The shared free web2 leaderboard is present (no wallet).
    await expect(page.getByText('🏆 Leaderboard')).toBeVisible({ timeout: 10_000 });
  });
}

test('game-over CustomEvent drives the shell result overlay + save', async ({ page }) => {
  const submits: string[] = [];
  await page.route('**/api/scores/submit', async (route) => {
    submits.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 4200 }) });
  });

  await page.goto('/play/flipball', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game-container canvas')).toBeVisible({ timeout: 15_000 });

  // Simulate the engine finishing a run (same event the real game dispatches).
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('flipball:gameover', {
      detail: { score: 4200, ballsUsed: 3, durationSec: 42, sessionSeed: [1, 2, 3] },
    }));
  });

  // The shell submits the score and shows its save status.
  await expect.poll(() => submits.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(submits[0]).toContain('"gameId":"flipball"');
  expect(submits[0]).toContain('"score":4200');
  await expect(page.getByText(/saved to leaderboard/i)).toBeVisible({ timeout: 10_000 });
});
