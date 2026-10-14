// Standing rules, enforced by a test instead of by someone remembering them.
//
// WHY. Several rules exist only as notes a human has to recall, and the record shows they
// get violated anyway — this file was written after a scan found "Wordle" in six places,
// "NFT" in five, and arcade copy advertising "a tradeable Solana NFT on Magic Eden / Tensor"
// in two games, which is against both the soulbound rule and the no-marketplace rule.
//
// Precision is the whole game here. A guard that cries wolf gets deleted, so every pattern
// is word-bounded and narrow, and legitimate uses get an explicit escape hatch rather than a
// loosened pattern. Note what is deliberately NOT banned: "price", "value" and "worth" appear
// 45/99/9 times in legitimate merchant copy. Banning them would flag the shop for doing its
// job, and a naive ban on "investment" would flag the disclaimer that says $GAME is *not* one.

export type Tier = 'anywhere' | 'user-visible';

export interface Rule {
  pattern: RegExp;
  /** 'anywhere' also covers comments — outside names must not appear in source at all. */
  tier: Tier;
  rule: string;
}

export const RULES: Rule[] = [
  // Outside names and trademarks: not in copy, not in comments, not in commits.
  { pattern: /\bWordle\b/i,        tier: 'anywhere', rule: 'trademark: describe the mechanic generically' },
  { pattern: /\bZelda\b/i,         tier: 'anywhere', rule: 'originality: never name outside works' },
  { pattern: /\bOpenX\w*/,         tier: 'anywhere', rule: 'must not appear in this codebase' },

  // Asset framing: items are soulbound and are never traded.
  { pattern: /\bNFTs?\b/,          tier: 'user-visible', rule: 'R3: items are soulbound; never the word NFT' },
  { pattern: /\btradeable\b/i,     tier: 'user-visible', rule: 'R3/R4: nothing is tradeable, no marketplace' },
  { pattern: /\bMagic Eden\b|\bTensor\b/i, tier: 'user-visible', rule: 'R4: never point at a marketplace' },

  // Price and upside language. Narrow on purpose — merchant pricing is allowed (R5), what is
  // forbidden is implying the token appreciates.
  // NOT bare /yield/ or /moon/: `words.ts` legitimately contains the dictionary word YIELD,
  // and a game about descent legitimately has a moon in it. Precision over coverage — a guard
  // that flags a word list is a guard someone deletes.
  { pattern: /\bAPY\b|yield farm/i,           tier: 'user-visible', rule: 'R5: no yield language' },
  { pattern: /to the moon/i,                   tier: 'user-visible', rule: 'R5: no price-upside language' },
  { pattern: /\bpump(ing|ed)?\b/i,            tier: 'user-visible', rule: 'R5: no price-upside language' },
  { pattern: /\b(price|value) (of|will) (go )?(up|rise|increase)/i, tier: 'user-visible', rule: 'R5: no appreciation claims' },
  { pattern: /\bearly investors?\b/i,         tier: 'user-visible', rule: 'R5: not an investment' },
  { pattern: /\breturns? on\b/i,              tier: 'user-visible', rule: 'R5: no return language' },
];

/** Opt out one line, with a reason, e.g. `// copy-guard-allow: required disclaimer`. */
export const ALLOW_MARKER = 'copy-guard-allow:';

export interface Finding { match: string; rule: string; tier: Tier }

/** First banned phrase in `text`, or null. `tier` filters which rules apply. */
export function findBannedCopy(text: string | null | undefined, tier?: Tier): Finding | null {
  if (!text) return null;
  if (text.includes(ALLOW_MARKER)) return null;
  for (const r of RULES) {
    if (tier && r.tier !== tier) continue;
    const m = text.match(r.pattern);
    if (m) return { match: m[0], rule: r.rule, tier: r.tier };
  }
  return null;
}
