"use client";

import { useEffect, useState } from "react";

import EmailLoginModal from "../../components/arcade/EmailLoginModal";
import { useIdentity } from "../../lib/identity/useIdentity";

// App getting-started meter (LinkedIn All-Star pattern): progress bar + short steps,
// one-tap where useful, self-retires at 100%. Play is free; this only guides.
export default function AppOnboard() {
  const { user, isSignedIn, refresh } = useIdentity();
  const [flags, setFlags] = useState({ played: false, streak: false, shop: false, wallet: false, native: false, notif: false });
  const [showLogin, setShowLogin] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const recompute = () => {
    try {
      const played = Object.keys(localStorage).some((k) => k.startsWith("gpx_best_"));
      const raw = localStorage.getItem("gpx_streak");
      const streak = raw ? (JSON.parse(raw).n ?? 0) >= 1 : false;
      const shop = localStorage.getItem("gpx_seen_shop") === "1";
      const wallet = Boolean((user as { walletAddress?: string } | null)?.walletAddress) || localStorage.getItem("gpx_wallet_ok") === "1";
      const w = window as unknown as { __GAMERPLEX_NATIVE__?: boolean; __GAMERPLEX_NOTIF__?: string };
      const native = Boolean(w.__GAMERPLEX_NATIVE__);
      const notif = w.__GAMERPLEX_NOTIF__ === "granted";
      setFlags({ played, streak, shop, wallet, native, notif });
      setDismissed(localStorage.getItem("gpx_onboard_done") === "1");
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    recompute();
    const onFocus = () => recompute();
    window.addEventListener("gamerplex:focus", onFocus);
    return () => window.removeEventListener("gamerplex:focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSignedIn]);

  const steps = [
    { done: isSignedIn, icon: "✉️", label: "Sign in to save", action: !isSignedIn },
    { done: flags.played, icon: "🎮", label: "Play a game", hint: "tap one below ↓" },
    ...(flags.native ? [{ done: flags.notif, icon: "🔔", label: "Turn on reminders", hint: "in Settings" }] : []),
    { done: flags.streak, icon: "🔥", label: "Start a daily streak", hint: "play daily" },
    { done: flags.shop, icon: "🛒", label: "Peek at the Shop", hint: "Shop tab" },
    { done: flags.wallet, icon: "👛", label: "Connect a wallet", hint: "Profile · optional" },
  ];
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const complete = done === steps.length;

  if (dismissed) return null;

  const retire = () => {
    try { localStorage.setItem("gpx_onboard_done", "1"); } catch { /* no-op */ }
    setDismissed(true);
  };

  return (
    <>
      <div style={wrap}>
        {complete ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "#fff" }}>You&apos;re all set — have fun!</span>
            <button onClick={retire} style={ghost}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Get started</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#14F195", fontFamily: "ui-monospace,monospace" }}>{pct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 12 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#14F195,#35e0ff)", transition: "width .4s ease" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {steps.map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 9, opacity: s.done ? 0.55 : 1 }}>
                  <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{s.done ? "✓" : s.icon}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: s.done ? "#9a8fc4" : "#e8e2ff", textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                  {!s.done && "action" in s && s.action ? (
                    <button onClick={() => setShowLogin(true)} style={cta}>Sign in</button>
                  ) : !s.done && "hint" in s && s.hint ? (
                    <span style={{ fontSize: 11.5, color: "#8a80b0" }}>{s.hint}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); refresh(); recompute(); }} />
    </>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 520,
  margin: "0 auto 18px",
  background: "linear-gradient(180deg,rgba(153,69,255,0.12),rgba(255,255,255,0.02))",
  border: "1px solid rgba(153,69,255,0.38)",
  borderRadius: 16,
  padding: "16px 16px 14px",
};
const cta: React.CSSProperties = {
  background: "linear-gradient(100deg,#9945ff,#7a2bff)", color: "#fff", fontWeight: 800, fontSize: 12.5,
  border: "none", borderRadius: 9, padding: "6px 13px", cursor: "pointer",
};
const ghost: React.CSSProperties = {
  background: "none", border: "1px solid rgba(255,255,255,0.2)", color: "#cbbfff", fontWeight: 700,
  fontSize: 12.5, borderRadius: 9, padding: "6px 12px", cursor: "pointer",
};
