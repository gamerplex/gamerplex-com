"use client";

// Flipball inside the Gamerplex Arcade Shell. The game (raw three.js + Rapier)
// now runs same-origin — mounted directly via <FlipballGame /> (no iframe, no
// separate subdomain). It emits its score as a `flipball:gameover` window
// CustomEvent that this shell listens for. The shell owns nav + login + the free
// web2 leaderboard save — so flipball needs NO wallet to be ranked. Responsive.

import { useCallback, useEffect, useRef, useState } from "react";
import ShellLeaderboard from "../../../components/arcade/ShellLeaderboard";
import BackToGames from "../../../components/arcade/BackToGames";
import CommunityLinks from "../../../components/CommunityLinks";
import EmailLoginModal from "../../../components/arcade/EmailLoginModal";
import ShellResultScreen from "../../../components/arcade/ShellResultScreen";
import ShareSheet from "../../../components/arcade/ShareSheet";
import ClaimHandleModal from "../../../components/arcade/ClaimHandleModal";
import FlipballGame from "./FlipballGame";
import { getIdentity, getCredits, claimReferral, type IdentityUser } from "../../../lib/identity/client";
import { buildShareUrl, getStoredReferralCode } from "../../../lib/arcade/referral";
import { track } from "../../../lib/analytics";

const PENDING_KEY = "flipball_pending_score";

export default function FlipballShell() {
  const [saved, setSaved] = useState<null | "saving" | "saved" | "signed_out" | "error">(null);
  const [lastScore, setLastScore] = useState<number | null>(null);   // triggers the result overlay
  const [savedBest, setSavedBest] = useState<number | null>(null);   // server-returned personal best
  const [showShare, setShowShare] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const lastRun = useRef<string | null>(null);

  // Web2 identity (email-first) — sign-in is a shell modal here, not just the /?login=1
  // redirect; the score save happens here on the game's flipball:gameover event.
  const [me, setMe] = useState<IdentityUser | null>(null);
  const meRef = useRef<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const refreshIdentity = async () => {
    const u = await getIdentity();
    setMe(u);
    meRef.current = u;
    if (u) {
      const c = await getCredits();
      setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0);
    } else {
      setCredits(null);
    }
  };
  useEffect(() => { void refreshIdentity(); }, []);

  // Submit a flipball score to the free web2 board. Distinguishes the three
  // outcomes HONESTLY (the old code showed "saved" on a network error and never
  // stashed, silently losing the run): 401 → signed_out, non-2xx/network → error.
  // On signed_out OR error we stash the payload so it replays on sign-in (parity
  // with blockwords/chess/snake) — a run is never dropped.
  const submitScore = useCallback((payload: string) => {
    setSaved("saving");
    void fetch("/api/scores/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    })
      .then(async (r) => {
        if (r.status === 401) return { status: "signed_out" as const, best: null };
        if (!r.ok) return { status: "error" as const, best: null };
        const b = await r.json().catch(() => ({}));
        return { status: "saved" as const, best: typeof b?.best === "number" ? b.best : null };
      })
      .catch(() => ({ status: "error" as const, best: null }))
      .then((res) => {
        setSaved(res.status);
        if (res.status === "saved") {
          if (res.best != null) setSavedBest(res.best);
          try { window.localStorage.removeItem(PENDING_KEY); } catch {}
          // A score now exists — re-attempt any pending referral. The route only
          // pays out once BOTH sides are fully onboarded (proof-of-life gate).
          const rc = getStoredReferralCode();
          if (rc && meRef.current) void claimReferral(rc.value);
        } else {
          // signed_out OR transient error — keep the run so sign-in / retry saves it.
          try { window.localStorage.setItem(PENDING_KEY, payload); } catch {}
        }
        track(res.status === "saved" ? "score_save_succeeded" : res.status === "signed_out" ? "login_prompt" : "score_save_failed", { game: "flipball", reason: res.status });
      });
  }, []);

  useEffect(() => {
    const onGameOver = (e: Event) => {
      const d = (e as CustomEvent<{ score: number; durationSec?: number; runId?: string }>).detail;
      if (!d || typeof d.score !== "number") return;
      const refId = d.runId ? `flipball:${d.runId}` : `flipball:${d.score}:${Math.floor(d.durationSec ?? 0)}`;
      if (lastRun.current === refId) return; // de-dupe
      lastRun.current = refId;
      setLastScore(d.score);
      setSavedBest(null);
      track("game_over", { game: "flipball", score: d.score, signed_in: !!meRef.current });
      submitScore(JSON.stringify({ gameId: "flipball", score: d.score, refId, durationSec: d.durationSec }));
    };
    window.addEventListener("flipball:gameover", onGameOver);
    return () => window.removeEventListener("flipball:gameover", onGameOver);
  }, [submitScore]);

  useEffect(() => {
    const onStart = () => { track("game_started", { game: "flipball" }); track("play_started", { game: "flipball" }); };
    window.addEventListener("flipball:gamestart", onStart);
    return () => window.removeEventListener("flipball:gamestart", onStart);
  }, []);

  // Replay a stashed run once the player signs in (they saw "sign in to save",
  // signed in via the modal — now actually save it). Parity with the other games.
  useEffect(() => {
    if (!me) return;
    let pend: string | null = null;
    try { pend = window.localStorage.getItem(PENDING_KEY); } catch {}
    if (pend) submitScore(pend);
  }, [me, submitScore]);

  const closeResult = () => { setLastScore(null); setSaved(null); };

  return (
    <div style={{ minHeight: "100dvh", background: "#0d001a", color: "#e8e8f0", fontFamily: "'Space Grotesk', system-ui, sans-serif", display: "flex", flexDirection: "column", overflowX: "hidden", paddingTop: "calc(56px + env(safe-area-inset-top))", boxSizing: "border-box" }}>
      {/* Fixed nav — consistent with the other arcade games (.top-nav is position:fixed). */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px clamp(12px, 4vw, 20px)", borderBottom: "1px solid rgba(153,69,255,0.2)", background: "rgba(13,0,26,0.85)", backdropFilter: "blur(12px)", boxSizing: "border-box" }}>
        <BackToGames />
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
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />

      {/* THE FOLD — the game fills the viewport below the fixed nav (one comfortable
          screen tall). The leaderboard flows just below it (reached by a short scroll). */}
      <div style={{ height: "calc(100dvh - 56px - env(safe-area-inset-top))", minHeight: 420, display: "flex", flexDirection: "column", padding: "10px clamp(12px, 3vw, 20px)", boxSizing: "border-box" }}>
        <div style={{ flex: 1, minHeight: 0, position: "relative", maxWidth: 640, width: "100%", margin: "0 auto", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)", background: "#000" }}>
          <FlipballGame />

          {/* Canonical Arcade Shell game-over — matches Blockwords. Overlays the game
              area; the game's own reset drives Play again (we just clear the overlay). */}
          {lastScore !== null && (
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(165deg, #4a2ea0 0%, #7b3ff2 60%, #b13bd8 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "26px 20px calc(24px + env(safe-area-inset-bottom))", overflowY: "auto" }}>
              <ShellResultScreen
                theme="gradient"
                headline="🎱 Game over!"
                score={lastScore}
                saveStatus={saved ?? "saving"}
                best={savedBest}
                credits={credits}
                onPlayAgain={closeResult}
                onSignIn={() => setShowLogin(true)}
                onShare={() => setShowShare(true)}
                shareLabel="🔗 Challenge"
                needsHandle={!!me && !me.handle}
                onClaimName={() => setShowClaim(true)}
                arcadeHref="/#featured"
              />

              <div style={{ width: "100%", maxWidth: 460, marginTop: 20, zIndex: 1 }}>
                <ShellLeaderboard gameId="flipball" highlightUserId={me?.id} selfScore={lastScore} selfHandle={me?.handle} />
              </div>

              <div style={{ marginTop: 18, zIndex: 1 }}>
                <CommunityLinks tone="light" />
              </div>
            </div>
          )}
        </div>
      </div>

      <ShareSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        text={`🎱 FLIPBALL — I scored ${(lastScore ?? 0).toLocaleString()}! Can you beat it?`}
        url={buildShareUrl("https://gamerplex.com/play/flipball", me?.id)}
      />
      <ClaimHandleModal open={showClaim} onClose={() => setShowClaim(false)} onClaimed={() => { setShowClaim(false); void refreshIdentity(); }} />

      {/* The shared leaderboard — below the fold, full-width, no vw sizing. */}
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", padding: "8px clamp(12px, 3vw, 20px) calc(24px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <ShellLeaderboard gameId="flipball" />
      </div>
    </div>
  );
}
