import { test, expect } from '@playwright/test';

// Arcade Shell — the free web2 leaderboard is part of the standard game-over,
// shown to everyone (no wallet), and must render across device sizes.

test('scores leaderboard endpoint returns a list (proxy → identity-service)', async ({ request }) => {
  const res = await request.get('/api/scores/leaderboard?gameId=magic-chess');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body.leaderboard)).toBeTruthy();
});

for (const vp of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1280, height: 832 },
]) {
  test(`ShellLeaderboard renders on chess game-over — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/play/magic-chess?mode=arcade');
    // start flow (matches game-chess.spec.ts): dismiss the StartPagePicker, then bot/speed, START
    await page.locator('[data-mode="casual"]').first().click().catch(() => {});
    await page.locator('button', { hasText: 'Bullet' }).first().click().catch(() => {});
    await page.locator('button', { hasText: 'ELO 600' }).first().click().catch(() => {});
    await page.locator('button', { hasText: /START/ }).first().click();
    // resign straight to game-over
    await page.locator('button', { hasText: /Resign/ }).first().click();

    // the shared leaderboard + its verified-only filter must be visible + responsive
    await expect(page.getByText('🏆 Leaderboard')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Verified only')).toBeVisible();
    expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });
}
