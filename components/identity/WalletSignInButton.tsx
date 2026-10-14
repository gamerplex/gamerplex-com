"use client";

// Sign in with a Solana wallet — free, instant, no payment.
//
// WHY THIS EXISTS. The identity service has supported anonymous wallet sign-in all
// along (api/auth/wallet/siws, branch 4c: "Anonymous + new wallet -> CREATE a
// wallet-only user"), but no signed-out person could reach it. AuthPanel offered only
// the Flipcash chat — whose first message costs Flipcash's unwaivable ~$1 init fee —
// and an email path that cannot currently be delivered. So the only door charged money.
//
// That is how a user who had just spent $10.19 buying $GAME ended up asking "How to log
// in to game?". Buying the token is not an account: the token sits in their Flipcash
// wallet, and nothing linked it to Gamerplex.
//
// The older SignInWithSolana component gates wallet behind `emailVerified`. That gate is
// correct for LINKING a wallet onto an existing account (the server enforces it too) but
// wrong for a fresh sign-in, where the server requires no email at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { useIdentity } from "../../lib/identity/useIdentity";
import { hasNativeWalletBridge, requestNativeWallet } from "../../lib/identity/auth-core";
import { makeAuthClient } from "../../lib/identity/auth-core";

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || "https://auth.gamerplex.com";
const authCore = makeAuthClient({ identityUrl: IDENTITY_URL });

type Injected = { isConnected?: boolean; connect(): Promise<unknown> };
type WindowWithSolana = Window & {
  phantom?: { solana?: Injected };
  solana?: Injected;
  braveSolana?: Injected;
  solflare?: Injected;
  backpack?: Injected;
};

export default function WalletSignInButton({ onDone }: { onDone?: () => void }) {
  const { connected, signMessage, wallets } = useWallet();
  const { setVisible, visible } = useWalletModal();
  const { signIn } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Set when the user clicked while disconnected, so we sign as soon as they connect
  // rather than making them press the button a second time.
  const pending = useRef(false);

  const doSignIn = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      await signIn();
      onDone?.();
    } catch (e) {
      const m = e instanceof Error ? e.message : "sign-in failed";
      setErr(
        /User rejected|rejected the request/i.test(m)
          ? "You cancelled the signature."
          : /message signing/i.test(m)
            ? "That wallet can't sign messages — try Phantom or Solflare."
            : "That didn't go through. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [signIn, onDone]);

  useEffect(() => {
    if (connected && pending.current) {
      pending.current = false;
      void doSignIn();
    }
  }, [connected, doSignIn]);

  // Dismissing the picker without connecting must clear the intent. Otherwise the flag
  // stays armed and a connection made later, for something else entirely, would fire an
  // unexpected signature request.
  useEffect(() => {
    if (!visible && !connected) pending.current = false;
  }, [visible, connected]);

  // Inside the Expo shell there is no injected provider and Mobile Wallet Adapter is a
  // native protocol, so wallet-adapter has nothing to connect to — the picker would open
  // empty, which is precisely what "I click connect wallet and nothing happens" was. The
  // shell runs the identical SIWS natively instead (authorize + signMessages in ONE MWA
  // transact; two throw on Android) and we then ask the SERVER who we are. The injected
  // result is page script and proves nothing; the HttpOnly session cookie does.
  const onNativeClick = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await requestNativeWallet();
    const who = await authCore.me();
    setBusy(false);
    if (who.signedIn) { onDone?.(); return; }
    setErr(
      r.error === "timeout" ? "Your wallet did not come back. Try again."
        : r.error?.startsWith("connect_") ? "Your wallet did not connect. Open it, then try again."
        : r.pubkey ? "Wallet connected, but this app version cannot finish sign-in. Update Gamerplex, or use Flipcash or email below."
        : "That didn't go through. Try again.",
    );
  }, [onDone]);

  const onClick = async () => {
    if (connected) { void doSignIn(); return; }

    // Inside a wallet's own in-app browser the provider is ALREADY injected and there is
    // nothing to choose, so opening the adapter's picker can leave the user staring at a
    // modal that never resolves — reported as "I click connect wallet and nothing
    // happens", with no SIWS challenge ever reaching the server. Connect the injected
    // provider directly in that case and skip the chooser entirely.
    const injected = typeof window !== "undefined"
      ? (window as WindowWithSolana).phantom?.solana
        ?? (window as WindowWithSolana).braveSolana
        ?? (window as WindowWithSolana).solflare
        ?? (window as WindowWithSolana).backpack
        ?? (window as WindowWithSolana).solana
      : null;

    if (injected?.isConnected || injected?.connect) {
      setBusy(true);
      setErr(null);
      try {
        await injected.connect();
        // The adapter now sees a connected provider; hand off to the normal SIWS path.
        pending.current = true;
        setVisible(true);
        return;
      } catch {
        setErr("You cancelled the wallet connection.");
        return;
      } finally {
        setBusy(false);
      }
    }

    pending.current = true;
    setVisible(true);
  };

  const native = hasNativeWalletBridge();

  // Nothing installed — on a phone browser this is the common case. Say so instead of
  // opening a picker with no entries in it. In the shell there is never an injected
  // wallet and never needs to be, so this check does not apply there.
  const haveWallet = wallets.some((w) => w.readyState === "Installed" || w.readyState === "Loadable");
  if (!native && !haveWallet) {
    return (
      <p style={{ margin: "12px 2px 0", fontSize: 12, lineHeight: 1.5, color: "#8a80b0" }}>
        No Solana wallet found in this browser.{" "}
        <a href="https://phantom.app/download" target="_blank" rel="noreferrer" style={{ color: "#8ad" }}>
          Get Phantom
        </a>{" "}
        to sign in free with a wallet.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void (native ? onNativeClick() : onClick())}
        disabled={busy || (!native && connected && !signMessage)}
        data-testid="wallet-signin"
        style={{
          width: "100%", height: 48, marginTop: 12, borderRadius: 12,
          border: "1px solid #3a3357", background: "rgba(153,69,255,0.12)",
          color: "#e9e2ff", fontSize: 14.5, fontWeight: 800,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (native ? "Opening your wallet…" : "Check your wallet…") : "Continue with a wallet"}
      </button>
      <p style={{ margin: "6px 2px 0", fontSize: 12, lineHeight: 1.5, color: "#8a80b0" }}>
        Free · one signature · nothing sent
      </p>
      {err && <p style={{ margin: "6px 2px 0", fontSize: 12, color: "#ff9b9b" }}>{err}</p>}
    </>
  );
}
