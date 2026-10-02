// GET /api/game-price — the live $GAME spot price, for fiat-canonical pricing.
//
// Prices are set in USD and converted to $GAME at spot. Fixing a $GAME number
// instead would mean the price drifts with the token and the shop runs an
// unintended FX position; it is also what R5's no-price-language rule is
// protecting against.
//
// Source is the arcade contract's ExchangeRatesConfig PDA — the same rate the
// contract itself charges against, refreshed every ~15 min by the oracle. Read
// with a plain getAccountInfo and decoded by offset, so this needs no wallet,
// no Anchor provider and no IDL.
//
//   ExchangeRatesConfig: 8 disc | 32 admin | 8 sol | 8 game | 8 | 8 | 1   (73 bytes)
//
// Returns: { usdPerGame, updatedAt, ageSeconds, stale }

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The free public endpoint rate-limits hard (429), so try a short list in turn.
// A price that is a few minutes stale is fine; no price at all is not.
const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
].filter((u): u is string => Boolean(u));
// Declared here rather than imported from lib/arcade/client: that module pulls in
// the wallet adapter and Anchor, which do not belong in a server route.
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ARCADE_PROGRAM_ID || "GAMEbo12FjDbrobsgy8RbPhMs5kAQtJce3pARCi1cakV",
);
/** game_micro_usd_per_quark is stored scaled by this. */
const RATE_SCALE = 1e12;
/** $GAME mint decimals. */
const GAME_DECIMALS = 10;
/** Older than this and the contract would reject a save as ExchangeRateStale. */
const STALE_AFTER_SEC = 1800;

const GAME_OFFSET = 8 + 32 + 8;      // after discriminator, admin, sol rate
const GAME_UPDATED_OFFSET = 8 + 32 + 8 + 8 + 8;

// Last good value, kept indefinitely so a throttled RPC degrades to a stale
// price rather than to none.
let cache: { at: number; body: Record<string, unknown> } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 60_000) return NextResponse.json(cache.body);

  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("rates")], PROGRAM_ID);

  let info = null;
  let lastErr: unknown = null;
  for (const url of RPC_ENDPOINTS) {
    try {
      info = await new Connection(url, "confirmed").getAccountInfo(pda);
      if (info) break;
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    if (!info || info.data.length < 73) {
      if (cache) return NextResponse.json({ ...cache.body, servedStale: true });
      console.error("[game-price] no endpoint answered", lastErr);
      return NextResponse.json({ error: "rates_unavailable" }, { status: 503 });
    }

    const scaled = info.data.readBigUInt64LE(GAME_OFFSET);
    const updatedAt = Number(info.data.readBigInt64LE(GAME_UPDATED_OFFSET));
    if (Number(scaled) === 0) return NextResponse.json({ error: "rate_unset" }, { status: 503 });

    // scaled is micro-USD per quark ×RATE_SCALE.
    //   usd per $GAME = (scaled / RATE_SCALE) * 10^decimals / 1e6
    const usdPerGame = (Number(scaled) / RATE_SCALE) * Math.pow(10, GAME_DECIMALS) / 1e6;
    const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - updatedAt);

    const body = {
      usdPerGame,
      updatedAt,
      ageSeconds,
      stale: ageSeconds > STALE_AFTER_SEC,
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (cache) return NextResponse.json({ ...cache.body, servedStale: true });
    console.error("[game-price]", e);
    return NextResponse.json({ error: "rates_unavailable" }, { status: 503 });
  }
}
