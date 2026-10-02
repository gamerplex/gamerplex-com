// GET /api/flipcash/intent — everything the shop needs to offer the Starter Pack.
//
// Returns the Flipcash payment link, a QR of it for desktop, and the pack's
// contents read from identity-service, which is where the grant is actually
// decided. The shop never describes the pack from its own copy of the list: it
// would eventually advertise something the server does not grant, and the first
// person to notice would be a paying customer.
//
// The recipient is a UUID, not a handle. Flipcash's router parses that path
// segment with UUID.fromString, so a handle fails silently client-side — and the
// page returns 200 for any path, being an SPA, so a reachability check proves
// nothing.

import { NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const IDENTITY_URL = (process.env.IDENTITY_URL || "https://auth.gamerplex.com").replace(/\/$/, "");
// Our Flipcash account, as a dashed UUID.
const RECIPIENT = process.env.FLIPCASH_RECIPIENT_UUID || "";
// The DM-opening fee set on that profile. Display only — acceptance is decided by
// the server from the $GAME amount that actually arrives.
const PRICE_USD = Number(process.env.FLIPCASH_PACK_USD || 2);

interface Pack {
  tier: string;
  label: string;
  game: number;
  items: Array<{ id: string; type: string }>;
  base: Array<{ id: string; type: string }>;
  promo: { active: boolean; until: string; items: Array<{ id: string; type: string }> };
  credits: number;
  worth: { credits: number; promoUsd: number };
}

export async function GET() {
  if (!/^[0-9a-f-]{36}$/i.test(RECIPIENT)) {
    return NextResponse.json(
      { error: "unconfigured", message: "FLIPCASH_RECIPIENT_UUID is not set" },
      { status: 503 },
    );
  }

  let pack: Pack | null = null;
  try {
    const r = await fetch(`${IDENTITY_URL}/api/v1/flipcash/pack`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (r.ok) pack = (await r.json()) as Pack;
  } catch {
    // fall through — handled below
  }
  // Without the authoritative contents we do not guess. Offering a pack we cannot
  // describe accurately is worse than not offering it this second.
  if (!pack) {
    return NextResponse.json(
      { error: "unavailable", message: "Pack details are temporarily unavailable." },
      { status: 503 },
    );
  }

  const payUrl = `https://app.flipcash.com/tip/${RECIPIENT}`;
  // Rendered here rather than in the browser: one less client dependency, and the
  // QR encodes exactly the URL the button uses.
  const qr = await QRCode.toDataURL(payUrl, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#ffffffff" },
  });

  return NextResponse.json({
    payUrl,
    qr,
    priceUsd: PRICE_USD,
    pack,
  });
}
