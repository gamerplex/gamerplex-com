import { test, expect } from '@playwright/test';

// FULL-PLAYTHROUGH E2E for Blockwords (5-letter guessing arcade).
// Proves the game plays AND reaches the end state + save-score screen: intro
// overlay → start a Random Run → submit guesses until the run ENDS → the end
// overlay ("● Time's up" / "● Solved") + the shared Arcade-Shell "🏆 Leaderboard"
// (the save-score screen) are visible.
//
// Deterministic end: any 5-letter A–Z string is an "acceptable" guess (see
// isAcceptableGuess), so we exhaust the 6-guess budget with six distinct
// throwaway words. On the 6th commit the engine flips status → "ended" (or
// earlier if a guess happens to solve — either way the end overlay renders).
// The 90s timer is far longer than the test, so exhausting guesses is the
// reliable, headless route to game-over.
//
// The grid renders 30 tiles with aria-label="empty"/"letter X"; the run HUD shows
// "0/6" guesses. Physical-keyboard input drives letters/Enter (wired on window).

test('blockwords: start → exhaust guesses → end screen + leaderboard save screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/blockwords');

  // 1) Intro overlay with a Start control. "Random Run" avoids the daily
  // once-per-day lock so the test is repeatable.
  const startBtn = page.getByRole('button', { name: /Random Run/i });
  await expect(startBtn).toBeVisible({ timeout: 15_000 });
  await startBtn.click();

  // 2) Playing UI: the guess grid (30 tiles) and the HUD ("0/6") appear.
  await expect(page.getByText('/6')).toBeVisible({ timeout: 15_000 });
  const tiles = page.locator('[aria-label="empty"], [aria-label^="letter"]');
  await expect(tiles.first()).toBeVisible({ timeout: 10_000 });

  // 3) Submit six distinct 5-letter guesses to exhaust the budget. Each is a
  // valid acceptable guess (any 5 A–Z letters); Enter commits it. Key handlers
  // live on window, so we press against <body>.
  const guesses = ['CRANE', 'MOIST', 'BLURP', 'FJORD', 'WXYZQ', 'GHKLV'];
  const body = page.locator('body');
  for (const word of guesses) {
    // If a prior guess already ended the run, the input is inert — stop early.
    if (await page.getByText(/Time's up|Solved/i).first().isVisible().catch(() => false)) break;
    for (const ch of word) await body.press(ch);
    await body.press('Enter');
    await page.waitForTimeout(250); // let the row flip animation settle
  }

  // 4) END STATE: the run flipped to "ended" and the overlay eyebrow shows
  // "● Time's up" (guesses exhausted) or "● Solved" (accidental solve). Either is
  // the game-over state.
  await expect(page.getByText(/Time's up|Solved/i).first()).toBeVisible({ timeout: 10_000 });

  // 5) SAVE-SCORE SCREEN: the shared Arcade-Shell web2 leaderboard (heading
  // "🏆 Leaderboard" + "Verified only" filter) is present — that IS the
  // save-score screen.
  await expect(page.getByText('🏆 Leaderboard')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Verified only')).toBeVisible();

  expect(errors, `blockwords page threw: ${errors.join(' | ')}`).toHaveLength(0);
});
