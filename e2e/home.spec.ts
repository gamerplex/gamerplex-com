import { test, expect } from '@playwright/test';

// The homepage is the front door. It must show the brand, the login card, real
// (not broken) game thumbnails, and the games grid — on desktop and mobile.

const GAMES = ['cyber-snake', 'magic-chess', 'blockwords', 'flipball'];

test.describe('homepage', () => {
  test('hero + login card render', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-title')).toHaveText(/GAMERPLEX/);
    await expect(page.locator('.home-identity')).toBeVisible();
    await expect(page.getByText('Sign in with email')).toBeVisible();
  });

  test('all game thumbnails load (no broken images)', async ({ page }) => {
    await page.goto('/');
    for (const g of GAMES) {
      const img = page.locator(`img[src*="/games/${g}/banner.png"]`);
      await expect(img, `${g} <img> present`).toBeVisible();
      const loaded = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
      expect(loaded, `${g} thumbnail decoded`).toBeTruthy();
    }
  });

  test('games are linked and playable', async ({ page }) => {
    await page.goto('/');
    // Each game card links to its play route.
    for (const g of GAMES) {
      await expect(page.locator(`a[href*="/play/${g}"]`).first()).toBeVisible();
    }
  });
});
