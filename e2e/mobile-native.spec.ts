import { test, expect, type Page } from '@playwright/test';

// The mobile platform layer — the handful of declarations that decide whether this
// reads as an installed app or a website in a browser. Inside the Expo app it IS a
// WebView, and the native side sets no scroll or zoom overrides, so CSS owns all of
// it and a regression here ships straight to the app.
//
// EVERY ASSERTION READS COMPUTED STYLE, never source. A grep says what someone
// wrote; getComputedStyle says what the browser decided after the cascade, and the
// gap between those two is exactly where these bugs live. (The 15px input that was
// "fixed" with a comment claiming 15px was safe sat in source for months.)
//
// What this CANNOT check, stated plainly: sticky hover, the tap-highlight flash,
// input zoom, the URL-bar height change and overscroll are all real-hardware
// behaviours. These tests prove the CSS is present and correct; they do not prove
// the feel. That needs a phone.

const PAGES = ['/', '/shop', '/leaderboard'];

async function styles(page: Page) {
  return page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      tapHighlight: html.webkitTapHighlightColor,
      textSizeAdjust: html.webkitTextSizeAdjust,
      overscrollY: html.overscrollBehaviorY,
      caretColor: html.caretColor,
      accentColor: html.accentColor,
      bodyMinHeight: body.minHeight,
      viewportHeight: window.innerHeight,
    };
  });
}

test.describe('mobile platform baseline', () => {
  for (const path of PAGES) {
    test(`${path} — tap highlight is suppressed`, async ({ page }) => {
      await page.goto(path);
      const s = await styles(page);
      // Any non-transparent value paints a grey box over whatever was tapped.
      expect(s.tapHighlight).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    });

    test(`${path} — scroll does not chain to pull-to-refresh`, async ({ page }) => {
      await page.goto(path);
      // `contain` deliberately, not `none`: it stops the chain while leaving the
      // WebView's own gesture handling alone.
      expect((await styles(page)).overscrollY).toBe('contain');
    });

    test(`${path} — no font inflation in landscape`, async ({ page }) => {
      await page.goto(path);
      expect((await styles(page)).textSizeAdjust).toBe('100%');
    });
  }

  test('body height tracks the visible viewport, not the collapsed one', async ({ page }) => {
    await page.goto('/');
    const s = await styles(page);
    // 100vh is the viewport with browser chrome COLLAPSED, so with the URL bar
    // showing a 100vh body overflows by exactly that bar. dvh resolves to the
    // height actually visible — so the computed px equals innerHeight.
    expect(s.bodyMinHeight).toBe(`${s.viewportHeight}px`);
  });

  test('browser-drawn surfaces are themed, not system defaults', async ({ page }) => {
    await page.goto('/');
    const s = await styles(page);
    // System blue on a plum-black site is the giveaway that nobody looked.
    expect(s.caretColor).not.toBe('rgb(0, 0, 0)');
    expect(s.caretColor).toBe('rgb(153, 69, 255)');
    expect(s.accentColor).toBe('rgb(153, 69, 255)');
  });

  test('the font that is asked for is the font that loads', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        // Referenced in 18 files and never linked until this pass: every one of
        // those rules silently fell back, including the shell behind the home
        // page, leaderboard, docs and profile.
        spaceGrotesk: document.fonts.check('700 16px "Space Grotesk"'),
        // Both faces ARE declared; a face is only fetched once something on the
        // page uses it. On "/" the shell sets Space Grotesk for visible text, so
        // JetBrains Mono legitimately stays unfetched — asserting it loads here
        // tests lazy loading, not our CSS. Declared-ness is the real check.
        jetBrainsDeclared: [...document.fonts].some((f) => /JetBrains/i.test(f.family)),
      };
    });
    expect(r.spaceGrotesk).toBe(true);
    expect(r.jetBrainsDeclared).toBe(true);
  });

  test('every input is at least 16px, or iOS zooms and never zooms back', async ({ page }) => {
    await page.goto('/');
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll('input, textarea, select')]
        .map((el) => ({
          sel: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : ''),
          px: parseFloat(getComputedStyle(el).fontSize),
        }))
        .filter((x) => x.px < 16),
    );
    expect(tooSmall, `inputs under 16px zoom the page on iOS: ${JSON.stringify(tooSmall)}`).toEqual([]);
  });

  test('tappables respond to a press, since the tap highlight is gone', async ({ page }) => {
    await page.goto('/');
    // Removing the highlight took away the only feedback unstyled tappables had,
    // so a press transform is the floor. Read it from the :active rule rather than
    // trying to hold a synthetic press open.
    const hasActiveRule = await page.evaluate(() => {
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin (the font stylesheet)
        }
        for (const rule of [...rules]) {
          const t = (rule as CSSStyleRule).selectorText;
          if (t && /button:active/.test(t)) return true;
        }
      }
      return false;
    });
    expect(hasActiveRule).toBe(true);
  });

  test('pinch-zoom is never trapped', async ({ page }) => {
    await page.goto('/');
    const v = await page.evaluate(
      () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    );
    // maximum-scale=1 / user-scalable=no is the wrong fix for input zoom and an
    // accessibility failure. The right fix is the 16px font size above.
    expect(v).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(v).not.toMatch(/maximum-scale\s*=\s*1\b/);
  });
});
