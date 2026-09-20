"use client";

// Shared multi-token picker for arcade save-score / verified-save / replay-mint.
// Mirrors the pattern flipball uses in its own SaveScoreModal — kept identical
// in look so users have one consistent payment UX across all gamerplex.com
// same-page games (blockwords, magic-chess, cyber-snake).
//
// Usage:
//   const [token, setToken] = useState(PAYMENT_TOKENS[0]);
//   <PaymentMethodPicker value={token} onChange={setToken} basePriceMicroUsd={BN(50_000)} />

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PAYMENT_TOKENS, type PaymentTokenDef } from "../../lib/arcade/tokens";
import { formatPrice } from "../../lib/arcade/save-score-payment";
import { track } from "../../lib/analytics";

interface Props {
  value: PaymentTokenDef;
  onChange: (token: PaymentTokenDef) => void;
  basePriceMicroUsd: BN;
  /** Restrict to a subset of PAYMENT_TOKENS. Defaults to all. */
  options?: PaymentTokenDef[];
  /** Compact mode — single row, smaller buttons. Default false. */
  compact?: boolean;
  /** Connected wallet. When given, the picker shows balances and flags shortfalls. */
  wallet?: string | null;
}

/** Live $GAME buy page. Same link the shop uses. */
const FLIPCASH_GAME =
  "https://app.flipcash.com/token/7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE";

/** What the player must hold, in whole tokens, for this purchase. */
function requiredAmount(token: PaymentTokenDef, basePriceMicroUsd: BN): number {
  const discounted = basePriceMicroUsd
    .mul(new BN(10_000 - token.discountBps))
    .div(new BN(10_000));
  return discounted.toNumber() / 1_000_000; // USD; converted per-token below
}

const wrap: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const btnBase: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 96,
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #2a2a40",
  background: "#0e0e1a",
  color: "#cfd0dc",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 0.2,
  transition: "border-color 80ms ease, background 80ms ease",
};

const btnActive: CSSProperties = {
  ...btnBase,
  borderColor: "#4fc3f7",
  background: "rgba(79,195,247,0.12)",
  color: "#fff",
  boxShadow: "0 0 12px rgba(79,195,247,0.25)",
};

const badge: CSSProperties = {
  display: "inline-block",
  marginLeft: 6,
  padding: "1px 5px",
  borderRadius: 999,
  background: "rgba(255,0,170,0.18)",
  color: "#ff5fb6",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0.4,
  verticalAlign: "middle",
};

const label: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#8a8aa0",
  marginBottom: 6,
};

export default function PaymentMethodPicker({
  value,
  onChange,
  basePriceMicroUsd,
  options = PAYMENT_TOKENS,
  compact = false,
  wallet = null,
}: Props) {
  // Balances drive the whole point of this component: previously every token was
  // offered unconditionally, so a player could pick $GAME holding zero $GAME and
  // only discover it when the payment failed. $GAME is the discounted path we most
  // want taken, so that silent dead end was costing exactly the conversions we want.
  const [balances, setBalances] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!wallet) { setBalances(null); return; }
    let cancelled = false;
    fetch(`/api/wallet/balances?wallet=${wallet}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.balances) setBalances(d.balances); })
      // A failed balance read must never block a purchase — fall back to
      // "unknown", which renders exactly as before.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wallet]);

  const usdPrice = (t: PaymentTokenDef) => requiredAmount(t, basePriceMicroUsd);
  const gameToken = options.find((t) => t.kind === "game");
  const selectedShort =
    balances && value.kind === "game" && gameToken
      ? (balances[gameToken.symbol] ?? 0) <= 0
      : false;

  return (
    <div>
      {!compact && <div style={label}>Pay with</div>}
      <div style={wrap}>
        {options.map((t) => {
          const isActive = t.symbol === value.symbol;
          return (
            <button
              key={t.symbol}
              type="button"
              onClick={() => onChange(t)}
              style={isActive ? btnActive : btnBase}
              aria-pressed={isActive}
              title={formatPrice(t, basePriceMicroUsd)}
            >
              {t.symbol}
              {t.discountBps > 0 && <span style={badge}>−20%</span>}
              {!compact && (
                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3, fontWeight: 500 }}>
                  ${usdPrice(t).toFixed(2)}
                </div>
              )}
              {!compact && balances && (
                <div style={{ fontSize: 9, marginTop: 2, color: (balances[t.symbol] ?? 0) > 0 ? "#7bd88f" : "#8a8aa0" }}>
                  {(balances[t.symbol] ?? 0) > 0
                    ? `you have ${(balances[t.symbol] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                    : "none"}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {/* The top-up prompt shows in compact mode too: a player who has selected
          $GAME with an empty balance is one tap from a failed payment, and that
          is precisely the moment worth interrupting. The generic Flipcash CTA
          stays full-mode-only, since it is informational rather than blocking. */}
      {selectedShort && <GameTopUp usd={usdPrice(value)} />}
      {!compact && !selectedShort && <FlipcashCta />}
    </div>
  );
}

const flipcashWrap: CSSProperties = {
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 12,
  background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const flipcashBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: 999,
  background: "#000",
  border: "1px solid #fff",
  color: "#fff",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  textDecoration: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/**
 * Shown when $GAME is selected but the wallet holds none. This is the funnel step
 * that did not exist: previously the player just hit a failed payment.
 */
function GameTopUp({ usd }: { usd: number }) {
  return (
    <div style={{ ...flipcashWrap, borderColor: "rgba(153,69,255,0.45)" }}>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e8e8f0" }}>
          You don&apos;t have any $GAME yet
        </span>
        <span style={{ fontSize: 10, color: "#8a8aa0" }}>
          This save costs about ${usd.toFixed(2)} in $GAME — 20% less than paying in stablecoins.
        </span>
      </div>
      <a
        href={FLIPCASH_GAME}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("flipcash_handoff_start", { source: "payment_picker", usd })}
        style={{ ...flipcashBtn, background: "linear-gradient(90deg,#9C4BFF,#14F195)", color: "#0c0c14", border: "none" }}
      >
        Get $GAME
      </a>
    </div>
  );
}

function FlipcashCta() {
  return (
    <div style={flipcashWrap}>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e8e8f0" }}>No USDC?</span>
        <span style={{ fontSize: 10, color: "#8a8aa0" }}>Apple / Google Pay → USDC via Flipcash</span>
      </div>
      {/* Not wired yet — a live-looking button that only opens a marketing site reads
          as a broken checkout. Disabled until the on-ramp actually returns USDC. */}
      <button
        type="button"
        disabled
        title="Coming soon — pay with USDC, SOL or $GAME above"
        style={{ ...flipcashBtn, opacity: 0.45, cursor: "not-allowed", border: "1px dashed #3a3a55" }}
        aria-label="Pay with Flipcash — coming soon"
      >
        <span aria-hidden style={{ fontSize: 13, fontWeight: 900 }}>F</span>
        Flipcash · Coming soon
      </button>
    </div>
  );
}
