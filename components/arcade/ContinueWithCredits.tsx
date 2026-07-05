"use client";

// Credits-SPEND option for the arcade game-over / continue flow. Above-the-money-line
// consumable: a player can spend Credits (web2 grind currency) instead of $GAME to
// continue or retry a run. SERVER-AUTHORITATIVE — the client names an ITEM (not an
// amount); the price lives in the /api/credits/spend catalog, and identity-service
// rejects overspend. CREDITS ONLY (R2/R7) — never $GAME here.
//
// Usage:
//   <ContinueWithCredits item="continue" onSuccess={continueRun} />   // cyber-snake
//   <ContinueWithCredits item="retry"    onSuccess={startNewRun} />   // blockwords / chess

import { useEffect, useRef, useState } from "react";
import { spendCredits, getCredits } from "../../lib/identity/client";

// Display-only mirror of the server catalog (app/api/credits/spend/route.ts). The server
// is authoritative for the actual deduction; these are for the label + insufficient-balance
// disable only.
const ITEM_PRICE: Record<"continue" | "retry", number> = {
  continue: 420,
  retry: 100,
};

const ITEM_LABEL: Record<"continue" | "retry", string> = {
  continue: "Continue",
  retry: "Retry",
};

interface Props {
  item: "continue" | "retry";
  onSuccess: () => void;
  /** Short game tag for the idempotency ref (e.g. "snake"). Optional. */
  game?: string;
}

const wrap: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
};

const btnBase: React.CSSProperties = {
  width: "100%",
  padding: "12px 20px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 0.3,
  border: "none",
  cursor: "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
  background: "linear-gradient(135deg, #ffd740, #ff9a40)",
  color: "#050508",
};

const btnDisabled: React.CSSProperties = {
  ...btnBase,
  background: "#14141f",
  color: "#6a6a80",
  border: "1px solid #252540",
  cursor: "not-allowed",
};

export default function ContinueWithCredits({ item, onSuccess, game }: Props) {
  const price = ITEM_PRICE[item];
  const [balance, setBalance] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refId = useRef(
    `${game ?? "arcade"}:${item}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  ).current;

  useEffect(() => {
    let cancelled = false;
    getCredits()
      .then((c) => {
        if (cancelled) return;
        setSignedIn(c !== null);
        setBalance(c ? c.total : null);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const insufficient = balance !== null && balance < price;
  const disabled = busy || signedIn === false || insufficient;

  const pay = async () => {
    if (disabled) return;
    setBusy(true);
    setErr(null);
    const r = await spendCredits(item, refId);
    setBusy(false);
    if (r.ok) {
      if (typeof r.appBalance === "number") setBalance(r.appBalance);
      onSuccess();
      return;
    }
    setErr(
      r.error === "insufficient"
        ? "Not enough Credits."
        : r.error === "not_signed_in"
        ? "Sign in first to spend Credits."
        : "Couldn't spend Credits.",
    );
    if (r.error === "not_signed_in") setSignedIn(false);
  };

  return (
    <div style={wrap}>
      <button onClick={pay} disabled={disabled} style={disabled ? btnDisabled : btnBase}>
        {busy ? "…" : `🪙 ${ITEM_LABEL[item]} · ${price.toLocaleString()} Credits`}
      </button>
      <div style={{ fontSize: 11, color: "#8a8aa0", letterSpacing: 0.3, textAlign: "center" }}>
        {signedIn === false ? (
          <span>Sign in (top bar) to use Credits</span>
        ) : balance !== null ? (
          <span>
            You have 🪙 {balance.toLocaleString()} Credits
            {insufficient && <span style={{ color: "#ff9a40" }}> · not enough</span>}
          </span>
        ) : (
          <span>Spend Credits instead of $GAME</span>
        )}
      </div>
      {err && (
        <div style={{ fontSize: 11, color: "#ff5252", textAlign: "center" }}>{err}</div>
      )}
    </div>
  );
}
