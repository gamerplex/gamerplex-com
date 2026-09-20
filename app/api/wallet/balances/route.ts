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
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

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

  const conn = new Connection(RPC, "confirmed");
  const balances: Record<string, number> = {};

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
  } catch (e) {
    // A balance lookup failing must never block a purchase — the picker treats
    // an absent balance as "unknown" and still allows the attempt.
    return NextResponse.json(
      { balances, error: (e as Error).message.slice(0, 120), partial: true },
      { status: 200 },
    );
  }

  cache.set(wallet, { data: balances, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(
    { balances },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}
