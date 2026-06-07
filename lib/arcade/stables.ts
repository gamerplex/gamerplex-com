// Stablecoin allowlist scaffold for arcade payments.
//
// v1.2 ships with USDC-only (Circle's canonical mint on devnet + mainnet).
// Infrastructure is here so admin can add USDT / PYUSD / USDF later via
// `update_accepted_stablecoins` on-chain, and the UI can pick between them.
//
// When more than one stable is active, UX becomes: auto-pick the one with
// the highest user balance, expose a dropdown to override.

import { PublicKey } from "@solana/web3.js";
import {
  ARCADE_NETWORK,
  USDC_DEVNET_MINT,
  USDC_MAINNET_MINT,
  USDT_MAINNET_MINT,
  USDF_MAINNET_MINT,
} from "./client";

export interface StablecoinDef {
  symbol: string;
  mint: PublicKey;
  decimals: number;
  label: string; // display name e.g. "USDC (Circle)"
}

export const STABLES_DEVNET: StablecoinDef[] = [
  { symbol: "USDC", mint: USDC_DEVNET_MINT, decimals: 6, label: "USDC (Circle devnet)" },
];

// v1.3 — all three stables active on mainnet. Admin must also have called
// update_accepted_stablecoins([USDC, USDT, USDF, ...]) on-chain (see
// migrations/v1_3-upgrade.ts).
export const STABLES_MAINNET: StablecoinDef[] = [
  { symbol: "USDC", mint: USDC_MAINNET_MINT, decimals: 6, label: "USDC (Circle)" },
  { symbol: "USDT", mint: USDT_MAINNET_MINT, decimals: 6, label: "USDT (Tether)" },
  { symbol: "USDF", mint: USDF_MAINNET_MINT, decimals: 6, label: "USDF (Flipcash)" },
];

export const SUPPORTED_STABLES: StablecoinDef[] =
  ARCADE_NETWORK === "mainnet" ? STABLES_MAINNET : STABLES_DEVNET;

/** Default mint for the current network — the one used when no user
 *  preference is set. Always returns USDC for now. */
export function defaultStable(): StablecoinDef {
  return SUPPORTED_STABLES[0];
}
