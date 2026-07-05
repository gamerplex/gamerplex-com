import { defineConfig, devices } from '@playwright/test';

// Cross-site journey against the LIVE ecosystem (gamerplex.com + play.petlegends.com
// + www.sledgit.com). No webServer, no baseURL — the specs use absolute URLs and
// walk one user's real day across all three federated apps.
//
//   npm run e2e:cross

export default defineConfig({
  testDir: './e2e-cross-site',
  fullyParallel: true,
  retries: 1, // live sites: one retry absorbs transient network/CDN blips
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 832 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
