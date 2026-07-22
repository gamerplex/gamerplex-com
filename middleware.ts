// Edge geofencing — path-segregated by web2-free vs web3-money.
//
// THE RULE (see ENGINEERING/OPERATIONS/GEOFENCE.md + LEGAL.md):
//  • FREE routes — all games, Credits, everything web2 — are NEVER geofenced.
//    Free non-cashable Credits play isn't gambling anywhere and moves no token,
//    so it's open worldwide (ECOSYSTEM_RULES R2: Credits = the growth faucet).
//  • WEB3 routes — anything that moves a token — live under their own prefixes
//    and carry the geo blocks:
//      /wallet      → consumptive wallet actions (on-chain "save forever",
//                     $GAME spends). OFAC sanctions block only.
//      /wager, /tournament → money-PRIZE skill contests. OFAC + the Singapore
//                     RGA + the 10-US-state cash-prize bans.
//  On the free routes we don't block — we only stamp a `gp_web3block` cookie so
//  an inline web3 affordance (e.g. the on-chain-save button on a game-over
//  screen) can hide itself in a sanctioned region until that action is fully
//  moved onto a /wallet page. No token ever moves on a free route in a blocked
//  region.
//
// Defense-layer 1 of 2. Layer 2 = the Cloudflare WAF (GEOFENCE.md §Layer 2) and
// MUST fence only the web3 prefixes too, or the edge will over-block free play.

import { NextRequest, NextResponse } from "next/server";

// OFAC comprehensive sanctions — any token movement is prohibited.
const SANCTIONED_COUNTRIES = new Set(["CU", "IR", "KP", "SY"]);

// Money-PRIZE (pay-to-play cash-prize) restrictions — money-prize routes only.
const WAGER_BLOCKED_COUNTRIES = new Set(["SG"]);
const WAGER_BLOCKED_US_REGIONS = new Set([
  "AZ", "AR", "CT", "DE", "LA", "MT", "SC", "SD", "TN", "VI",
]);

// Free web2 — games, Credits. NEVER blocked (we only stamp the geo cookie).
const FREE_PREFIXES = ["/play", "/arcade", "/challenge"];
// Web3 consumptive wallet actions — OFAC block.
const WALLET_PREFIXES = ["/wallet"];
// Web3 money-prize wagering — OFAC + cash-prize block. (Not live yet.)
const MONEY_PREFIXES = ["/wager", "/tournament"];

function onAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function detectRegion(req: NextRequest): { country: string; region: string } {
  const country =
    req.headers.get("cf-ipcountry") ??
    req.headers.get("x-vercel-ip-country") ??
    "";
  const region =
    req.headers.get("cf-region-code") ??
    req.headers.get("x-vercel-ip-country-region") ??
    "";
  return { country: country.toUpperCase(), region: region.toUpperCase() };
}

function block(req: NextRequest, label: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/unavailable";
  url.searchParams.set("region", label);
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Static assets (banner art etc.) render everywhere.
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();

  const onFree = onAnyPrefix(pathname, FREE_PREFIXES);
  const onWallet = onAnyPrefix(pathname, WALLET_PREFIXES);
  const onMoney = onAnyPrefix(pathname, MONEY_PREFIXES);
  if (!onFree && !onWallet && !onMoney) return NextResponse.next();

  const { country, region } = detectRegion(req);
  const sanctioned = !!country && SANCTIONED_COUNTRIES.has(country);
  const wagerBlocked =
    (!!country && WAGER_BLOCKED_COUNTRIES.has(country)) ||
    (country === "US" && !!region && WAGER_BLOCKED_US_REGIONS.has(region));

  // Web3 money-prize routes: OFAC + cash-prize bans.
  if (onMoney && (sanctioned || wagerBlocked)) {
    return block(req, country === "US" && wagerBlocked ? `US-${region}` : country);
  }
  // Web3 wallet routes: OFAC only (consumptive sinks aren't cash-prize contests).
  if (onWallet && sanctioned) return block(req, country);

  // Free routes are NEVER blocked. Stamp the geo signal so an inline web3
  // affordance can self-hide in a sanctioned region (no token moves there).
  const res = NextResponse.next();
  res.cookies.set("gp_web3block", sanctioned ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    maxAge: 3600,
  });
  return res;
}

export const config = {
  matcher: [
    "/play/:path*",
    "/arcade/:path*",
    "/challenge/:path*",
    "/wallet/:path*",
    "/wager/:path*",
    "/tournament/:path*",
  ],
};
