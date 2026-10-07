// GET /api/flipcash/prices — shelf prices, proxied from identity so the shop has
// exactly one source for what things cost.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || "https://auth.gamerplex.com";

export async function GET() {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/v1/flipcash/prices`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return NextResponse.json({ items: {} });
    return NextResponse.json(await r.json(), {
      headers: { "cache-control": "public, max-age=60" },
    });
  } catch {
    // An empty map means "no Flipcash price known", which the shop renders as
    // Credits-only. Never a guess.
    return NextResponse.json({ items: {} });
  }
}
