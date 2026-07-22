import { test, expect, type Page, type Request } from '@playwright/test';

// PLAYS-HEADLESS E2E for NETHERLEVEL — Season 1, the full arc:
//   THE DESCENT (0 → −6) → THE ABYSS mastery gate (3 flawless clears open the
//   Ascent Door) → THE ASCENSION (−6 → 0 → the TWELVE GATES +12 = the ending) →
//   plus persistent campaign progress (Continue / New run) and THE DAILY DESCENT
//   (date-seeded, one attempt per day).
// Headless Chromium has no WebGPU, so EVERY run here exercises the forced-WebGL2
// fallback (the exact mobile-WebView path) — desktop project == forced-WebGL.
// Proofs:
//   1. descent: walk → collapse kills → respawn → hop the pit → Gate → shell.
//   2. abyss (?hall=7&asc=1): flawless lap → 1/3 → a death SHATTERS to 0/3 →
//      3 flawless in a row → Relic + "THE ASCENT DOOR OPENS" → (asc=1 caps the
//      run here) → shell.
//   3. mobile: touch controls walk → trap death → abandon → shell.
//   4. the +12 ENDING (?hall=23&asc=1): the Twelfth Gate → the sky floods in →
//      ASCENSION → shell win.
//   5. resume: clear a hall → progress unlocks → reload → CONTINUE persists.
//   6. the Daily Descent: enter → play → shell; the one-per-day guard; the
//      score stashes tagged gameId "netherlevel-daily".
// Driving rule (learned the hard way): the headless sim runs UNDER real-time
// (fixed-step accumulator, 50ms clamp), so all trap-cycle waits are in SIM
// seconds via the HUD clock (nl-time), never wall-clock sleeps.

const SHOTS = 'scratchpad/shots';

const readNum = async (page: Page, id: string): Promise<number | null> => {
  const t = await page.getByTestId(id).textContent({ timeout: 900 }).catch(() => null);
  if (!t) return null;
  const m = t.match(/(-?[\d.]+)/);
  return m ? parseFloat(m[1]) : null;
};

// HUD sim clock (m:ss) → seconds; only advances while the Pilgrim is in "run".
const readSim = async (page: Page): Promise<number | null> => {
  const t = await page.getByTestId('nl-time').textContent({ timeout: 900 }).catch(() => null);
  const m = t ? t.match(/(\d+):(\d+)/) : null;
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

// Abyss streak read: "◆◆◇ 2/3 FLAWLESS" → 2
const readStreak = async (page: Page): Promise<number | null> => {
  const t = await page.getByTestId('nl-streak').textContent({ timeout: 900 }).catch(() => null);
  const m = t ? t.match(/(\d)\s*\/\s*3/) : null;
  return m ? parseInt(m[1], 10) : null;
};

// wait N SIM seconds (trap cycles are sim-timed; wall-clock lies headless)
async function waitSim(page: Page, secs: number, capMs = 90_000) {
  const s0 = await readSim(page);
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    const s = await readSim(page);
    if (s0 !== null && s !== null && s - s0 >= secs) return;
    await page.waitForTimeout(120);
  }
  throw new Error('waitSim cap exceeded');
}

// walk forward (holding W) until cond is true; always releases the key.
async function walkUntil(page: Page, cond: () => Promise<boolean>, timeoutMs: number, label = '') {
  await page.keyboard.down('w');
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < timeoutMs) {
      if (await cond()) return;
      await page.waitForTimeout(50);
    }
    throw new Error('walkUntil timeout ' + label);
  } finally {
    await page.keyboard.up('w');
  }
}

// precision approach: short W taps so overshoot stays bounded even when the
// headless frame rate (and poll latency) crawls under runner load.
async function tapWalkUntil(page: Page, cond: () => Promise<boolean>, timeoutMs: number, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return;
    await page.keyboard.down('w');
    await page.waitForTimeout(150);
    await page.keyboard.up('w');
    await page.waitForTimeout(200);
  }
  throw new Error('tapWalkUntil timeout ' + label);
}

const distLE = (page: Page, v: number) => async () => {
  const d = await readNum(page, 'nl-dist');
  return d !== null && d <= v;
};

function watchCaptures(page: Page): Array<{ event: string; properties?: Record<string, unknown> }> {
  const captures: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  page.on('request', (r: Request) => {
    if (!/ph001\.gamerplex\.com/i.test(r.url()) || r.method() !== 'POST' || !/\/(e|i\/v0\/e|batch)\//i.test(r.url())) return;
    const raw = r.postData();
    if (!raw) return;
    const tryParse = (s: string): unknown => { try { return JSON.parse(s); } catch { return undefined; } };
    let payload: unknown = tryParse(raw);
    if (payload === undefined) {
      const m = /(?:^|&)data=([^&]+)/.exec(raw);
      if (m) {
        const val = decodeURIComponent(m[1]);
        payload = tryParse(val) ?? tryParse(Buffer.from(val, 'base64').toString('utf8'));
      }
    }
    const arr = Array.isArray(payload) ? payload : payload ? [payload] : [];
    for (const e of arr) {
      if (e && typeof e === 'object' && 'event' in e) captures.push(e as { event: string; properties?: Record<string, unknown> });
    }
  });
  return captures;
}

test('netherlevel descent: walk → trap kills → respawn → hop the pit → Gate → shell', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'full deterministic run is desktop-driven; mobile covered below');
  test.setTimeout(300_000); // headless WebGL sim runs well under real-time; the loop needs headroom

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const captures = watchCaptures(page);

  await page.goto('/play/netherlevel?asc=1');

  // 1) READY screen: descent framing + the full-arc copy (Twelve Gates) + start CTA.
  const enter = page.getByRole('button', { name: /ENTER THE HALL/i });
  await expect(enter).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/the Pilgrim/i).first()).toBeVisible();
  await expect(page.getByText(/Abyss trial 3× in a row/i).first()).toBeVisible();
  await expect(page.getByText(/Twelve Gates/i).first()).toBeVisible();
  await expect(page.getByTestId('nl-map')).toBeVisible();          // the journey map
  await expect(page.getByTestId('nl-daily')).toBeVisible();        // the Daily entry
  await enter.click({ force: true });

  // 2) Engine boots (forced-WebGL2 fallback headless): live HUD with the depth
  //    read (▼ DESCENT −1), the Gate meter, and the Great Ladder journey map.
  await expect(page.getByTestId('nl-dist')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('nl-depth')).toContainText('DESCENT −1');
  await expect(page.getByTestId('nl-deaths')).toContainText('0');
  await expect(page.getByTestId('nl-ladder')).toBeVisible();

  // 3) Walk straight in — the collapsing floor springs and kills the pilgrim.
  await walkUntil(page, async () => ((await readNum(page, 'nl-deaths')) ?? 0) >= 1, 60_000, 'first death');
  await expect(page.getByTestId('nl-deaths')).toContainText('1'); // died + counted

  // 4) Wait out the death animation: the soul returns to the Shrine (dist resets).
  const waitRespawn = async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      const d = await readNum(page, 'nl-dist');
      if (d !== null && d >= 20) return;
      await page.waitForTimeout(100);
    }
    throw new Error('respawn never observed');
  };

  // 5) Beat the hall the way a player does — retry until the hop lands (headless
  //    frame pacing jitters the walk-stop point, so allow a few honest deaths).
  let won = false;
  for (let attempt = 0; attempt < 5 && !won; attempt++) {
    await waitRespawn();
    // approach fast, then tap-walk onto the trigger and stop → tiles fall away
    await walkUntil(page, distLE(page, 15.6), 60_000, 'pit approach');
    await tapWalkUntil(page, distLE(page, 14.0), 60_000, 'pit trigger');
    await waitSim(page, 3); // tiles fall on the SIM clock, not wall-clock
    const deathsBefore = (await readNum(page, 'nl-deaths')) ?? 0;
    // HOP the pit from the lip (hold space = full height, W held for carry)
    await page.keyboard.down('w');
    await page.keyboard.down(' ');
    await page.waitForTimeout(900);
    await page.keyboard.up(' ');
    // walk on until the Gate (HUD unmounts) or a death (retry)
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const d = await readNum(page, 'nl-dist');
      if (d === null) { won = true; break; } // game over (HUD unmounts)
      const deaths = await readNum(page, 'nl-deaths');
      if (deaths !== null && deaths > deathsBefore) break; // perished — go again
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('w');
  }
  expect(won, 'reached the real Gate within 5 attempts').toBe(true);

  // 6) The canonical shell: result screen + leaderboard render. (The headline
  //    yields to "New personal best!" on a fresh profile — assert the stable bits.)
  await expect(page.getByRole('button', { name: /play again/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/deaths/i).first()).toBeVisible();
  await expect(page.getByText(/1\/1 rungs/i).first()).toBeVisible(); // ?asc=1 → score honesty
  await expect(page.getByText(/LEADERBOARD/i).first()).toBeVisible();

  // 7) Play-events contract — opportunistic wire assertion (house convention:
  //    ph001 may hold/reject automation batches, so assert only what shipped).
  const gameEvents = captures.filter((c) => ['play_started', 'game_started', 'game_over'].includes(c.event));
  if (gameEvents.length) {
    for (const c of gameEvents) expect(c.properties?.game, `${c.event} tagged with the game slug`).toBe('netherlevel');
  } else {
    testInfo.annotations.push({ type: 'note', description: 'ph001 held the capture batch in-window — play-event tagging verified when batches ship' });
  }

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});

// ── THE ABYSS (−6): the mastery gate. One scripted flawless lap of the trial:
// spike (wait out) → crush (wait out) → collapse pit (spring + hop) → vanishing
// floor (right ledge) → delayed drop (spring, wait, hop) → the Ascent Door.
// Identical every attempt (deterministic) — which is exactly what makes it
// drivable. Returns 'clear' | 'death'.
async function trialLap(page: Page, streak0: number): Promise<'clear' | 'death'> {
  const deaths0 = (await readNum(page, 'nl-deaths')) ?? 0;
  const died = async () => ((await readNum(page, 'nl-deaths')) ?? 0) > deaths0;
  const step = async (fn: () => Promise<void>) => { await fn(); if (await died()) throw 'death'; };
  try {
    // spike (trigger −6.0): step just past the trigger, stand short of the band, wait the cycle out
    await step(async () => { await walkUntil(page, distLE(page, 29.8), 90_000, 'spike appr'); await tapWalkUntil(page, distLE(page, 28.4), 40_000, 'spike trig'); await waitSim(page, 3); });
    // crush (trigger −11.4): same read — spring it, let it slam and retract
    await step(async () => { await walkUntil(page, distLE(page, 24.4), 90_000, 'crush appr'); await tapWalkUntil(page, distLE(page, 23.0), 40_000, 'crush trig'); await waitSim(page, 4); });
    // collapse pit (trigger −17.4): spring it from the lip, let the tiles fall, hop across
    await step(async () => {
      await walkUntil(page, distLE(page, 18.6), 90_000, 'pit appr');
      await tapWalkUntil(page, distLE(page, 17.1), 40_000, 'pit trig');
      await waitSim(page, 3);
      await page.keyboard.down('w');
      await page.keyboard.down(' ');
      await page.waitForTimeout(700);
      await page.keyboard.up(' ');
      try {
        const t0 = Date.now();
        while (Date.now() - t0 < 60_000) {
          const d = await readNum(page, 'nl-dist');
          if (d === null || d <= 14.2 || d >= 30) break; // landed+stopped / lap end / respawned
          await page.waitForTimeout(40);
        }
      } finally { await page.keyboard.up('w'); }
    });
    // vanishing floor (cut x −2..0.8): take the right ledge, stay on it past the cut
    await step(async () => {
      await page.keyboard.down('d');
      try { await waitSim(page, 2); } finally { await page.keyboard.up('d'); } // wall-clamped strafe right
      await walkUntil(page, distLE(page, 8.5), 90_000, 'ledge walk');
    });
    // delayed drop (trigger −27.6, long warn): spring it, stand on the lip, wait, hop late
    await step(async () => { await tapWalkUntil(page, distLE(page, 7.05), 40_000, 'delayed trig'); await waitSim(page, 3); });
    // hop the fallen band and walk into the Ascent Door (wide threshold trigger)
    await page.keyboard.down('w');
    await page.keyboard.down(' ');
    await page.waitForTimeout(700);
    await page.keyboard.up(' ');
    const t0 = Date.now();
    try {
      while (Date.now() - t0 < 90_000) {
        const s = await readStreak(page);
        if (s !== null && s !== streak0) return 'clear';
        if (await died()) throw 'death';
        const d = await readNum(page, 'nl-dist');
        if (d === null) return 'clear'; // HUD unmounted — the ending fired
        await page.waitForTimeout(80);
      }
    } finally { await page.keyboard.up('w'); }
    throw new Error('the Ascent Door was never reached');
  } catch (e) {
    if (e === 'death') return 'death';
    throw e;
  }
}

test('netherlevel abyss: 3× flawless trial → streak break on death → Relic → the Ascent Door opens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the trial script is keyboard-driven; mobile covered below');
  test.setTimeout(720_000); // 4+ scripted laps under headless sim-lag
  await page.setViewportSize({ width: 900, height: 620 }); // smaller raster → sim closer to real-time

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // dev hook: start at the Abyss; asc=1 caps the run so the Ascent Door → shell
  // (the campaign otherwise CONTINUES into the climb — proven in the +12 test).
  await page.goto('/play/netherlevel?hall=7&asc=1');
  const enter = page.getByRole('button', { name: /ENTER THE HALL/i });
  await expect(enter).toBeVisible({ timeout: 15_000 });
  await enter.click({ force: true });
  await expect(page.getByTestId('nl-dist')).toBeVisible({ timeout: 30_000 });

  // the Abyss HUD: −6 depth read + the streak meter at 0/3
  await expect(page.getByTestId('nl-depth')).toContainText('ABYSS');
  await expect(page.getByTestId('nl-streak')).toContainText('0/3');

  const waitRespawn = async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 40_000) {
      const d = await readNum(page, 'nl-dist');
      if (d !== null && d >= 30) return;
      await page.waitForTimeout(150);
    }
    throw new Error('Abyss Shrine respawn never observed');
  };

  // 1) One flawless lap → the streak holds 1/3.
  expect(await trialLap(page, 0), 'first scripted lap must be flawless').toBe('clear');
  await expect(page.getByTestId('nl-streak')).toContainText('1/3');
  await waitRespawn(); // looped back to the Abyss Shrine — NOT the top of the descent

  // 2) A death SHATTERS the streak to 0/3 (walk blind into the spike).
  const d0 = (await readNum(page, 'nl-deaths')) ?? 0;
  await walkUntil(page, async () => ((await readNum(page, 'nl-deaths')) ?? 0) > d0, 60_000, 'deliberate death');
  await expect(page.getByTestId('nl-streak')).toContainText('0/3'); // the break moment
  await waitRespawn(); // respawn is the Abyss Shrine again — descent progress never lost

  // 3) Three flawless laps IN A ROW → the Relic + the Ascent Door (retry loop
  //    tolerates honest frame-jitter deaths, which correctly reset the streak).
  let streak = 0;
  for (let attempt = 0; attempt < 9 && streak < 3; attempt++) {
    const s0 = (await readStreak(page)) ?? 0;
    const r = await trialLap(page, s0);
    if (r === 'clear') {
      streak = (await readStreak(page)) ?? s0 + 1;
      if (streak >= 3) break;
    } else {
      streak = 0;
      await expect(page.getByTestId('nl-streak')).toContainText('0/3'); // every death resets
    }
    await waitRespawn();
  }
  expect(streak, 'held 3 flawless clears within 9 attempts').toBe(3);

  // 4) The ending: Relic granted → the reveal → THE ASCENT DOOR OPENS.
  await expect(page.getByText(/THE RELIC IS YOURS|THE FIRST LIE WAS YOUR OWN|THE ASCENT DOOR OPENS/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/THE ASCENT DOOR OPENS/i).first()).toBeVisible({ timeout: 60_000 });

  // 5) The canonical shell fires after the ending beat (asc=1 caps the run here).
  await expect(page.getByRole('button', { name: /play again/i })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Relic claimed/i).first()).toBeVisible();

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('netherlevel mobile: touch controls walk → trap death → abandon → shell', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-viewport proof');
  test.setTimeout(180_000);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/netherlevel?asc=1');
  const enter = page.getByRole('button', { name: /ENTER THE HALL/i });
  await expect(enter).toBeVisible({ timeout: 15_000 });
  // ready-screen shot (mobile): New run / Daily + the journey map
  await page.screenshot({ path: `${SHOTS}/mobile-ready.png` });
  await enter.click({ force: true });
  await expect(page.getByTestId('nl-dist')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('nl-depth')).toContainText('DESCENT −1');

  // touch cluster is present (big targets: HOP + BACK + the move stick)
  await expect(page.getByRole('button', { name: /HOP/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /💨 BACK/ })).toBeVisible(); // exact — the nav also has "Back to games"
  await page.screenshot({ path: `${SHOTS}/mobile-descent-hall.png` });

  // drive the left stick (pointer events): press center, drag up, hold → walk
  const joy = page.locator('.nl-touch').first().locator('div').first();
  const box = await joy.boundingBox();
  if (!box) throw new Error('joystick not found');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 40, { steps: 4 });
  const t0 = Date.now();
  let died = false;
  while (Date.now() - t0 < 90_000) {
    const t = await page.getByTestId('nl-deaths').textContent({ timeout: 900 }).catch(() => null);
    if (t && /[1-9]/.test(t)) { died = true; break; }
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  expect(died, 'the collapse trap must spring and kill on mobile too').toBe(true);
  await page.waitForTimeout(1_500); // respawn at the Shrine

  // end the run via ABANDON → the shared shell game-over renders on mobile.
  // (The headline yields to "New personal best!" on a fresh profile — assert the
  // stable bits, same as the desktop descent test.)
  await page.getByRole('button', { name: /ABANDON/i }).click({ force: true });
  await expect(page.getByRole('button', { name: /play again/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/1 deaths/i).first()).toBeVisible();
  await expect(page.getByText(/0\/1 rungs/i).first()).toBeVisible();
  await expect(page.getByText(/LEADERBOARD/i).first()).toBeVisible();

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});

// ── THE ASCENSION / the +12 ending: start at the Twelfth Gate (?hall=23&asc=1)
// — the FINAL GAUNTLET sky bridge: twin wind gusts (long multi-channel warn,
// ramped push), the full-width gap to hop, then a crumbling span you must cross
// without faltering (warnT 1.0 > walk-across time). Reaching its Gate dissolves
// the corridor into Heaven (the sky reveal + the Twelve Gates arc) and runs the
// finale → ShellResultScreen win. Proves the ascent halls render + the campaign's
// earned ending — and the wind telegraph (nl-wind vignette) mid-warn.
test('netherlevel ascension: the Twelfth Gate (+12) → the sky floods in → shell win', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the ending run is keyboard-driven');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 900, height: 620 });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/netherlevel?hall=23&asc=1');
  const enter = page.getByRole('button', { name: /ENTER THE HALL/i });
  await expect(enter).toBeVisible({ timeout: 15_000 });
  await enter.click({ force: true });
  await expect(page.getByTestId('nl-dist')).toBeVisible({ timeout: 30_000 });

  // the ascent HUD reads the sky: ▲ ASCENT +12 (the climb, not the descent)
  await expect(page.getByTestId('nl-depth')).toContainText('ASCENT +12');
  await page.screenshot({ path: `${SHOTS}/ascent-twelfth-gate.png` }); // sky/light hall

  // the WIND TELEGRAPH: the first gust's long warn fires early — the nl-wind
  // vignette + direction read must show, and we capture it mid-warn. (Standing
  // still through the warn lets the one-shot gust blow itself out — the
  // wait-it-out read, which is exactly the fair play.)
  await walkUntil(page, async () => page.getByTestId('nl-wind').isVisible().catch(() => false), 40_000, 'wind warn');
  await waitSim(page, 1); // deeper into the warn — streaks + vignette near full build
  await page.screenshot({ path: `${SHOTS}/wind-telegraph-mid-warn.png` });
  await waitSim(page, 4); // let the one-shot gust blow itself out before walking on

  const waitRespawn = async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000) {
      const d = await readNum(page, 'nl-dist');
      if (d !== null && d >= 16) return;
      await page.waitForTimeout(120);
    }
  };

  // Drive to the Gate: walk in (the twin gusts alternate sides and ramp in —
  // at full walk each drifts you <0.2m and they cancel), hop the sky gap, then
  // KEEP WALKING across the crumbling span (warnT 1.0 outlasts a committed
  // walker) to the Gate. Retry on an honest fall.
  let reached = false;
  for (let attempt = 0; attempt < 8 && !reached; attempt++) {
    if (attempt > 0) await waitRespawn();
    const deathsBefore = (await readNum(page, 'nl-deaths')) ?? 0;
    // approach the gap lip (gap ~ z −14..−15.8 → dist ~6 at the Gate z −20)
    try { await walkUntil(page, distLE(page, 6.6), 40_000, 'gap approach'); } catch { continue; }
    if (((await readNum(page, 'nl-deaths')) ?? 0) > deathsBefore) continue; // fell to the gust
    // hop the gap, carry forward (w stays held — the crumbling span demands it)
    await page.keyboard.down('w');
    await page.keyboard.down(' ');
    await page.waitForTimeout(850);
    await page.keyboard.up(' ');
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000) {
      // the ending fires as a banner while still "running" (transition mode)
      const banner = await page.getByText(/TWELFTH GATE OPENS|SKY FLOODS IN|THE PILGRIM IS FREE/i).first().isVisible().catch(() => false);
      if (banner) { reached = true; break; }
      const d = await readNum(page, 'nl-dist');
      if (d === null) { reached = true; break; }
      const deaths = await readNum(page, 'nl-deaths');
      if (deaths !== null && deaths > deathsBefore) break; // fell — retry
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('w');
  }
  expect(reached, 'reached the Twelfth Gate within 8 attempts').toBe(true);

  // the heaven reveal — capture the Twelve Gates / sky flood
  await page.screenshot({ path: `${SHOTS}/twelve-gates-heaven-ending.png` });

  // the finale resolves to the canonical shell — a WIN (ASCENDED to +12)
  await expect(page.getByRole('button', { name: /play again/i })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/ending-shell-win.png` });

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});

// ── RESUME: progress persists across a reload. Clear the first descent hall →
// hall 2 unlocks (saved to localStorage) → reload → the CONTINUE button is there.
test('netherlevel resume: clear a hall → reload → Continue persists the climb', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'keyboard-driven clear');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 900, height: 620 });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // full campaign (no asc cap) from hall 1 so clearing hall 1 unlocks hall 2.
  await page.goto('/play/netherlevel');
  await page.evaluate(() => window.localStorage.removeItem('nl_campaign_v1')); // clean slate
  await page.reload();
  const enter = page.getByRole('button', { name: /ENTER THE HALL/i });
  await expect(enter).toBeVisible({ timeout: 15_000 });
  // no Continue yet on a fresh profile
  await expect(page.getByTestId('nl-continue')).toHaveCount(0);
  await enter.click({ force: true });
  await expect(page.getByTestId('nl-dist')).toBeVisible({ timeout: 30_000 });

  const waitRespawn = async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      const d = await readNum(page, 'nl-dist');
      if (d !== null && d >= 20) return;
      await page.waitForTimeout(100);
    }
  };

  // clear hall 1 (the pit hop) → reach hall 2 (▼ DESCENT −2 = unlocked=2 saved)
  let reachedH2 = false;
  for (let attempt = 0; attempt < 6 && !reachedH2; attempt++) {
    if (attempt > 0) await waitRespawn();
    await walkUntil(page, distLE(page, 15.6), 60_000, 'pit approach');
    await tapWalkUntil(page, distLE(page, 14.0), 60_000, 'pit trigger');
    await waitSim(page, 3);
    const deathsBefore = (await readNum(page, 'nl-deaths')) ?? 0;
    await page.keyboard.down('w');
    await page.keyboard.down(' ');
    await page.waitForTimeout(900);
    await page.keyboard.up(' ');
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const depth = await page.getByTestId('nl-depth').textContent({ timeout: 900 }).catch(() => null);
      if (depth && /−2/.test(depth)) { reachedH2 = true; break; } // hall 2 — unlocked
      const deaths = await readNum(page, 'nl-deaths');
      if (deaths !== null && deaths > deathsBefore) break;
      await page.waitForTimeout(80);
    }
    await page.keyboard.up('w');
  }
  expect(reachedH2, 'reached the second hall (unlocked=2)').toBe(true);

  // the write is fire-and-forget from onState — let it flush, then confirm it persisted
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('nl_campaign_v1')), { timeout: 10_000 })
    .toContain('"unlocked":2');

  // RELOAD — the campaign resumes: Continue is offered from the unlocked rung.
  await page.reload();
  await expect(page.getByTestId('nl-continue')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('nl-continue')).toContainText('CONTINUE');
  await expect(page.getByTestId('nl-newrun')).toBeVisible(); // New run still offered
  await page.screenshot({ path: `${SHOTS}/ready-continue-newrun-daily.png` });

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});

// ── THE DAILY DESCENT: a distinct entry; date-seeded; one attempt per day;
// the score stashes under gameId "netherlevel-daily" (its own board).
test('netherlevel daily: enter → play → shell + one-per-day guard + daily tagging', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'keyboard-driven');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 900, height: 620 });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/play/netherlevel');
  await page.evaluate(() => window.localStorage.removeItem('nl_daily_attempt'));
  await page.reload();

  // the Daily entry is present + distinct from the campaign start
  const daily = page.getByTestId('nl-daily');
  await expect(daily).toBeVisible({ timeout: 15_000 });
  await daily.click({ force: true });

  // the daily HUD reads its own mode (not the campaign ladder)
  await expect(page.getByTestId('nl-dist')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('nl-depth')).toContainText('DAILY DESCENT');
  await expect(page.getByTestId('nl-ladder')).toHaveCount(0); // the mastery ladder is hidden in the daily
  await page.screenshot({ path: `${SHOTS}/daily-descent-hall.png` });

  // play it: walk until a death (accessible traps), then end via ABANDON → shell.
  await walkUntil(page, async () => ((await readNum(page, 'nl-deaths')) ?? 0) >= 1, 60_000, 'daily death').catch(() => {});
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: /ABANDON/i }).click({ force: true });
  await expect(page.getByText(/FALLEN|DAILY DESCENT/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /play again/i })).toBeVisible();

  // the stashed score is tagged as the DAILY board (signed-out → localStorage stash)
  const pend = await page.evaluate(() => window.localStorage.getItem('netherlevel_pending_score'));
  expect(pend, 'a daily score was stashed').toBeTruthy();
  const parsed = JSON.parse(pend!);
  expect(parsed.gameId, 'daily score tagged to the daily board').toBe('netherlevel-daily');
  expect(String(parsed.refId), 'daily refId carries the date').toMatch(/netherlevel-daily:\d{4}-\d{2}-\d{2}/);

  // the daily leaderboard renders under its own gameId on the result screen
  await expect(page.getByText(/DAILY DESCENT/i).first()).toBeVisible();

  // the one-per-day guard: back to the ready screen, the Daily is spent for today
  await page.goto('/play/netherlevel');
  await expect(page.getByTestId('nl-daily-done')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('nl-daily')).toHaveCount(0); // no second attempt today

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});
