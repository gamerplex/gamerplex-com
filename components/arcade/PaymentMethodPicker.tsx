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
import { BN } from "@coral-xyz/anchor";
import { PAYMENT_TOKENS, type PaymentTokenDef } from "../../lib/arcade/tokens";
import { formatPrice } from "../../lib/arcade/save-score-payment";

interface Props {
  value: PaymentTokenDef;
  onChange: (token: PaymentTokenDef) => void;
  basePriceMicroUsd: BN;
  /** Restrict to a subset of PAYMENT_TOKENS. Defaults to all. */
  options?: PaymentTokenDef[];
  /** Compact mode — single row, smaller buttons. Default false. */
  compact?: boolean;
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
}: Props) {
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
                  ${(basePriceMicroUsd.toNumber() * (10_000 - t.discountBps) / 10_000 / 1_000_000).toFixed(2)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
