import { test, expect } from '@playwright/test';

// Flipball is now consolidated INTO gamerplex.com as an iframe route wrapped by
// the Arcade Shell (nav + login + free web2 leaderboard). This asserts the
// embed shell renders across device sizes — the heavy WebGL game itself lives
// in the iframe and is covered by flipball's own suite.

for (const vp of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 832 },
]) {
  test(`flipball embed shell renders — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/play/flipball', { waitUntil: 'domcontentloaded' });

    // shell nav home link
    await expect(page.getByRole('link', { name: 'GAMERPLEX' })).toBeVisible();
    // the game iframe points at the flipball origin
    const frame = page.locator('iframe[src*="flipball.gamerplex.com"]');
    await expect(frame).toHaveCount(1);
    // the shared leaderboard is present (free web2 board, no wallet)
    await expect(page.getByText('🏆 Leaderboard')).toBeVisible({ timeout: 10_000 });
  });
}
