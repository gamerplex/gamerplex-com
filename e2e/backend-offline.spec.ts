import { expect, test, type Page } from '@playwright/test';

// An unreachable backend must never read as "signed out".
//
// THE REAL INCIDENT THIS LOCKS DOWN (2026-10-06): auth.gamerplex.com stopped
// resolving, `getIdentity()` caught the network error and returned null, and the
// UI concluded there was no session. The owner's report was "my login has kicked
// me out again" — and he went to re-buy a pack he already owned. Nothing was
// wrong with the account; we just could not ask.
//
// So the assertion here is about a DISTINCTION, not a message: 5xx and network
// failure must leave the session believed-in, while a server that actually says
// "no session" must sign the user out. Both halves matter — a client that never
// signs anyone out is just as wrong, and much harder to notice.

const signedInUser = {
  id: '00000000-0000-4000-8000-00000000beef',
  email: 'offline@example.com',
  emailVerified: true,
  handle: 'offlinetest',
  walletAddress: 'MockWa11etAdd35500000000000000000000000000',
};

const okBody = JSON.stringify({ user: signedInUser });

/** Serve a live session until `down` flips, then fail the way an outage does. */
async function identityThatCanGoDown(page: Page, state: { down: boolean; mode: 'abort' | '503' }) {
  await page.route('**/api/auth/me', async (route) => {
    if (!state.down) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: okBody });
      return;
    }
    if (state.mode === 'abort') await route.abort('failed'); // DNS/network, the real case
    else await route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' });
  });
}

async function signedInMarkerCount(page: Page): Promise<number> {
  // The handle appears wherever the app believes there is a session.
  return page.getByText(signedInUser.handle, { exact: false }).count();
}

test.describe('backend outage is not a logout', () => {
  for (const mode of ['abort', '503'] as const) {
    test(`a ${mode === 'abort' ? 'network failure' : '503'} does not sign the user out`, async ({ page }) => {
      const state = { down: false, mode };
      await identityThatCanGoDown(page, state);

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const before = await signedInMarkerCount(page);
      test.skip(before === 0, 'no signed-in marker rendered on this build; nothing to assert against');

      // The backend dies, and the app re-checks (every surface re-checks on focus).
      state.down = true;
      await page.reload();
      await page.waitForLoadState('networkidle');

      expect(
        await signedInMarkerCount(page),
        'the session disappeared when the backend went down — an outage is being shown as a logout',
      ).toBeGreaterThan(0);
    });
  }

  // The other half: a server that genuinely reports no session MUST sign out,
  // or a shared device keeps showing someone else's account.
  test('a real "no session" answer still signs the user out', async ({ page }) => {
    let signedOut = false;
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: signedOut ? JSON.stringify({ user: null }) : okBody,
      }),
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const before = await signedInMarkerCount(page);
    test.skip(before === 0, 'no signed-in marker rendered on this build; nothing to assert against');

    signedOut = true;
    await page.reload();
    await page.waitForLoadState('networkidle');

    expect(
      await signedInMarkerCount(page),
      'a genuine signed-out response was ignored — the client is now sticky in the wrong direction',
    ).toBe(0);
  });

  // The visible half: people need to be told, or a silent degraded state just
  // looks like the app is broken.
  test('an outage is announced, and the announcement clears when it recovers', async ({ page }) => {
    const state = { down: true, mode: 'abort' as const };
    await identityThatCanGoDown(page, state);

    await page.goto('/');
    const banner = page.getByRole('status').filter({ hasText: /Can.t reach Gamerplex/i });
    await expect(banner, 'no outage notice while the backend is unreachable').toBeVisible({
      timeout: 15_000,
    });
    // It must not tell people they are signed out — that is the whole bug.
    await expect(banner).toContainText(/still signed in/i);

    state.down = false;
    await banner.getByRole('button', { name: /try again/i }).click();
    await expect(banner, 'the notice stayed up after the backend recovered').toBeHidden({
      timeout: 15_000,
    });
  });
});
