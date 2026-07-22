"use client";

// TCG Quiz — Arcade-Shell wrapper. Follows the shell standard shared by
// blockwords/vrfc/cyber-snake: BackToGames, web2 identity + Credits chip,
// stash-then-save score (never drop a run), ShellResultScreen game-over with
// ShellLeaderboard + ShareSheet, shared juice.
//
// Questions come from Sledgit's card catalog via /api/quiz/questions (proxied
// server-side — the catalog lives in ONE place). ONE generic engine; the modes
// below are filters on it, not separate games.
//
// The board is FEDERATION-WIDE (crossApp): the same quiz runs on sledgit.com,
// and users.email is unique across the federation, so a player's best run wins
// on one board no matter which domain they played on.
//
// Skill-only, Credits-only. No price format, no wagering (R2/R4/R5).

import { useCallback, useEffect, useRef, useState } from "react";
import CommunityLinks from "../../../../components/CommunityLinks";
import BackToGames from "../../../../components/arcade/BackToGames";
import ShellResultScreen from "../../../../components/arcade/ShellResultScreen";
import ShellLeaderboard from "../../../../components/arcade/ShellLeaderboard";
import ShareSheet from "../../../../components/arcade/ShareSheet";
import EmailLoginModal from "../../../../components/arcade/EmailLoginModal";
import ClaimHandleModal from "../../../../components/arcade/ClaimHandleModal";
import { sfxRung, sfxInvalid, sfxMilestone, sfxGameOver, haptic } from "../../../../lib/arcade/juice";
import { track } from "../../../../lib/analytics";
import { getIdentity, getCredits, claimReferral, type IdentityUser } from "../../../../lib/identity/client";
import { buildShareUrl, getStoredReferralCode } from "../../../../lib/arcade/referral";
import { GLASS_CSS, glassPanel, GREEN } from "../../../../components/glass";

type Phase = "ready" | "playing" | "over";
type Question = { format: string; prompt: string; image: string; options: string[]; answer: number; card: string };

const PENDING_KEY = "tcg_quiz_pending_score";
const N_QUESTIONS = 8;
const POINTS = 100;      // per correct answer
const STREAK_BONUS = 25; // per consecutive correct beyond the first

const MODES: { id: string; label: string; hint: string }[] = [
  { id: "mix", label: "🌍 Mixed", hint: "the whole catalog" },
  { id: "franchise:pokemon", label: "⚡ Pokémon", hint: "Pokémon cards only" },
  { id: "artist:Shinji Kanda", label: "🎨 Shinji Kanda", hint: "one artist's work" },
];

export default function TcgQuizMode() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [mode, setMode] = useState<string>("mix");
  const [qs, setQs] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctN, setCorrectN] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const runSeedRef = useRef<string>("");
  const startedAt = useRef<number>(0);

  const [me, setMe] = useState<IdentityUser | null>(null);
  const meRef = useRef<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [savedBest, setSavedBest] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "signed_out" | "error">("signed_out");
  const [showLogin, setShowLogin] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showClaim, setShowClaim] = useState(false);

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

  // Replay a stashed run once signed in; clear only on confirmed 2xx.
  useEffect(() => {
    void (async () => {
      const u = await refreshIdentity();
      if (u && typeof window !== "undefined") {
        const pend = window.localStorage.getItem(PENDING_KEY);
        if (pend) {
          try {
            const res = await fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: pend });
            if (res.ok) window.localStorage.removeItem(PENDING_KEY);
          } catch { /* keep stash */ }
        }
      }
    })();
  }, [refreshIdentity]);

  // Stash up-front so a run is NEVER lost; status reflects the real outcome.
  const saveScore = useCallback((final: number, durationSec: number) => {
    const signedIn = !!meRef.current;
    const payload = JSON.stringify({ gameId: "tcg-quiz", score: final, refId: `tcg-quiz:${runSeedRef.current}`, durationSec });
    try { window.localStorage.setItem(PENDING_KEY, payload); } catch {}
    if (!signedIn) { setSaveState("signed_out"); track("score_save_deferred", { game: "tcg-quiz", score: final, reason: "signed_out" }); return; }
    setSaveState("saving");
    track("score_save_attempted", { game: "tcg-quiz", score: final, duration_sec: durationSec });
    void fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then(async (res) => {
        const b = res.ok ? await res.json().catch(() => null) : null;
        if (!res.ok || !b) {
          setSaveState("error");
          track("score_save_failed", { game: "tcg-quiz", score: final, status: res.status });
          return;
        }
        try { window.localStorage.removeItem(PENDING_KEY); } catch {}
        if (typeof b.best === "number") setSavedBest(b.best);
        setSaveState("saved");
        track("score_save_succeeded", { game: "tcg-quiz", score: final, best: b.best ?? null });
        const rc = getStoredReferralCode();
        if (rc) void claimReferral(rc.value);
      })
      .catch((e) => { setSaveState("error"); track("score_save_failed", { game: "tcg-quiz", score: final, status: 0, error: String(e?.message || e) }); });
  }, []);

  const begin = useCallback(async (m: string) => {
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await fetch(`/api/quiz/questions?mode=${encodeURIComponent(m)}&n=${N_QUESTIONS}`, { cache: "no-store" });
      const b = await r.json().catch(() => null);
      if (!r.ok || !b?.questions?.length) { setLoadErr("Couldn't load questions — try another mode."); setLoading(false); return; }
      runSeedRef.current = `${Math.floor(Date.now() / 1000)}-${Math.floor(performance.now())}`;
      startedAt.current = Date.now();
      setQs(b.questions);
      setIdx(0); setScore(0); setStreak(0); setCorrectN(0); setPicked(null);
      setSavedBest(null);
      setSaveState(meRef.current ? "saving" : "signed_out");
      setMode(m);
      setPhase("playing");
      track("game_started", { game: "tcg-quiz", mode: m, seed: runSeedRef.current });
      track("play_started", { game: "tcg-quiz" });
    } catch {
      setLoadErr("Couldn't load questions — check your connection.");
    }
    setLoading(false);
  }, []);

  const answer = (i: number) => {
    if (picked !== null) return;
    const q = qs[idx];
    if (!q) return;
    setPicked(i);
    const right = i === q.answer;
    if (right) {
      const gained = POINTS + Math.max(0, streak) * STREAK_BONUS;
      setScore((s) => s + gained);
      setStreak((s) => s + 1);
      setCorrectN((c) => c + 1);
      sfxRung(1); haptic("rung");
    } else {
      setStreak(0);
      sfxInvalid(); haptic("invalid");
    }
    // Reveal, then advance.
    window.setTimeout(() => {
      if (idx + 1 >= qs.length) {
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        const finalScore = right ? score + POINTS + Math.max(0, streak) * STREAK_BONUS : score;
        sfxGameOver(correctN + (right ? 1 : 0) >= qs.length / 2);
        track("game_over", { game: "tcg-quiz", score: finalScore, correct: correctN + (right ? 1 : 0), total: qs.length, mode, signed_in: !!meRef.current });
        saveScore(finalScore, durationSec);
        setPhase("over");
      } else {
        if (right && (streak + 1) % 3 === 0) sfxMilestone();
        setIdx((n) => n + 1);
        setPicked(null);
      }
    }, 1100);
  };

  const q = qs[idx];
  const inRun = phase === "playing";
  const shareText = `🃏 TCG Quiz — ${score.toLocaleString()} pts (${correctN}/${qs.length}) on Gamerplex. Know your cards better than me?`;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#07060f", color: "#fff", fontFamily: "'Space Grotesk', sans-serif", overflowX: "hidden" }}>
      <style>{GLASS_CSS}</style>
      <div className="gl-bg" aria-hidden="true" />

      <nav style={{ position: "relative", zIndex: 1, ...glassPanel, margin: "12px 12px 0", borderRadius: 18, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <BackToGames />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#ffd24a", fontWeight: 800, letterSpacing: 2 }}>🃏 TCG QUIZ</span>
            {me ? (
              <a href="/profile" className="gl-user">
                <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.handle || me.email?.split("@")[0] || "you"}</span>
                {credits != null && <span style={{ color: GREEN, fontWeight: 800 }}>⚡{credits}</span>}
              </a>
            ) : (
              <button onClick={() => { setShowLogin(true); track("login_prompt", { game: "tcg-quiz", source: "nav" }); }} className="gl-signin">Sign in</button>
            )}
          </div>
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "clamp(14px,4vw,26px) 14px 32px" }}>
        {/* ---------- READY ---------- */}
        {phase === "ready" && (
          <div style={{ ...glassPanel, borderRadius: 24, padding: "clamp(20px,5vw,30px)", textAlign: "center" }}>
            <div style={{ fontSize: "clamp(30px,8vw,48px)", fontWeight: 900, background: "linear-gradient(90deg,#ffd24a,#14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>TCG QUIZ</div>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 14.5, lineHeight: 1.55, marginTop: 10 }}>
              Real cards from the <b style={{ color: "#ffd24a" }}>Sledgit catalog</b>. Name the <b>set</b>, the <b>artist</b>, the <b>year</b>.
              {" "}Answer fast, build a <b style={{ color: GREEN }}>streak</b> — each one in a row is worth more.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              {MODES.map((m) => (
                <button key={m.id} onClick={() => void begin(m.id)} disabled={loading}
                  style={{ padding: "14px 18px", fontSize: 15, fontWeight: 800, color: "#0d0a02", background: "linear-gradient(90deg,#ffd24a,#14F195)", border: "none", borderRadius: 14, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
                  {m.label} <span style={{ fontWeight: 600, opacity: 0.7 }}>· {m.hint}</span>
                </button>
              ))}
            </div>
            {loading && <div style={{ marginTop: 14, fontSize: 13, color: "#9fb0d0" }}>Dealing cards…</div>}
            {loadErr && <div style={{ marginTop: 14, fontSize: 13, color: "#ff7a86" }}>{loadErr}</div>}
            <div style={{ marginTop: 18, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{N_QUESTIONS} cards · free · Credits for every correct answer</div>
            <div style={{ ...glassPanel, borderRadius: 18, padding: 14, marginTop: 22 }}>
              <ShellLeaderboard gameId="tcg-quiz" crossApp highlightUserId={me?.id} defaultWindow="all" limit={8} />
            </div>
            <div style={{ marginTop: 18 }}><CommunityLinks tone="dark" /></div>
          </div>
        )}

        {/* ---------- PLAYING ---------- */}
        {inRun && q && (
          <div style={{ ...glassPanel, borderRadius: 24, padding: "clamp(16px,4vw,24px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "monospace", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#9fb0d0" }}>{idx + 1} / {qs.length}</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: GREEN }}>{score.toLocaleString()}</span>
              {streak >= 2 && <span style={{ fontSize: 13, fontWeight: 800, color: "#ffd24a" }}>🔥 {streak}</span>}
            </div>

            {/* the card — the whole point of the quiz */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.image} alt="Guess this card" style={{ width: "100%", maxWidth: 260, margin: "0 auto", display: "block", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }} />

            <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, margin: "16px 0 12px" }}>{q.prompt}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {q.options.map((o, i) => {
                const isAnswer = i === q.answer;
                const chosen = picked === i;
                const bg = picked === null ? "rgba(255,255,255,0.07)" : isAnswer ? "rgba(20,241,149,0.22)" : chosen ? "rgba(255,91,123,0.22)" : "rgba(255,255,255,0.04)";
                const bd = picked === null ? "rgba(255,255,255,0.16)" : isAnswer ? GREEN : chosen ? "#ff5b7b" : "rgba(255,255,255,0.1)";
                return (
                  <button key={`${o}-${i}`} onClick={() => answer(i)} disabled={picked !== null}
                    style={{ padding: "12px 14px", fontSize: 14, fontWeight: 700, textAlign: "left", color: "#fff", background: bg, border: `1px solid ${bd}`, borderRadius: 12, cursor: picked === null ? "pointer" : "default" }}>
                    {o}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: "#9fb0d0" }}>
                {picked === q.answer ? "✅ Correct" : "❌ Nope"} · <b style={{ color: "#e8e8f0" }}>{q.card}</b>
              </div>
            )}
          </div>
        )}

        {/* ---------- OVER ---------- */}
        {phase === "over" && (
          <>
            <div style={{ ...glassPanel, borderRadius: 24, padding: "22px 16px" }}>
              <ShellResultScreen
                theme="dark"
                headline={correctN === qs.length ? "🏆 PERFECT ROUND" : correctN >= qs.length / 2 ? "🃏 Nice run" : "🃏 Round over"}
                win={correctN >= qs.length / 2}
                score={score}
                extraStat={<>{correctN}/{qs.length} correct · {MODES.find((m) => m.id === mode)?.label ?? mode}</>}
                saveStatus={saveState}
                best={savedBest}
                credits={credits}
                onRetrySave={() => saveScore(score, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)))}
                onPlayAgain={() => void begin(mode)}
                onSignIn={() => { setShowLogin(true); track("login_prompt", { game: "tcg-quiz", source: "gameover" }); }}
                onShare={() => { setShowShare(true); track("share_open", { game: "tcg-quiz" }); }}
                shareLabel="🔗 Challenge"
                needsHandle={!!me && !me.handle}
                onClaimName={() => setShowClaim(true)}
                arcadeHref="/"
              />
            </div>
            <ShareSheet open={showShare} onClose={() => setShowShare(false)} text={shareText}
              url={buildShareUrl("https://gamerplex.com/play/tcg-quiz", me?.id)}
              onShared={(m) => track("share_result", { game: "tcg-quiz", method: m })} />
            <ClaimHandleModal open={showClaim} onClose={() => setShowClaim(false)} onClaimed={() => { setShowClaim(false); void refreshIdentity(); }} />
            <div style={{ ...glassPanel, borderRadius: 20, padding: 16, marginTop: 16 }}>
              <ShellLeaderboard gameId="tcg-quiz" crossApp highlightUserId={me?.id} selfScore={score} selfHandle={me?.handle} defaultWindow="all" />
            </div>
            <div style={{ marginTop: 16 }}><CommunityLinks tone="dark" /></div>
          </>
        )}
      </div>
    </div>
  );
}
