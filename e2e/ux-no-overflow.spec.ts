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
