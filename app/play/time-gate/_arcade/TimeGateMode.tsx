"use client";

// Time Gate — Arcade-Shell wrapper. Follows the shell standard shared by
// vrfc/blockwords/cyber-snake: fixed-fold mobile shell, web2 identity chip +
// inline EmailLoginModal (no navigation), stash-then-save score, canonical
// ShellResultScreen game-over + ShellLeaderboard + ShareSheet, CommunityLinks,
// shared juice. The WebGPU game lives in _game/timeGate.ts. game slug =
// "time-gate" (numeric GAME_ID=7 for on-chain, registered at the mainnet
// ceremony — web2 leaderboard works now).

import { useCallback, useEffect, useRef, useState } from "react";
import CommunityLinks from "../../../../components/CommunityLinks";
import ShellResultScreen from "../../../../components/arcade/ShellResultScreen";
import BackToGames from "../../../../components/arcade/BackToGames";
import ShellLeaderboard from "../../../../components/arcade/ShellLeaderboard";
import EmailLoginModal from "../../../../components/arcade/EmailLoginModal";
import ShareSheet from "../../../../components/arcade/ShareSheet";
import { sfxRung, sfxInvalid, sfxMilestone, sfxGameOver, haptic } from "../../../../lib/arcade/juice";
import { track } from "../../../../lib/analytics";
import { getIdentity, getCredits, type IdentityUser } from "../../../../lib/identity/client";
import { buildShareUrl } from "../../../../lib/arcade/referral";
import { TimeGateGame, type HudState } from "../_game/timeGate";
import { seedFrom } from "../_game/frame";

type Phase = "ready" | "playing" | "over";

const HUD0: HudState = { phase: "playing", score: 0, timeLeft: 30, hull: 100, boost: 100, gates: 0, level: 1, loop: false, loopProgress: 0, lastNum: 0, pattern: "PRIMES" };

const PENDING_KEY = "time-gate_pending_score";

export default function TimeGateMode() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TimeGateGame | null>(null);
  const runSeedRef = useRef<string>("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<HudState>(HUD0);
  const startedAt = useRef<number>(0);
  const endedHandled = useRef(false);
  const [showShare, setShowShare] = useState(false);

  // Web2 identity (email-first, no wallet) — the shell standard.
  const [me, setMe] = useState<IdentityUser | null>(null);
  const meRef = useRef<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [savedBest, setSavedBest] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "signed_out" | "error">("signed_out");
  const [showLogin, setShowLogin] = useState(false);

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
  const saveScore = useCallback((score: number, durationSec: number) => {
    const signedIn = !!meRef.current;
    const payload = JSON.stringify({ gameId: "time-gate", score, refId: `time-gate:${runSeedRef.current}`, durationSec });
    try { if (typeof window !== "undefined") window.localStorage.setItem(PENDING_KEY, payload); } catch {}
    if (!signedIn) { setSaveState("signed_out"); track("score_save_deferred", { game: "time-gate", score, reason: "signed_out" }); return; }
    setSaveState("saving");
    track("score_save_attempted", { game: "time-gate", score, duration_sec: durationSec });
    void fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then(async (res) => {
        const b = res.ok ? await res.json().catch(() => null) : null;
        if (!res.ok || !b) {
          const err = res.ok ? "bad_body" : await res.json().then((j) => j?.error).catch(() => `http_${res.status}`);
          setSaveState("error");
          track("score_save_failed", { game: "time-gate", score, status: res.status, error: err });
          return;
        }
        try { if (typeof window !== "undefined") window.localStorage.removeItem(PENDING_KEY); } catch {}
        if (typeof b.best === "number") setSavedBest(b.best);
        setSaveState("saved");
        track("score_save_succeeded", { game: "time-gate", score, best: b.best ?? null, was_best: b.best === score });
      })
      .catch((e) => { setSaveState("error"); track("score_save_failed", { game: "time-gate", score, status: 0, error: String(e?.message || e) }); });
  }, []);

  const onEvent = useCallback((e: string) => {
    switch (e) {
      case "gate": sfxRung(1); haptic("rung"); break;
      case "kill": sfxRung(2); break;
      case "level": sfxMilestone(); haptic("milestone"); break;
      case "miss":
      case "hurt":
      case "loop": sfxInvalid(); haptic("invalid"); break;
      case "escaped": sfxMilestone(); break;
      case "over": sfxGameOver(false); haptic("gameover"); break;
    }
  }, []);

  const onState = useCallback((s: HudState) => {
    setHud(s);
    if (s.phase === "over" && !endedHandled.current) {
      endedHandled.current = true;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      track("game_over", { game: "time-gate", score: s.score, signed_in: !!meRef.current });
      saveScore(s.score, durationSec);
      setPhase("over");
    }
  }, [saveScore]);

  // begin() only flips phase → the canvas mounts → the start effect below runs.
  const begin = useCallback(() => {
    gameRef.current?.dispose();
    gameRef.current = null;
    const runSeed = `tg:${Math.floor(Date.now() / 1000)}-${Math.floor(performance.now())}`;
    runSeedRef.current = runSeed;
    startedAt.current = Date.now();
    endedHandled.current = false;
    setSavedBest(null);
    setSaveState(meRef.current ? "saving" : "signed_out");
    setHud(HUD0);
    setPhase("playing");
    track("game_started", { game: "time-gate", seed: runSeed });
    track("play_started", { game: "time-gate" });
  }, []);

  // start the WebGPU game once the canvas is actually in the DOM (phase→playing)
  useEffect(() => {
    if (phase !== "playing" || gameRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new TimeGateGame(seedFrom(runSeedRef.current), onState, onEvent);
    gameRef.current = g;
    g.start(canvas).catch((err) => console.error("time-gate start failed", err));
  }, [phase, onState, onEvent]);

  // cleanup on unmount
  useEffect(() => () => { gameRef.current?.dispose(); gameRef.current = null; }, []);

  const inRun = phase === "playing" || phase === "over";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05010f",
        color: "#e8e8f0",
        fontFamily: "'Space Grotesk', sans-serif",
        ...(inRun ? { height: "100dvh", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", paddingTop: "calc(64px + env(safe-area-inset-top))", boxSizing: "border-box" } : {}),
      }}
    >
      <nav className="top-nav" style={{ padding: "14px 24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BackToGames />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#7fd7ff", fontWeight: 700, letterSpacing: 2 }}>◇ TIME GATE</span>
          {me ? (
            <a href="/profile" style={{ display: "flex", alignItems: "center", gap: 6, color: "#e8e8f0", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
              <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.handle || me.email?.split("@")[0] || "you"}</span>
              {credits != null && <span style={{ color: "#14F195", fontWeight: 800 }}>⚡{credits}</span>}
            </a>
          ) : (
            <button onClick={() => { setShowLogin(true); track("login_prompt", { game: "time-gate", source: "nav" }); }} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#e8e8f0", fontSize: 12, fontWeight: 700, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>Sign in</button>
          )}
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />

      {/* ---------- IN-RUN: canvas + HUD ---------- */}
      {inRun ? (
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

          {/* HUD */}
          {phase === "playing" && (
            <>
              <div style={{ position: "absolute", top: 10, left: 12, right: 12, display: "flex", justifyContent: "space-between", pointerEvents: "none", fontFamily: "monospace" }}>
                <div style={{ fontSize: "clamp(18px,5vw,26px)", fontWeight: 900, color: "#14F195", textShadow: "0 0 10px rgba(20,241,149,0.6)" }}>{hud.score.toLocaleString()}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "clamp(14px,4vw,20px)", fontWeight: 800, color: hud.timeLeft < 6 ? "#ff5b7b" : "#7fd7ff" }}>⏱ {hud.timeLeft.toFixed(1)}s</div>
                  <div style={{ fontSize: 11, color: "#9fb0d0" }}>LVL {hud.level} · ◇{hud.gates}</div>
                </div>
              </div>
              {/* current rule (the pattern to follow) */}
              <div style={{ position: "absolute", top: 8, left: 0, right: 0, textAlign: "center", pointerEvents: "none", fontFamily: "monospace" }}>
                <div style={{ fontSize: 11, color: "#7f8ba8", letterSpacing: 1 }}>SEQUENCE</div>
                <div style={{ fontSize: "clamp(13px,4vw,17px)", fontWeight: 800, color: "#b388ff" }}>{hud.pattern}{hud.lastNum ? ` · last ${hud.lastNum}` : ""}</div>
              </div>
              {/* hull + boost bars */}
              <div style={{ position: "absolute", top: 48, left: 12, display: "flex", flexDirection: "column", gap: 5, pointerEvents: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "#8fa0c0", width: 30 }}>HULL</span>
                  <div style={{ width: "min(34vw,150px)", height: 7, background: "rgba(255,255,255,0.12)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${hud.hull}%`, height: "100%", background: hud.hull < 30 ? "#ff5b7b" : "#35e0ff", transition: "width 120ms linear" }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "#8fa0c0", width: 30 }}>BOOST</span>
                  <div style={{ width: "min(34vw,150px)", height: 7, background: "rgba(255,255,255,0.12)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${hud.boost}%`, height: "100%", background: "#ffd24a", transition: "width 100ms linear" }} />
                  </div>
                </div>
              </div>

              {/* TIME LOOP — full-screen, unmissable, with an escape meter */}
              {hud.loop && (
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20, background: "radial-gradient(ellipse at center, rgba(255,20,50,0.03) 0%, rgba(255,10,40,0.30) 100%)", animation: "tgLoopPulse 0.9s ease-in-out infinite" }}>
                  <div style={{ fontSize: "clamp(30px,10vw,66px)", fontWeight: 900, fontFamily: "monospace", color: "#ff5b7b", letterSpacing: 3, textShadow: "0 0 26px rgba(255,40,70,0.95)", lineHeight: 1 }}>⏳ TIME LOOP</div>
                  <div style={{ marginTop: 12, fontSize: "clamp(16px,5vw,26px)", fontWeight: 900, color: "#fff", fontFamily: "monospace", letterSpacing: 1, textShadow: "0 0 12px rgba(0,0,0,0.8)" }}>
                    HOLD <span style={{ color: "#ffd24a", textShadow: "0 0 14px rgba(255,210,74,0.9)" }}>» BOOST</span> TO BREAK FREE
                  </div>
                  <div style={{ marginTop: 6, fontSize: "clamp(11px,3.4vw,15px)", color: "#ffc0cd", fontFamily: "monospace" }}>your hull drains while you&apos;re stuck — get out fast</div>
                  <div style={{ marginTop: 20, width: "min(80vw,380px)", height: 16, background: "rgba(0,0,0,0.55)", border: "2px solid rgba(255,90,120,0.75)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(hud.loopProgress * 100)}%`, height: "100%", background: "linear-gradient(90deg,#ff5b7b,#ffd24a,#14F195)", transition: "width 80ms linear" }} />
                  </div>
                  <div style={{ marginTop: 7, fontSize: 13, fontWeight: 900, color: "#ffd24a", fontFamily: "monospace", letterSpacing: 2 }}>BREAKING FREE · {Math.round(hud.loopProgress * 100)}%</div>
                </div>
              )}

              {/* mobile controls: FIRE + BOOST (desktop uses space/shift) */}
              <div style={{ position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 18px", pointerEvents: "none" }}>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setBoost(true); }}
                  onPointerUp={() => gameRef.current?.setBoost(false)}
                  onPointerLeave={() => gameRef.current?.setBoost(false)}
                  style={{ ...ctrlBtn, pointerEvents: "auto", color: "#ffd24a", borderColor: hud.loop ? "#ffd24a" : "rgba(255,210,74,0.5)", ...(hud.loop ? { animation: "tgBoostFlash 0.5s infinite", transform: "scale(1.08)" } : {}) }}
                >» BOOST</button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setFiring(true); }}
                  onPointerUp={() => gameRef.current?.setFiring(false)}
                  onPointerLeave={() => gameRef.current?.setFiring(false)}
                  style={{ ...ctrlBtn, pointerEvents: "auto", color: "#14F195", borderColor: "rgba(20,241,149,0.5)" }}
                >⦿ FIRE</button>
              </div>
              <div style={{ position: "absolute", bottom: "calc(58px + env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#7f8ba8", pointerEvents: "none" }}>
                fly the ring with the next number in the sequence · wrong number = time loop
              </div>
              <style>{`@keyframes tgFlash{0%{opacity:1}50%{opacity:0.4}100%{opacity:1}}@keyframes tgLoopPulse{0%,100%{opacity:0.8}50%{opacity:1}}@keyframes tgBoostFlash{0%,100%{box-shadow:0 0 10px rgba(255,210,74,0.6)}50%{box-shadow:0 0 30px rgba(255,210,74,1)}}`}</style>
            </>
          )}

          {/* game-over overlay — canonical ShellResultScreen + leaderboard (shell standard) */}
          {phase === "over" && (
            <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "rgba(5,1,15,0.82)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 8px 32px" }}>
              <div style={{ width: "100%", maxWidth: 440 }}>
                <ShellResultScreen
                  theme="dark"
                  gameId="time-gate"
                  headline={`◇ TIME GATE — ${hud.score.toLocaleString()}`}
                  score={hud.score}
                  extraStat={<>◇ {hud.gates} gates · level {hud.level}</>}
                  saveStatus={saveState}
                  best={savedBest}
                  credits={credits}
                  onRetrySave={() => saveScore(hud.score, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))}
                  onPlayAgain={begin}
                  onSignIn={() => { setShowLogin(true); track("login_prompt", { game: "time-gate", source: "gameover" }); }}
                  onShare={() => { setShowShare(true); track("share_open", { game: "time-gate" }); }}
                  arcadeHref="/arcade"
                />
              </div>

              <ShareSheet
                open={showShare}
                onClose={() => setShowShare(false)}
                text={`◇ TIME GATE — I scored ${hud.score.toLocaleString()} flying the sequence. Beat it?`}
                url={buildShareUrl("https://gamerplex.com/play/time-gate", me?.id)}
                onShared={(m) => track("share_result", { game: "time-gate", method: m })}
              />

              <div style={{ width: "100%", maxWidth: 460, marginTop: 16 }}>
                <ShellLeaderboard gameId="time-gate" highlightUserId={me?.id} selfScore={hud.score} selfHandle={me?.handle} />
              </div>
              <div style={{ marginTop: 16 }}><CommunityLinks tone="dark" /></div>
            </div>
          )}
        </div>
      ) : (
        /* ---------- READY: start screen ---------- */
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "clamp(32px,9vw,54px)", fontWeight: 900, background: "linear-gradient(90deg,#7fd7ff,#14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>TIME GATE</div>
          <p style={{ color: "#9fb0d0", fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
            The rings are numbered. Fly the one that continues the sequence — <b style={{ color: "#b388ff" }}>primes, then ×3, squares, Fibonacci…</b> harder each level. Rings top up your <b style={{ color: "#ffd24a" }}>time + boost</b>. Take the <b style={{ color: "#ff6b7f" }}>wrong number</b> and you're pulled into a <b style={{ color: "#ff6b7f" }}>TIME LOOP</b> — hold BOOST to escape. Blast the enemies for score.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", margin: "18px 0 8px", flexWrap: "wrap", fontSize: 13, color: "#7f8ba8" }}>
            <span>◇ right number = time + boost</span><span>⚠ wrong = time loop</span><span>⦿ enemies = score</span>
          </div>
          <button
            onClick={begin}
            style={{ marginTop: 16, padding: "16px 40px", fontSize: 18, fontWeight: 900, color: "#03121a", background: "linear-gradient(90deg,#7fd7ff,#14F195)", border: "none", borderRadius: 14, cursor: "pointer", boxShadow: "0 0 30px rgba(20,241,149,0.35)" }}
          >▶ FLY</button>
          <div style={{ marginTop: 12, fontSize: 12, color: "#7f8ba8" }}>desktop: arrows/WASD steer · space fire · shift boost</div>
          <div style={{ marginTop: 28 }}><CommunityLinks tone="dark" /></div>
        </div>
      )}
    </div>
  );
}

const ctrlBtn: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 15,
  fontWeight: 800,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid",
  borderRadius: 12,
  color: "#fff",
  userSelect: "none",
  touchAction: "none",
};
