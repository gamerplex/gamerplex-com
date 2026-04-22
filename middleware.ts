// Edge geofencing for paid-action routes.
//
// Blocks requests from prohibited jurisdictions before the page renders.
// This is defense-layer 1 of 2. Layer 2 is a Cloudflare WAF rule at the edge
// (see docs for expression). Both layers target the same list so a single
// slip-up in either doesn't expose us.
//
// We geofence the arcade routes only — not the marketing homepage, /terms,
// /privacy, or /unavailable. Prohibited-region users can still read what the
// product is and why they can't use it; they just can't connect a wallet or
// pay.
//
// Detection priority:
//   1. Cloudflare: cf-ipcountry + cf-region-code (most reliable on Cloudflare edge)
//   2. Vercel: x-vercel-ip-country + x-vercel-ip-country-region (if hosted on Vercel)
//   3. Fallback: allow (don't fail-closed — false positives worse than false negatives
//      for a first-line filter, since Cloudflare WAF is the hard gate in production)

import { NextRequest, NextResponse } from "next/server";

const BLOCKED_COUNTRIES = new Set([
  "CU", "IR", "KP", "SY", // US OFAC comprehensive sanctions
  "SG", // Singapore — Remote Gambling Act skill-not-gambling friction
]);

// 10 US states + USVI where skill-money contests are restricted.
const BLOCKED_US_REGIONS = new Set([
  "AZ", "AR", "CT", "DE", "LA", "MT", "SC", "SD", "TN", "VI",
]);

// Routes where paid actions can happen. Marketing + legal pages stay open
// so users can understand what Gamerplex is even if they can't use it.
const PROTECTED_PREFIXES = ["/arcade", "/play", "/games", "/challenge"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const { country, region } = detectRegion(req);

  const countryBlocked = country && BLOCKED_COUNTRIES.has(country);
  const usRegionBlocked = country === "US" && region && BLOCKED_US_REGIONS.has(region);

  if (!countryBlocked && !usRegionBlocked) return NextResponse.next();

  const regionLabel = usRegionBlocked ? `US-${region}` : country;
  const url = req.nextUrl.clone();
  url.pathname = "/unavailable";
  url.searchParams.set("region", regionLabel);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/arcade/:path*", "/play/:path*", "/games/:path*", "/challenge/:path*"],
};
