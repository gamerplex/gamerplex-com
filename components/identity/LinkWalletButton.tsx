"use client";

// Links the CONNECTED wallet to the signed-in account (SIWS).
//
// This is the only place outside /arcade that can set users.walletAddress, and
// /arcade has no route in the Expo app — so without it a mobile player can
// connect Phantom but never link it, and anything reading the identity wallet
// sees null forever.

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { useIdentity } from "../../lib/identity/useIdentity";
import { track } from "../../lib/analytics";

const ERRORS: Record<string, string> = {
  wallet_taken: "That wallet is already linked to another account.",
  email_verification_required: "Verify your email first, then link your wallet.",
  bad_origin: "Couldn't reach the account service. Try again.",
};

export default function LinkWalletButton() {
  const { user, isSignedIn, signIn, refresh } = useIdentity();
  const { connected, signMessage } = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  // Already linked — show it and stop. `linked` covers the same render pass as
  // the successful call, before `user` has refetched.
  const addr = user?.walletAddress;
  if (addr || linked) {
    return (
      <p style={done}>
        ✓ Wallet linked{addr ? ` · ${addr.slice(0, 4)}…${addr.slice(-4)}` : ""}
      </p>
    );
  }

  if (!isSignedIn || !connected) return null;

  const onLink = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await signIn();
      if (r.status === "linked" || r.status === "login") {
        setLinked(true);
        try { localStorage.setItem("gpx_wallet_ok", "1"); } catch { /* no-op */ }
        track("wallet_linked", {});
        await refresh();
      }
    } catch (e) {
      const key = e instanceof Error ? e.message : "";
      setErr(ERRORS[key] ?? "Couldn't link that wallet. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button onClick={onLink} disabled={busy || !signMessage} style={cta}
        title={!signMessage ? "This wallet can't sign messages" : undefined}>
        {busy ? "Check your wallet…" : "Link this wallet to your account"}
      </button>
      <span style={{ fontSize: 11.5, color: "#8a80b0" }}>
        Signs a message to prove ownership. No transaction, no fee.
      </span>
      {err ? <span role="alert" style={{ fontSize: 12, color: "#ff8a8a" }}>{err}</span> : null}
    </div>
  );
}

const cta: React.CSSProperties = {
  background: "linear-gradient(100deg,#9945ff,#7a2bff)", color: "#fff", fontWeight: 800,
  fontSize: 13, border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer",
};
const done: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: "#14F195", margin: 0,
};
