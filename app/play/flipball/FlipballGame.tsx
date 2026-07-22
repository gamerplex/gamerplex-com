"use client";

// Flipball game, mounted same-origin (no iframe). Renders the DOM scaffold the
// engine drives (HUD + #game-container mount + play button + mobile controls),
// then boots the raw three.js + Rapier engine from ./_game/main on the client.
// The engine emits a `flipball:gameover` window CustomEvent, which FlipballShell
// listens for directly. IDs match the engine's expectations (incl. its hardcoded
// #splash / #pause-overlay) and are unique to this page — no collision risk.

import { useEffect, useRef } from "react";

export default function FlipballGame() {
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return; // React StrictMode double-invoke guard
    booted.current = true;
    let cleanup: (() => void) | null = null;
    let disposed = false;

    void import("./_game/main").then(({ startFlipball }) =>
      startFlipball({
        mountSelector: "#game-container",
        scoreSelector: "#score",
        hiSelector: "#hi",
        ballsSelector: "#balls",
        comboSelector: "#combo",
        playButtonSelector: "#play-btn",
        mobileLeftSelector: "#mc-left",
        mobileRightSelector: "#mc-right",
        mobilePlungerSelector: "#mc-plunger",
      }).then((teardown) => {
        if (disposed) teardown();
        else cleanup = teardown;
      }),
    );

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="fb-root">
      <div id="hud">
        <span>SCORE <strong id="score">0</strong></span>
        <span>BALLS <strong id="balls">●●●</strong></span>
        <span><span id="combo" className="combo-pill" /></span>
        <span>HI <strong className="hi" id="hi">0</strong></span>
      </div>

      <div id="game-container" aria-label="FLIPBALL pinball table">
        <div id="splash" className="splash-shown">
          <div className="splash-title">FLIPBALL</div>
          <div className="splash-sub">press START to play</div>
        </div>
        <div id="pause-overlay">
          <div className="splash-title" style={{ fontSize: 42 }}>PAUSED</div>
          <div className="splash-sub">P or ESC to resume</div>
        </div>
      </div>

      <div id="controls">
        <button className="fb-btn primary" id="play-btn" type="button">▶ START</button>
      </div>

      <div id="mobile-controls" aria-hidden="true">
        <button className="mc-btn mc-flipper" id="mc-left" type="button" aria-label="left flipper">◀</button>
        <button className="mc-btn mc-plunger" id="mc-plunger" type="button" aria-label="launch ball (hold to charge)">▲</button>
        <button className="mc-btn mc-flipper" id="mc-right" type="button" aria-label="right flipper">▶</button>
      </div>

      <div className="fb-hint">← / → flippers · SPACE launch · P pause</div>
      <div className="fb-hint fb-mobile-hint">tap on-screen buttons OR left/right halves of table</div>

      <style>{FLIPBALL_CSS}</style>
    </div>
  );
}

// Game-specific CSS, scoped under .fb-root. Ported from the standalone Astro
// app's global styles (only the parts the engine's DOM + classList toggles need).
const FLIPBALL_CSS = `
.fb-root {
  --neon-cyan: #00ffd1; --neon-purple: #9d4dff; --neon-pink: #ff00aa; --neon-gold: #ffaa00;
  height: 100%; display: flex; flex-direction: column; gap: 10px;
  align-items: center; justify-content: center; padding: 8px; box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.fb-root #hud {
  width: 100%; max-width: 420px; display: flex; justify-content: space-between;
  align-items: center; font-size: 12px; color: rgba(255,255,255,0.7);
  padding: 0 4px; font-variant-numeric: tabular-nums; flex-shrink: 0;
}
.fb-root #hud strong { color: #fff; }
.fb-root #hud .hi { color: var(--neon-gold); }
.fb-root #hud .combo-pill {
  display: inline-block; padding: 1px 8px; border-radius: 999px;
  background: rgba(255,0,170,0.18); border: 1px solid rgba(255,0,170,0.4);
  color: var(--neon-pink); font-weight: 800; font-size: 11px; letter-spacing: 0.3px;
  transition: transform 100ms ease, opacity 200ms ease; opacity: 0; transform: scale(0.9);
}
.fb-root #hud .combo-pill.active { opacity: 1; transform: scale(1); }
.fb-root #game-container {
  position: relative; width: 100%; max-width: 420px; flex: 1; min-height: 0;
  border-radius: 18px; overflow: hidden; border: 2px solid #3a1f5c; background: #04000c;
  box-shadow: 0 0 90px rgba(0,255,209,0.18), 0 0 40px rgba(157,77,255,0.28), inset 0 0 60px rgba(0,0,0,0.5);
  touch-action: none;
}
.fb-root #splash {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; pointer-events: none; z-index: 5; opacity: 0;
  transition: opacity 400ms ease; text-align: center;
}
.fb-root #splash.splash-shown { opacity: 1; }
.fb-root .splash-title {
  font-size: clamp(40px, 11vw, 72px); font-weight: 900; letter-spacing: -2px;
  background: linear-gradient(135deg, var(--neon-cyan) 0%, var(--neon-pink) 50%, var(--neon-gold) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  filter: drop-shadow(0 0 30px rgba(255,0,170,0.35)); animation: fb-splash-pulse 2.4s ease-in-out infinite;
}
.fb-root .splash-sub {
  font-size: 11px; letter-spacing: 1.5px; color: rgba(255,255,255,0.6);
  text-transform: uppercase; font-family: monospace;
}
@keyframes fb-splash-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
.fb-root #pause-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; background: rgba(4,0,12,0.65); backdrop-filter: blur(6px);
  z-index: 6; opacity: 0; pointer-events: none; transition: opacity 200ms ease;
}
.fb-root #pause-overlay.shown { opacity: 1; }
.fb-root #controls { display: flex; gap: 12px; flex-shrink: 0; }
.fb-root .fb-btn {
  padding: 11px 28px; border-radius: 999px; border: none; font-weight: 800; font-size: 13px;
  letter-spacing: 0.3px; cursor: pointer; transition: transform 100ms ease;
}
.fb-root .fb-btn:active { transform: scale(0.97); }
.fb-root .fb-btn.primary {
  background: var(--neon-cyan); color: #0d001a; box-shadow: 0 0 20px rgba(0,255,209,0.5);
}
.fb-root .fb-hint {
  font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; letter-spacing: 0.5px;
  font-family: monospace; flex-shrink: 0;
}
.fb-root .fb-mobile-hint { display: none; }
@media (hover: none) and (pointer: coarse) {
  .fb-root .fb-hint:not(.fb-mobile-hint) { display: none; }
  .fb-root .fb-mobile-hint { display: block; }
}
.fb-root #mobile-controls { display: none; width: 100%; max-width: 420px; gap: 10px; touch-action: none; flex-shrink: 0; }
@media (hover: none) and (pointer: coarse) { .fb-root #mobile-controls { display: flex; } }
.fb-root .mc-btn {
  flex: 1; padding: 18px 0; border-radius: 14px; border: 2px solid; font-size: 20px; font-weight: 800;
  font-family: monospace; cursor: pointer; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; transition: transform 80ms ease, box-shadow 80ms ease; line-height: 1;
}
.fb-root .mc-flipper {
  background: rgba(0,255,209,0.12); border-color: rgba(0,255,209,0.5); color: var(--neon-cyan);
  box-shadow: 0 0 12px rgba(0,255,209,0.2);
}
.fb-root .mc-flipper.active { background: rgba(0,255,209,0.32); box-shadow: 0 0 24px rgba(0,255,209,0.6); transform: scale(0.96); }
.fb-root .mc-plunger {
  background: rgba(255,170,0,0.12); border-color: rgba(255,170,0,0.5); color: var(--neon-gold);
  box-shadow: 0 0 12px rgba(255,170,0,0.2); flex: 0.7;
}
.fb-root .mc-plunger.active { background: rgba(255,170,0,0.4); box-shadow: 0 0 24px rgba(255,170,0,0.7); transform: scale(0.96); }
`;
