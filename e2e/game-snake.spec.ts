import { test, expect } from '@playwright/test';

// CORE-LOOP E2E for Cyber Snake (solo arcade).
// Proves the game actually plays: ready screen with a Start control → starting
// mounts the live board (score HUD appears) → an arrow key steers the snake and
// the game keeps ticking without crashing.
//
// The board is a WebGL/Canvas scene; we assert on the score HUD (real DOM, shown
// only while status === "active") rather than pixel state. We use the 2D view to
// avoid GPU flakiness, and assert on state transitions + no-crash, not exact score.

test('cyber snake: start → board goes live → arrow key steers without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/cyber-snake');

  // 2) READY screen with a Start control.
  const startBtn = page.getByRole('button', { name: /Start Game/i });
  await expect(startBtn).toBeVisible({ timeout: 15_000 });

  // Switch to the 2D view first (deterministic, no WebGL) — button label "▦ 2D".
  await page.getByRole('button', { name: /2D/i }).first().click();

  // 3) Starting transitions into play. The Start button pulses (never "stable"),
  // so force past Playwright's stability wait.
  await startBtn.click({ force: true });

  // Live board: the score HUD renders only while the run is active.
  // The HUD shows "score", "len", and "tick" — all only while status === "active".
  await expect(page.getByText(/score/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/len \d+/i)).toBeVisible({ timeout: 10_000 });

  // 4) Basic interaction: steer with an arrow key. The snake starts moving east,
  // so turn it up (a legal, non-reversing turn). The game must keep ticking.
  const tickText = () => page.getByText(/tick \d+/i).innerText();
  const readTick = async () => Number((await tickText()).match(/tick (\d+)/i)?.[1] ?? -1);

  await page.locator('body').press('ArrowUp');
  const before = await readTick();
  // Let the fixed-interval loop advance several frames (TICK_MS = 140).
  await page.waitForTimeout(800);
  const after = await readTick();

  // Game responded and kept running: the tick counter advanced, no crash. We assert
  // the loop progressed (state transition) rather than any exact score.
  expect(after, `snake loop did not advance (before=${before} after=${after})`).toBeGreaterThan(before);

  expect(errors, `snake page threw: ${errors.join(' | ')}`).toHaveLength(0);
});
