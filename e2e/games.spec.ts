import { test, expect } from '@playwright/test';
import { GAME_ROUTES } from './routes';

// availability.spec already proves every game route renders content without
// crashing. This layer proves each one exposes a PLAY affordance — a canvas, the
// game board/grid, a start/find-match control, a wallet connect (wallet-gated
// games), or a link to the game's own origin (Flipball). No affordance, or a
// crash, fails the test.

const PLAY_AFFORDANCE = [
  'canvas',
  'iframe', // Flipball's play surface is a cross-origin game iframe (flipball.gamerplex.com)
  '[class*="board"]',
  '[role="tablist"]', // Blockwords arcade mode-picker
  '[data-testid*="game"]',
  'a:has-text("PLAY")',
  'button:has-text("Start")',
  'button:has-text("Play")',
  'button:has-text("Find")', // "Find a match" (live PvP)
  'button:has-text("Select Wallet")', // wallet-gated games
  'button:has-text("Connect")',
  'button:has-text("Launch")',
  'button:has-text("TV")', // Cyber Snake spectator/arcade
].join(', ');

for (const route of GAME_ROUTES) {
  test(`game mounts: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // Some games have hidden pre-start canvases in the DOM; assert a VISIBLE
    // affordance exists rather than that the first DOM match happens to be visible.
    await expect(
      page.locator(PLAY_AFFORDANCE).filter({ visible: true }).first(),
      `${route}: no play affordance`,
    ).toBeVisible({ timeout: 15_000 });
    expect(errors, `${route} threw: ${errors.join(' | ')}`).toHaveLength(0);
  });
}
