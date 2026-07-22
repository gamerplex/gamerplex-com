"use client";

// "Lock on-chain" orchestration: promote the user's web2 handle to a permanent
// on-chain HandleClaim PDA. The USER'S wallet signs the arcade set_handle ix
// (permissionless — no backend key); the server only sets the pending lock and,
// after confirming the tx, flips handleOnChain. Gated in the UI behind
// NEXT_PUBLIC_HANDLE_ONCHAIN until the identity-service promote endpoints deploy.

import { Connection, Transaction } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";

import { makeProgram, buildSetHandleIx } from "./client";
import { promoteHandle, confirmPromoteHandle } from "../identity/client";

export const HANDLE_ONCHAIN_ENABLED = process.env.NEXT_PUBLIC_HANDLE_ONCHAIN === "1";

export async function lockHandleOnChain(
  connection: Connection,
  wallet: AnchorWallet,
): Promise<{ ok: boolean; error?: string; txSig?: string }> {
  // 1) Server sets the promotion lock + returns the handle to claim.
  const promo = await promoteHandle();
  if (!promo.ok || !promo.handle) return { ok: false, error: promo.error || "promote_failed" };
  if (promo.alreadyOnChain) return { ok: true };

  // 2) Build + sign + send the arcade set_handle ix with the user's own wallet.
  //    Promotion is always the FIRST on-chain claim (handleOnChain was false), so
  //    there is no old claim to close → currentHandle = "".
  try {
    const program = makeProgram(connection, wallet);
    const ix = await buildSetHandleIx(program, wallet.publicKey, promo.handle, "");
    const tx = new Transaction().add(ix);
    const sig = await (program.provider as AnchorProvider).sendAndConfirm!(tx);

    // 3) Confirm so the server flips handleOnChain (idempotent/replay-safe).
    const conf = await confirmPromoteHandle(sig);
    if (!conf.ok) return { ok: false, error: conf.error || "confirm_failed", txSig: sig };
    return { ok: true, txSig: sig };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "onchain_failed" };
  }
}
