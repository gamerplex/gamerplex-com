"use client";

// NETHERLEVEL — Arcade-Shell wrapper. Follows the shell standard shared by
// vrfc/blockwords/cyber-snake/flipball: web2 identity + Credits chip,
// stash-then-save score (never drop a run), ShellResultScreen game-over with
// ShellLeaderboard + ShareSheet (stable-userId referral links), shared juice.
// The first-person WebGPU engine lives in _game/netherlevel.ts (vendored
// game-kit adopter). game slug = "netherlevel"; the Daily Descent submits as
// "netherlevel-daily" (numeric on-chain game_id is assigned at the mainnet
// ceremony — web2 works now).
//
// Season 1 additions owned here (engine stays shell-free):
//  · persistent campaign progress (localStorage) → Continue / New run / the
//    ready-screen journey map with unlocked-rung replay
//  · THE DAILY DESCENT: date-seeded run, one attempt per day (local guard),
//    scores tagged gameId "netherlevel-daily" + date refId, its own board

import { useCallback, useEffect, useRef, useState } from "react";
import CommunityLinks from "../../../../components/CommunityLinks";
import ShellResultScreen from "../../../../components/arcade/ShellResultScreen";
import BackToGames from "../../../../components/arcade/BackToGames";
import ShellLeaderboard from "../../../../components/arcade/ShellLeaderboard";
import ShareSheet from "../../../../components/arcade/ShareSheet";
import GoPlusModal from "../../../../components/arcade/GoPlusModal";
import ClaimHandleModal from "../../../../components/arcade/ClaimHandleModal";
import EmailLoginModal from "../../../../components/arcade/EmailLoginModal";
import { sfxRung, sfxInvalid, sfxMilestone, sfxGameOver, haptic, isMuted, setMuted, prefersReducedMotion } from "../../../../lib/arcade/juice";
import { track, identifyWallet } from "../../../../lib/analytics";
import { getIdentity, getCredits, earnCredits, claimReferral, type IdentityUser } from "../../../../lib/identity/client";
import { buildShareUrl, getStoredReferralCode } from "../../../../lib/arcade/referral";
import { GLASS_CSS, glassPanel, GREEN } from "../../../../components/glass";
// On-chain arcade parity with the sibling games (ceremony-gated, never faked).
import { submitReplayFireAndForget, openSession } from "@gamerplex/sdk/arcade";
import type { PublicKey } from "@solana/web3.js";
import { EconomyConsentModal, hasEconomyConsent } from "../../../../lib/arcade/economy-gate";
import { NetherlevelGame, CAMPAIGN_HALLS, type HudState, type NlEvent } from "../_game/netherlevel";
import { seedFrom } from "../../../../lib/gamekit";

type Phase = "ready" | "playing" | "over";
type RunMode = "campaign" | "daily";

const PENDING_KEY = "netherlevel_pending_score";
const COMFORT_KEY = "nl_comfort";
const PROG_KEY = "nl_campaign_v1";   // { unlocked, finished } — the persistent climb
const DAILY_KEY = "nl_daily_attempt"; // today's date once the daily attempt starts

// Netherlevel's numeric on-chain game_id is assigned at the mainnet ceremony.
// Until it exists the on-chain save path is HARD-GATED off (never faked, never
// shown as verified) — the web2 save is the live path. Same gate as VRFC.
const NETHERLEVEL_ONCHAIN_GAME_ID: number | null = null;

const TOTAL_HALLS = CAMPAIGN_HALLS.length; // 6 descent + the Abyss + 3 climb + the Twelve Gates
const HUD0: HudState = { phase: "running", ascension: 1, totalAscensions: TOTAL_HALLS, hallName: "THE FIRST LIE", depth: -1, zone: "descent", daily: false, abyss: false, streak: 0, relic: false, whisper: "", deaths: 0, timeSec: 0, distToGate: 0, score: 0, banner: "", flip: false, wind: 0, win: false };

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// the daily key: UTC date — the same lying corridor for every soul worldwide
const todayKey = () => new Date().toISOString().slice(0, 10);

type Progress = { unlocked: number; finished: boolean };
const loadProgress = (): Progress => {
  try {
    const raw = window.localStorage.getItem(PROG_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return { unlocked: Math.min(TOTAL_HALLS, Math.max(1, Math.floor(Number(p.unlocked)) || 1)), finished: !!p.finished };
    }
  } catch {}
  return { unlocked: 1, finished: false };
};

// short rung label for a campaign hall (1-based) — the map/Continue read
const rungLabel = (hall: number): string => {
  const h = CAMPAIGN_HALLS[Math.min(TOTAL_HALLS, Math.max(1, hall)) - 1];
  if (h.abyss) return "THE ABYSS";
  if (h.zone === "sky") return `+${h.depth}`;
  if (h.zone === "earth") return "EARTH 0";
  if (h.zone === "ascent") return `▲ −${Math.abs(h.depth)}`;
  return `−${Math.abs(h.depth)}`;
};

export default function NetherlevelMode() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NetherlevelGame | null>(null);
  const runSeedRef = useRef<string>("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<HudState>(HUD0);
  const startedAt = useRef<number>(0);
  const endedHandled = useRef(false);
  const [deathFlash, setDeathFlash] = useState(0);
  const [gateFlash, setGateFlash] = useState(0);
  const [streakBreak, setStreakBreak] = useState(0); // the Abyss streak shatters
  const [showEconomyGate, setShowEconomyGate] = useState(false);
  const [comfort, setComfort] = useState(false);
  const comfortRef = useRef(false);
  const startHallRef = useRef(1); // Continue/map-replay/?hall= — rung display stays honest
  const beginHallRef = useRef(1); // requested start hall for the next campaign run
  const [runMode, setRunMode] = useState<RunMode>("campaign");
  const runModeRef = useRef<RunMode>("campaign");
  const dailyKeyRef = useRef("");
  // persistent campaign progress — the returnable climb (P1b)
  const [prog, setProg] = useState<Progress>({ unlocked: 1, finished: false });
  const progRef = useRef<Progress>({ unlocked: 1, finished: false });
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const saveProgress = useCallback((next: Progress) => {
    progRef.current = next;
    setProg(next);
    try { window.localStorage.setItem(PROG_KEY, JSON.stringify(next)); } catch {}
  }, []);
  useEffect(() => {
    const p = loadProgress();
    progRef.current = p;
    setProg(p);
    try { setDailyPlayed(window.localStorage.getItem(DAILY_KEY) === todayKey()); } catch {}
  }, []);

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
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(COMFORT_KEY) : null;
    const c = stored != null ? stored === "1" : prefersReducedMotion();
    setComfort(c);
    comfortRef.current = c;
  }, []);
  const toggleMute = useCallback(() => { const m = !isMuted(); setMuted(m); setMutedState(m); }, []);
  const toggleComfort = useCallback(() => {
    setComfort((c) => {
      const n = !c;
      comfortRef.current = n;
      try { window.localStorage.setItem(COMFORT_KEY, n ? "1" : "0"); } catch {}
      return n;
    });
  }, []);

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
  // The Daily submits under its own gameId ("netherlevel-daily") with the date in
  // the refId — idempotent per (user, day); its board renders separately below.
  const saveScore = useCallback((score: number, durationSec: number) => {
    const signedIn = !!meRef.current;
    const daily = runModeRef.current === "daily";
    const gameId = daily ? "netherlevel-daily" : "netherlevel";
    const refId = daily ? `netherlevel-daily:${dailyKeyRef.current}` : `netherlevel:${runSeedRef.current}`;
    const payload = JSON.stringify({ gameId, score, refId, durationSec });
    try { if (typeof window !== "undefined") window.localStorage.setItem(PENDING_KEY, payload); } catch {}
    if (!signedIn) { setSaveState("signed_out"); track("score_save_deferred", { game: gameId, score, reason: "signed_out" }); return; }
    setSaveState("saving");
    track("score_save_attempted", { game: gameId, score, duration_sec: durationSec });
    void fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then(async (res) => {
        const b = res.ok ? await res.json().catch(() => null) : null;
        if (!res.ok || !b) {
          const err = res.ok ? "bad_body" : await res.json().then((j) => j?.error).catch(() => `http_${res.status}`);
          setSaveState("error");
          track("score_save_failed", { game: gameId, score, status: res.status, error: err }); // leave stash for retry
          return;
        }
        try { if (typeof window !== "undefined") window.localStorage.removeItem(PENDING_KEY); } catch {}
        if (typeof b.best === "number") setSavedBest(b.best);
        setSaveState("saved");
        track("score_save_succeeded", { game: gameId, score, best: b.best ?? null, was_best: b.best === score });
        const rc = getStoredReferralCode();
        if (rc) void claimReferral(rc.value);
      })
      .catch((e) => { setSaveState("error"); track("score_save_failed", { game: gameId, score, status: 0, error: String(e?.message || e) }); });
  }, []);

  const onEvent = useCallback((e: NlEvent) => {
    switch (e) {
      case "tell": sfxRung(0); break;
      case "hop": sfxRung(1); break;
      case "land": sfxRung(0); break;
      case "dodge": sfxRung(2); break;
      case "trap": sfxInvalid(); haptic("invalid"); break;
      case "flip": sfxInvalid(); break;
      case "death": sfxInvalid(); haptic("gameover"); setDeathFlash((f) => f + 1); break;
      case "respawn": sfxRung(0); break;
      case "gate": sfxMilestone(); haptic("milestone"); setGateFlash((f) => f + 1); break;
      case "beat": sfxRung(0); break;
      case "trial": sfxMilestone(); haptic("milestone"); setGateFlash((f) => f + 1); break;
      case "streakbreak": sfxInvalid(); haptic("gameover"); setStreakBreak((f) => f + 1); break;
      // mastering the Abyss mid-run is a win-worthy milestone: Credits (NEVER $GAME)
      case "relic": sfxMilestone(); haptic("milestone"); void earnCredits("game_win", `netherlevel:abyss:${runSeedRef.current}`); break;
      case "ascent": sfxMilestone(); haptic("milestone"); setGateFlash((f) => f + 1); break;
      // rising gust: three ascending rungs across the warn — the sound of wind building
      case "windwarn": sfxRung(2); window.setTimeout(() => sfxRung(4), 380); window.setTimeout(() => sfxRung(7), 760); haptic("rung"); break;
      case "gust": sfxRung(9); haptic("rung"); break;
      case "heaven": sfxMilestone(); haptic("milestone"); setGateFlash((f) => f + 1); break;
      case "win": sfxGameOver(true); break;
    }
  }, []);

  // On-chain save — ceremony-ready structure, HARD-GATED behind the missing
  // game_id (tracks the gate, does zero chain work; the web2 save is live).
  const saveOnChain = useCallback(async (wallet: { publicKey: PublicKey } | null) => {
    if (NETHERLEVEL_ONCHAIN_GAME_ID === null) {
      track("onchain_save_gated", { game: "netherlevel", reason: "no_game_id" });
      return;
    }
    if (!hasEconomyConsent()) { setShowEconomyGate(true); return; }
    if (!wallet) return;
    identifyWallet(wallet.publicKey.toBase58());
    const session = await openSession({ player: wallet.publicKey, gameId: NETHERLEVEL_ONCHAIN_GAME_ID });
    track("onchain_session_opened", { game: "netherlevel", session: session.sessionPda.toBase58() });
    // score tx + submitReplayFireAndForget(sig, inputLog) land here at ceremony.
    void submitReplayFireAndForget;
  }, []);

  const onState = useCallback((s: HudState) => {
    setHud(s);
    // persistent progress: reaching a new campaign hall unlocks it forever
    if (s.phase === "running" && runModeRef.current === "campaign" && s.ascension > progRef.current.unlocked) {
      saveProgress({ ...progRef.current, unlocked: s.ascension });
    }
    if (s.phase === "over" && !endedHandled.current) {
      endedHandled.current = true;
      const daily = runModeRef.current === "daily";
      const gameId = daily ? "netherlevel-daily" : "netherlevel";
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      track("game_over", { game: gameId, score: s.score, win: s.win, deaths: s.deaths, ascension: s.ascension, time_sec: Math.round(s.timeSec), signed_in: !!meRef.current });
      if (s.win) {
        void earnCredits("game_win", daily ? `netherlevel-daily:win:${dailyKeyRef.current}` : `netherlevel:win:${runSeedRef.current}`);
        // ASCENDED — only when the run's ladder actually ends at +12 (?asc= short runs don't count)
        if (!daily && s.totalAscensions === TOTAL_HALLS) saveProgress({ unlocked: TOTAL_HALLS, finished: true });
      }
      saveScore(s.score, durationSec);
      void saveOnChain(null); // gated no-op until the mainnet ceremony assigns a game_id
      setPhase("over");
    }
  }, [saveScore, saveOnChain, saveProgress]);

  // begin() flips phase → the canvas mounts → the start effect below runs.
  // campaign: startHall = 1 (New run), the unlocked rung (Continue) or any
  // cleared rung from the journey map (replay). daily: the one date-seeded hall.
  const begin = useCallback((mode: RunMode = "campaign", startHall = 1) => {
    gameRef.current?.dispose();
    gameRef.current = null;
    runModeRef.current = mode;
    setRunMode(mode);
    beginHallRef.current = startHall;
    let runSeed: string;
    if (mode === "daily") {
      const dk = todayKey();
      dailyKeyRef.current = dk;
      // one attempt per day — the guard arms the moment the descent begins
      try { window.localStorage.setItem(DAILY_KEY, dk); } catch {}
      setDailyPlayed(true);
      runSeed = `netherlevel-daily:${dk}`;
    } else {
      runSeed = `netherlevel:${Math.floor(Date.now() / 1000)}-${Math.floor(performance.now())}`;
    }
    runSeedRef.current = runSeed;
    startedAt.current = Date.now();
    endedHandled.current = false;
    setSavedBest(null);
    setSaveState(meRef.current ? "saving" : "signed_out");
    setHud(HUD0);
    setPhase("playing");
    track("game_started", { game: mode === "daily" ? "netherlevel-daily" : "netherlevel", seed: runSeed, start_hall: startHall });
    track("play_started", { game: mode === "daily" ? "netherlevel-daily" : "netherlevel" });
  }, []);

  useEffect(() => {
    if (phase !== "playing" || gameRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const daily = runModeRef.current === "daily";
    // ?asc=N short-run hook + ?hall=N start-at-hall hook (dev/e2e; campaign only)
    let maxAsc: number | undefined;
    let startHall: number | undefined;
    if (!daily) {
      try {
        const q = new URLSearchParams(window.location.search);
        const p = q.get("asc");
        if (p) maxAsc = Math.max(1, Math.min(TOTAL_HALLS, parseInt(p, 10) || TOTAL_HALLS));
        const h = q.get("hall");
        if (h) startHall = Math.max(1, Math.min(TOTAL_HALLS, parseInt(h, 10) || 1));
      } catch {}
      startHall = startHall ?? beginHallRef.current; // dev hook wins over Continue
    }
    startHallRef.current = daily ? 1 : (startHall ?? 1);
    const g = new NetherlevelGame(seedFrom(runSeedRef.current), onState, onEvent, {
      maxAscensions: maxAsc,
      startHall,
      comfort: comfortRef.current,
      daily: daily ? { dateKey: dailyKeyRef.current } : undefined,
    });
    gameRef.current = g;
    g.start(canvas).catch((err) => console.error("netherlevel start failed", err));
  }, [phase, onState, onEvent]);

  useEffect(() => () => { gameRef.current?.dispose(); gameRef.current = null; }, []);

  const inRun = phase === "playing" || phase === "over";
  const isDaily = runMode === "daily";
  // rungs counted from the actual start hall (Continue/map/?hall= runs stay honest)
  const rungsTotal = hud.totalAscensions - (startHallRef.current - 1);
  const cleared = Math.max(0, (hud.win ? hud.totalAscensions : hud.ascension - 1) - (startHallRef.current - 1));

  // the depth HUD read: ▼ down the descent, ▲ up the climb, +N on the gates
  const climbing = hud.zone === "ascent" || hud.zone === "earth" || hud.zone === "sky";
  const depthLabel = hud.daily ? "🌒 THE DAILY DESCENT"
    : hud.abyss ? "THE ABYSS −6"
    : hud.zone === "sky" ? `▲ ASCENT +${hud.depth}`
    : hud.zone === "earth" ? "▲ EARTH 0"
    : hud.zone === "ascent" ? `▲ ASCENT −${Math.abs(hud.depth)}`
    : `▼ DESCENT −${Math.abs(hud.depth)}`;
  const depthColor = hud.abyss ? "#ff5b3c" : hud.daily ? "#9ab8ff" : climbing ? "#9fe0ff" : "#ffd24a";

  const fellAt = hud.daily ? "THE DAILY DESCENT"
    : hud.abyss ? "THE ABYSS"
    : hud.zone === "sky" ? `GATE +${hud.depth}`
    : hud.zone === "earth" ? "EARTH"
    : hud.zone === "ascent" ? `THE CLIMB −${Math.abs(hud.depth)}`
    : `DESCENT −${Math.abs(hud.depth)}`;
  const shareText = isDaily
    ? hud.win
      ? `🌒 NETHERLEVEL Daily Descent ${dailyKeyRef.current} — cleared with ${hud.deaths} deaths · ${fmtTime(hud.timeSec)}. Same corridor for everyone. Beat my death count?`
      : `🌒 NETHERLEVEL Daily Descent ${dailyKeyRef.current} — today's corridor got me (${hud.deaths} deaths). Beat that?`
    : hud.win
      ? `🕯 NETHERLEVEL — fell to −6, mastered the Abyss, climbed the Twelve Gates to Heaven · ${hud.deaths} deaths · ${fmtTime(hud.timeSec)}. ASCENDED. Walk it cleaner?`
      : `🕯 NETHERLEVEL — the corridor got me at ${fellAt} (${hud.deaths} deaths). It LIES. Avenge me?`;

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
      {!inRun && <div className="gl-bg" aria-hidden="true" />}

      {/* flex row on the inner div (a global mobile rule stretches inline-flex navs) */}
      <nav style={{ position: "relative", zIndex: 1, ...glassPanel, margin: inRun ? 0 : "12px 12px 0", borderRadius: inRun ? 0 : 18, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BackToGames />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#ff9a4a", fontWeight: 800, letterSpacing: 2 }}>🕯 NETHERLEVEL</span>
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
                onClick={() => { setShowLogin(true); track("login_prompt", { game: "netherlevel", source: "nav" }); }}
                className="gl-signin"
              >Sign in</button>
            )}
          </div>
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />
      {showEconomyGate && <EconomyConsentModal onAccept={() => setShowEconomyGate(false)} onClose={() => setShowEconomyGate(false)} />}

      {/* ---------- IN-RUN: canvas + HUD ---------- */}
      {inRun ? (
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }} />

          {phase === "playing" && (
            <>
              {/* run HUD: depth (▼ DESCENT −N / the Abyss streak) · deaths · time · distance */}
              <div style={{ position: "absolute", top: 8, left: 10, right: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, pointerEvents: "none", fontFamily: "monospace" }}>
                <div>
                  <div data-testid="nl-depth" style={{ fontSize: "clamp(11px,3vw,14px)", fontWeight: 900, color: depthColor, letterSpacing: 1 }}>
                    {depthLabel}
                  </div>
                  <div style={{ fontSize: 11, color: "#9fb0d0", fontWeight: 700, letterSpacing: 1 }}>{hud.abyss ? "MASTER IT TO ASCEND" : hud.daily ? "ONE ATTEMPT — WALK IT CLEAN" : hud.hallName}</div>
                  {hud.abyss && (
                    <div data-testid="nl-streak" key={`sb${streakBreak}`} style={{ marginTop: 4, fontSize: "clamp(12px,3.4vw,15px)", fontWeight: 900, letterSpacing: 2, color: "#ffd24a", animation: streakBreak > 0 ? "nlShatter 0.7s ease-out" : undefined }}>
                      <span style={{ color: "#ff8a3c" }}>{"◆".repeat(hud.streak)}</span>
                      <span style={{ color: "rgba(255,255,255,0.35)" }}>{"◇".repeat(Math.max(0, 3 - hud.streak))}</span>
                      {" "}{hud.streak}/3 <span style={{ fontSize: 10, letterSpacing: 1 }}>FLAWLESS</span>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div data-testid="nl-deaths" style={{ fontSize: "clamp(13px,4vw,18px)", fontWeight: 900, color: "#ff5b7b" }}>💀 {hud.deaths}</div>
                  <div data-testid="nl-time" style={{ fontSize: 11, color: "#9fb0d0", fontWeight: 700 }}>{fmtTime(hud.timeSec)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div data-testid="nl-dist" style={{ fontSize: "clamp(12px,3.4vw,15px)", fontWeight: 900, color: "#7fd7ff" }}>{hud.distToGate.toFixed(1)}m</div>
                  <div style={{ fontSize: 10, color: "#9fb0d0", fontWeight: 700, letterSpacing: 1 }}>{hud.abyss ? "TO THE DOOR" : "TO THE GATE"}</div>
                  <button
                    onClick={() => gameRef.current?.abandon()}
                    style={{ marginTop: 6, pointerEvents: "auto", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.55)", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}
                  >🏳 ABANDON</button>
                </div>
              </div>

              {/* the Great Ladder — journey map: the descent → the Abyss → the climb → the Twelve Gates */}
              {!hud.daily && <GreatLadder ascension={hud.ascension} streak={hud.streak} win={hud.win} />}

              {/* banner — the vague-mythic voice of the corridor */}
              {hud.banner && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: "clamp(20px,6vw,44px)", fontWeight: 900, fontFamily: "monospace", letterSpacing: 3, textAlign: "center", padding: "0 16px", color: hud.banner.includes("PERISHES") || hud.banner.includes("SHATTERS") ? "#ff5b7b" : "#ffd24a", textShadow: "0 0 34px rgba(255,150,60,0.8)", animation: "nlBanner 0.4s ease-out" }}>
                    {hud.banner}
                  </div>
                </div>
              )}

              {/* story whisper — one short line, never blocks the loop */}
              {hud.whisper && (
                <div style={{ position: "absolute", left: 0, right: 0, bottom: "24%", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
                  <div data-testid="nl-whisper" style={{ fontSize: "clamp(13px,3.6vw,18px)", fontStyle: "italic", fontFamily: "Georgia, serif", color: "rgba(255,226,196,0.88)", textShadow: "0 0 18px rgba(255,140,60,0.6)", padding: "0 20px", textAlign: "center", animation: "nlWhisper 4.2s ease-out forwards" }}>
                    “{hud.whisper}”
                  </div>
                </div>
              )}

              {/* look-flip curse tint */}
              {hud.flip && <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "rgba(140,60,255,0.14)", boxShadow: "inset 0 0 120px 30px rgba(140,60,255,0.5)" }} />}

              {/* wind telegraph — edge vignette on the incoming side + the direction read */}
              {hud.wind !== 0 && (
                <div data-testid="nl-wind" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {/* deep-blue pressure front on the incoming edge — reads on the bright sky */}
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${hud.wind > 0 ? 90 : 270}deg, rgba(30,70,140,${(0.6 * Math.abs(hud.wind)).toFixed(3)}) 0%, rgba(60,110,190,${(0.28 * Math.abs(hud.wind)).toFixed(3)}) 18%, rgba(60,110,190,0) 42%)` }} />
                  <div style={{ position: "absolute", left: 0, right: 0, top: "18%", textAlign: "center", fontFamily: "monospace", fontWeight: 900, letterSpacing: 5, fontSize: "clamp(14px,4vw,20px)", color: "#eaf4ff", opacity: 0.4 + 0.6 * Math.abs(hud.wind), textShadow: "0 0 16px rgba(30,80,160,0.95), 0 2px 6px rgba(0,20,50,0.8)" }}>
                    {hud.wind > 0 ? "WIND ⟶ ⟶" : "⟵ ⟵ WIND"}
                  </div>
                </div>
              )}

              {/* death flash — red impact */}
              {deathFlash > 0 && <div key={deathFlash} style={{ position: "absolute", inset: 0, background: "radial-gradient(circle, rgba(255,60,40,0.75) 0%, rgba(120,10,10,0.9) 100%)", pointerEvents: "none", animation: "nlFlash 0.6s ease-out forwards" }} />}
              {/* gate flash — gold pulse */}
              {gateFlash > 0 && <div key={`g${gateFlash}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 110px 18px rgba(255,210,74,0.6)", animation: "nlFlash 0.5s ease-out forwards" }} />}

              {/* desktop key legend (hidden on touch) */}
              <div className="nl-legend" style={{ position: "absolute", bottom: "calc(10px + env(safe-area-inset-bottom))", left: 0, right: 0, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 5, pointerEvents: "none", opacity: 0.62, fontFamily: "monospace", fontSize: 11, padding: "0 12px" }}>
                {[["WASD", "walk · strafe"], ["MOUSE DRAG / ←→↑↓", "look"], ["SPACE", "hop (hold = higher)"], ["SHIFT", "step back"]].map(([key, act]) => (
                  <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "3px 7px" }}>
                    <b style={{ color: "#ffd24a" }}>{key}</b><span style={{ color: "#cfd8ea" }}>{act}</span>
                  </span>
                ))}
              </div>

              {/* mobile touch controls: left stick = move · drag right = look ·
                  tap = hop · buttons for HOP/DODGE (big targets, safe-area) */}
              <div className="nl-touch" style={{ position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", left: 14, pointerEvents: "none" }}>
                <Joystick onMove={(x, z) => gameRef.current?.setMove(x, z)} />
              </div>
              <div className="nl-touch" style={{ position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", right: 14, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
                <button style={{ ...ctrlBtn, color: "#ffd24a", borderColor: "rgba(255,210,74,0.55)" }}
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.hop(true); }}
                >⬆ HOP</button>
                <button style={{ ...ctrlBtn, color: "#b388ff", borderColor: "rgba(179,136,255,0.55)" }}
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.dodge(); }}
                >💨 BACK</button>
              </div>
              <style>{`@keyframes nlBanner{0%{transform:scale(1.5);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes nlFlash{0%{opacity:0.9}100%{opacity:0}}@keyframes nlWhisper{0%{opacity:0}10%{opacity:1}80%{opacity:1}100%{opacity:0}}@keyframes nlShatter{0%{transform:scale(1.8) rotate(-4deg);color:#ff3c2a;text-shadow:0 0 30px rgba(255,40,20,0.9)}60%{transform:scale(0.94) rotate(2deg)}100%{transform:scale(1) rotate(0)}}@media (pointer:coarse){.nl-legend{display:none!important}}@media (hover:hover) and (pointer:fine){.nl-touch{display:none!important}}`}</style>
            </>
          )}

          {/* game-over overlay — canonical ShellResultScreen in a glass panel */}
          {phase === "over" && (
            <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "radial-gradient(85% 55% at 22% 0%, rgba(255,120,40,0.24) 0%, transparent 60%), radial-gradient(95% 60% at 78% 112%, rgba(20,241,149,0.16) 0%, transparent 64%), rgba(7,6,15,0.84)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 12px calc(28px + env(safe-area-inset-bottom))" }}>
              <div style={{ ...glassPanel, borderRadius: 24, padding: "22px 16px", width: "100%", maxWidth: 440, boxSizing: "border-box" }}>
                <ShellResultScreen
                  theme="dark"
                  gameId={isDaily ? "netherlevel-daily" : "netherlevel"}
                  headline={hud.win
                    ? (isDaily ? "🌒 DAILY DESCENT — CLEARED" : "☀ ASCENSION — THE TWELFTH GATE")
                    : `🕯 FALLEN — ${fellAt}`}
                  win={hud.win}
                  score={hud.score}
                  extraStat={<>
                    ⚰️ {hud.deaths} deaths · ⏱ {fmtTime(hud.timeSec)}
                    {!isDaily && <> · {cleared}/{rungsTotal} rungs</>}
                    {hud.relic ? " · ◆ Relic claimed" : ""}
                    {isDaily && <> · same corridor for everyone today</>}
                  </>}
                  saveStatus={saveState}
                  best={savedBest}
                  credits={credits}
                  onRetrySave={() => saveScore(hud.score, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))}
                  onPlayAgain={() => begin("campaign", isDaily ? progRef.current.unlocked : startHallRef.current)}
                  onSignIn={() => { setShowLogin(true); track("login_prompt", { game: "netherlevel", source: "gameover" }); }}
                  onShare={() => { setShowShare(true); track("share_open", { game: "netherlevel" }); }}
                  shareLabel="🔗 Challenge"
                  needsHandle={!!me && !me.handle}
                  onClaimName={() => setShowClaim(true)}
                  arcadeHref="/arcade"
                  onGoPlus={() => { setShowPlus(true); track("plus_opened", { source: "gameover", game: "netherlevel" }); }}
                />
              </div>

              <ShareSheet
                open={showShare}
                onClose={() => setShowShare(false)}
                text={shareText}
                url={buildShareUrl("https://gamerplex.com/play/netherlevel", me?.id)}
                onShared={(m) => track("share_result", { game: "netherlevel", method: m })}
              />
              <GoPlusModal open={showPlus} onClose={() => setShowPlus(false)} source="gameover" />
              <ClaimHandleModal open={showClaim} onClose={() => setShowClaim(false)} onClaimed={() => { setShowClaim(false); void refreshIdentity(); }} />

              <div style={{ ...glassPanel, borderRadius: 20, padding: 16, width: "100%", maxWidth: 460, marginTop: 16, boxSizing: "border-box" }}>
                {isDaily && (
                  <div style={{ textAlign: "center", fontSize: 11.5, color: "#9ab8ff", fontWeight: 800, letterSpacing: 1.5, marginBottom: 8 }}>
                    🌒 DAILY DESCENT — THIS WEEK&apos;S BOARD · fewest deaths, then fastest
                  </div>
                )}
                <ShellLeaderboard gameId={isDaily ? "netherlevel-daily" : "netherlevel"} fixedWindow={isDaily ? "day" : undefined} highlightUserId={me?.id} selfScore={hud.score} selfHandle={me?.handle} />
              </div>
              <div style={{ marginTop: 16 }}><CommunityLinks tone="dark" /></div>
            </div>
          )}
        </div>
      ) : (
        /* ---------- READY: start screen (liquid glass) ---------- */
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "clamp(20px,5vw,40px) 16px 32px" }}>
          <div style={{ ...glassPanel, borderRadius: 26, padding: "clamp(22px,5vw,34px) clamp(18px,5vw,30px)", textAlign: "center" }}>
            <div style={{ fontSize: "clamp(34px,9vw,56px)", fontWeight: 900, background: "linear-gradient(90deg,#ff7a3c,#ffd24a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>NETHERLEVEL</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.66)", fontWeight: 700, letterSpacing: 3, marginTop: 2 }}>THE CORRIDOR LIES</div>
            {prog.finished && (
              <div style={{ marginTop: 10, display: "inline-block", padding: "5px 14px", borderRadius: 999, border: "1px solid rgba(255,210,74,0.5)", background: "rgba(255,210,74,0.12)", color: "#ffd24a", fontSize: 12, fontWeight: 900, letterSpacing: 2 }}>
                ☀ ASCENDED — THE TWELVE GATES ARE YOURS
              </div>
            )}
            <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 15, lineHeight: 1.55, marginTop: 14 }}>
              You are <b style={{ color: "#ffd24a" }}>the Pilgrim</b> — a fallen soul. Descend the lying corridors{" "}
              <b style={{ color: "#ff7a3c" }}>down to the Abyss at −6</b>: floors drop away, spikes lunge, walls slam shut — and not every Gate is real.{" "}
              <b style={{ color: GREEN }}>Read the tells</b> (a hum, a shimmer, a crack), react — <b style={{ color: "#7fd7ff" }}>hop</b>, <b style={{ color: "#b388ff" }}>step back</b>, sidestep — or perish
              and return to the <b style={{ color: "#7fd7ff" }}>Shrine</b>, wiser. At the bottom the exit is locked: clear the <b style={{ color: "#ff5b3c" }}>Abyss trial 3× in a row without dying</b> to
              claim the <b style={{ color: "#ffd24a" }}>Relic</b> and open the <b style={{ color: "#ffd24a" }}>Ascent Door</b> — then <b style={{ color: "#9fe0ff" }}>climb out</b>: through Earth and up the{" "}
              <b style={{ color: "#9fe0ff" }}>Twelve Gates</b> of the sky — wind, vapor, and the long fall — to the <b style={{ color: "#ffd24a" }}>Twelfth Gate</b>: the ending.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", margin: "16px 0 8px", flexWrap: "wrap", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              <span>▼ 6 halls down to hell</span><span>◆◆◆ the Abyss trial — 3 flawless</span><span>▲ the Twelve Gates up to Heaven</span><span>💀 every trap is fair — beatable on retry</span><span>♾ infinite retries · progress saves</span>
            </div>

            {/* the campaign: Continue picks the climb back up; New run starts from the top */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
              {prog.unlocked > 1 && !prog.finished && (
                <button
                  data-testid="nl-continue"
                  onClick={() => begin("campaign", prog.unlocked)}
                  style={{ padding: "16px 30px", fontSize: 17, fontWeight: 900, color: "#04121e", background: "linear-gradient(90deg,#7fd7ff,#9fe0ff)", border: "none", borderRadius: 14, cursor: "pointer", boxShadow: "0 12px 40px rgba(127,215,255,0.3), inset 0 1px 0 rgba(255,255,255,0.5)" }}
                >⛩ CONTINUE — {rungLabel(prog.unlocked)}</button>
              )}
              <button
                data-testid="nl-newrun"
                onClick={() => begin("campaign", 1)}
                style={prog.unlocked > 1 && !prog.finished
                  ? { padding: "16px 26px", fontSize: 15, fontWeight: 900, color: "#ffd24a", background: "rgba(255,210,74,0.1)", border: "1px solid rgba(255,210,74,0.5)", borderRadius: 14, cursor: "pointer" }
                  : { padding: "16px 44px", fontSize: 18, fontWeight: 900, color: "#1a0a03", background: "linear-gradient(90deg,#ff7a3c,#ffd24a)", border: "none", borderRadius: 14, cursor: "pointer", boxShadow: "0 12px 40px rgba(255,122,60,0.35), inset 0 1px 0 rgba(255,255,255,0.5)" }}
              >🕯 ENTER THE HALL{prog.unlocked > 1 ? " — NEW RUN" : ""}</button>
            </div>

            {/* the journey map — the Great Ladder: cleared rungs stay unlocked + replayable */}
            <div data-testid="nl-map" style={{ marginTop: 18, padding: "12px 10px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>THE GREAT LADDER — −6 TO +12 · tap a lit rung to replay it</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                {CAMPAIGN_HALLS.map((h, i) => {
                  const n = i + 1;
                  const unlocked = n <= prog.unlocked || prog.finished;
                  const label = h.abyss ? "◆" : h.zone === "sky" ? `+${h.depth}` : h.zone === "earth" ? "0" : h.zone === "ascent" ? `▲−${Math.abs(h.depth)}` : `−${Math.abs(h.depth)}`;
                  const color = h.abyss ? "#ff5b3c" : h.zone === "sky" ? "#9fe0ff" : h.zone === "earth" ? "#8fe0b0" : h.zone === "ascent" ? "#b8a8ff" : "#ffb060";
                  return (
                    <button
                      key={`${h.name}-${i}`}
                      title={h.name}
                      disabled={!unlocked}
                      onClick={() => begin("campaign", n)}
                      style={{
                        minWidth: 30, padding: "6px 4px", borderRadius: 8, fontFamily: "monospace", fontSize: 11, fontWeight: 800,
                        cursor: unlocked ? "pointer" : "default",
                        color: unlocked ? color : "rgba(255,255,255,0.28)",
                        background: unlocked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${unlocked ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >{unlocked ? label : "🔒"}</button>
                  );
                })}
              </div>
            </div>

            {/* THE DAILY DESCENT — one date-seeded corridor, the same for everyone,
                one attempt per day: fewest deaths, then fastest */}
            <div style={{ marginTop: 14, padding: "14px 12px", borderRadius: 16, border: "1px solid rgba(154,184,255,0.35)", background: "rgba(122,152,255,0.08)" }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, color: "#9ab8ff" }}>🌒 THE DAILY DESCENT · {todayKey()}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginTop: 4 }}>One fresh corridor a day — identical for every Pilgrim worldwide. One attempt: fewest deaths, then fastest.</div>
              {dailyPlayed ? (
                <div data-testid="nl-daily-done" style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>
                  ✓ DESCENDED TODAY — return tomorrow
                </div>
              ) : (
                <button
                  data-testid="nl-daily"
                  onClick={() => begin("daily")}
                  style={{ marginTop: 10, padding: "13px 32px", fontSize: 15, fontWeight: 900, color: "#0a1226", background: "linear-gradient(90deg,#9ab8ff,#cfe0ff)", border: "none", borderRadius: 12, cursor: "pointer", boxShadow: "0 10px 30px rgba(154,184,255,0.3)" }}
                >🌒 DAILY DESCENT</button>
              )}
            </div>

            <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
              desktop: <b>WASD</b> walk · <b>mouse-drag</b> or <b>arrows</b> look · <b>SPACE</b> hop (hold = higher) · <b>SHIFT</b> step back<br />
              mobile: <b>left thumb</b> move · <b>right thumb drag</b> look · <b>tap</b> = hop · <b>BACK</b> button = step back
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
              <input type="checkbox" checked={comfort} onChange={toggleComfort} style={{ accentColor: "#ffd24a" }} />
              comfort mode (no head-bob, softer shake — first-person friendly)
            </label>
          </div>
          <div style={{ marginTop: 24, textAlign: "center" }}><CommunityLinks tone="dark" /></div>
        </div>
      )}
    </div>
  );
}

// The Great Ladder — the cheap in-run journey map, now the FULL arc in play
// order: the descent −1…−6 → the Abyss → the climb (−4, −2, 0) → the Twelve
// Gates (+1…+12). Cleared rungs lit; the Abyss rung carries the trial streak.
function GreatLadder({ ascension, streak, win }: { ascension: number; streak: number; win: boolean }) {
  const dot = (state: "done" | "here" | "later", zone: string) => ({
    done: { color: zone === "sky" ? "#9fe0ff" : "#ffd24a", opacity: 0.95 },
    here: { color: "#ff8a3c", opacity: 1, textShadow: "0 0 10px rgba(255,140,60,0.9)" },
    later: { color: "#9fb0d0", opacity: 0.32 },
  })[state];
  return (
    <div data-testid="nl-ladder" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 1, pointerEvents: "none", fontFamily: "monospace", fontSize: 9, fontWeight: 800, letterSpacing: 1, lineHeight: 1.15 }}>
      {CAMPAIGN_HALLS.map((h, i) => {
        const n = i + 1;
        const state = ascension > n || win ? "done" : ascension === n ? "here" : "later";
        const mark = h.abyss ? (state === "done" ? "◆" : "◈") : state === "done" ? "●" : state === "here" ? "◉" : "○";
        const label = h.abyss ? `ABYSS${state === "here" && !win ? ` ${streak}/3` : ""}`
          : h.zone === "sky" ? `+${h.depth}`
          : h.zone === "earth" ? "0"
          : h.zone === "ascent" ? `▲−${Math.abs(h.depth)}`
          : `−${Math.abs(h.depth)}`;
        return <div key={`${h.name}-${i}`} style={dot(state, h.zone)}>{mark} {label}</div>;
      })}
    </div>
  );
}

// Left-thumb virtual stick: normalized {x, z} into the engine (z = forward).
function Joystick({ onMove }: { onMove: (x: number, z: number) => void }) {
  const idRef = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 44;

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== idRef.current) return;
    e.preventDefault();
    let dx = (e.clientX - originRef.current.x) / R;
    let dy = (e.clientY - originRef.current.y) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    setKnob({ x: dx * R, y: dy * R });
    onMove(dx, -dy); // screen-down = backward
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== idRef.current) return;
    idRef.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      style={{ width: 120, height: 120, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)", position: "relative", pointerEvents: "auto", touchAction: "none", userSelect: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        if (idRef.current !== null) return;
        idRef.current = e.pointerId;
        (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        originRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,210,74,0.35)", border: "1.5px solid rgba(255,210,74,0.7)", transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}

const ctrlBtn: React.CSSProperties = {
  padding: "16px 18px",
  fontSize: 14,
  fontWeight: 800,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.3)",
  borderRadius: 14,
  color: "#fff",
  userSelect: "none",
  touchAction: "none",
  pointerEvents: "auto",
};
