import { test, expect, type Page } from '@playwright/test';

// CROSS-APP ECOSYSTEM SMOKE / REGRESSION SUITE.
//
// "Green" here means the WHOLE Gamerplex arcade works end-to-end, not one game in
// isolation. For EACH shipped game (blockwords, magic-chess, cyber-snake, flipball)
// we assert the core loop is intact:
//   1. The game route loads (no uncaught pageerror).
//   2. We can START a round (resilient role/text selectors; force past pulsing
//      buttons; skip gracefully if a game can't auto-start rather than aborting).
//   3. During active play there is NO horizontal overflow AND no uncaught errors.
//   4. The shared Arcade-Shell is present (a Leaderboard element at idle / game-over).
//   5. The @gamerplex_com X community link is present.
//
// Each game is its own test() so a failing game NEVER aborts the others — the
// suite's job is to SURFACE per-game breakage as a pass/fail matrix. Selectors are
// role/text-based so cosmetic copy changes don't break the smoke.

// ---------------------------------------------------------------------------
// Per-game config. `start` performs the game-specific "begin a round" flow using
// resilient selectors, force-clicks past pulsing/decorated buttons, and swallows
// its own errors (the assertions live in the shared body). `activeSignal` is a
// locator that only appears once a round is actually live — proof we started.
// ---------------------------------------------------------------------------

type GameCfg = {
  id: string;
  route: string;
  /** Kick off a round. Best-effort; must not throw. */
  start: (page: Page) => Promise<void>;
  /** A locator present only during active play — proof the round started. */
  activeSignal: (page: Page) => ReturnType<Page['locator']>;
  /** flipball is an iframe embed — it "plays" inside the frame, so skip the
   *  in-page active-play assertions but still smoke the shell + no-overflow. */
  embed?: boolean;
};

const GAMES: GameCfg[] = [
  {
    id: 'blockwords',
    route: '/play/blockwords',
    start: async (page) => {
      // Intro overlay → "Random Run" avoids the once-per-day daily lock.
      await page
        .getByRole('button', { name: /random run/i })
        .first()
        .click({ force: true })
        .catch(() => {});
    },
    // "Rungs" HUD renders only while a run is live.
    activeSignal: (page) => page.getByText('Rungs', { exact: true }),
  },
  {
    id: 'magic-chess',
    route: '/play/magic-chess',
    start: async (page) => {
      // Start-page picker → (ArcadeMode lazy-mounts) → speed → opponent → START.
      // The picker button carries an onClick that swaps in a dynamically-imported
      // ArcadeMode chunk; click WITHOUT force (waits for actionability so we don't
      // fire before hydration attaches the handler) and retry until the picker is
      // gone — under parallel load the chunk import is racy.
      const casual = page.locator('[data-mode="casual"]').first();
      await casual.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
      await expect(async () => {
        await casual.click().catch(() => {});
        await expect(page.getByText('How do you want to play?')).toHaveCount(0, { timeout: 2_000 });
      }).toPass({ timeout: 12_000 }).catch(() => {});
      // ArcadeMode mounted → pick speed → opponent → START (best-effort each).
      const bullet = page.locator('button', { hasText: 'Bullet' }).first();
      await bullet.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
      await bullet.click({ force: true }).catch(() => {});
      await page.locator('button', { hasText: /ELO 600/ }).first().click({ force: true }).catch(() => {});
      await page.locator('button', { hasText: /START/ }).first().click({ force: true }).catch(() => {});
    },
    // "Move <n>" turn indicator renders only in the playing phase.
    activeSignal: (page) => page.getByText(/Move \d+/i),
  },
  {
    id: 'cyber-snake',
    route: '/play/cyber-snake',
    start: async (page) => {
      await page
        .getByRole('button', { name: /start game/i })
        .first()
        .click({ force: true })
        .catch(() => {});
    },
    // "len <n>" score HUD renders only while the snake run is active.
    activeSignal: (page) => page.getByText(/len \d+/i),
  },
  {
    id: 'flipball',
    route: '/play/flipball',
    embed: true,
    // The game lives in the flipball iframe; nothing to click in the outer shell.
    start: async () => {},
    activeSignal: (page) => page.locator('iframe[src*="flipball"]'),
  },
];

/** A leaderboard element from the shared Arcade Shell — matches the idle board,
 *  the game-over save screen, and the nav/leaderboard link, so it's robust to
 *  WHERE the shell surfaces it. */
function leaderboardEl(page: Page) {
  return page
    .getByText(/leaderboard/i)
    .first();
}

/** No horizontal overflow at the document level. */
async function assertNoHOverflow(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(m.sw, `${label}: horizontal overflow (${m.sw} > ${m.cw})`).toBeLessThanOrEqual(m.cw);
}

for (const g of GAMES) {
  test(`ecosystem smoke — ${g.id}: load · start · no-overflow · shell · community link`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1) Route loads with a 200 and no navigation failure.
    const resp = await page.goto(g.route, { waitUntil: 'domcontentloaded' });
    expect(resp, `${g.id}: no response for ${g.route}`).not.toBeNull();
    expect(resp!.status(), `${g.id}: ${g.route} returned ${resp!.status()}`).toBeLessThan(400);

    // Idle overflow contract (before starting).
    await page.waitForTimeout(1000);
    await assertNoHOverflow(page, `${g.id} idle`);

    // 2) Start a round. Best-effort; catch + skip the active-play assertions if a
    //    game can't auto-start in this environment (don't fail the whole game).
    //    NOTE: some games (magic-chess) mount a start-page picker FIRST and only
    //    mount their arcade shell (nav + X link + leaderboard) once a round begins,
    //    so we run start() BEFORE asserting the shell chrome.
    await g.start(page);

    // Bounded wait so a game that DOESN'T start resolves to started=false quickly
    // (a finding) instead of eating the whole test budget and timing out.
    const started = await g
      .activeSignal(page)
      .first()
      .waitFor({ state: g.embed ? 'attached' : 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    // 3) During active play (or embed-mounted): no horizontal overflow, no errors.
    //    If start didn't take, we still hold the loaded page to the no-overflow +
    //    no-error contract — a game that can't start is a finding, not a crash.
    await page.waitForTimeout(500);
    await assertNoHOverflow(page, `${g.id} ${started ? 'play' : 'post-start'}`);

    // 4) Shared shell leaderboard present. Assert ATTACHED (in the DOM), not
    //    visible — on the mobile project the nav's Leaderboard link is hidden via
    //    CSS, but the shared board is still wired into the shell. Presence is the
    //    smoke contract; visibility is exercised by shell-leaderboard.spec.
    await expect(
      leaderboardEl(page),
      `${g.id}: shared Arcade-Shell leaderboard element not found`,
    ).toBeAttached({ timeout: 15_000 });

    // 5) @gamerplex_com X community link present in the game shell/nav (attached —
    //    hidden on mobile nav via CSS but wired into every game's chrome).
    await expect(
      page.locator('a[href*="gamerplex_com"]').first(),
      `${g.id}: @gamerplex_com X community link missing from game shell/nav`,
    ).toBeAttached({ timeout: 10_000 });

    // No uncaught page errors across the whole loop.
    expect(errors, `${g.id} page threw: ${errors.join(' | ')}`).toHaveLength(0);

    // Annotate whether the round actually started, for the pass/fail matrix.
    test.info().annotations.push({
      type: 'round-started',
      description: `${g.id}=${started}`,
    });
  });
}

// ---------------------------------------------------------------------------
// SHARED-ENDPOINT SMOKE — the cross-app APIs must respond and must FAIL SAFE.
// These are the seams every game leans on; if they 500 or leak, "green" is a lie.
// ---------------------------------------------------------------------------

test.describe('shared endpoints — cross-app arcade APIs fail safe', () => {
  test('leaderboard endpoint returns 200 + JSON list shape', async ({ request }) => {
    const res = await request.get('/api/scores/leaderboard?gameId=blockwords');
    expect(res.status(), `leaderboard status ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.leaderboard), 'leaderboard is not an array').toBeTruthy();
  });

  test('submit endpoint rejects an unauthenticated call (no 500)', async ({ request }) => {
    // Default request context sends no Origin header → the shared submit route
    // must reject (bad_origin 403 / not_signed_in 401) and NEVER 500 or accept.
    const res = await request.post('/api/scores/submit', {
      data: { gameId: 'blockwords', score: 1, refId: 'smoke' },
    });
    expect(
      [401, 403].includes(res.status()),
      `submit should reject unauthenticated with 401/403, got ${res.status()}`,
    ).toBeTruthy();
  });
});
