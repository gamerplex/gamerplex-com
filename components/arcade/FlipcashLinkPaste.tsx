"use client";

// Sign in by pasting the Flipcash link, for when tapping it does the wrong thing.
//
// WHY THIS EXISTS. The login link is delivered in a Flipcash DM, and whichever
// app wins the tap gets the single-use token. On a real device that was the
// browser as often as the app, and a session in the browser is useless to someone
// playing in the app — the WebView has its own cookie jar. The server now serves
// a hand-off page to browsers instead of redeeming, but completing that hand-off
// needs a native build we cannot ship today.
//
// This path needs no app release at all: the control renders INSIDE the app's
// WebView, so navigating it to the redeem URL sets the cookie in exactly the jar
// the app reads. The buyer copies the link they already have and pastes it here.
//
// It works in a normal browser too, where it simply signs that browser in.

import { useState } from "react";

const AUTH = "https://auth.gamerplex.com";

/**
 * Pull the token out of whatever got pasted: the whole link, the app-scheme
 * rewrite, or a bare token. Exported for tests — getting this wrong sends someone
 * to a dead URL with no way to tell why.
 */
export function tokenFromPaste(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const m = /[?&]token=([A-Za-z0-9._~-]+)/.exec(s);
  if (m) return m[1];
  // A bare token: base64url, and long enough not to be a stray word.
  if (/^[A-Za-z0-9._~-]{20,}$/.test(s) && !s.includes("/")) return s;
  return null;
}

export default function FlipcashLinkPaste() {
  const [raw, setRaw] = useState("");
  const [bad, setBad] = useState(false);

  const go = () => {
    const token = tokenFromPaste(raw);
    if (!token) {
      setBad(true);
      return;
    }
    // A full navigation, not fetch(): the point is for the redeem response to set
    // its cookie on THIS browsing context, which is the app's WebView.
    window.location.href = `${AUTH}/flipcash-link?token=${encodeURIComponent(token)}`;
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #2a2140" }}>
      <div style={{ fontSize: 12.5, color: "#9a92b5", marginBottom: 8, lineHeight: 1.45 }}>
        Bought with Flipcash? Paste the sign-in link from your chat — it signs you in right here.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Paste your sign-in link"
          aria-label="Flipcash sign-in link"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            // 16px or iOS zooms the page and never zooms back.
            fontSize: 16,
            padding: "11px 12px",
            borderRadius: 10,
            border: `1px solid ${bad ? "#ff6b8a" : "#2a2140"}`,
            background: "#120c1f",
            color: "#f4f2fb",
          }}
        />
        <button
          onClick={go}
          style={{
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 10,
            border: 0,
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
            color: "#fff",
            background: "linear-gradient(135deg,#9945ff,#ff2e88)",
          }}
        >
          Sign in
        </button>
      </div>
      {bad && (
        <div style={{ fontSize: 12, color: "#ff6b8a", marginTop: 7 }}>
          That does not look like a sign-in link. Copy the whole link from the Flipcash chat.
        </div>
      )}
    </div>
  );
}
