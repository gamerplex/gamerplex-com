"use client";

// THE sign-in body. One implementation, one order, one set of words.
//
// WHY IT IS ALONE. Sign-in used to be offered from sixteen places with different
// copy and different leading methods: a top-right pill, a "Save your scores" email
// CTA, an onboarding row, "Sign in to save your rank", a profile email box, and a
// per-game prompt. On one screen you could meet three of them, two of which led
// with email — the one method that cannot deliver. Every fix had fifteen other
// places to regress in.
//
// So this is the only sign-in UI in the product. Everything else is a BUTTON that
// opens it. Copy this file verbatim into sister apps rather than reimplementing
// it; the point is that the frame is identical wherever someone meets it.
//
// Order is deliberate and is the whole argument:
//   1. Flipcash — the only path that works end to end today
//   2. Email    — kept, because some people have no Flipcash, but demoted: the
//                 provider has been unable to deliver to any new address
//   3. Wallet   — a link for an existing account, never a way to create one

import FlipcashLinkPaste from "../arcade/FlipcashLinkPaste";

export default function AuthPanel({
  onEmail,
  busy = false,
}: {
  /** Opens the email step. Null hides it entirely (e.g. where mail is known dead). */
  onEmail: (() => void) | null;
  busy?: boolean;
}) {
  return (
    <div style={wrap}>
      <p style={lede}>
        <b style={{ color: "#f4f2fb" }}>Flipcash</b> is the fastest way in — no password,
        no wallet, nothing to wait for.
      </p>

      <FlipcashLinkPaste />

      {onEmail && (
        <>
          <div style={divider} aria-hidden="true">
            <span style={rule} />
            <span style={dividerText}>OR EMAIL</span>
            <span style={rule} />
          </div>
          <button type="button" onClick={onEmail} disabled={busy} style={secondary}>
            {busy ? "Working…" : "Use email instead"}
          </button>
          <p style={note}>We send a 6-digit code. No password.</p>
        </>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = { display: "flex", flexDirection: "column" };
const lede: React.CSSProperties = {
  margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: "#9a92b5",
};
const divider: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px",
};
const rule: React.CSSProperties = { flex: 1, height: 1, background: "#2a2440" };
const dividerText: React.CSSProperties = {
  fontSize: 11, color: "#6a6385", letterSpacing: ".08em",
};
const secondary: React.CSSProperties = {
  width: "100%", height: 48, borderRadius: 12, border: "1px solid #3a3357",
  background: "transparent", color: "#cabfff", fontSize: 14.5, fontWeight: 700,
  cursor: "pointer",
};
const note: React.CSSProperties = {
  margin: "10px 0 0", fontSize: 11.5, color: "#6a6385", textAlign: "center",
};
