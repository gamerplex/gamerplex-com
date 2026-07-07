"use client";

// Compact, play-first email sign-in modal — the web2 entry point for the arcade.
// Pattern from the 12-portal UX benchmark (Wordle/Duolingo): never a wall before
// play; surfaced only to SAVE a score/streak, framed as loss-aversion ("keep your
// streak"), email magic-link (no password, no wallet). Wallet is a separate,
// optional "save on-chain" step elsewhere.

import { useEffect, useRef, useState } from "react";
import { emailSignup } from "../../lib/identity/client";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function EmailLoginModal({
  open,
  onClose,
  title = "Save your score & streak",
  subtitle = "Enter your email — we'll send a one-tap sign-in link. No password, no wallet.",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setState("idle");
      setErr(null);
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
      window.addEventListener("keydown", onKey);
      return () => {
        clearTimeout(t);
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      setErr("Enter a valid email");
      return;
    }
    setState("sending");
    setErr(null);
    const res = await emailSignup(e);
    if (res.ok) {
      setState("sent");
    } else {
      setState("error");
      setErr(res.error === "rate_limited" ? "Too many tries — wait a minute." : "Couldn't send the link. Try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
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

        {state === "sent" ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📬</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#f4f2fb", marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: 13, color: "#9a92b5", lineHeight: 1.5 }}>
              We sent a one-tap sign-in link to<br />
              <b style={{ color: "#cabfff" }}>{email.trim().toLowerCase()}</b>. Open it on this device to save your score.
            </div>
            <button onClick={onClose} style={primaryBtn}>Got it</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f4f2fb", marginBottom: 6, paddingRight: 28 }}>{title}</div>
            <div style={{ fontSize: 13, color: "#9a92b5", lineHeight: 1.5, marginBottom: 16 }}>{subtitle}</div>
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
            {err && <div style={{ color: "#ff7a86", fontSize: 12, marginTop: 8 }}>{err}</div>}
            <button onClick={submit} disabled={state === "sending"} style={{ ...primaryBtn, opacity: state === "sending" ? 0.7 : 1 }}>
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            <div style={{ fontSize: 11, color: "#6a6385", textAlign: "center", marginTop: 12 }}>
              Free · no password · your score saves the moment you tap the link
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
  background: "linear-gradient(90deg, #9945FF, #7c3aed)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};
