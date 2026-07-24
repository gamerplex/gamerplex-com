// /api/wallet/game-balance?wallet=<pubkey> — $GAME balance for the pill + shop.
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet";
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

// $GAME mint per cluster (mirrors lib/arcade/client.ts).
const GAME_MAINNET = new PublicKey("7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE");
const GAME_DEVNET = new PublicKey("8eGnj5jkW6zTGYieGhtejPjLtGmnKfCdk7FamoJ5LLvD");
const GAME_MINT = NETWORK === "mainnet" ? GAME_MAINNET : GAME_DEVNET;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { balance: number; expiresAt: number }>();

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(wallet);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json({ balance: hit.balance }, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }

  try {
    const connection = new Connection(RPC, "confirmed");
    const ata = getAssociatedTokenAddressSync(GAME_MINT, owner);
    let balance = 0;
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      balance = bal.value.uiAmount ?? 0;
    } catch {
      // ATA doesn't exist → no $GAME held yet. Balance stays 0.
    }
    cache.set(wallet, { balance, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json({ balance }, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch {
    return NextResponse.json({ error: "rpc_error" }, { status: 502 });
  }
}
