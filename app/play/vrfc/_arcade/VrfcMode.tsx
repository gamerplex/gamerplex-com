"use client";

// VRFC — Arcade-Shell wrapper. Follows the shell standard shared by
// blockwords/cyber-snake/magic-chess/flipball: web2 identity + Credits chip,
// stash-then-save score (never drop a run), ShellResultScreen game-over with
// ShellLeaderboard + ShareSheet (stable-userId referral links), shared juice.
// Chrome (ready/nav/game-over) uses the shared liquid-glass style so VRFC reads
// as one family with home; the live fight canvas stays immersive (not frosted).
// The WebGPU fight lives in _game/vrfc.ts. game slug = "vrfc" (a numeric
// game_id for on-chain is assigned at the mainnet ceremony — web2 works now).

import { useCallback, useEffect, useRef, useState } from "react";
import CommunityLinks from "../../../../components/CommunityLinks";
import ShellResultScreen from "../../../../components/arcade/ShellResultScreen";
import BackToGames from "../../../../components/arcade/BackToGames";
import ShellLeaderboard from "../../../../components/arcade/ShellLeaderboard";
import ShareSheet from "../../../../components/arcade/ShareSheet";
import GoPlusModal from "../../../../components/arcade/GoPlusModal";
import ClaimHandleModal from "../../../../components/arcade/ClaimHandleModal";
import EmailLoginModal from "../../../../components/arcade/EmailLoginModal";
import { sfxRung, sfxInvalid, sfxMilestone, sfxGameOver, haptic, isMuted, setMuted } from "../../../../lib/arcade/juice";
import { track, identifyWallet } from "../../../../lib/analytics";
import { getIdentity, getCredits, earnCredits, claimReferral, type IdentityUser } from "../../../../lib/identity/client";
import { buildShareUrl, getStoredReferralCode } from "../../../../lib/arcade/referral";
import { GLASS_CSS, glassPanel, GREEN } from "../../../../components/glass";
// On-chain arcade parity with the sibling games (cyber-snake/blockwords).
import { submitReplayFireAndForget, openSession } from "@gamerplex/sdk/arcade";
import type { PublicKey } from "@solana/web3.js";
import { EconomyConsentModal, hasEconomyConsent } from "../../../../lib/arcade/economy-gate";
import { VrfcGame, type HudState, type StrikeId } from "../_game/vrfc";
import { seedFrom } from "../_game/frame";

type Phase = "ready" | "playing" | "over";

const PENDING_KEY = "vrfc_pending_score";
const OPP_NAME = "RAVAN";

// VRFC's numeric on-chain game_id is assigned at the mainnet ceremony. Until it
// exists the on-chain save path below is HARD-GATED off (never faked, never
// shown as verified) — the web2 save is the live path. On ceremony day: set the
// id + pass the connected wallet; the flow already mirrors the sibling games
// (consent gate → identifyWallet → openSession → score tx → replay submit).
const VRFC_ONCHAIN_GAME_ID: number | null = null;

const HUD0: HudState = { phase: "fighting", score: 0, round: 1, roundTime: 60, playerHp: 100, oppHp: 100, stamina: 100, combo: 0, playerRounds: 0, oppRounds: 0, banner: "", win: false };

export default function VrfcMode() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<VrfcGame | null>(null);
  const runSeedRef = useRef<string>("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<HudState>(HUD0);
  const startedAt = useRef<number>(0);
  const endedHandled = useRef(false);
  const [flash, setFlash] = useState(0); // KO white-flash key
  const [flowFlash, setFlowFlash] = useState(0); // combo-chain edge-glow key
  const [showEconomyGate, setShowEconomyGate] = useState(false); // $GAME consent (§F)

  // Web2 identity (email-first, no wallet) — the shell standard.
  const [me, setMe] = useState<IdentityUser | null>(null);
  const meRef = useRef<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [savedBest, setSavedBest] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "signed_out" | "error">("signed_out");
  const [showLogin, setShowLogin] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [muted, setMutedState] = useState(true);
  useEffect(() => { setMutedState(isMuted()); }, []);
  const toggleMute = useCallback(() => { const m = !isMuted(); setMuted(m); setMutedState(m); }, []);

  const refreshIdentity = useCallback(async () => {
    const u = await getIdentity();
    setMe(u);
    meRef.current = u;
    if (u) {
      const c = await getCredits();
      setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0);
    } else setCredits(null);
    return u;
  }, []);

  // Magic-link round-trip: replay a stashed score once signed in; clear only on 2xx.
  useEffect(() => {
    void (async () => {
      const u = await refreshIdentity();
      if (u && typeof window !== "undefined") {
        const pend = window.localStorage.getItem(PENDING_KEY);
        if (pend) {
          try {
            const res = await fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: pend });
            if (res.ok) window.localStorage.removeItem(PENDING_KEY);
          } catch { /* keep stash for the next attempt */ }
        }
      }
    })();
  }, [refreshIdentity]);

  // Web2 save — stash up-front so a run is NEVER lost; clear only on confirmed 2xx.
  // The UI status reflects the REAL request outcome (not just login state), and
  // every outcome is tracked so save reliability is visible in PostHog.
  const saveScore = useCallback((score: number, durationSec: number) => {
    const signedIn = !!meRef.current;
    const payload = JSON.stringify({ gameId: "vrfc", score, refId: `vrfc:${runSeedRef.current}`, durationSec });
    try { if (typeof window !== "undefined") window.localStorage.setItem(PENDING_KEY, payload); } catch {}
    if (!signedIn) { setSaveState("signed_out"); track("score_save_deferred", { game: "vrfc", score, reason: "signed_out" }); return; }
    setSaveState("saving");
    track("score_save_attempted", { game: "vrfc", score, duration_sec: durationSec });
    void fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then(async (res) => {
        const b = res.ok ? await res.json().catch(() => null) : null;
        if (!res.ok || !b) {
          const err = res.ok ? "bad_body" : await res.json().then((j) => j?.error).catch(() => `http_${res.status}`);
          setSaveState("error");
          track("score_save_failed", { game: "vrfc", score, status: res.status, error: err }); // leave stash for retry
          return;
        }
        try { if (typeof window !== "undefined") window.localStorage.removeItem(PENDING_KEY); } catch {}
        if (typeof b.best === "number") setSavedBest(b.best);
        setSaveState("saved");
        track("score_save_succeeded", { game: "vrfc", score, best: b.best ?? null, was_best: b.best === score });
        const rc = getStoredReferralCode();
        if (rc) void claimReferral(rc.value);
      })
      .catch((e) => { setSaveState("error"); track("score_save_failed", { game: "vrfc", score, status: 0, error: String(e?.message || e) }); });
  }, []);

  const onEvent = useCallback((e: string) => {
    switch (e) {
      case "hit": sfxRung(1); haptic("rung"); break;
      case "flow": sfxRung(2); setFlowFlash((f) => f + 1); break; // chained combo link landed
      case "block": sfxRung(0); break;
      case "hurt": sfxInvalid(); haptic("invalid"); break;
      case "gassed": sfxInvalid(); break;
      case "round": sfxMilestone(); haptic("milestone"); break;
      case "ko": sfxMilestone(); haptic("gameover"); setFlash((f) => f + 1); break;
      case "win": sfxGameOver(true); break;
      case "lose": sfxGameOver(false); haptic("gameover"); break;
    }
  }, []);

  // On-chain save — ceremony-ready structure, HARD-GATED behind the missing
  // game_id (tracks the gate, does zero chain work; the web2 save is live).
  // Ceremony day: assign VRFC_ONCHAIN_GAME_ID + pass the connected wallet.
  const saveOnChain = useCallback(async (wallet: { publicKey: PublicKey } | null) => {
    if (VRFC_ONCHAIN_GAME_ID === null) {
      track("onchain_save_gated", { game: "vrfc", reason: "no_game_id" });
      return;
    }
    if (!hasEconomyConsent()) { setShowEconomyGate(true); return; }
    if (!wallet) return;
    identifyWallet(wallet.publicKey.toBase58());
    // Same shape as cyber-snake/blockwords: open the session, send the score tx
    // (payment + submit ixs via the arcade program), then stream the replay.
    const session = await openSession({ player: wallet.publicKey, gameId: VRFC_ONCHAIN_GAME_ID });
    track("onchain_session_opened", { game: "vrfc", session: session.sessionPda.toBase58() });
    // score tx + submitReplayFireAndForget(sig, moveLog) land here at ceremony.
    void submitReplayFireAndForget;
  }, []);

  const onState = useCallback((s: HudState) => {
    setHud(s);
    if (s.phase === "over" && !endedHandled.current) {
      endedHandled.current = true;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      track("game_over", { game: "vrfc", score: s.score, win: s.win, rounds: `${s.playerRounds}-${s.oppRounds}`, signed_in: !!meRef.current });
      if (s.win) void earnCredits("game_win", `vrfc:win:${runSeedRef.current}`);
      saveScore(s.score, durationSec);
      void saveOnChain(null); // gated no-op until the mainnet ceremony assigns a game_id
      setPhase("over");
    }
  }, [saveScore, saveOnChain]);

  // begin() flips phase → the canvas mounts → the start effect below runs.
  const begin = useCallback(() => {
    gameRef.current?.dispose();
    gameRef.current = null;
    const runSeed = `vrfc:${Math.floor(Date.now() / 1000)}-${Math.floor(performance.now())}`;
    runSeedRef.current = runSeed;
    startedAt.current = Date.now();
    endedHandled.current = false;
    setSavedBest(null);
    setSaveState(meRef.current ? "saving" : "signed_out");
    setHud(HUD0);
    setPhase("playing");
    track("game_started", { game: "vrfc", seed: runSeed });
    track("play_started", { game: "vrfc" });
  }, []);

  useEffect(() => {
    if (phase !== "playing" || gameRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new VrfcGame(seedFrom(runSeedRef.current), onState, onEvent);
    gameRef.current = g;
    g.start(canvas).catch((err) => console.error("vrfc start failed", err));
  }, [phase, onState, onEvent]);

  useEffect(() => () => { gameRef.current?.dispose(); gameRef.current = null; }, []);

  const inRun = phase === "playing" || phase === "over";
  const strike = (id: StrikeId, height?: "up" | "down") => gameRef.current?.strike(id, height);
  const kickStartY = useRef(0);

  const shareText = hud.win
    ? `🥊 VRFC — won ${hud.playerRounds}-${hud.oppRounds} vs ${OPP_NAME} · ${hud.score.toLocaleString()} pts. The art of eight limbs. Think you can take me?`
    : `🥊 VRFC — ${hud.score.toLocaleString()} pts vs ${OPP_NAME}. The art of eight limbs. Avenge me?`;

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#07060f",
        color: "#fff",
        fontFamily: "'Space Grotesk', sans-serif",
        overflowX: "hidden",
        ...(inRun ? { height: "100dvh", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", paddingTop: "calc(64px + env(safe-area-inset-top))", boxSizing: "border-box" } : {}),
      }}
    >
      <style>{GLASS_CSS}</style>
      {/* liquid-glass Solana field — only on the chrome screens; the live fight
          keeps the immersive canvas behind it. */}
      {!inRun && <div className="gl-bg" aria-hidden="true" />}

      {/* NOTE: no inline display:flex on the <nav> itself — a global mobile
          rule (globals.css) force-stretches inline-flex navs to flex-basis:100%,
          which in this column layout would eat the whole screen. The flex row
          lives on the inner div instead. */}
      <nav style={{ position: "relative", zIndex: 1, ...glassPanel, margin: inRun ? 0 : "12px 12px 0", borderRadius: inRun ? 0 : 18, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BackToGames />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#ff5b7b", fontWeight: 800, letterSpacing: 2 }}>🥊 VRFC</span>
            <button onClick={toggleMute} aria-label={muted ? "unmute sound" : "mute sound"} style={{ height: 32, width: 32, borderRadius: 99, border: "1px solid rgba(255,255,255,0.26)", background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>
              {muted ? "🔇" : "🔊"}
            </button>
            {me ? (
              <a href="/profile" className="gl-user">
                <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.handle || me.email?.split("@")[0] || "you"}</span>
                {credits != null && <span style={{ color: GREEN, fontWeight: 800 }}>⚡{credits}</span>}
              </a>
            ) : (
              <button
                onClick={() => { setShowLogin(true); track("login_prompt", { game: "vrfc", source: "nav" }); }}
                className="gl-signin"
              >Sign in</button>
            )}
          </div>
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />
      {/* §F consent gate — only reachable once the on-chain path un-gates. */}
      {showEconomyGate && <EconomyConsentModal onAccept={() => setShowEconomyGate(false)} onClose={() => setShowEconomyGate(false)} />}

      {/* ---------- IN-RUN: canvas + HUD ---------- */}
      {inRun ? (
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

          {phase === "playing" && (
            <>
              {/* fight HUD: hp bars angled to center, round + timer between */}
              <div style={{ position: "absolute", top: 8, left: 10, right: 10, display: "flex", alignItems: "flex-start", gap: 8, pointerEvents: "none", fontFamily: "monospace" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(11px,3vw,14px)", fontWeight: 900 }}>
                    <span style={{ color: "#14F195" }}>YOU {"●".repeat(hud.playerRounds)}</span>
                  </div>
                  <div style={{ height: 12, background: "rgba(255,255,255,0.12)", borderRadius: 7, overflow: "hidden", border: "1px solid rgba(20,241,149,0.35)" }}>
                    <div style={{ width: `${hud.playerHp}%`, height: "100%", background: hud.playerHp < 30 ? "#ff5b7b" : "linear-gradient(90deg,#0fca7a,#14F195)", transition: "width 140ms linear" }} />
                  </div>
                  <div style={{ height: 6, marginTop: 3, width: "70%", background: "rgba(255,255,255,0.10)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${hud.stamina}%`, height: "100%", background: "#ffd24a", transition: "width 100ms linear" }} />
                  </div>
                  <div style={{ fontSize: "clamp(12px,3.4vw,16px)", fontWeight: 900, color: "#ffd24a", marginTop: 2 }}>{hud.score.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "center", minWidth: 64 }}>
                  <div style={{ fontSize: "clamp(16px,5vw,24px)", fontWeight: 900, color: hud.roundTime < 11 ? "#ff5b7b" : "#e8e8f0" }}>{Math.ceil(hud.roundTime)}</div>
                  <div style={{ fontSize: 11, color: "#9fb0d0", fontWeight: 800, letterSpacing: 1 }}>ROUND {hud.round}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "clamp(11px,3vw,14px)", fontWeight: 900 }}>
                    <span style={{ color: "#ff5b7b" }}>{"●".repeat(hud.oppRounds)} {OPP_NAME}</span>
                  </div>
                  <div style={{ height: 12, background: "rgba(255,255,255,0.12)", borderRadius: 7, overflow: "hidden", border: "1px solid rgba(255,91,123,0.35)", transform: "scaleX(-1)" }}>
                    <div style={{ width: `${hud.oppHp}%`, height: "100%", background: "linear-gradient(90deg,#b43bff,#ff5b7b)", transition: "width 140ms linear" }} />
                  </div>
                </div>
              </div>

              {/* combo counter — big, escalating */}
              {hud.combo >= 2 && (
                <div style={{ position: "absolute", top: "18%", left: 0, right: 0, textAlign: "center", pointerEvents: "none", fontFamily: "monospace" }}>
                  <div style={{ fontSize: "clamp(22px,7vw,40px)", fontWeight: 900, color: "#ffd24a", textShadow: "0 0 18px rgba(255,210,74,0.8)" }}>{hud.combo} HIT COMBO</div>
                </div>
              )}

              {/* round banner — huge, unmissable */}
              {hud.banner && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: "clamp(40px,13vw,90px)", fontWeight: 900, fontFamily: "monospace", letterSpacing: 4, color: hud.banner === "FIGHT!" || hud.banner === "KO!" ? "#ff5b7b" : "#e8e8f0", textShadow: "0 0 34px rgba(255,60,100,0.9)", animation: "vrfcBanner 0.4s ease-out" }}>
                    {hud.banner}
                  </div>
                </div>
              )}

              {/* KO white flash */}
              {flash > 0 && <div key={flash} style={{ position: "absolute", inset: 0, background: "#fff", pointerEvents: "none", animation: "vrfcFlash 0.55s ease-out forwards" }} />}

              {/* combo-flow edge glow — a golden screen-edge pulse per chained link */}
              {flowFlash > 0 && <div key={`fl${flowFlash}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 90px 12px rgba(255,210,74,0.55)", animation: "vrfcFlow 0.45s ease-out forwards" }} />}

              {/* desktop key-legend — compact translucent chips, bottom-center,
                  hidden on touch (mobile has on-screen buttons). Matches the map. */}
              <div className="vrfc-legend" style={{ position: "absolute", bottom: "calc(10px + env(safe-area-inset-bottom))", left: 0, right: 0, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 5, pointerEvents: "none", opacity: 0.62, fontFamily: "monospace", fontSize: 11, padding: "0 12px" }}>
                {[
                  ["WASD / ↑↓←→", "move · circle"], ["J", "jab"], ["J·J·J·J", "flow combo"], ["K", "cross"], ["L", "hook"],
                  ["U", "elbow"], ["I", "knee"], ["O", "kick"], ["W+O", "head kick"], ["S+O", "low kick"], ["SPACE", "block"], ["SHIFT", "dodge"],
                ].map(([key, act]) => (
                  <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "3px 7px" }}>
                    <b style={{ color: "#ffd24a" }}>{key}</b><span style={{ color: "#cfd8ea" }}>{act}</span>
                  </span>
                ))}
              </div>

              {/* mobile touch controls — left: d-pad (advance/retreat + circle) +
                  block/dodge · right: 6-strike cluster. Hidden on desktop. */}
              <div className="vrfc-touch" style={{ position: "absolute", bottom: "calc(12px + env(safe-area-inset-bottom))", left: 10, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...ctrlBtn, color: "#7fd7ff", borderColor: "rgba(127,215,255,0.5)" }}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setBlock(true); }}
                    onPointerUp={() => gameRef.current?.setBlock(false)}
                    onPointerLeave={() => gameRef.current?.setBlock(false)}
                  >🛡 BLOCK</button>
                  <button style={{ ...ctrlBtn, color: "#b388ff", borderColor: "rgba(179,136,255,0.5)" }}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.dodge(); }}
                  >💨 DODGE</button>
                </div>
                {/* 4-way mini d-pad: ▲▼ advance/retreat · ◀▶ circle */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gridTemplateRows: "repeat(2, 44px)", gap: 4 }}>
                  <span />
                  <button style={{ ...dpadBtn }}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setAdvance(1); }}
                    onPointerUp={() => gameRef.current?.setAdvance(0)}
                    onPointerLeave={() => gameRef.current?.setAdvance(0)}
                  >▲</button>
                  <span />
                  <button style={{ ...dpadBtn }}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setCircle(-1); }}
                    onPointerUp={() => gameRef.current?.setCircle(0)}
                    onPointerLeave={() => gameRef.current?.setCircle(0)}
                  >◀</button>
                  <button style={{ ...dpadBtn }}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setAdvance(-1); }}
                    onPointerUp={() => gameRef.current?.setAdvance(0)}
                    onPointerLeave={() => gameRef.current?.setAdvance(0)}
                  >▼</button>
                  <button style={{ ...dpadBtn }}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setCircle(1); }}
                    onPointerUp={() => gameRef.current?.setCircle(0)}
                    onPointerLeave={() => gameRef.current?.setCircle(0)}
                  >▶</button>
                </div>
              </div>
              <div className="vrfc-touch" style={{ position: "absolute", bottom: "calc(12px + env(safe-area-inset-bottom))", right: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, pointerEvents: "none" }}>
                {([["JAB", "jab"], ["CROSS", "cross"], ["HOOK", "hook"], ["ELBOW", "elbow"], ["KNEE", "knee"]] as [string, StrikeId][]).map(([label, id]) => (
                  <button key={id} style={{ ...ctrlBtn, color: "#14F195", borderColor: "rgba(20,241,149,0.5)", padding: "12px 10px", fontSize: 13 }}
                    onPointerDown={(e) => { e.preventDefault(); strike(id); }}
                  >{label}</button>
                ))}
                {/* KICK: swipe UP on the button = head kick, DOWN = low kick, tap = body */}
                <button style={{ ...ctrlBtn, color: "#ff9f4a", borderColor: "rgba(255,159,74,0.6)", padding: "12px 10px", fontSize: 13, touchAction: "none" }}
                  onPointerDown={(e) => { e.preventDefault(); kickStartY.current = e.clientY; }}
                  onPointerUp={(e) => {
                    const dy = kickStartY.current - e.clientY;
                    strike("kick", dy > 22 ? "up" : dy < -22 ? "down" : undefined);
                  }}
                >↕KICK</button>
              </div>
              <style>{`@keyframes vrfcBanner{0%{transform:scale(1.6);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes vrfcFlash{0%{opacity:0.85}100%{opacity:0}}@keyframes vrfcFlow{0%{opacity:1}100%{opacity:0}}@media (pointer:coarse){.vrfc-legend{display:none!important}}@media (hover:hover) and (pointer:fine){.vrfc-touch{display:none!important}}`}</style>
            </>
          )}

          {/* game-over overlay — canonical ShellResultScreen in a glass panel */}
          {phase === "over" && (
            <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "radial-gradient(85% 55% at 22% 0%, rgba(153,69,255,0.28) 0%, transparent 60%), radial-gradient(95% 60% at 78% 112%, rgba(20,241,149,0.18) 0%, transparent 64%), rgba(7,6,15,0.82)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 12px calc(28px + env(safe-area-inset-bottom))" }}>
              <div style={{ ...glassPanel, borderRadius: 24, padding: "22px 16px", width: "100%", maxWidth: 440, boxSizing: "border-box" }}>
              <ShellResultScreen
                theme="dark"
                headline={hud.win ? `🏆 VICTORY — ${hud.playerRounds}-${hud.oppRounds}` : `💀 DEFEAT — ${hud.playerRounds}-${hud.oppRounds}`}
                win={hud.win}
                score={hud.score}
                extraStat={<>🥊 vs {OPP_NAME} · round {hud.round} · best-of-3</>}
                saveStatus={saveState}
                best={savedBest}
                credits={credits}
                onRetrySave={() => saveScore(hud.score, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))}
                onPlayAgain={begin}
                onSignIn={() => { setShowLogin(true); track("login_prompt", { game: "vrfc", source: "gameover" }); }}
                onShare={() => { setShowShare(true); track("share_open", { game: "vrfc" }); }}
                shareLabel="🔗 Challenge"
                needsHandle={!!me && !me.handle}
                onClaimName={() => setShowClaim(true)}
                arcadeHref="/arcade"
                onGoPlus={() => { setShowPlus(true); track("plus_opened", { source: "gameover", game: "vrfc" }); }}
              />
              </div>

              <ShareSheet
                open={showShare}
                onClose={() => setShowShare(false)}
                text={shareText}
                url={buildShareUrl("https://gamerplex.com/play/vrfc", me?.id)}
                onShared={(m) => track("share_result", { game: "vrfc", method: m })}
              />
              <GoPlusModal open={showPlus} onClose={() => setShowPlus(false)} source="gameover" />
              <ClaimHandleModal open={showClaim} onClose={() => setShowClaim(false)} onClaimed={() => { setShowClaim(false); void refreshIdentity(); }} />

              <div style={{ ...glassPanel, borderRadius: 20, padding: 16, width: "100%", maxWidth: 460, marginTop: 16, boxSizing: "border-box" }}>
                <ShellLeaderboard gameId="vrfc" highlightUserId={me?.id} selfScore={hud.score} selfHandle={me?.handle} />
              </div>
              <div style={{ marginTop: 16 }}><CommunityLinks tone="dark" /></div>
            </div>
          )}
        </div>
      ) : (
        /* ---------- READY: start screen (liquid glass) ---------- */
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "clamp(20px,5vw,40px) 16px 32px" }}>
          <div style={{ ...glassPanel, borderRadius: 26, padding: "clamp(22px,5vw,34px) clamp(18px,5vw,30px)", textAlign: "center" }}>
            <div style={{ fontSize: "clamp(34px,9vw,56px)", fontWeight: 900, background: "linear-gradient(90deg,#ff5b7b,#ffd24a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>VRFC</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.66)", fontWeight: 700, letterSpacing: 3, marginTop: 2 }}>VIRTUAL REALITY FIGHTING CHAMPIONSHIP</div>
            <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 15, lineHeight: 1.55, marginTop: 14 }}>
              Muay Thai — <b style={{ color: "#ffd24a" }}>the art of eight limbs</b>. Step into the ring against <b style={{ color: "#ff5b7b" }}>{OPP_NAME}</b>, best of 3 rounds.
              Fists are fast, <b style={{ color: GREEN }}>kicks, knees and elbows hit hard</b> but cost stamina. <b style={{ color: "#7fd7ff" }}>Block</b> to soak damage,{" "}
              <b style={{ color: "#b388ff" }}>dodge</b> to slip a strike clean.{" "}
              <b style={{ color: "#ffd24a" }}>Tap punch in rhythm to FLOW a combination</b> — jab → cross → hook → uppercut — faster and harder with every link. Finish with a <b style={{ color: "#ff5b7b" }}>KO</b> for the big bonus.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", margin: "16px 0 8px", flexWrap: "wrap", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              <span>🥊 flow combos = score</span><span>⚡ heavy strikes drain stamina</span><span>💀 KO = +500</span>
            </div>
            <button
              onClick={begin}
              style={{ marginTop: 16, padding: "16px 44px", fontSize: 18, fontWeight: 900, color: "#1a0308", background: "linear-gradient(90deg,#ff5b7b,#ffd24a)", border: "none", borderRadius: 14, cursor: "pointer", boxShadow: "0 12px 40px rgba(255,91,123,0.35), inset 0 1px 0 rgba(255,255,255,0.5)" }}
            >🥊 FIGHT</button>
            <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              desktop: <b>W/S</b> or <b>↑↓</b> advance/retreat · <b>A/D</b> or <b>←→</b> circle the opponent<br />
              <b>J</b> jab · <b>K</b> cross · <b>L</b> hook · <b>U</b> elbow · <b>I</b> knee · <b>O</b> kick · <b>SPACE</b> block (hold) · <b>SHIFT</b> dodge<br />
              tap <b style={{ color: "#ffd24a" }}>J·J·J·J</b> in rhythm = <b style={{ color: "#ffd24a" }}>flow combo</b> (jab→cross→hook→uppercut) — a kick in rhythm caps it<br />
              hold <b style={{ color: "#ff9f4a" }}>W</b>+kick = <b style={{ color: "#ff9f4a" }}>head kick</b> · hold <b>S</b>+kick = <b>low kick</b> · mobile: tap JAB in rhythm, swipe the KICK button up/down
            </div>
          </div>
          <div style={{ marginTop: 24, textAlign: "center" }}><CommunityLinks tone="dark" /></div>
        </div>
      )}
    </div>
  );
}

const ctrlBtn: React.CSSProperties = {
  padding: "14px 16px",
  fontSize: 14,
  fontWeight: 800,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 12,
  color: "#fff",
  userSelect: "none",
  touchAction: "none",
  pointerEvents: "auto",
};

const dpadBtn: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 10,
  color: "#fff",
  userSelect: "none",
  touchAction: "none",
  pointerEvents: "auto",
};
