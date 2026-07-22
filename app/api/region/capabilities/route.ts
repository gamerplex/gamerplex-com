// GET /api/region/capabilities — the runtime jurisdiction gate. Resolves the
// caller's country from the CDN geo headers → a capability object the web + native
// shell use to show/hide the money-line surfaces ($GAME, wallet, Flipcash). This is
// the SOFT gate (visibility); Flipcash KYC is the authoritative money gate, and store
// country-availability is the coarse fence above it. See GLOBAL_JURISDICTION_MAP.md.

import { NextRequest, NextResponse } from "next/server";

import { capabilitiesForTier, countryFromHeaders, tierForCountry } from "../../../../lib/region";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  let country = countryFromHeaders(req.headers);

  // Non-production ONLY: ?country=XX to test tiers locally. Never honored in prod —
  // otherwise a user could spoof their tier to unlock crypto in a banned region.
  if (process.env.NODE_ENV !== "production") {
    const q = req.nextUrl.searchParams.get("country");
    if (q) country = q.toUpperCase();
  }

  const tier = tierForCountry(country);
  const caps = capabilitiesForTier(tier, country);
  // Per-user geo → never shared-cache it.
  return NextResponse.json(caps, { headers: { "Cache-Control": "private, no-store" } });
}
