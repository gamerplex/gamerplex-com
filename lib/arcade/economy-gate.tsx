"use client";

// Blocking legal gate for the first $GAME action. Shown ONCE before a player's first $GAME
// payment. $GAME buys cosmetics & skill perks — NOT gambling, no cash-out. 18+. Pets/games use
// Claude AI (disclosure). Acceptance is persisted (localStorage) + logged (PostHog). Credits
// (free, earned, no money) do NOT need this gate — this fires only for kind === "game".

import { useState } from "react";
import { track } from "../analytics";

const CONSENT_KEY = "gp_economy_consent_v1";

export function hasEconomyConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function setEconomyConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 3200,
  background: "rgba(2,6,20,0.72)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const card: React.CSSProperties = {
  background: "#0c0c14",
  border: "1px solid #2a2a40",
  borderRadius: 16,
  padding: "22px 24px",
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 0 40px rgba(153,69,255,0.25)",
  color: "#e8e8f0",
  fontFamily: "'Space Grotesk', sans-serif",
};

const title: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: 0.4,
  marginBottom: 12,
  background: "linear-gradient(135deg, #14F195, #4fc3f7)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const list: React.CSSProperties = {
  margin: "0 0 14px",
  paddingLeft: 18,
  fontSize: 13,
  lineHeight: 1.6,
  color: "#cfd0dc",
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

const btnRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 4 };

const cancelBtn: React.CSSProperties = {
  flex: 1,
  padding: "11px 0",
  borderRadius: 10,
  border: "1px solid #2a2a40",
  background: "#14141f",
  color: "#cfd0dc",
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

function agreeBtn(ok: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "11px 0",
    borderRadius: 10,
    border: "none",
    background: ok ? "linear-gradient(135deg, #14F195, #4fc3f7)" : "#14141f",
    color: ok ? "#020614" : "#6a6a80",
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 13,
    fontWeight: 800,
    cursor: ok ? "pointer" : "not-allowed",
    boxShadow: ok ? "0 0 20px rgba(20,241,149,0.35)" : "none",
  };
}

/**
 * Blocking consent modal for $GAME. Render when a $GAME action is requested and
 * `hasEconomyConsent()` is false. `onAccept` records consent + logs, then continues the
 * action; `onClose` cancels. Closing the overlay = cancel (no bypass).
 */
export function EconomyConsentModal({
  onAccept,
  onClose,
}: {
  onAccept: () => void;
  onClose: () => void;
}) {
  const [ack, setAck] = useState(false);
  const accept = () => {
    if (!ack) return;
    setEconomyConsent();
    track("economy_consent_accepted");
    onAccept();
  };
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={card}>
        <div style={title}>Before you pay with $GAME 💎</div>
        <ul style={list}>
          <li>
            <b>This is a skill &amp; cosmetic game — not gambling.</b> $GAME buys cosmetics &amp;
            perks for saving your run; items have no cash-out value.
          </li>
          <li>
            Purchases are <b>18+</b> — by continuing you confirm you are 18 or older.
          </li>
          <li>
            Parts of the game use <b>Claude AI</b>.
          </li>
          <li>
            $GAME is a <b>Flipcash</b> community currency; Gamerplex only accepts it and makes no
            representation about its value.
          </li>
        </ul>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: "#cfd0dc",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            I am 18+, I understand this is a skill/cosmetic sink and not gambling, and I am not a
            resident of a prohibited region.
          </span>
        </label>
        <div style={btnRow}>
          <button onClick={onClose} style={cancelBtn}>
            Cancel
          </button>
          <button onClick={accept} disabled={!ack} style={agreeBtn(ack)}>
            Agree &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
}
