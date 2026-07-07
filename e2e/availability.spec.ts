import { test, expect, Page } from '@playwright/test';
import { CONTENT_ROUTES, GAME_ROUTES, ARCADE_ROUTES, DYNAMIC_ROUTES } from './routes';

// THE #1 MANDATE: every page must be viewable. This suite fails if any route
// crashes (uncaught JS), returns a server error, or shows Next's error overlay.
// Runs on desktop AND mobile (both projects in playwright.config.ts).

// Console noise we deliberately ignore: missing optional banner images (emoji
// fallback handles them) and the identity/resolver cross-origin calls that only
// resolve on the real gamerplex.com origin (harmless when testing off-origin).
const IGNORED = [
  /\/games\/.*\.(png|webp)/i,
  /auth\.gamerplex\.com/i,
  /resolver\.gamerplex\.com/i,
  /identity/i,
  /Failed to load resource/i,
  /CORS/i,
  /net::ERR_/i,
  /favicon/i,
  // Flipball's iframe sets frame-ancestors to the real gamerplex.com origin, so the
  // browser blocks the embed (and logs this) when the shell is served off-origin
  // (localhost / preview deploy). Harmless: the embed loads on the production origin.
  /frame-ancestors/i,
];

// Attach crash/error collectors. Returns getters the test asserts on.
function watch(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  return { pageErrors, consoleErrors };
}

async function assertViewable(page: Page, path: string, requireContent: boolean) {
  const { pageErrors, consoleErrors } = watch(page);
  const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });

  // 1. HTTP: no server error on the document itself.
  const status = resp?.status() ?? 0;
  expect(status, `${path} HTTP status`).toBeLessThan(400);

  // 2. Not Next's error/404 overlay.
  await expect(page.locator('body')).toBeVisible();

  // Client content mounts after hydration, which lands after `domcontentloaded`.
  // Wait for the body to carry real text before snapshotting it, so the assertions
  // below check rendered output rather than racing an empty pre-hydration DOM.
  if (requireContent) {
    await expect
      .poll(() => page.locator('body').innerText().then((t) => t.trim().length).catch(() => 0), {
        message: `${path} rendered too little`,
      })
      .toBeGreaterThan(40);
  }

  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(bodyText, `${path} shows an app error`).not.toMatch(/Application error|Internal Server Error|This page could not be found/i);

  // 4. No uncaught JS exception (a real crash).
  expect(pageErrors, `${path} threw: ${pageErrors.join(' | ')}`).toHaveLength(0);

  // 5. No unexpected console errors (after filtering known-benign).
  expect(consoleErrors, `${path} console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
}

test.describe('page availability', () => {
  for (const path of CONTENT_ROUTES) {
    test(`content: ${path}`, async ({ page }) => assertViewable(page, path, true));
  }
  for (const path of GAME_ROUTES) {
    test(`game: ${path}`, async ({ page }) => assertViewable(page, path, true));
  }
  for (const path of ARCADE_ROUTES) {
    test(`arcade: ${path}`, async ({ page }) => assertViewable(page, path, false));
  }
  for (const path of DYNAMIC_ROUTES) {
    test(`dynamic: ${path}`, async ({ page }) => assertViewable(page, path, false));
  }
});
