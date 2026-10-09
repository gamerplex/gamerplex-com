"use client";

// THE sign-in body. One implementation, one order, one set of words.
//
// WHY IT IS ALONE. Sign-in used to be offered from sixteen places with different
// copy and different leading methods, so one screen could show three of them and
// every fix had fifteen other places to regress in. This is the only sign-in UI;
// everything else is a button that opens it. Copy this file verbatim into sister
// apps rather than reimplementing it.
//
// ORDER FOLLOWS THE ACTUAL JOURNEY, which the first version got backwards. It led
// with "paste the sign-in link from your chat" — but a new person has not opened
// Flipcash yet, so the first thing they met was a box for something they could not
// possibly have, already outlined in red.
//
// THE RAIL, as verified against the watcher (tools/flipcash-pay/watch-payments.ts):
//   - We cannot message anyone first. There is no userId -> destination lookup and
//     no discovery, so the thread only exists once THEY open it.
//   - Opening the DM the first time costs Flipcash's init fee, a $1 floor that
//     cannot be waived. That first payment is what tells us who they are: it
//     carries their Flipcash userId, which is the only identifier we ever get.
//   - A payment >= 110 $GAME grants the Starter Pack; the watcher then DMs a
//     single-use login link back into that same thread.
//   - Once the chat is open their messages are FREE, and a message alone re-mints
//     a link against their existing payment — no new grant.
//
// So the copy must not promise a new person that "a message brings a link back":
// for them it is a payment that does. Returning people are the ones for whom a
// message is enough, and they are also the ones who already have a link to paste.
//
//   1. Open the chat        — the step that produces a link
//   2. Paste the link       — revealed, for someone coming back with one
//   3. Email                — kept, demoted; it cannot be delivered right now

import { useEffect, useState } from "react";

import FlipcashLinkPaste from "../arcade/FlipcashLinkPaste";

export default function AuthPanel({
  onEmail,
  busy = false,
}: {
  /** Opens the email step. Null hides it entirely. */
  onEmail: (() => void) | null;
  busy?: boolean;
}) {
  // null = still asking, '' = asked and unavailable, string = ready.
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/flipcash/intent")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setPayUrl(j?.payUrl ?? ""); })
      .catch(() => { if (live) setPayUrl(""); });
    return () => { live = false; };
  }, []);

  return (
    <div style={wrap}>
      <p style={lede}>
        <b style={{ color: "#f4f2fb" }}>Flipcash</b> is the fastest way in — no password,
        nothing to install, nothing to wait for.
      </p>

      {/* Step 1: the thing that actually produces a sign-in link. */}
      {payUrl === null ? (
        <span style={{ ...primary, opacity: 0.55, pointerEvents: "none" }} aria-busy="true">Loading…</span>
      ) : payUrl ? (
        <a href={payUrl} style={primary}>Open the @gamerplex chat</a>
      ) : (
        // The intent endpoint is unconfigured or down. Say so rather than leaving
        // the only working route spinning for ever.
        <span style={{ ...primary, background: "#2a2440", color: "#9a92b5" }}>
          Flipcash is unavailable right now
        </span>
      )}
      <p style={note}>
        New here? Opening the chat is the <b style={{ color: "#9a92b5" }}>$2 Starter Pack</b> —
        a sign-in link comes straight back.<br />
        Bought before? Just send a message; it is free and a fresh link comes back.
      </p>

      {/* Step 2: only for someone who already has one. Hidden until asked for, so
          it cannot be the first thing a new person meets. */}
      {showPaste ? (
        <FlipcashLinkPaste />
      ) : (
        <button type="button" onClick={() => setShowPaste(true)} style={linkish}>
          Already have a sign-in link? Paste it
        </button>
      )}

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
const lede: React.CSSProperties = { margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: "#9a92b5" };
const primary: React.CSSProperties = {
  display: "block", textAlign: "center", minHeight: 48, lineHeight: "48px",
  borderRadius: 12, textDecoration: "none", fontWeight: 800, fontSize: 15, color: "#fff",
  background: "linear-gradient(135deg,#9945ff,#ff2e88)",
};
const linkish: React.CSSProperties = {
  marginTop: 14, background: "transparent", border: "none", padding: 0,
  color: "#cabfff", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center",
  textDecoration: "underline", textUnderlineOffset: 3,
};
const divider: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" };
const rule: React.CSSProperties = { flex: 1, height: 1, background: "#2a2440" };
const dividerText: React.CSSProperties = { fontSize: 11, color: "#6a6385", letterSpacing: ".08em" };
const secondary: React.CSSProperties = {
  width: "100%", height: 48, borderRadius: 12, border: "1px solid #3a3357",
  background: "transparent", color: "#cabfff", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
};
const note: React.CSSProperties = { margin: "10px 0 0", fontSize: 11.5, color: "#6a6385", textAlign: "center", lineHeight: 1.45 };
