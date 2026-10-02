import { test, expect, type Page } from '@playwright/test';

// The Starter Pack offer — the only entry point to the Flipcash rail, and the only
// way a brand-new visitor becomes a paying account. Everything here is mocked at
// /api/flipcash/intent, which is the single contract the component depends on.
//
// What these guard, in order of what would hurt most:
//   1. the hand-off URL is the UUID form (a handle fails SILENTLY in Flipcash's
//      router, so a wrong URL looks fine and takes the money nowhere)
//   2. "limited time" tracks the SERVER's deadline, and the promo item disappears
//      when the server says it has ended — otherwise the claim becomes false
//   3. the offer HIDES itself when it cannot describe the pack accurately, rather
//      than rendering a button that charges for something unknown

const PAY_URL = 'https://app.flipcash.com/tip/a31efa1c-06a0-4e29-b026-e3b19e4ab44d';
// A 1x1 png; the component only needs a usable src.
const QR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function intent(over: Record<string, unknown> = {}) {
  const daysOut = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  return {
    payUrl: PAY_URL,
    qr: QR,
    priceUsd: 2,
    pack: {
      tier: 'starter-pack',
      label: 'Starter Pack',
      game: 140,
      items: [
        { id: 'continue5', type: 'power' },
        { id: 'retry', type: 'power' },
        { id: 'surge', type: 'power' },
        { id: 'theme-neon-grid', type: 'cosmetic' },
      ],
      base: [
        { id: 'continue5', type: 'power' },
        { id: 'retry', type: 'power' },
        { id: 'surge', type: 'power' },
      ],
      promo: { active: true, until: daysOut(29), items: [{ id: 'theme-neon-grid', type: 'cosmetic' }] },
      credits: 300,
      worth: { credits: 3300, promoUsd: 1.5 },
    },
    ...over,
  };
}

async function mockIntent(page: Page, body: unknown, status = 200) {
  await page.route('**/api/flipcash/intent', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

// Inventory drives the "already owned" branch; keep it empty unless a test says so.
async function mockInventory(page: Page, items: Array<{ itemId: string }> = []) {
  await page.route('**/api/inventory', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) }),
  );
}

test.describe('Starter Pack offer', () => {
  test('shows the pack, its price and the value anchor', async ({ page }) => {
    await mockInventory(page);
    await mockIntent(page, intent());
    await page.goto('/shop');

    const offer = page.locator('section.fcp');
    await expect(offer).toBeVisible();
    await expect(offer.getByRole('heading', { name: 'Starter Pack' })).toBeVisible();
    await expect(offer).toContainText('$2.00');
    // Names come from the shop's own CATALOG, including quantity.
    await expect(offer).toContainText('5 × Continues');
    await expect(offer).toContainText('3 × Instant Retry');
    await expect(offer).toContainText('Score Surge');
    await expect(offer).toContainText('300 Credits');
    // The anchor is arithmetic on real prices, not an invented was-price.
    await expect(offer).toContainText('3,300 Credits of power-ups');
    await expect(offer).toContainText('$1.50 site theme');
  });

  // The URL is the whole payment. A handle in that path fails inside Flipcash's
  // client router with no error anyone sees, so assert the UUID form explicitly.
  test('hands off to the UUID payment URL, not a handle', async ({ page }) => {
    await mockInventory(page);
    await mockIntent(page, intent());
    await page.goto('/shop');

    const nav: string[] = [];
    await page.route('https://app.flipcash.com/**', (route) => {
      nav.push(route.request().url());
      return route.abort();
    });
    await page.locator('button.fcp-btn').click();
    await expect.poll(() => nav.length).toBeGreaterThan(0);
    expect(nav[0]).toBe(PAY_URL);
    expect(nav[0]).toMatch(/\/tip\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('reveals a QR that encodes that same URL', async ({ page }) => {
    await mockInventory(page);
    await mockIntent(page, intent());
    await page.goto('/shop');

    await expect(page.locator('.fcp-qr img')).toHaveCount(0);
    await page.getByRole('button', { name: /scan on your phone/i }).click();
    const img = page.locator('.fcp-qr img');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('alt', /pay \$2\.00 with flipcash/i);
  });

  test.describe('the promotion is the server’s, not the page’s', () => {
    test('counts down to the deadline the server reports', async ({ page }) => {
      await mockInventory(page);
      await mockIntent(page, intent());
      await page.goto('/shop');
      const offer = page.locator('section.fcp');
      await expect(offer).toContainText('Neon Grid theme');
      await expect(offer).toContainText(/included free · \d+ days? left/);
    });

    test('says "ends today" on the last day rather than "0 days left"', async ({ page }) => {
      const body = intent();
      (body.pack.promo as Record<string, unknown>).until = new Date(Date.now() + 3_600_000).toISOString();
      await mockInventory(page);
      await mockIntent(page, body);
      await page.goto('/shop');
      await expect(page.locator('section.fcp')).toContainText('ends today');
    });

    // If the server has stopped granting the theme, the page must stop promising it.
    test('DROPS the theme once the server says the promo is over', async ({ page }) => {
      const body = intent();
      body.pack.promo = { active: false, until: new Date(Date.now() - 86_400_000).toISOString(), items: [] };
      body.pack.items = body.pack.base;
      body.pack.worth = { credits: 3300, promoUsd: 0 };
      await mockInventory(page);
      await mockIntent(page, body);
      await page.goto('/shop');

      const offer = page.locator('section.fcp');
      await expect(offer).toBeVisible();
      await expect(offer).not.toContainText('Neon Grid theme');
      await expect(offer).not.toContainText('included free');
      await expect(offer).not.toContainText('site theme');
      // The pack itself still sells.
      await expect(offer).toContainText('5 × Continues');
    });
  });

  test.describe('it refuses to guess', () => {
    // Rendering a price without knowing the contents would mean charging for
    // something we cannot name.
    test('hides itself when the intent endpoint is unavailable', async ({ page }) => {
      await mockInventory(page);
      await mockIntent(page, { error: 'unavailable' }, 503);
      await page.goto('/shop');
      await expect(page.getByRole('heading', { name: 'Shop' })).toBeVisible();
      await expect(page.locator('section.fcp')).toHaveCount(0);
    });

    test('hides itself when the recipient is unconfigured', async ({ page }) => {
      await mockInventory(page);
      await mockIntent(page, { error: 'unconfigured' }, 503);
      await page.goto('/shop');
      await expect(page.locator('section.fcp')).toHaveCount(0);
    });

    test('does not offer the pack to someone who already owns it', async ({ page }) => {
      await mockInventory(page, [{ itemId: 'theme-neon-grid' }, { itemId: 'continue5' }]);
      await mockIntent(page, intent());
      await page.goto('/shop');
      await expect(page.getByRole('heading', { name: 'Shop' })).toBeVisible();
      await expect(page.locator('section.fcp')).toHaveCount(0);
    });
  });

  test('tells the buyer where the sign-in link arrives', async ({ page }) => {
    await mockInventory(page);
    await mockIntent(page, intent());
    await page.goto('/shop');
    // Without this, a payer waits on a web page for something that is in a chat.
    await expect(page.locator('section.fcp')).toContainText(/sign-in link arrives in the Flipcash chat/i);
  });

  test('fits a phone without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockInventory(page);
    await mockIntent(page, intent());
    await page.goto('/shop');
    await expect(page.locator('section.fcp')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
