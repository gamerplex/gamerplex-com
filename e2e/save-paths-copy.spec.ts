import { test, expect } from '@playwright/test';

// Locks the copy that explains WHICH account can do WHAT, because getting this
// wrong is a trust problem rather than a cosmetic one.
//
// The facts being asserted are forced by the arcade contract: record_payment and
// submit_score both take `player: Signer`, must be top-level (CpiNotAllowed), and
// require the transfer authority to BE the player. A Flipcash balance is a u64 in
// a virtual account inside Flipcash's own payment network, so it can pay us but can
// never sign for the player. Hence: Flipcash = payment rail, wallet = signer.
//
// Two overclaims this guards against:
//   "no wallet needed"  - was on the home page once; saving on-chain does need one.
//   "can't be faked"    - on-chain saving proves PERMANENCE (we cannot purge it),
//                         not that the score is genuine; scores are client-reported.

test.describe('save-path copy is accurate', () => {
  test('home tagline names both paths and never claims "no wallet needed"', async ({ page }) => {
    await page.goto('/');
    const foot = page.locator('.gl-foot').first();
    await expect(foot).toBeVisible();
    const text = (await foot.innerText()).toLowerCase();

    expect(text).toContain('flipcash');
    expect(text).toContain('wallet');
    expect(text).toContain('on-chain');
    expect(text).not.toContain('no wallet needed');
  });

  test('docs has a Saving Your Score section, linked from the contents', async ({ page }) => {
    await page.goto('/docs');

    // Listed in the contents sidebar, not just present in the DOM. The sidebar
    // renders <button onClick={scrollTo(id)}> rather than anchors, and globals.css
    // sets `.docs-sidebar { display: none !important }` at phone width — which
    // drops it from the accessibility tree, so getByRole finds nothing on mobile.
    // Query the DOM directly and assert ATTACHED, so one spec covers both viewports.
    await expect(
      page.locator('.docs-sidebar button').filter({ hasText: 'Saving Your Score' })
    ).toHaveCount(1);

    const section = page.locator('#saving');
    await expect(section).toBeAttached();
    const body = await section.innerText();

    // The split, and the reason for it.
    expect(body).toMatch(/player: Signer/);
    expect(body).toMatch(/Flipcash is the payment rail/i);
    expect(body).toMatch(/Not possible/i);          // Flipcash column, on-chain row
    expect(body).toMatch(/Required/i);              // wallet column, on-chain row
    expect(body).toMatch(/Verified/);               // what it looks like on the board

    // Permanence is the claim; unforgeability is NOT.
    expect(body).toMatch(/permanent/i);
    expect(body).toMatch(/does not by itself prove/i);
    expect(body).not.toMatch(/cannot be faked|can'?t be faked|unforgeable/i);
  });

  test('leaderboard explains that the Verified badge needs a wallet', async ({ page }) => {
    await page.goto('/leaderboard');
    const main = await page.locator('body').innerText();

    expect(main).toMatch(/Verified/);
    expect(main).toMatch(/needs a Solana wallet/i);
    expect(main).toMatch(/Flipcash/i);
  });
});
