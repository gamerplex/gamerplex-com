import { test, expect } from '@playwright/test';

// The Frontier hackathon is over — the top voting banner must NOT reappear
// (it lived in app/layout.tsx, so it would show on every page).
test('no Frontier/hackathon voting banner anywhere on the site', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href*="colosseum.com/frontier"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Vote for Gamerplex');
  await expect(page.locator('body')).not.toContainText('Help us get to Mainnet');
});
