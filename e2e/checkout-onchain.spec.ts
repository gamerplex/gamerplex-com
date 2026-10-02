import { test, expect, type Page } from '@playwright/test';

import { WORD_SET } from '../app/play/blockwords/_arcade/words';

// ON-CHAIN CHECKOUT E2E (the paid save — the revenue path).
// Drives the REAL flow a Seeker user hits: play a run → game over → open the
// on-chain checkout → wallet connect → pick a currency → PAY. It runs as the
// NATIVE app: __GAMERPLEX_NATIVE__ plus a stub ReactNativeWebView that speaks the
// same bridge protocol the Android shell implements (portal-webview.tsx), so the
// web half of the wallet round-trip is verified without a device.
//
// Guards the two things that were broken on-device:
//   1. a PAY button that is present, enabled and actually fires (no silent no-op)
//   2. the checkout fits ONE mobile fold — no spilling onto a second screen
//
// NETWORK-CONSISTENCY GUARD. On 2026-08-03 production shipped the DEVNET program id
// while talking to the MAINNET RPC, so every save died building the tx with a cryptic
// "Account does not exist" (the devnet `config` PDA doesn't exist on mainnet). Local
// runs passed because .env.local pairs devnet RPC *with* the devnet program — a
// consistent pair — so the mismatch only ever existed in prod. Hence: this spec must
// be runnable against a deployed URL, and it asserts WHICH program the client uses by
// watching the `config` PDA it asks the RPC for.
const CONFIG_PDA = {
  mainnet: '7okBxv65ifW2DqVRH3qcAkcRWp4g8WadctMkpf5iaLmv',
  devnet: '7XCKkcJf6uBp1qZV7ChZEjxqsaaZH4aAtmRhx6Tav6hE',
} as const;

// MAINNET-ONLY, everywhere — local and deployed. Mixing clusters is what caused the
// outage, so the suite deliberately has no devnet branch to drift out of sync.
const EXPECT_NETWORK = 'mainnet' as const;

// A funded pubkey is required or the flow stops at its "not enough SOL" pre-flight.
const FUNDED_PUBKEY =
  process.env.E2E_WALLET_PUBKEY ?? '6vSeXXpFCjkF9o45tbLEnwnqtKwSL45mmAb9qVR1UThz'; // zerocool

type Bridged = { type?: string; id?: string; tx?: string };

/** Pretend to be the Android shell: answer connect + sign-and-send like the real bridge. */
async function installNativeBridge(page: Page, pubkey: string) {
  await page.addInitScript(
    ({ pk }) => {
      const w = window as unknown as {
        __GAMERPLEX_NATIVE__?: boolean;
        __GPX_BRIDGE_MSGS__?: unknown[];
        ReactNativeWebView?: { postMessage: (m: string) => void };
      };
      w.__GAMERPLEX_NATIVE__ = true;
      w.__GPX_BRIDGE_MSGS__ = [];
      w.ReactNativeWebView = {
        postMessage: (raw: string) => {
          const msg = JSON.parse(raw);
          w.__GPX_BRIDGE_MSGS__!.push(msg);
          if (msg.type === 'gpx-connect-wallet') {
            const detail = { pubkey: pk };
            (window as any).__GAMERPLEX_WALLET__ = detail;
            window.dispatchEvent(new CustomEvent('gamerplex:wallet-linked', { detail }));
          }
          if (msg.type === 'gpx-sign-and-send') {
            // The wallet would return a real signature here; the assertion that matters
            // is that a fully-built transaction reached the wallet at all.
            const detail = { id: msg.id, signature: '1'.repeat(88) };
            window.dispatchEvent(new CustomEvent('gamerplex:tx-result', { detail }));
          }
        },
      };
    },
    { pk: pubkey },
  );
}

function neighbours(word: string, exclude: Set<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    for (let c = 65; c <= 90; c++) {
      const ch = String.fromCharCode(c);
      if (word[i] === ch) continue;
      const cand = word.slice(0, i) + ch + word.slice(i + 1);
      if (WORD_SET.has(cand) && !exclude.has(cand)) out.push(cand);
    }
  }
  return out;
}

async function bridgeMessages(page: Page): Promise<Bridged[]> {
  return page.evaluate(() => (window as any).__GPX_BRIDGE_MSGS__ ?? []);
}

async function assertFitsOneFold(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
  }));
  expect(m.sw, `${label}: horizontal overflow (${m.sw} > ${m.cw})`).toBeLessThanOrEqual(m.cw);
  expect(m.sh, `${label}: spills past one screen (${m.sh} > ${m.ch})`).toBeLessThanOrEqual(m.ch + 2);
}

/** Play a real run and expire the 90s clock so the game-over screen renders. */
async function playToGameOver(page: Page) {
  await page.goto('/play/blockwords');
  const start = page.getByRole('button', { name: /random run/i });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click({ force: true });

  const tiles = page.locator('[aria-label^="letter"]');
  await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

  // Climb a couple of real rungs so the run has a non-zero score.
  const letters: string[] = [];
  for (let i = 0; i < 5; i++) {
    const label = await tiles.nth(i).getAttribute('aria-label');
    letters.push((label ?? '').replace('letter ', '').trim().toUpperCase());
  }
  let current = letters.join('');
  const used = new Set<string>([current]);
  const body = page.locator('body');
  for (let step = 0; step < 2; step++) {
    const next = neighbours(current, used)[0];
    if (!next) break;
    for (const ch of next) await body.press(ch);
    await body.press('Enter');
    await page.waitForTimeout(250);
    used.add(next);
    current = next;
  }

  // Run is 90s; wait it out so the game-over/checkout screen mounts. Match any of the
  // game-over tells — the headline varies (win / new best / time's up).
  await expect(
    page.getByText(/Play again|Time's up|Nice climb|Saved to leaderboard/i).first(),
  ).toBeVisible({ timeout: 150_000 });
}

test.describe('On-chain checkout (paid save)', () => {
  test.setTimeout(420_000); // the run itself has a 90s clock, plus RPC round-trips

  test('play → game over → connect → pick currency → PAY reaches the wallet', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Watch which cluster's `config` PDA the client actually asks for — the tell for
    // a program-id/RPC mismatch that only shows up on a deployed environment.
    const askedFor = { mainnet: 0, devnet: 0 };
    page.on('request', (req) => {
      if (req.method() !== 'POST') return;
      const body = req.postData() ?? '';
      if (body.includes(CONFIG_PDA.mainnet)) askedFor.mainnet++;
      if (body.includes(CONFIG_PDA.devnet)) askedFor.devnet++;
    });

    await installNativeBridge(page, FUNDED_PUBKEY);

    await playToGameOver(page);
    await testInfo.attach('1-gameover', { body: await page.screenshot(), contentType: 'image/png' });
    await assertFitsOneFold(page, 'game over');

    // Reveal the on-chain checkout ("Make it permanent — Verified ✓").
    const reveal = page.getByRole('button', { name: /make it permanent|permanent/i }).first();
    if (await reveal.isVisible().catch(() => false)) await reveal.click({ force: true });

    // The shell hands the already-connected native wallet over, so the picker shows
    // straight away — no "Connect wallet" round-trip.
    const connect = page.getByRole('button', { name: /connect wallet to save/i });
    if (await connect.isVisible().catch(() => false)) {
      await connect.click({ force: true });
      await expect(connect).toBeHidden({ timeout: 15_000 });
    }

    // Currency picker. Default SOL: it works for any SOL-funded wallet and exercises
    // the oracle-priced path (a stale rate fails the save, so this covers that too).
    // E2E_CURRENCY=GAME additionally exercises the 20%-off + consent-gate path, but
    // needs a wallet holding $GAME on the target cluster.
    // SOL by default: the test wallet holds SOL, and its rate is kept fresh by the
    // kx002 oracle timer — so this also covers the "stale rate breaks the save" path.
    const currency = process.env.E2E_CURRENCY ?? 'SOL';
    const tile = page.getByRole('button', { name: new RegExp(currency, 'i') }).first();
    if (await tile.isVisible().catch(() => false)) await tile.click({ force: true });

    await testInfo.attach('2-checkout', { body: await page.screenshot(), contentType: 'image/png' });
    await assertFitsOneFold(page, 'checkout open');

    // THE PAY BUTTON — must exist, be enabled, and fire.
    const pay = page.getByRole('button', { name: /save to the global leaderboard|pay .*save/i }).first();
    await expect(pay, 'checkout must offer a visible PAY button').toBeVisible({ timeout: 10_000 });
    await expect(pay, 'PAY button must be enabled').toBeEnabled();

    await pay.click({ force: true });

    // $GAME purchases hit a one-time compliance gate (18+ / skill-not-gambling).
    // It must be completable — an un-dismissable gate reads as "PAY does nothing".
    const gate = page.getByRole('button', { name: /agree & continue/i });
    if (await gate.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await page.locator('label:has(input[type="checkbox"])').filter({ hasText: /18\+/ })
        .locator('input[type="checkbox"]').check({ force: true });
      await expect(gate, 'consent gate must enable once the box is ticked').toBeEnabled();
      await gate.click({ force: true });
    }

    // The tap must produce a real built transaction handed to the wallet.
    await expect
      .poll(async () => (await bridgeMessages(page)).some((m) => m.type === 'gpx-sign-and-send'), {
        message: 'PAY did not send a transaction to the wallet (silent no-op)',
        timeout: 45_000,
      })
      .toBe(true);

    const signMsg = (await bridgeMessages(page)).find((m) => m.type === 'gpx-sign-and-send')!;
    expect(signMsg.tx, 'transaction payload must be non-empty base64').toBeTruthy();
    expect((signMsg.tx ?? '').length).toBeGreaterThan(100);

    await testInfo.attach('3-after-pay', { body: await page.screenshot(), contentType: 'image/png' });

    // The regression that shipped to prod: an AccountNotFound during tx build.
    const notFound = await page.locator('text=/Account does not exist/i').first()
      .textContent().catch(() => null);
    expect(notFound, `client hit AccountNotFound → program-id/RPC mismatch: ${notFound}`).toBeNull();

    // ...and the direct assertion of it: the client must query the config PDA of the
    // cluster it is actually connected to, never the other one.
    const wrong = EXPECT_NETWORK === 'mainnet' ? 'devnet' : 'mainnet';
    expect(
      askedFor[EXPECT_NETWORK],
      `expected the ${EXPECT_NETWORK} config PDA to be queried (it never was)`,
    ).toBeGreaterThan(0);
    expect(
      askedFor[wrong],
      `client queried the ${wrong} config PDA while on ${EXPECT_NETWORK} — program id does not match the RPC cluster`,
    ).toBe(0);

    expect(errors, `checkout threw: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
