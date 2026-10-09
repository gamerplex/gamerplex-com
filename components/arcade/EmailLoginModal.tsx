"use client";

// Compact, play-first email sign-in modal — the web2 entry point for the arcade.
// Pattern from the 12-portal UX benchmark (Wordle/Duolingo): never a wall before
// play; surfaced only to SAVE a score/streak, framed as loss-aversion ("keep your
// streak"), email magic-link (no password, no wallet). Wallet is a separate,
// optional "save on-chain" step elsewhere.

import { useEffect, useRef, useState } from "react";

import AuthPanel from "../identity/AuthPanel";
import { emailSignup, isNativeApp, requestEmailOtp, verifyEmailOtp } from "../../lib/identity/client";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function EmailLoginModal({
  open,
  onClose,
  title = "Save your score & streak",
  subtitle = "Flipcash is the fastest way in — no password, nothing to install.",
  allowEmail = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /**
   * Offer the email step. OFF by default: email cannot currently be delivered, so the
   * front door must not send anyone down it. Profile's "Add your email" sets it —
   * there it is a RECOVERY address someone deliberately attaches, not a way in.
   */
  allowEmail?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [hinted, setHinted] = useState(false);
  const [code, setCode] = useState("");
  // "code"/"verifying" are the native-app OTP path; "sent" is the web magic-link path.
  const [state, setState] = useState<"idle" | "sending" | "sent" | "code" | "verifying" | "error">("idle");
  const [emailStep, setEmailStep] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setState("idle");
      setErr(null);
      setCode("");
      setNative(isNativeApp());
      // Account-chooser: the native shell injects the signed-in Gamerplex email as
      // a HINT (not a token) so cross-domain apps can offer "Continue as you@…".
      // The magic-link/OTP flow below is unchanged — this only pre-fills.
      let didHint = false;
      try {
        const hint = (window as unknown as { __GAMERPLEX_LOGIN_HINT__?: string }).__GAMERPLEX_LOGIN_HINT__;
        if (hint && EMAIL_RE.test(hint)) { setEmail(hint); didHint = true; }
      } catch { /* no-op */ }
      setHinted(didHint);
      const t = setTimeout(() => { if (!didHint) inputRef.current?.focus(); }, 60);
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
    // Native app → email a 6-digit code (magic links can't return to the app).
    // Web → the existing one-tap magic link.
    const res = native ? await requestEmailOtp(e) : await emailSignup(e);
    // `ok` only means the request was accepted. The server separately reports
    // whether the mail actually left — and when the provider rejects it, saying
    // "check your email" sends someone to wait for a mail that will never come.
    // Absent (older identity-service) is treated as sent, so this never invents
    // a failure. Explicit false is a real delivery failure.
    const delivered = native
      ? (res as { sent?: boolean }).sent !== false
      : (res as { verificationEmailSent?: boolean }).verificationEmailSent !== false;
    if (res.ok && !delivered) {
      setState("idle");
      setErr("We couldn't send that email right now. It's us, not you — try again shortly.");
      return;
    }
    if (res.ok) {
      setState(native ? "code" : "sent");
      if (native) setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setState("idle");
      setErr(res.error === "rate_limited" ? "Too many tries — wait a minute." : "Couldn't send it. Try again.");
    }
  };

  const verify = async () => {
    const c = code.trim();
    if (!/^[0-9]{6}$/.test(c)) {
      setErr("Enter the 6-digit code");
      return;
    }
    setState("verifying");
    setErr(null);
    const res = await verifyEmailOtp(email.trim().toLowerCase(), c);
    if (res.ok) {
      onClose(); // parent refreshes identity → signed in
    } else {
      setState("code");
      setErr(
        res.error === "invalid_code"
          ? "Wrong or expired code — check it or resend."
          : res.error === "rate_limited"
            ? "Too many tries — wait a minute."
            : "Couldn't verify. Try again.",
      );
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
        ) : state === "code" || state === "verifying" ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f4f2fb", marginBottom: 6, paddingRight: 28 }}>Enter your code</div>
            <div style={{ fontSize: 13, color: "#9a92b5", lineHeight: 1.5, marginBottom: 16 }}>
              We emailed a 6-digit code to <b style={{ color: "#cabfff" }}>{email.trim().toLowerCase()}</b>. It expires in 10 minutes.
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              disabled={state === "verifying"}
              style={{
                width: "100%", height: 48, padding: "0 14px", borderRadius: 12,
                border: `1px solid ${err ? "#ff5a6a" : "#332d4a"}`, background: "#0e0b17",
                color: "#f4f2fb", fontSize: 22, fontWeight: 700, letterSpacing: 8, textAlign: "center",
                outline: "none", boxSizing: "border-box",
              }}
            />
            {err && <div style={{ color: "#ff7a86", fontSize: 12, marginTop: 8 }}>{err}</div>}
            <button onClick={verify} disabled={state === "verifying"} style={{ ...primaryBtn, opacity: state === "verifying" ? 0.7 : 1 }}>
              {state === "verifying" ? "Verifying…" : "Verify & sign in"}
            </button>
            <button
              onClick={() => { setState("idle"); setErr(null); setCode(""); }}
              style={{ width: "100%", marginTop: 10, background: "transparent", border: "none", color: "#8a83a5", fontSize: 12, cursor: "pointer" }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f4f2fb", marginBottom: 6, paddingRight: 28 }}>{hinted ? "Welcome back 👋" : title}</div>

            {emailStep ? (
              <>
                <div style={{ fontSize: 13, color: "#9a92b5", lineHeight: 1.5, margin: "0 0 14px" }}>
                  {native ? "We'll send a 6-digit code." : "We'll send a one-tap sign-in link."}
                </div>
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
                    width: "100%", height: 48, padding: "0 14px", borderRadius: 12,
                    border: `1px solid ${err ? "#ff5a6a" : "#332d4a"}`, background: "#0e0b17",
                    color: "#f4f2fb", fontSize: 16, outline: "none", boxSizing: "border-box",
                  }}
                />
                {err && <div style={{ color: "#ff7a86", fontSize: 12, marginTop: 8 }}>{err}</div>}
                <button onClick={submit} disabled={state === "sending"} style={{ ...primaryBtn, opacity: state === "sending" ? 0.7 : 1 }}>
                  {state === "sending" ? "Sending…" : native ? "Email me a code" : "Email me a sign-in link"}
                </button>
                <button
                  onClick={() => { setEmailStep(false); setErr(null); }}
                  style={{ width: "100%", marginTop: 10, background: "transparent", border: "none", color: "#8a83a5", fontSize: 12.5, cursor: "pointer" }}
                >
                  ← Back
                </button>
              </>
            ) : (
              <>
                {/* Email is NOT offered at the front door. It cannot be delivered -- the
                    sending domain is unverified and own1 currently fails DNS on the SMTP
                    host -- so showing it here sends people down a path that silently ends.
                    It survives as an OPTIONAL recovery address in Profile, where someone
                    already signed in can add one and the page can be honest about whether
                    the mail actually went. */}
                <AuthPanel onEmail={allowEmail ? () => setEmailStep(true) : null} busy={state === "sending"} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Email is the fallback now, so it reads as one: outlined, not filled. */
const secondaryBtn: React.CSSProperties = {
  width: "100%",
  height: 48,
  marginTop: 12,
  borderRadius: 12,
  border: "1px solid #3a3357",
  background: "transparent",
  color: "#cabfff",
  fontSize: 14.5,
  fontWeight: 700,
  cursor: "pointer",
};

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
