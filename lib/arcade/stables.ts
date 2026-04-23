// Stablecoin allowlist scaffold for arcade payments.
//
// v1.2 ships with USDC-only (Circle's canonical mint on devnet + mainnet).
// Infrastructure is here so admin can add USDT / PYUSD / USDF later via
// `update_accepted_stablecoins` on-chain, and the UI can pick between them.
//
// When more than one stable is active, UX becomes: auto-pick the one with
// the highest user balance, expose a dropdown to override.

import { PublicKey } from "@solana/web3.js";
import { ARCADE_NETWORK, USDC_DEVNET_MINT, USDC_MAINNET_MINT } from "./client";

export interface StablecoinDef {
  symbol: string;
  mint: PublicKey;
  decimals: number;
  label: string; // display name e.g. "USDC (Circle)"
}

export const STABLES_DEVNET: StablecoinDef[] = [
  { symbol: "USDC", mint: USDC_DEVNET_MINT, decimals: 6, label: "USDC (Circle devnet)" },
];

export const STABLES_MAINNET: StablecoinDef[] = [
  { symbol: "USDC", mint: USDC_MAINNET_MINT, decimals: 6, label: "USDC (Circle)" },
  // Future additions — admin must also call update_accepted_stablecoins to
  // activate on-chain before adding here.
  // { symbol: "USDT", mint: new PublicKey("Es9vMF..."), decimals: 6, label: "USDT (Tether)" },
  // { symbol: "PYUSD", mint: new PublicKey("2b1kV6..."), decimals: 6, label: "PYUSD (PayPal)" },
];

export const SUPPORTED_STABLES: StablecoinDef[] =
  ARCADE_NETWORK === "mainnet" ? STABLES_MAINNET : STABLES_DEVNET;

/** Default mint for the current network — the one used when no user
 *  preference is set. Always returns USDC for now. */
export function defaultStable(): StablecoinDef {
  return SUPPORTED_STABLES[0];
}
