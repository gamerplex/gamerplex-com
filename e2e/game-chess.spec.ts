import { test, expect } from '@playwright/test';

// FULL-PLAYTHROUGH E2E for Magic Chess (vs-bot arcade).
// Proves the game actually plays AND reaches the shared Arcade-Shell save-score
// screen: start-page picker → pick speed + bot → START → board renders → a real
// pawn move advances the turn → RESIGN (fastest deterministic route to game-over)
// → the game-over panel + the free web2 "🏆 Leaderboard" (the save-score screen)
// are visible. Regression guard: the game must NOT flip to a false CHECKMATE/
// DEFEATED the instant it starts.
//
// The 3D board is a WebGL canvas (racy + no stable per-square selector), so the
// move interaction is done in the 2D view, which renders clickable squares with
// data-sq="e2" attributes matching the chess engine's algebraic coordinates.

test('magic chess: start → play a move → resign → game-over + leaderboard save screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'move interaction verified on desktop viewport');

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/magic-chess');

  // 1) Start-page picker (Casual = free arcade play vs bot).
  await expect(page.getByTestId('start-page-picker')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-mode="casual"]').click();

  // 2) READY screen: pick a speed preset (default 5s is fine), then an opponent.
  await expect(page.getByRole('heading', { name: /MAGIC CHESS/i })).toBeVisible({ timeout: 15_000 });
  // Speed buttons render "<icon><n>s<label>" — pick the "Bullet" preset.
  await page.locator('button', { hasText: 'Bullet' }).first().click();
  // Choose an opponent — bot buttons carry "ELO <n>" text. Selecting one hides the
  // speed grid and reveals the START button.
  await page.locator('button', { hasText: /ELO 600/ }).first().click();

  // 3) START transitions into play. ("✦ START ✦" — text-based to survive the
  // decorative glyphs.)
  const startBtn = page.locator('button', { hasText: 'START' });
  await expect(startBtn).toBeVisible();
  await startBtn.click({ force: true });

  // Playing UI: status bar shows the turn indicator ("Your turn" / "Move 0").
  await expect(page.getByText(/Move \d+/i)).toBeVisible({ timeout: 15_000 });

  // 4) REGRESSION GUARD: must NOT be game-over right after starting.
  await expect(page.getByText(/CHECKMATE|DEFEATED|STALEMATE/i)).toHaveCount(0);
  // "Resign" only renders while phase === "playing" — proves we're mid-game.
  await expect(page.locator('button', { hasText: 'Resign' })).toBeVisible();

  // 5) Make a real move in the 2D board (deterministic clickable squares).
  await page.locator('button', { hasText: /^2D$/ }).click();
  const e2 = page.locator('[data-sq="e2"]');
  const e4 = page.locator('[data-sq="e4"]');
  await expect(e2).toBeVisible({ timeout: 10_000 });
  await e2.click();          // select the white e-pawn
  await e4.click();          // push it two squares — a legal opening move

  // The move advanced the game: it's now the bot's turn (status changes), and the
  // move counter ticked past 0. Assert on state transition, not exact score.
  await expect(page.getByText(/Move [1-9]/i)).toBeVisible({ timeout: 10_000 });

  // 6) RESIGN — the fastest deterministic route to game-over. This sets won=false
  // and flips phase → "gameover", rendering the DEFEATED panel + save tiers.
  await page.locator('button', { hasText: 'Resign' }).first().click();

  // 7) SAVE-SCORE SCREEN: the game-over panel shows the result, and the shared
  // Arcade-Shell web2 leaderboard (heading "🏆 Leaderboard" + "Verified only"
  // filter) renders for everyone — that IS the save-score screen.
  await expect(page.getByText(/DEFEATED/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('🏆 Leaderboard')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Verified only')).toBeVisible();
  // Resign hidden once we're in game-over (phase !== "playing").
  await expect(page.locator('button', { hasText: 'Resign' })).toHaveCount(0);

  expect(errors, `chess page threw: ${errors.join(' | ')}`).toHaveLength(0);
});
