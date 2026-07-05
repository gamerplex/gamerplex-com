import { test, expect } from '@playwright/test';

// Every primary nav destination actually navigates — catches dead/mis-wired links.
// Works on desktop (top nav) and mobile (bottom nav); the hidden one isn't in the
// a11y tree, so getByRole resolves the visible link for each viewport.

const NAV = [
  { name: 'Build', url: /\/docs$/ },
  { name: 'Leaderboard', url: /\/leaderboard$/ },
  { name: 'Profile', url: /\/profile$/ },
];

for (const item of NAV) {
  test(`nav → ${item.name}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: item.name, exact: true }).first().click();
    await expect(page).toHaveURL(item.url);
  });
}
