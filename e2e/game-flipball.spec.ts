import { test, expect } from '@playwright/test';

// CORE-LOOP E2E for Flipball — CONSTRAINED BY ARCHITECTURE.
//
// Unlike the other three arcade games, Flipball is NOT mounted inside gamerplex.com.
// app/play/flipball/page.tsx is a static landing page whose only affordance is a
// "PLAY NOW" link out to the game's OWN origin (https://flipball.gamerplex.com), by
// design ("your wallet session stays isolated to the game. Connect your wallet
// there, not here"). There is no in-app canvas, start button, or launch/flick
// control on this origin, so the "board renders → flick → score changes" core loop
// cannot be exercised here — it lives at the external origin, out of scope for this
// app's E2E and not deterministically bootable in this suite.
//
// What we CAN assert on this origin: the landing loads with zero uncaught errors,
// and its single play affordance (the launch link) is present and points at the
// external game. That is the full extent of the loop reachable from this app.

test('flipball: landing loads clean and exposes the launch affordance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/flipball');

  // 2/3) The page's start/launch affordance: the "PLAY NOW" link.
  const playLink = page.getByRole('link', { name: /PLAY NOW/i });
  await expect(playLink).toBeVisible({ timeout: 15_000 });

  // It launches the game at its own origin (the real "start" for this game).
  await expect(playLink).toHaveAttribute('href', /flipball\.gamerplex\.com/);

  // Title renders (page mounted, not an error boundary).
  await expect(page.getByRole('heading', { name: 'FLIPBALL' })).toBeVisible();

  // 1) No uncaught errors.
  expect(errors, `flipball landing threw: ${errors.join(' | ')}`).toHaveLength(0);
});
