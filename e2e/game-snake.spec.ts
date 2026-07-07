import { test, expect } from '@playwright/test';

// FULL-PLAYTHROUGH E2E for Cyber Snake (solo arcade).
// Proves the game plays AND reaches game-over + the save-score screen: ready
// screen → start → live board (score HUD) → drive the snake into a wall so it
// CRASHES → the crash overlay ("● Game Over") + its "Your score" / "SAVE SCORE"
// panel (the save-score screen) are visible.
//
// Deterministic crash: the snake spawns at row GRID/2 (16) moving EAST, near the
// left edge. Turning NORTH (ArrowUp) is a legal, non-reversing turn; it then
// advances one row north per tick (TICK_MS=140) until it walks off the top wall
// (~16 ticks ≈ 2.3s) → stepDir() returns null → status "crashed". No food is
// eaten on this straight vertical path, so the crash is reliable and headless.
//
// The board is a WebGL/Canvas scene; we assert on real DOM (score HUD while
// active, crash overlay + leaderboard after) rather than pixel state, and use the
// 2D view to avoid GPU flakiness.

test('cyber snake: start → crash into wall → game-over + leaderboard save screen', async ({ page }, testInfo) => {
  // The deterministic "▦ 2D" board (the no-WebGL view this playthrough relies on)
  // only renders on the desktop viewport; on mobile the run is forced through the 3D
  // WebGL board, which stalls/crashes the emulated-mobile GPU (ReadPixels stalls →
  // renderer close). Mobile page-load + play-affordance are still covered by
  // availability.spec + games.spec. Same desktop-only stance as magic-chess.spec.
  test.skip(testInfo.project.name === 'mobile', 'deterministic 2D board is desktop-only; mobile 3D path GPU-crashes headless');

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/cyber-snake');

  // 1) READY screen with a Start control.
  const startBtn = page.getByRole('button', { name: /Start Game/i });
  await expect(startBtn).toBeVisible({ timeout: 15_000 });

  // Switch to the 2D view first (deterministic, no WebGL) — button label "▦ 2D".
  // Non-essential to the crash (which is DOM/state-driven), so force past the
  // pulsing-nav pointer-intercept and don't fail the run if the toggle is racy.
  await page.getByRole('button', { name: /▦ 2D/ }).first().click({ force: true }).catch(() => {});

  // 2) Starting transitions into play. The Start button pulses (never "stable"),
  // so force past Playwright's stability wait.
  await startBtn.click({ force: true });

  // Live board: the score HUD renders only while the run is active.
  await expect(page.getByText(/len \d+/i)).toBeVisible({ timeout: 15_000 });

  // 3) Drive NORTH into the top wall. One ArrowUp turns the snake north; the
  // fixed-interval loop then walks it into the wall. We keep nudging ArrowUp (a
  // no-op once already heading north) to be robust to input timing.
  await page.locator('body').press('ArrowUp');

  // 4) Wait for the crash overlay. It replaces the live HUD with a "● Game Over"
  // (or "● Starved") eyebrow. Poll ArrowUp a few times in case the very first key
  // landed between ticks; the wall crash is inevitable on a northward heading.
  const crashEyebrow = page.getByText(/Game Over|Starved/i).first();
  await expect(async () => {
    await page.locator('body').press('ArrowUp');
    await expect(crashEyebrow).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });

  // 5) SAVE-SCORE SCREEN: Cyber Snake's game-over is a full-fold crash overlay that
  // owns its own save-score UI (the shared ShellLeaderboard sits on the pre-game
  // page, not under the in-run overlay). Assert the overlay's "Your score" panel and
  // its "SAVE SCORE" affordance — that IS the save-score screen for this game.
  await expect(page.getByText(/Your score/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /SAVE SCORE/i })).toBeVisible({ timeout: 10_000 });

  expect(errors, `snake page threw: ${errors.join(' | ')}`).toHaveLength(0);
});
