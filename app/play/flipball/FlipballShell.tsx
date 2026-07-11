"use client";

// Flipball inside the Gamerplex Arcade Shell. The game (raw three.js + Rapier)
// runs same-origin — mounted directly via <FlipballGame /> (no iframe, no separate
// subdomain). It emits its score as a `flipball:gameover` window CustomEvent that
// this shell listens for. The shell owns nav + login + the free web2 leaderboard
// save — so flipball needs NO wallet to be ranked. Fully responsive.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShellLeaderboard from "../../../components/arcade/ShellLeaderboard";
import CommunityLinks from "../../../components/CommunityLinks";
import EmailLoginModal from "../../../components/arcade/EmailLoginModal";
import FlipballGame from "./FlipballGame";
import { getIdentity, getCredits, type IdentityUser } from "../../../lib/identity/client";

export default function FlipballShell() {
  const [saved, setSaved] = useState<null | "saving" | "saved" | "signed_out">(null);
  const lastRun = useRef<string | null>(null);

  // Web2 identity (email-first) — sign-in is a shell modal here, not just the /?login=1
  // redirect; the score save happens here on the game's flipball:gameover event.
  const [me, setMe] = useState<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const refreshIdentity = async () => {
    const u = await getIdentity();
    setMe(u);
    if (u) {
      const c = await getCredits();
      setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0);
    } else {
      setCredits(null);
    }
  };
  useEffect(() => { void refreshIdentity(); }, []);

  useEffect(() => {
    const onGameOver = (e: Event) => {
      const d = (e as CustomEvent<{ score: number; durationSec?: number }>).detail;
      if (!d || typeof d.score !== "number") return;
      const refId = `flipball:${d.score}:${Math.floor(d.durationSec ?? 0)}`;
      if (lastRun.current === refId) return; // de-dupe
      lastRun.current = refId;
      setSaved("saving");
      void fetch("/api/scores/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "flipball", score: d.score, refId, durationSec: d.durationSec }),
      })
        .then((r) => setSaved(r.status === 401 ? "signed_out" : "saved"))
        .catch(() => setSaved("saved"));
    };
    window.addEventListener("flipball:gameover", onGameOver);
    return () => window.removeEventListener("flipball:gameover", onGameOver);
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#0d001a", color: "#e8e8f0", fontFamily: "'Space Grotesk', system-ui, sans-serif", display: "flex", flexDirection: "column", overflowX: "hidden", paddingTop: "calc(56px + env(safe-area-inset-top))", boxSizing: "border-box" }}>
      {/* Fixed nav — consistent with the other arcade games (.top-nav is position:fixed). */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px clamp(12px, 4vw, 20px)", borderBottom: "1px solid rgba(153,69,255,0.2)", background: "rgba(13,0,26,0.85)", backdropFilter: "blur(12px)", boxSizing: "border-box" }}>
        <Link href="/" style={{ fontWeight: 900, letterSpacing: 1, color: "#e8e8f0", textDecoration: "none" }}>GAMERPLEX</Link>
        <span style={{ fontWeight: 800, color: "#b388ff", letterSpacing: 2 }}>FLIPBALL</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CommunityLinks compact />
          {me ? (
            <a
              href="/profile"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(153,69,255,0.4)", background: "rgba(153,69,255,0.12)", color: "#e8e8f0", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
            >
              <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.handle || me.email?.split("@")[0] || "you"}</span>
              {credits != null && <span style={{ color: "#14F195", fontWeight: 800 }}>⚡{credits}</span>}
            </a>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              style={{ height: 32, padding: "0 16px", borderRadius: 99, border: "1px solid rgba(153,69,255,0.4)", background: "rgba(153,69,255,0.10)", color: "#e8e8f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Sign in
            </button>
          )}
          <Link href="/#featured" style={{ fontSize: 12, color: "#b0b0c8", textDecoration: "none" }}>← Arcade</Link>
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />

      {/* THE FOLD — the game fills the viewport below the fixed nav (one comfortable
          screen tall). The leaderboard flows just below it (reached by a short scroll). */}
      <div style={{ height: "calc(100dvh - 56px - env(safe-area-inset-top))", minHeight: 420, display: "flex", flexDirection: "column", padding: "10px clamp(12px, 3vw, 20px)", boxSizing: "border-box" }}>
        <div style={{ flex: 1, minHeight: 0, position: "relative", maxWidth: 640, width: "100%", margin: "0 auto", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)", background: "#000" }}>
          <FlipballGame />
        </div>
        {saved && (
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {saved === "saving" && <span style={{ color: "#888" }}>Saving to leaderboard…</span>}
            {saved === "saved" && <span style={{ color: "#14F195" }}>✓ Saved to leaderboard · 🔥 come back tomorrow to keep your streak</span>}
            {saved === "signed_out" && <a href="/?login=1" style={{ color: "#000", background: "linear-gradient(90deg,#9945FF,#14F195)", padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}>Sign in to save your score & rank →</a>}
          </div>
        )}
      </div>

      {/* The shared leaderboard — below the fold, full-width, no vw sizing. */}
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", padding: "8px clamp(12px, 3vw, 20px) calc(24px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <ShellLeaderboard gameId="flipball" />
      </div>
    </div>
  );
}
