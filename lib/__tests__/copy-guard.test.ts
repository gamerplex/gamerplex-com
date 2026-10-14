import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { findBannedCopy, RULES } from '../copy-guard';

const ROOT = path.resolve(__dirname, '../..');

/**
 * A RATCHET, not a cliff.
 *
 * A scan on 2026-10-14 found a real backlog, so a test that simply failed would have been
 * disabled within the day. Instead this pins the count: existing violations are listed, and
 * the test fails if a NEW one appears or if a listed file stops being a violation without
 * being removed from the list. The number only goes down.
 */
const KNOWN: Record<string, number> = {
  // Measured 2026-10-14, not guessed. 5 files, 15 lines.
  //
  // 🔴 The one that matters: cyber-snake and blockwords advertise a run as "a tradeable
  // Solana NFT on Magic Eden / Tensor", and docs L435 says "Tradeable". That is against R3
  // (items are soulbound) AND R4 (no marketplace, no trading). Flagged to the owner rather
  // than silently rewritten — product copy is their call.
  'app/play/blockwords/_arcade/ArcadeMode.tsx': 6, // 4x outside name in comments + 2
  'app/docs/page.tsx': 4,                          // NFT x2, outside brand, "Tradeable"
  'app/play/cyber-snake/_arcade/ArcadeMode.tsx': 3, // tradeable x2 + NFT
  'app/terms/page.tsx': 1,                         // cNFT wrapping, planned v1.3
  'components/arcade/EmailLoginModal.tsx': 1,      // outside name in a comment
};

function userFacingFiles(): string[] {
  const out = execSync(
    // .tsx ONLY. Copy lives in components; `app/**/*.ts` is game logic and data — scanning
    // it flagged a dictionary word list for containing "YIELD", which is how a guard dies.
    `git ls-files 'app/**/*.tsx' 'components/**/*.tsx'`,
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out.split('\n').filter(Boolean);
}

describe('findBannedCopy', () => {
  it('catches the rules we keep restating', () => {
    expect(findBannedCopy('play our Wordle clone')?.match).toMatch(/Wordle/i);
    expect(findBannedCopy('mint it as an NFT', 'user-visible')?.match).toBe('NFT');
    expect(findBannedCopy('a tradeable skin', 'user-visible')?.match).toMatch(/tradeable/i);
    expect(findBannedCopy('list it on Magic Eden', 'user-visible')?.match).toMatch(/Magic Eden/i);
      expect(findBannedCopy('earn 12% APY', 'user-visible')?.match).toMatch(/APY/i);
    expect(findBannedCopy('great for early investors', 'user-visible')?.match).toMatch(/early investor/i);
  });

  it('does NOT flag legitimate merchant copy — the reason a guard survives', () => {
    for (const ok of [
      'Starter Pack · $2 · best value',
      'The price is set server-side in USD.',
      'Worth a play if you like puzzles.',
      'Your items are soulbound and stay with your account.',
      '$GAME is a consumable utility credit. It is not an investment.', // the disclaimer
    ]) {
      expect(findBannedCopy(ok, 'user-visible'), `false positive on: ${ok}`).toBeNull();
    }
  });

  it('honours the per-line opt-out, so exceptions are documented not hidden', () => {
    expect(findBannedCopy('not an NFT // copy-guard-allow: required disclaimer')).toBeNull();
  });

  it('every rule carries the rule it enforces', () => {
    for (const r of RULES) expect(r.rule.length, String(r.pattern)).toBeGreaterThan(8);
  });
});

describe('repo scan (ratchet)', () => {
  const found: Record<string, number> = {};
  for (const rel of userFacingFiles()) {
    const text = readFileSync(path.join(ROOT, rel), 'utf8');
    let n = 0;
    for (const line of text.split('\n')) if (findBannedCopy(line)) n++;
    if (n) found[rel] = n;
  }

  it('introduces no NEW banned copy', () => {
    const newFiles = Object.keys(found).filter((f) => !(f in KNOWN));
    expect(
      newFiles.map((f) => `${f} (${found[f]})`),
      'new banned copy — fix it, or justify it with a copy-guard-allow comment',
    ).toEqual([]);
  });

  it('does not let a known file get worse', () => {
    const worse = Object.keys(KNOWN).filter((f) => (found[f] ?? 0) > KNOWN[f]);
    expect(worse, 'these files gained banned copy').toEqual([]);
  });

  it('keeps the ratchet honest: a fixed file must leave the list', () => {
    const fixed = Object.keys(KNOWN).filter((f) => (found[f] ?? 0) < KNOWN[f]);
    expect(
      fixed,
      'these improved — lower or delete their KNOWN entry so the ratchet cannot slip back',
    ).toEqual([]);
  });
});
