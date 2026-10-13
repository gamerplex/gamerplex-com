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

export default function WalletSignInButton({ onDone }: { onDone?: () => void }) {
  const { connected, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
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

  const onClick = () => {
    if (!connected) {
      pending.current = true;
      setVisible(true);
      return;
    }
    void doSignIn();
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || (connected && !signMessage)}
        data-testid="wallet-signin"
        style={{
          width: "100%", height: 48, marginTop: 12, borderRadius: 12,
          border: "1px solid #3a3357", background: "rgba(153,69,255,0.12)",
          color: "#e9e2ff", fontSize: 14.5, fontWeight: 800,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Check your wallet…" : "Continue with a wallet"}
      </button>
      <p style={{ margin: "6px 2px 0", fontSize: 12, lineHeight: 1.5, color: "#8a80b0" }}>
        Free · one signature · nothing sent
      </p>
      {err && <p style={{ margin: "6px 2px 0", fontSize: 12, color: "#ff9b9b" }}>{err}</p>}
    </>
  );
}
