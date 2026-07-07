"use client";

// Time Gate — Arcade-Shell wrapper. Follows the Blockwords standard: fixed-fold
// mobile shell (100dvh, .top-nav fixed, paddingTop for the nav), web2-first
// GameOverPanel (auto-save → ShellLeaderboard → Plus fake-door → optional
// on-chain), CommunityLinks, and shared juice. The WebGPU game lives in
// _game/timeGate.ts. game slug = "time-gate" (numeric GAME_ID=7 for on-chain,
// registered at the mainnet ceremony — web2 leaderboard works now).

import { useCallback, useEffect, useRef, useState } from "react";
import CommunityLinks from "../../../../components/CommunityLinks";
import GameOverPanel from "../../../../components/arcade/GameOverPanel";
import { sfxRung, sfxInvalid, sfxMilestone, sfxGameOver, haptic } from "../../../../lib/arcade/juice";
import { track } from "../../../../lib/analytics";
import { TimeGateGame, type HudState } from "../_game/timeGate";
import { seedFrom } from "../_game/frame";

type Phase = "ready" | "playing" | "over";

const HUD0: HudState = { phase: "playing", score: 0, timeLeft: 30, hull: 100, gates: 0, level: 1 };

export default function TimeGateMode() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TimeGateGame | null>(null);
  const runSeedRef = useRef<string>("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<HudState>(HUD0);
  const [seed, setSeed] = useState<string>(() => `tg:${Math.floor(Date.now() / 1000)}`);
  const startedAt = useRef<number>(0);

  const onEvent = useCallback((e: string) => {
    switch (e) {
      case "gate": sfxRung(1); haptic("rung"); break;
      case "kill": sfxRung(2); break;
      case "level": sfxMilestone(); haptic("milestone"); break;
      case "miss":
      case "hurt": sfxInvalid(); haptic("invalid"); break;
      case "over": sfxGameOver(false); haptic("gameover"); break;
    }
  }, []);

  const onState = useCallback((s: HudState) => {
    setHud(s);
    if (s.phase === "over") setPhase("over");
  }, []);

  // begin() only flips phase → the canvas mounts → the start effect below runs.
  const begin = useCallback(() => {
    gameRef.current?.dispose();
    gameRef.current = null;
    const runSeed = `tg:${Math.floor(Date.now() / 1000)}-${Math.floor(performance.now())}`;
    runSeedRef.current = runSeed;
    setSeed(runSeed);
    startedAt.current = Date.now();
    setHud(HUD0);
    setPhase("playing");
    track("game_started", { game: "time-gate", seed: runSeed });
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
  const secondsUsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));

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
        <a href="/" style={{ fontWeight: 900, letterSpacing: 1, color: "#e8e8f0", textDecoration: "none" }}>GAMERPLEX</a>
        <span style={{ fontSize: 12, color: "#7fd7ff", fontWeight: 700, letterSpacing: 2 }}>◇ TIME GATE</span>
      </nav>

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
              {/* hull bar */}
              <div style={{ position: "absolute", top: 44, left: 12, width: "min(38vw,160px)", height: 8, background: "rgba(255,255,255,0.12)", borderRadius: 6, overflow: "hidden", pointerEvents: "none" }}>
                <div style={{ width: `${hud.hull}%`, height: "100%", background: hud.hull < 30 ? "#ff5b7b" : "#35e0ff", transition: "width 120ms linear" }} />
              </div>
              {/* mobile controls: FIRE + BOOST (desktop uses space/shift) */}
              <div style={{ position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 18px", pointerEvents: "none" }}>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setBoost(1); }}
                  onPointerUp={() => gameRef.current?.setBoost(0)}
                  onPointerLeave={() => gameRef.current?.setBoost(0)}
                  style={{ ...ctrlBtn, pointerEvents: "auto", color: "#7fd7ff", borderColor: "rgba(127,215,255,0.5)" }}
                >» BOOST</button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setFiring(true); }}
                  onPointerUp={() => gameRef.current?.setFiring(false)}
                  onPointerLeave={() => gameRef.current?.setFiring(false)}
                  style={{ ...ctrlBtn, pointerEvents: "auto", color: "#14F195", borderColor: "rgba(20,241,149,0.5)" }}
                >⦿ FIRE</button>
              </div>
              <div style={{ position: "absolute", bottom: "calc(58px + env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#7f8ba8", pointerEvents: "none" }}>
                drag to fly · hold to fire · fly through the gates
              </div>
            </>
          )}

          {/* game-over overlay — scrolls; shell GameOverPanel */}
          {phase === "over" && (
            <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "rgba(5,1,15,0.82)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 8px 32px" }}>
              <GameOverPanel
                gameId="time-gate"
                score={hud.score}
                refId={`time-gate:${seed}`}
                durationSec={secondsUsed}
                onPlayAgain={begin}
                onHome={() => { window.location.href = "/arcade"; }}
              />
              <div style={{ marginTop: 16 }}><CommunityLinks tone="dark" /></div>
            </div>
          )}
        </div>
      ) : (
        /* ---------- READY: start screen ---------- */
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "clamp(32px,9vw,54px)", fontWeight: 900, background: "linear-gradient(90deg,#7fd7ff,#14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>TIME GATE</div>
          <p style={{ color: "#9fb0d0", fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
            Fly through the gates. Blast what gets in your way. Every gate buys you time — miss one and your hull takes the hit.
          </p>
          <div style={{ display: "flex", gap: 18, justifyContent: "center", margin: "18px 0 8px", flexWrap: "wrap", fontSize: 13, color: "#7f8ba8" }}>
            <span>◇ gates = score + time</span><span>⦿ enemies = score</span><span>🛡 hull = lives</span>
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
