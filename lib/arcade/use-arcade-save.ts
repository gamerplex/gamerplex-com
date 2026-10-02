"use client";

// Native-aware arcade save. On the web, wallet connect + tx signing use the
// browser wallet-adapter as before. Inside the Gamerplex native app (WebView), a
// wallet can't be reached via MWA from JS, so connect + sign+send are bridged to
// the native shell (portal-webview.tsx): postMessage('gpx-connect-wallet' /
// 'gpx-sign-and-send'), and the native side replies via window CustomEvents.
// Games use this hook instead of useWallet/useWalletModal/useAnchorWallet directly.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnchorWallet, useConnection, useWallet, type AnchorWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";

// Wallet failures used to surface raw ("sign_send_java.util.concurrent.Cancellation-
// Exception") on the game-over screen. Players need to know what to DO instead.
function friendlyWalletError(code?: string): string {
  switch (code) {
    case "cancelled_in_wallet":
      return "Cancelled in your wallet — tap Pay again and approve the transaction.";
    case "wallet_timeout":
      return "Your wallet didn’t respond. Open it, then tap Pay again.";
    case undefined:
    case "":
      return "Couldn’t reach your wallet. Tap Pay again.";
    default:
      return code.startsWith("wallet_error:")
        ? `Your wallet rejected the request (${code.slice(13)}). Tap Pay again.`
        : "Couldn’t complete the payment. Tap Pay again.";
  }
}

// Ship the web half of the save to the same sink the native app uses, so ONE journal
// on kx002 shows the whole journey: build → wallet → broadcast → confirm. Without it
// a failure after signing is invisible remotely. Fire-and-forget; never throws.
function webDiag(event: string, props: Record<string, unknown>): void {
  try {
    void fetch("https://auth.gamerplex.com/api/v1/diag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, platform: "web", surface: "arcade-save", ...props }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* diagnostics must never break a payment */ }
}

function isNativeApp(): boolean {
  return typeof window !== "undefined" && (window as { __GAMERPLEX_NATIVE__?: boolean }).__GAMERPLEX_NATIVE__ === true;
}

function postNative(msg: object): void {
  const rn = (window as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView;
  rn?.postMessage(JSON.stringify(msg));
}

export interface ArcadeSave {
  publicKey: PublicKey | null;
  connected: boolean;
  isNative: boolean;
  /** AnchorWallet for makeProgram (build-only in native — signing goes via sendTx). */
  anchorWallet: AnchorWallet | undefined;
  /** Open the wallet picker (web) or ask the native shell to connect+SIWS (native). */
  connectForSave: () => void;
  /** Sign+send a built tx: native → MWA bridge; web → provider.sendAndConfirm. Returns the signature. */
  sendTx: (program: Program, tx: Transaction) => Promise<string>;
  /** Last native connect error surfaced back from the shell (e.g. no wallet app). */
  connectError: string | null;
}

export function useArcadeSave(): ArcadeSave {
  const native = isNativeApp();
  const web = useWallet();
  const webAnchor = useAnchorWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [nativePubkey, setNativePubkey] = useState<PublicKey | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const pending = useRef(new Map<string, { resolve: (s: string) => void; reject: (e: Error) => void }>());
  const txCounter = useRef(0);

  useEffect(() => {
    if (!native) return;
    const setFromPubkey = (pk?: string) => {
      if (!pk) return;
      try {
        setNativePubkey(new PublicKey(pk));
        setConnectError(null);
      } catch { /* bad pubkey — ignore */ }
    };
    const onLinked = (e: Event) => {
      const d = (e as CustomEvent).detail as { pubkey?: string; error?: string } | undefined;
      if (d?.error) setConnectError(d.error);
      setFromPubkey(d?.pubkey);
    };
    const onTx = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { id?: string; signedTx?: string; error?: string }
        | undefined;
      if (!d?.id) return;
      const p = pending.current.get(d.id);
      if (!p) return;
      pending.current.delete(d.id);
      // The wallet returns the SIGNED transaction; this side broadcasts it (Phantom
      // on Android doesn't support sign-and-send, so we can't rely on the wallet
      // to submit). Errors arrive already humanized.
      if (d.signedTx) p.resolve(d.signedTx);
      else p.reject(new Error(friendlyWalletError(d.error)));
    };
    window.addEventListener("gamerplex:wallet-linked", onLinked);
    window.addEventListener("gamerplex:tx-result", onTx);
    // If the shell linked a wallet earlier this session, it left the pubkey here.
    setFromPubkey((window as { __GAMERPLEX_WALLET__?: { pubkey?: string } }).__GAMERPLEX_WALLET__?.pubkey);
    return () => {
      window.removeEventListener("gamerplex:wallet-linked", onLinked);
      window.removeEventListener("gamerplex:tx-result", onTx);
    };
  }, [native]);

  const connectForSave = useCallback(() => {
    if (native) {
      setConnectError(null);
      postNative({ type: "gpx-connect-wallet" });
    } else {
      setVisible(true);
    }
  }, [native, setVisible]);

  // Build-only anchor wallet for makeProgram in native (signing never goes through it).
  const nativeAnchor = useMemo<AnchorWallet | undefined>(() => {
    if (!native || !nativePubkey) return undefined;
    return {
      publicKey: nativePubkey,
      signTransaction: async <T,>(t: T) => t,
      signAllTransactions: async <T,>(t: T[]) => t,
    } as AnchorWallet;
  }, [native, nativePubkey]);

  const sendTx = useCallback(
    async (program: Program, tx: Transaction): Promise<string> => {
      if (!native) {
        return await program.provider.sendAndConfirm!(tx, [], { skipPreflight: false });
      }
      if (!nativePubkey) throw new Error("wallet not connected");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.feePayer = nativePubkey;
      tx.recentBlockhash = blockhash;
      const b64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
      const id = `tx_${txCounter.current++}_${b64.length}`;
      webDiag("save_tx_built", { tx_len: b64.length, wallet: nativePubkey.toBase58(), id });
      const signedB64 = await new Promise<string>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        postNative({ type: "gpx-sign-and-send", id, tx: b64 });
        setTimeout(() => {
          if (pending.current.delete(id)) {
            reject(new Error("Your wallet didn’t respond. Open it, then tap Pay again."));
          }
        }, 120_000);
      });
      // Wallet signed; we broadcast (Phantom Android has no sign-and-send).
      webDiag("save_tx_signed", { signed_len: signedB64.length });
      const raw = Uint8Array.from(atob(signedB64), (c) => c.charCodeAt(0));
      let sig: string;
      try {
        sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
        webDiag("save_tx_broadcast_ok", { signature: sig });
      } catch (e: any) {
        webDiag("save_tx_broadcast_failed", {
          error: String(e?.message ?? e).slice(0, 300),
          logs: (e?.logs ?? []).slice(0, 6),
        });
        throw e;
      }
      try {
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        webDiag("save_tx_confirmed", { signature: sig });
      } catch (e: any) {
        webDiag("save_tx_confirm_failed", { signature: sig, error: String(e?.message ?? e).slice(0, 300) });
        throw e;
      }
      return sig;
    },
    [native, nativePubkey, connection],
  );

  return {
    publicKey: native ? nativePubkey : web.publicKey ?? null,
    connected: native ? Boolean(nativePubkey) : web.connected,
    isNative: native,
    anchorWallet: native ? nativeAnchor : webAnchor,
    connectForSave,
    sendTx,
    connectError,
  };
}
