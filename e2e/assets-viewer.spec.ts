import { expect, test } from '@playwright/test';
import catalog from '../app/assets/_data/catalog.json';

// Every published asset must load in the 3D viewer (the viewer marks its container data-state="loaded"|"error").
const slugs = (catalog as { slug: string }[]).map((a) => a.slug);

for (const slug of slugs) {
  test(`asset viewer loads ${slug}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(`/assets/${slug}`);
    const viewer = page.locator('[data-state]').first();
    await expect(viewer).toHaveAttribute('data-state', /loaded|error/, { timeout: 30_000 });
    expect(await viewer.getAttribute('data-state'), `viewer failed on ${slug}: ${errors.join(' | ')}`).toBe('loaded');
    await expect(page.locator('canvas').first()).toBeVisible();
    expect(errors.filter((e) => /GLTF|DRACO|Draco|asset viewer/.test(e)), `viewer errors on ${slug}`).toEqual([]);
  });
}
