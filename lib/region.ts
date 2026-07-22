// Jurisdiction tiers — the runtime "what does this country's LAW allow" gate.
// Composes with STORE_TARGET (store policy) and Flipcash KYC (the authoritative
// money gate). This layer only controls what surfaces are VISIBLE. Edit the
// country lists WITH COUNSEL. See ENGINEERING/GLOBAL_JURISDICTION_MAP.md.

export type RegionTier = 0 | 1 | 2 | 3; // 0 blocked · 1 web2-only · 2 crypto-lite · 3 crypto-full

export interface RegionCapabilities {
  tier: RegionTier;
  country: string | null;
  access: boolean; // false => blocked entirely (sanctions)
  game: boolean; // play the web2 games
  credits: boolean; // Credits economy (web2, non-cash)
  walletConnect: boolean; // connect a Solana wallet
  gameToken: boolean; // show / use $GAME in-app
  flipcashLinks: boolean; // external Flipcash acquisition links
}

// ISO-3166 alpha-2. Absent from all lists => tier 3 (crypto-full).
const BLOCKED = new Set(["CU", "IR", "KP", "SY", "RU", "BY"]); // tier 0 — sanctions
const WEB2_ONLY = new Set(["CN"]); // tier 1 — crypto banned
const CRYPTO_LITE = new Set(["US", "GB"]); // tier 2 — securities / promotion caution

// Fail-closed default when the country is UNKNOWN (dev / localhost / stripped
// header): crypto-lite, never full — a missing geo signal must not unlock $GAME
// everywhere. Override with REGION_DEFAULT_TIER (e.g. 3 for local crypto testing).
export function defaultTier(): RegionTier {
  const env = Number(process.env.REGION_DEFAULT_TIER);
  return env === 0 || env === 1 || env === 2 || env === 3 ? (env as RegionTier) : 2;
}

export function tierForCountry(country: string | null): RegionTier {
  if (!country) return defaultTier();
  const c = country.toUpperCase();
  if (BLOCKED.has(c)) return 0;
  if (WEB2_ONLY.has(c)) return 1;
  if (CRYPTO_LITE.has(c)) return 2;
  return 3;
}

export function capabilitiesForTier(tier: RegionTier, country: string | null): RegionCapabilities {
  const base = { tier, country };
  switch (tier) {
    case 0:
      return { ...base, access: false, game: false, credits: false, walletConnect: false, gameToken: false, flipcashLinks: false };
    case 1:
      return { ...base, access: true, game: true, credits: true, walletConnect: false, gameToken: false, flipcashLinks: false };
    case 2:
      return { ...base, access: true, game: true, credits: true, walletConnect: true, gameToken: false, flipcashLinks: true };
    default:
      return { ...base, access: true, game: true, credits: true, walletConnect: true, gameToken: true, flipcashLinks: true };
  }
}

// ISO country from the CDN geo headers — Cloudflare first, then Vercel. Returns
// null when unknown (T1 = Tor exit, XX = unresolved).
export function countryFromHeaders(h: Headers): string | null {
  const cf = h.get("cf-ipcountry");
  if (cf && cf !== "XX" && cf !== "T1") return cf.toUpperCase();
  const v = h.get("x-vercel-ip-country");
  if (v) return v.toUpperCase();
  return null;
}
