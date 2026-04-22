// POST /api/tos-accept — audit log for off-chain ToS acceptance.
//
// Stores a copy of the signed acceptance in server logs. The user's
// localStorage holds the canonical signed message; this endpoint exists only
// so that in a dispute we can cross-reference server-observed timestamps and
// IP geolocation with the user's self-reported signature.
//
// We do NOT verify the signature server-side here — tweetnacl is not installed
// and verification is not needed at submit time. If a dispute ever arises, the
// stored { wallet, message, signature } tuple can be verified offline with any
// ed25519 verifier.

import { NextRequest, NextResponse } from "next/server";

type Body = {
  version?: string;
  timestamp?: string;
  wallet?: string;
  message?: string;
  signature?: string;
};

const MAX_FIELD_LEN = 2000;

function truthy(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= MAX_FIELD_LEN;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !truthy(body.version) ||
    !truthy(body.timestamp) ||
    !truthy(body.wallet) ||
    !truthy(body.message) ||
    !truthy(body.signature)
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const country = req.headers.get("cf-ipcountry") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  // MVP: structured log line. Production: ship to a log aggregator or DB.
  console.log(
    JSON.stringify({
      event: "tos_accept",
      version: body.version,
      timestamp: body.timestamp,
      wallet: body.wallet,
      signature: body.signature,
      receivedAt: new Date().toISOString(),
      ip,
      country,
      userAgent: userAgent.slice(0, 200),
    }),
  );

  return NextResponse.json({ ok: true });
}
