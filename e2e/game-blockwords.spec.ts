import { test, expect } from '@playwright/test';

// CORE-LOOP E2E for Blockwords (5-letter guessing arcade).
// Proves the game actually plays: intro overlay with a Start control → starting a
// run mounts the guess grid + HUD → typing a valid guess row and submitting fills
// a row (guess counter advances) without crashing.
//
// The grid renders 30 tiles with aria-label="empty"/"letter X"; the run HUD shows
// "0/6" guesses. Physical-keyboard input drives letters/Enter (wired on window).

test('blockwords: start → grid renders → typing a guess advances the row', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/blockwords');

  // 2) Intro overlay with a Start control. "Random Run" avoids the daily
  // once-per-day lock so the test is repeatable.
  const startBtn = page.getByRole('button', { name: /Random Run/i });
  await expect(startBtn).toBeVisible({ timeout: 15_000 });
  await startBtn.click();

  // 3) Playing UI: the guess grid (30 tiles) and the HUD ("0/6") appear.
  await expect(page.getByText('/6')).toBeVisible({ timeout: 15_000 });
  const tiles = page.locator('[aria-label="empty"], [aria-label^="letter"]');
  await expect(tiles.first()).toBeVisible({ timeout: 10_000 });

  // 4) Type a valid 5-letter guess + submit. "CRANE" is a common starter that is
  // in the acceptable-guess list; Enter commits it. Key handlers live on window.
  const body = page.locator('body');
  for (const ch of 'CRANE') await body.press(ch);
  await body.press('Enter');

  // Game responded: the guess committed to a graded row. Committed tiles carry
  // aria-label="letter X" (empty cells are aria-label="empty"), so ≥5 graded tiles
  // means our word landed on the board. A real state transition, no crash. We
  // assert on committed letters rather than exact score/counter text.
  const graded = page.locator('[aria-label^="letter"]');
  await expect(graded.first()).toBeVisible({ timeout: 10_000 });
  expect(await graded.count()).toBeGreaterThanOrEqual(5);

  expect(errors, `blockwords page threw: ${errors.join(' | ')}`).toHaveLength(0);
});
