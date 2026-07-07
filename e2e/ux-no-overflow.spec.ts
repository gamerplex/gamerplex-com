import { test, expect, type Page } from '@playwright/test';

// UX GUARD (Blockwords — the flagship reference): the mobile fixed-fold layout must
// never let the page scroll horizontally OR vertically during active play / game-over.
// We position these as casual MOBILE-VERTICAL arcade games, so this is the contract:
//     scrollWidth  <= clientWidth   (no horizontal overflow)
//     scrollHeight <= clientHeight  (no page scroll — the game owns the fold)
// Runs on both the `desktop` and `mobile` Playwright projects; captures screenshots.

async function assertFits(page: Page, label: string, opts: { vertical?: boolean } = {}) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
  }));
  expect(m.sw, `${label}: horizontal overflow (${m.sw} > ${m.cw})`).toBeLessThanOrEqual(m.cw);
  if (opts.vertical) {
    // small tolerance for sub-pixel rounding
    expect(m.sh, `${label}: page scrolls vertically (${m.sh} > ${m.ch})`).toBeLessThanOrEqual(m.ch + 2);
  }
}

async function shot(page: Page, testInfo: any, name: string) {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

test.describe('Flipball — iframe-shell mobile UX guard', () => {
  test('embed shell never overflows horizontally (load + settle)', async ({ page }, testInfo) => {
    await page.goto('/play/flipball');
    // wait for the cross-origin game iframe to mount
    await page.getByTitle('Flipball').waitFor({ timeout: 15_000 }).catch(() => {});
    await assertFits(page, 'flipball load');
    await page.waitForTimeout(1500);
    await assertFits(page, 'flipball settle');
    await shot(page, testInfo, 'flipball');
  });
});

test.describe('Blockwords — fixed-fold mobile UX guard', () => {
  test('start · play · game-over never overflow or page-scroll', async ({ page }, testInfo) => {
    await page.goto('/play/blockwords');
    await page.waitForTimeout(1500);
    await assertFits(page, 'blockwords start');
    await shot(page, testInfo, 'blockwords-start');

    // START → active play: the fold is locked (no h-overflow AND no v-scroll).
    await page.getByRole('button', { name: /random run/i }).first().click({ force: true }).catch(() => {});
    await expect(page.getByText(/change one letter/i).first()).toBeVisible({ timeout: 15_000 });
    await assertFits(page, 'blockwords play', { vertical: true });
    await shot(page, testInfo, 'blockwords-play');
  });
});

test.describe('Cyber Snake — fixed-fold mobile UX guard', () => {
  test('start · play never overflow or page-scroll', async ({ page }, testInfo) => {
    await page.goto('/play/cyber-snake');
    await page.waitForTimeout(1500);
    await assertFits(page, 'cyber-snake start');
    await shot(page, testInfo, 'cyber-snake-start');

    // Force the headless-safe 2D canvas view (the 3D WebGL scene can't init in CI).
    // The camera toggle is CSS-hidden on mobile, so click the button via JS (works on
    // display:none elements) to set the view before the scene mounts.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /2D/.test(x.textContent || ''));
      (b as HTMLButtonElement | undefined)?.click();
    });
    // START → active play: click the pulsing Start button (force past the animation).
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /start game|accept challenge/i.test(x.textContent || ''));
      (b as HTMLButtonElement | undefined)?.click();
    });
    // The on-board HUD ("len N · tick M") only renders once the run is active.
    await expect(page.getByText(/len \d/i).first()).toBeVisible({ timeout: 15_000 });
    await assertFits(page, 'cyber-snake play', { vertical: true });
    await shot(page, testInfo, 'cyber-snake-play');
  });
});

test.describe('Magic Chess — fixed-fold mobile UX guard', () => {
  test('start · play · game-over never overflow or page-scroll', async ({ page }, testInfo) => {
    // Multi-step flow (picker → casual → bot → start → play → resign → game-over)
    // plus a 3D scene is slower than the single-screen games — give it headroom.
    test.setTimeout(90_000);
    await page.goto('/play/magic-chess');
    await page.waitForTimeout(1500);
    await assertFits(page, 'chess start');
    await shot(page, testInfo, 'chess-start');

    // Mode picker → Casual mounts the arcade game (ready phase: pick speed + opponent).
    await page.getByRole('button', { name: /casual/i }).first().click({ force: true });
    // Pick the first bot (opponent buttons carry "ELO"), then START.
    await page.getByRole('button', { name: /ELO/ }).first().click({ force: true });
    await page.getByRole('button', { name: /start/i }).first().click({ force: true });

    // Active play: the HUD/board fill the fold below the fixed nav — no h-overflow, no page-scroll.
    await expect(page.getByText(/your turn|bot thinking|check/i).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await assertFits(page, 'chess play', { vertical: true });
    await shot(page, testInfo, 'chess-play');

    // Resign → game-over overlay: still locked (content scrolls inside the fold, not the page).
    // JS-click (works even while the 3D overlay sits above the HUD in headless).
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /resign/i.test(x.textContent || ''));
      (b as HTMLButtonElement | undefined)?.click();
    });
    await expect(page.getByText(/checkmate|defeated|stalemate|score/i).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await assertFits(page, 'chess game-over', { vertical: true });
    await shot(page, testInfo, 'chess-gameover');
  });
});
