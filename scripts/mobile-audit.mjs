// Mobile-responsive audit: screenshot every key route at Pixel 7 size against
// prod, flag horizontal overflow. Output → scripts/mobile-audit/<name>.png
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const BASE = process.env.AUDIT_BASE || 'https://gamerplex.com';
const OUT = new URL('./mobile-audit/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['home', '/'],
  ['docs', '/docs'],
  ['leaderboard', '/leaderboard'],
  ['app-shop', '/app/shop'],
  ['app-ranks', '/app/ranks'],
  ['app-profile', '/app/profile'],
  ['app-community', '/app/community'],
  ['profile', '/profile'],
  ['play-blockwords', '/play/blockwords'],
  ['play-cyber-snake', '/play/cyber-snake'],
  ['play-magic-chess', '/play/magic-chess'],
  ['play-flipball', '/play/flipball'],
  ['play-vrfc', '/play/vrfc'],
  ['play-time-gate', '/play/time-gate'],
  ['play-netherlevel', '/play/netherlevel'],
  ['play-tcg-quiz', '/play/tcg-quiz'],
  ['challenge', '/challenge/e2e-sample'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const results = [];

for (const [name, route] of ROUTES) {
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
    }));
    const overflow = m.sw > m.cw;
    await page.screenshot({ path: `${OUT}${name}.png` });
    results.push({ name, route, overflow, hpx: m.sw - m.cw, sh: m.sh, ch: m.ch });
    console.log(`${overflow ? '❌ OVERFLOW +' + (m.sw - m.cw) + 'px' : '✅ fits'}  ${name}  (${route})`);
  } catch (e) {
    results.push({ name, route, error: String(e).slice(0, 80) });
    console.log(`⚠️  ${name} (${route}): ${String(e).slice(0, 80)}`);
  }
}

const bad = results.filter((r) => r.overflow);
console.log(`\n=== ${bad.length}/${results.length} routes overflow horizontally ===`);
bad.forEach((r) => console.log(`   ${r.name}: +${r.hpx}px`));
await browser.close();
