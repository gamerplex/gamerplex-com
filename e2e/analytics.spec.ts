import { test, expect } from '@playwright/test';

// PostHog analytics must actually work end-to-end: the client initialises,
// automated traffic is tagged so real dashboards can exclude it, and captured
// events genuinely leave the browser for the self-hosted ingest host
// (ph001.gamerplex.com). If NEXT_PUBLIC_POSTHOG_KEY isn't set in the build,
// there's nothing to ship — the request-shipping assertion skips cleanly.

const PH_HOST = /ph001\.gamerplex\.com/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Win = any;

test.describe('posthog analytics', () => {
  test('client initialises on the homepage', async ({ page }) => {
    await page.goto('/');
    // PostHogProvider runs in a useEffect; wait for it to flip the flag.
    await expect
      .poll(() => page.evaluate(() => !!(window as Win).__posthog_initialized), {
        timeout: 10_000,
        message: 'PostHogProvider never initialised the client',
      })
      .toBe(true);

    // posthog-js must be usable — either exposed on window or already persisting
    // its state to localStorage (proof the loaded instance is live).
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const ph = (window as Win).posthog;
            if (ph && (ph.__loaded === true || typeof ph.capture === 'function')) return true;
            for (let i = 0; i < localStorage.length; i++) {
              if (/^ph_/i.test(localStorage.key(i) || '')) return true;
            }
            return false;
          }),
        { timeout: 10_000, message: 'posthog-js never became live (no window.posthog, no ph_ storage)' },
      )
      .toBe(true);
  });

  test('automated traffic is tagged test_traffic=true', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => !!(window as Win).__posthog_initialized), { timeout: 10_000 })
      .toBe(true);

    // The provider registers test_traffic:true when navigator.webdriver is set
    // (Playwright). register() persists the super-properties asynchronously, so
    // poll the stored payload (version-independent) rather than reading once.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i) || '';
              if (/posthog/i.test(k)) {
                try {
                  if (JSON.parse(localStorage.getItem(k) || '{}').test_traffic === true) return true;
                } catch { /* ignore */ }
              }
            }
            return false;
          }),
        {
          timeout: 10_000,
          message: 'E2E traffic tagged test_traffic=true so dashboards can exclude it',
        },
      )
      .toBe(true);
  });

  test('a capture request fires to ph001 on a tracked action', async ({ page }) => {
    // Observe every POST to the self-hosted PostHog ingest host.
    const phRequests: string[] = [];
    page.on('request', (r) => {
      if (PH_HOST.test(r.url()) && r.method() === 'POST') phRequests.push(r.url());
    });

    // /games fires track("games_list_viewed") in a useEffect on load — a
    // deterministic tracked action needing no wallet/consent.
    await page.goto('/games');
    await expect(page.locator('a[href*="/play/"]').first()).toBeVisible();

    const initialised = await page.evaluate(() => !!(window as Win).__posthog_initialized);
    test.skip(!initialised, 'PostHog key not configured in this build (NEXT_PUBLIC_POSTHOG_KEY unset)');

    // The captured event (plus autocaptured pageview) must reach ph001.
    await expect
      .poll(() => phRequests.length, {
        timeout: 12_000,
        message: 'no capture request reached ph001.gamerplex.com',
      })
      .toBeGreaterThan(0);
  });
});
