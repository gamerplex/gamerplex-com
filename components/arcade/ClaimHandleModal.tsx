"use client";

// Free web2 username claim — the 🟡 "named" tier and the base of the whole
// identity/referral/leaderboard stack. No wallet, no cost. Validation mirrors the
// on-chain set_handle rules so a name accepted here promotes cleanly on-chain
// later. Mobile-first: full-width, thumb-height input + CTA.

import { useState } from "react";
import { setHandle } from "../../lib/identity/client";

const MIN = 3;
const MAX = 20;
const RESERVED = new Set([
  "admin", "system", "root", "null", "anonymous", "deleted",
  "gamerplex", "sledgit", "petlegends", "pltcg",
  "support", "help", "official", "team", "mod",
]);

function localValidate(s: string): string | null {
  if (s.length < MIN) return `At least ${MIN} characters.`;
  if (s.length > MAX) return `At most ${MAX} characters.`;
  if (!/^[a-z0-9_]+$/.test(s)) return "Only lowercase letters, numbers, and _";
  if (RESERVED.has(s)) return "That name is reserved.";
  return null;
}

function friendlyError(key: string): string {
  if (key === "handle_taken") return "That name is taken — try another.";
  if (key === "handle_is_on_chain") return "Your name is locked on-chain — change it via the wallet flow.";
  if (key === "verify_required") return "Verify your email first, then pick a name.";
  if (key === "insufficient_credits") return "Not enough Credits to rename right now — or wait for the free window.";
  if (key === "promotion_pending") return "Your on-chain lock is finishing — try again in a moment.";
  if (key === "network") return "Network hiccup — try again.";
  if (key.startsWith("At ") || key.startsWith("Only")) return key;
  return "Couldn’t save that name — try another.";
}

function untilFree(ms: number): string {
  const h = Math.max(1, Math.ceil((ms - Date.now()) / (60 * 60 * 1000)));
  return h <= 1 ? "under an hour" : `~${h}h`;
}

export default function ClaimHandleModal({
  open,
  onClose,
  onClaimed,
}: {
  open: boolean;
  onClose: () => void;
  onClaimed: (handle: string) => void;   // parent refreshes identity
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Set when a rename is inside the 24h cooldown → confirm the Credits spend.
  const [payPrompt, setPayPrompt] = useState<{ cost: number; cooldownEndsAt: number } | null>(null);

  if (!open) return null;

  const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const localErr = clean.length > 0 ? localValidate(clean) : null;

  const submit = async (payWithCredits = false) => {
    const v = clean;
    const le = localValidate(v);
    if (le) { setErr(le); return; }
    setBusy(true);
    setErr(null);
    const res = await setHandle(v, payWithCredits);
    setBusy(false);
    if (res.ok) { setPayPrompt(null); onClaimed(v); return; }
    if (res.requiresCredits && res.cost != null && res.cooldownEndsAt != null) {
      setPayPrompt({ cost: res.cost, cooldownEndsAt: res.cooldownEndsAt });
      return;
    }
    setPayPrompt(null);
    setErr(friendlyError(res.error || ""));
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, background: "#12121c", border: "1px solid #2a2a40", borderRadius: "18px 18px 0 0", padding: "20px 20px calc(24px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#3a3a52", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 20, fontWeight: 900, color: "#e8e8f0" }}>Pick your name 🟡</div>
        <div style={{ fontSize: 13, color: "#9a9ab0", marginTop: 4, lineHeight: 1.5 }}>
          Free — this is how you show up on the leaderboard, and it becomes your challenge link.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, background: "#0a0a12", border: `1px solid ${localErr ? "#ff6b6b55" : "#2a2a40"}`, borderRadius: 12, padding: "0 12px", height: 54 }}>
          <span style={{ color: "#666", fontWeight: 800, fontFamily: "monospace" }}>@</span>
          <input
            autoFocus
            value={clean}
            onChange={(e) => { setValue(e.target.value); setErr(null); setPayPrompt(null); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="yourname"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={MAX}
            style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: "#e8e8f0", fontSize: 17, fontWeight: 700, fontFamily: "monospace" }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>{clean.length}/{MAX}</span>
        </div>

        <div style={{ minHeight: 18, marginTop: 8, fontSize: 12, color: err || localErr ? "#ff6b6b" : "#666" }}>
          {err || localErr || "lowercase letters, numbers, underscore"}
        </div>

        {payPrompt ? (
          <>
            <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 12, background: "rgba(153,69,255,0.1)", border: "1px solid rgba(153,69,255,0.4)", fontSize: 13, color: "#d8c8ff", lineHeight: 1.5 }}>
              You renamed recently. Rename to <b style={{ color: "#fff" }}>@{clean}</b> now for <b style={{ color: "#14F195" }}>{payPrompt.cost} Credits</b>, or it&apos;s free again in <b>{untilFree(payPrompt.cooldownEndsAt)}</b>.
            </div>
            <button
              onClick={() => submit(true)}
              disabled={busy}
              style={{ width: "100%", height: 52, marginTop: 10, borderRadius: 12, border: "none", fontSize: 16, fontWeight: 900, cursor: busy ? "default" : "pointer", color: "#00110a", background: "linear-gradient(90deg,#14F195,#22d3ee)", opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Renaming…" : `Rename for ${payPrompt.cost} Credits`}
            </button>
            <button onClick={() => setPayPrompt(null)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#777", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              I&apos;ll wait
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => submit()}
              disabled={busy || !!localErr || clean.length < MIN}
              style={{
                width: "100%", height: 52, marginTop: 8, borderRadius: 12, border: "none",
                fontSize: 16, fontWeight: 900, cursor: busy || localErr || clean.length < MIN ? "default" : "pointer",
                color: "#00110a",
                background: busy || localErr || clean.length < MIN ? "#2a3a33" : "linear-gradient(90deg,#14F195,#22d3ee)",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Saving…" : "Save my name"}
            </button>
            <button onClick={onClose} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#777", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Maybe later
            </button>
          </>
        )}
      </div>
    </div>
  );
}
