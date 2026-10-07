// POST /api/flipcash/order — start a Flipcash purchase for one item.
//
// Thin proxy to identity, which owns prices, the rate and the order. The browser
// never names a price: it would be the one thing a buyer could edit.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || "https://auth.gamerplex.com";

export async function POST(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  const body = await req.text();
  try {
    const r = await fetch(`${IDENTITY_URL}/api/v1/flipcash/order`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body,
      cache: "no-store",
    });
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "identity_unreachable" }, { status: 503 });
  }
}
