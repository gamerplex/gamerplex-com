import { defineConfig, devices } from '@playwright/test';

// E2E for gamerplex.com. Default: run against a locally-built production server
// (npm start on :3055). Override to hit any deploy with BASE_URL=https://gamerplex.com.
// The mandate: every page must load, and login must work — on desktop AND mobile.

const BASE_URL = process.env.BASE_URL || 'http://localhost:3055';
const useLocalServer = !process.env.BASE_URL; // only auto-boot a server when testing locally

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 832 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  ...(useLocalServer
    ? {
        webServer: {
          command: 'npm run start -- -p 3055',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
