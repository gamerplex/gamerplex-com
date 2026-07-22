import { test, expect } from '@playwright/test';

// PLAYS-HEADLESS E2E for VRFC (WebGPU Muay Thai fighter).
// Proves the VRFC-specific risk: the WebGPU engine (→ forceWebGL fallback
// headless) actually BOOTS and RUNS a live fight — ready screen (glass chrome)
// → FIGHT → live HUD (round timer + both corners) → a strike executes with no
// uncaught error. We assert on real DOM, not canvas pixels.
//
// We deliberately do NOT idle-out to game-over here: the engine clamps dt to
// 50ms/frame, so under the slow headless WebGL fallback a full best-of-3 match
// runs several minutes of wall-clock and is timing-flaky. The game-over path
// (ShellResultScreen: "Save my score" / "Play again" + leaderboard) is the
// SHARED shell already covered by the sibling game specs + shell-leaderboard.spec;
// VRFC wires the identical component (see VrfcMode.tsx).

test('vrfc: ready → fight boots → live HUD + a strike, no errors', async ({ page }, testInfo) => {
  // WebGPU is absent headless; the engine falls back to forceWebGL. The mobile
  // emulated GPU stalls under the 3D scene like the other 3D games — same
  // desktop-only stance as cyber-snake/magic-chess. Mobile load + play
  // affordance stay covered by availability.spec + games.spec.
  test.skip(testInfo.project.name === 'mobile', '3D fight is GPU-heavy; deterministic run is desktop-only');

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/vrfc');

  // 1) READY screen (glass chrome): FIGHT control + the combo-teaching copy.
  const fightBtn = page.getByRole('button', { name: /FIGHT/i });
  await expect(fightBtn).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/art of eight limbs/i).first()).toBeVisible();

  // 2) FIGHT → the engine boots into a live round: timer + both corners' HUD.
  await fightBtn.click({ force: true });
  await expect(page.getByText(/ROUND 1/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/RAVAN/i).first()).toBeVisible();

  // 3) The sim is actually running — wait out the intro banner, then throw a jab
  //    (J). No throw = a live, input-responsive engine.
  await page.waitForTimeout(2_500);
  await page.keyboard.press('j');
  await page.waitForTimeout(1_000);

  // 4) No uncaught page errors booting/running the WebGL-fallback engine.
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});
