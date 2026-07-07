"use client";

// Gamerplex Plus — willingness-to-pay FAKE-DOOR (money-test, Test 2).
// A compact, honest "coming soon" modal that measures INTENT to pay for a $4.99/mo
// subscription BEFORE the subscription exists. It NEVER charges. "Notify me" captures
// an email (the signed-in session email if we have one, else a small field) and fires
// `plus_interest`; the funnel is plus_opened → plus_interest.
//
// R6: revenue = subscription + cosmetics + sinks. This tests the subscription leg only.

import { useEffect, useRef, useState } from "react";
import { track } from "../../lib/analytics";
import { getIdentity } from "../../lib/identity/client";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const PERKS = [
  { icon: "🚫", label: "No ads" },
  { icon: "🎮", label: "Extra daily runs" },
  { icon: "✨", label: "Exclusive cosmetics" },
  { icon: "❤️", label: "Support the games" },
];

export default function GoPlusModal({
  open,
  onClose,
  source = "unknown",
}: {
  open: boolean;
  onClose: () => void;
  source?: string;
}) {
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + reuse the identity session email when the modal opens.
  useEffect(() => {
    if (!open) return;
    setState("idle");
    setErr(null);
    (async () => {
      try {
        const me = await getIdentity();
        setSessionEmail(me?.email ?? null);
      } catch {
        setSessionEmail(null);
      }
    })();
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const signedIn = !!sessionEmail;

  const submit = async () => {
    const e = (sessionEmail || email).trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      setErr("Enter a valid email");
      return;
    }
    setState("sending");
    setErr(null);
    try {
      const res = await fetch("/api/plus/interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, email: e, signedIn }),
      });
      if (!res.ok) {
        setState("error");
        setErr(res.status === 429 ? "Too many tries — wait a minute." : "Couldn't save that. Try again.");
        return;
      }
      // Client-side funnel event (server also captures plus_interest independently).
      track("plus_interest", { source, signedIn });
      setState("done");
    } catch {
      setState("error");
      setErr("Couldn't save that. Try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gamerplex Plus"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "rgba(6,6,16,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#15121f",
          border: "1px solid #2c2740",
          borderRadius: 18,
          padding: "22px 20px calc(22px + env(safe-area-inset-bottom))",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid #2c2740",
            background: "transparent",
            color: "#9a92b5",
            fontSize: 16,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {state === "done" ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#f4f2fb", marginBottom: 6 }}>You're on the list</div>
            <div style={{ fontSize: 13, color: "#9a92b5", lineHeight: 1.5 }}>
              We'll email you the moment <b style={{ color: "#cabfff" }}>Gamerplex Plus</b> goes live. No charge today.
            </div>
            <button onClick={onClose} style={primaryBtn}>Got it</button>
          </div>
        ) : (
          <>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  color: "#0d0b14",
                  background: "linear-gradient(90deg,#9945FF,#14F195)",
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                ✦ COMING SOON
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#f4f2fb", marginBottom: 4, paddingRight: 28 }}>
              Gamerplex Plus
            </div>
            <div style={{ fontSize: 13, color: "#9a92b5", lineHeight: 1.5, marginBottom: 14 }}>
              <b style={{ color: "#14F195" }}>$4.99/mo</b> — more play, fewer ads, and the good cosmetics. Want it?
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {PERKS.map((p) => (
                <div
                  key={p.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#0e0b17",
                    border: "1px solid #2c2740",
                    borderRadius: 10,
                    padding: "9px 10px",
                    fontSize: 12.5,
                    color: "#d8d2ea",
                    fontWeight: 700,
                  }}
                >
                  <span style={{ fontSize: 15 }}>{p.icon}</span>
                  <span>{p.label}</span>
                </div>
              ))}
            </div>

            {!signedIn && (
              <input
                ref={inputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                disabled={state === "sending"}
                style={{
                  width: "100%",
                  height: 48,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: `1px solid ${err ? "#ff5a6a" : "#332d4a"}`,
                  background: "#0e0b17",
                  color: "#f4f2fb",
                  fontSize: 16,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
            {signedIn && (
              <div style={{ fontSize: 12, color: "#9a92b5", marginBottom: 2 }}>
                We'll notify <b style={{ color: "#cabfff" }}>{sessionEmail}</b>
              </div>
            )}
            {err && <div style={{ color: "#ff7a86", fontSize: 12, marginTop: 8 }}>{err}</div>}

            <button
              onClick={submit}
              disabled={state === "sending"}
              style={{ ...primaryBtn, opacity: state === "sending" ? 0.7 : 1 }}
            >
              {state === "sending" ? "Saving…" : "🔔 Notify me when it's live"}
            </button>
            <button
              onClick={onClose}
              style={{
                width: "100%",
                height: 40,
                marginTop: 8,
                border: "none",
                borderRadius: 12,
                background: "transparent",
                color: "#9a92b5",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Maybe later
            </button>
            <div style={{ fontSize: 11, color: "#6a6385", textAlign: "center", marginTop: 8 }}>
              Not live yet · you won't be charged · just gauging interest
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  width: "100%",
  height: 48,
  marginTop: 16,
  border: "none",
  borderRadius: 12,
  background: "linear-gradient(90deg, #9945FF, #14F195)",
  color: "#0d0b14",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};
