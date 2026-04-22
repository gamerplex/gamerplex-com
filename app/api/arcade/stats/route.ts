// /api/arcade/stats — aggregate stats for the arcade landing page.
//
// Returns: { sessions, verified, treasuryUsdc }
//   sessions  = total GPX5 memos (score commits) for cyber-snake across last 500 txs
//   verified  = unique wallets with at least one GPX5R memo
//   treasuryUsdc = USDC balance of the arcade treasury wallet (in cents, integer)
//
// Cached server-side for 60 seconds to avoid hammering devnet/mainnet RPC.
// For v2 replace with a proper indexer; for v1 this is fast enough.

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const ARCADE_PROGRAM_ID = new PublicKey("4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t");
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DEVNET  = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_MINT    = NETWORK === "mainnet" ? USDC_MAINNET : USDC_DEVNET;

// Treasury wallet is stored in on-chain ArcadeConfig PDA. For the stats
// endpoint we read it from env (avoids an extra RPC call on every request).
// Fallback: the deploy wallet used during initialize_config.
const TREASURY_WALLET = process.env.ARCADE_TREASURY_WALLET ||
  "BEzD7tvdTJa6kT43GhxHqsH4ythbM9QVz9JhTGgU2rtA";

// In-memory cache: { data, expiresAt }
let cache: { data: ArcadeStats; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export type ArcadeStats = {
  sessions: number;
  verified: number;
  treasuryUsdc: number; // whole cents (e.g. 425 = $4.25)
};

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=30" },
    });
  }

  try {
    const connection = new Connection(RPC, "confirmed");

    // Fetch last 500 signatures for the arcade program.
    const sigs = await connection.getSignaturesForAddress(ARCADE_PROGRAM_ID, { limit: 500 });

    let sessions = 0;
    const verifiedWallets = new Set<string>();

    for (const sig of sigs) {
      if (sig.err || !sig.memo) continue;
      const memo = sig.memo.replace(/^\[\d+\]\s*/, "");
      if (memo.startsWith("GPX5|") && memo.includes("|cyber-snake|")) sessions++;
      if (memo.startsWith("GPX5R|")) {
        const player = memo.split("|")[1];
        if (player) verifiedWallets.add(player);
      }
    }

    // Treasury USDC balance.
    let treasuryUsdc = 0;
    try {
      const treasury = new PublicKey(TREASURY_WALLET);
      const ata = getAssociatedTokenAddressSync(USDC_MINT, treasury);
      const bal = await connection.getTokenAccountBalance(ata);
      // bal.value.uiAmount is in USDC (e.g. 4.25). Convert to cents integer.
      treasuryUsdc = Math.round((bal.value.uiAmount ?? 0) * 100);
    } catch {
      // Treasury ATA may not exist yet on a fresh devnet deploy — that's fine.
    }

    const data: ArcadeStats = {
      sessions,
      verified: verifiedWallets.size,
      treasuryUsdc,
    };

    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=30" },
    });
  } catch (err) {
    console.error("[arcade/stats]", err);
    // Return zeros on RPC failure — stats are cosmetic, not critical.
    return NextResponse.json({ sessions: 0, verified: 0, treasuryUsdc: 0 });
  }
}
