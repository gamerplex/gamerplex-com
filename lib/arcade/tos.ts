// Terms of Service acceptance — off-chain, wallet-signed, localStorage-persisted.
//
// Flow:
//   1. User connects wallet.
//   2. Guard checks hasAcceptedCurrent(wallet). If false, redirect to /terms.
//   3. On /terms, user scrolls, checks boxes, clicks Sign & Accept.
//   4. Wallet signs the human-readable message via signMessage().
//   5. signAndStore() persists to localStorage + POSTs to /api/tos-accept audit log.
//   6. Subsequent loads: hasAcceptedCurrent returns true, no re-prompt.
//
// Version bumps: increment LATEST_TOS_VERSION → all users re-prompted on next connect.

import type { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const LATEST_TOS_VERSION = "1.2";

export type TosAcceptance = {
  version: string;
  timestamp: string;
  wallet: string;
  message: string;
  signature: string;
};

export function tosMessage(version: string, timestamp: string, walletAddr: string): string {
  return [
    "Gamerplex Arcade — Terms of Service Acceptance",
    "",
    "I have read and agree to the Terms of Service and Privacy Policy.",
    "I confirm I am at least 18 years of age.",
    "I confirm I am not a resident of a prohibited jurisdiction",
    "(AZ, AR, CT, DE, LA, MT, SC, SD, TN, USVI, or any sanctioned country).",
    "",
    `Version:   ${version}`,
    `Timestamp: ${timestamp}`,
    `Wallet:    ${walletAddr}`,
  ].join("\n");
}

function storageKey(wallet: PublicKey | string): string {
  const addr = typeof wallet === "string" ? wallet : wallet.toBase58();
  return `gpx:tos:${addr}`;
}

export function getStored(wallet: PublicKey | string): TosAcceptance | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(wallet));
    if (!raw) return null;
    return JSON.parse(raw) as TosAcceptance;
  } catch {
    return null;
  }
}

export function hasAcceptedCurrent(wallet: PublicKey | string): boolean {
  const stored = getStored(wallet);
  return stored?.version === LATEST_TOS_VERSION;
}

export async function signAndStore(
  wallet: PublicKey,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<TosAcceptance> {
  const timestamp = new Date().toISOString();
  const walletAddr = wallet.toBase58();
  const message = tosMessage(LATEST_TOS_VERSION, timestamp, walletAddr);
  const encoded = new TextEncoder().encode(message);
  const sigBytes = await signMessage(encoded);

  const acceptance: TosAcceptance = {
    version: LATEST_TOS_VERSION,
    timestamp,
    wallet: walletAddr,
    message,
    signature: bs58.encode(sigBytes),
  };

  window.localStorage.setItem(storageKey(wallet), JSON.stringify(acceptance));

  // Fire-and-forget audit log. Failure doesn't block the user — their
  // localStorage sig is sufficient proof; the audit log is a belt-and-braces
  // second copy for dispute resolution.
  fetch("/api/tos-accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(acceptance),
  }).catch(() => {});

  return acceptance;
}

export function clearTos(wallet: PublicKey | string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(wallet));
}
