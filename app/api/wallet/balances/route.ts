// /api/wallet/balances?wallet=<pubkey>
//
// Every arcade payment token in ONE call, so the picker can show what the player
// can actually afford. Previously the picker showed all tokens unconditionally —
// you could select $GAME holding zero $GAME, and only find out when the payment
// failed. That is the single biggest drop-off in the $GAME funnel, and $GAME is
// the discounted (−20%) path we most want people to take.
//
// Mirrors app/api/wallet/game-balance/route.ts: same RPC selection, same 30s cache.

import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PAYMENT_TOKENS } from "../../../../lib/arcade/tokens";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet";
const PUBLIC_RPC =
  NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

// Tried in order. The configured endpoint is preferred, but it is NOT assumed to
// work: as of 2026-09-20 the production NEXT_PUBLIC_SOLANA_RPC returns 404, which
// made every balance read fail. One dead provider should degrade the picker, not
// disable it — and a silent empty balance reads to the player as "you have no
// $GAME", which is the exact wrong message to show someone we want to convert.
const RPC_ENDPOINTS = [process.env.NEXT_PUBLIC_SOLANA_RPC, PUBLIC_RPC].filter(
  (u): u is string => !!u && /^https?:\/\//.test(u),
);

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { data: Record<string, number>; expiresAt: number }>();

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(wallet);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(
      { balances: hit.data, cached: true },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  }

  const balances: Record<string, number> = {};
  let lastError = "";

  for (const endpoint of RPC_ENDPOINTS) {
    const conn = new Connection(endpoint, "confirmed");
    try {
    // Native SOL first — it has no token account.
    const sol = PAYMENT_TOKENS.find((t) => t.kind === "sol");
    if (sol) {
      const lamports = await conn.getBalance(owner);
      balances[sol.symbol] = lamports / 10 ** sol.decimals;
    }

    // SPL tokens in one multi-account read rather than N round-trips — this runs
    // on every save-score modal open, and the public RPC rate-limits hard.
    const spl = PAYMENT_TOKENS.filter((t) => t.kind !== "sol");
    const atas = spl.map((t) => getAssociatedTokenAddressSync(t.mint, owner, true));
    const infos = await conn.getMultipleAccountsInfo(atas);

    spl.forEach((t, i) => {
      const info = infos[i];
      // No ATA means the player has never held this token — that is 0, not an error.
      if (!info || info.data.length < 72) {
        balances[t.symbol] = 0;
        return;
      }
      // SPL token account: amount is a u64 LE at offset 64.
      const raw = info.data.readBigUInt64LE(64);
      balances[t.symbol] = Number(raw) / 10 ** t.decimals;
    });
      // Success on this endpoint — stop trying others.
      cache.set(wallet, { data: balances, expiresAt: now + CACHE_TTL_MS });
      return NextResponse.json(
        { balances },
        { headers: { "Cache-Control": "public, max-age=30" } },
      );
    } catch (e) {
      lastError = (e as Error).message.slice(0, 120);
      // Try the next endpoint rather than giving up on the first failure.
    }
  }

  // Every endpoint failed. Return 200 with partial:true — a balance lookup must
  // never block a purchase; the picker treats absent balances as "unknown".
  return NextResponse.json({ balances: {}, error: lastError, partial: true }, { status: 200 });
}
