"use client";

// Canonical Arcade Shell results screen — ONE best-practice game-over layout,
// shared across every game (sits alongside ShellLeaderboard as a Shell surface).
// Presentational only: the game owns save/credits/on-chain
// plumbing and feeds this component state + slots. Standardizes the *hierarchy*
// (the fix for the old text-heavy, undifferentiated mess):
//
//   1. Headline + score hero + one extra stat        (the payoff)
//   2. Result strip: ✓ Saved · best comparison        (answers "did it save?")
//   3. Two co-primary CTAs: Play again + Challenge     (retention + the viral loop)
//   4. On-chain "save forever" — surfaced reveal, not a buried accordion
//   5. Footer: Arcade · Go Plus                        (tertiary)
//
// Two themes: "gradient" (celebratory overlay, e.g. Blockwords) and "dark".

import { useEffect, useState } from "react";
import { web3Blocked } from "../../lib/geo";

type SaveStatus = "saving" | "saved" | "signed_out" | "error";
type Theme = "gradient" | "dark";

export default function ShellResultScreen({
  headline,
  gameId,
  score,
  win = false,
  extraStat,
  saveStatus,
  best = null,
  credits = null,
  onRetrySave,
  onPlayAgain,
  onSignIn,
  loginHref,
  onShare,
  shareLabel = "🔗 Challenge",
  onChainSlot,
  onChainEnabled = false,
  onChainCta = "🔒 Save on-chain forever · $0.05",
  needsHandle = false,
  onClaimName,
  arcadeHref = "/arcade",
  onHome,
  onGoPlus,
  theme = "dark",
  children,
}: {
  headline: string;
  gameId?: string;                  // enables a device-local "your best" fallback (guests + pre-save)
  score: number;
  win?: boolean;
  extraStat?: React.ReactNode;
  saveStatus: SaveStatus;
  best?: number | null;             // server personal best (>= score after this save)
  credits?: number | null;
  onRetrySave?: () => void;
  onPlayAgain: () => void;
  onSignIn?: () => void;            // logged-out primary (in-page modal); falls back to loginHref
  loginHref?: string;
  onShare: () => void;             // opens the game's ShareSheet — the growth loop
  shareLabel?: string;
  onChainSlot?: React.ReactNode;   // game-specific upgrade stack, revealed on demand
  onChainEnabled?: boolean;        // kill-switch gate
  onChainCta?: string;
  needsHandle?: boolean;           // signed-in but no username → nudge to claim (drives real names on the board)
  onClaimName?: () => void;
  arcadeHref?: string;
  onHome?: () => void;
  onGoPlus?: () => void;
  theme?: Theme;
  children?: React.ReactNode;      // confetti, tx links, etc.
}) {
  const [showOnchain, setShowOnchain] = useState(false);
  // In an OFAC-sanctioned region no token may move — hide the on-chain reveal
  // (the free save still works). Checked after mount so SSR never leaks it.
  const [web3Off, setWeb3Off] = useState(false);
  useEffect(() => { setWeb3Off(web3Blocked()); }, []);
  const t = theme === "gradient" ? GRADIENT : DARK;

  // Personal best = the server `best` (when signed in) OR a device-local
  // (localStorage) fallback, so guests and not-yet-saved runs still see a best —
  // the point of the fix: a lower re-run is never "lost"; we always show THIS
  // RUN vs YOUR BEST.
  const [localBest, setLocalBest] = useState<number | null>(null);
  useEffect(() => {
    if (!gameId || typeof window === "undefined") return;
    const key = `gp_best_${gameId}`;
    let stored = 0;
    try { stored = Number(window.localStorage.getItem(key)) || 0; } catch {}
    const next = Math.max(stored, score);
    if (next !== stored) { try { window.localStorage.setItem(key, String(next)); } catch {} }
    setLocalBest(next);
  }, [gameId, score]);
  const hasBest = best != null || localBest != null;
  const bestKnown = Math.max(best ?? 0, localBest ?? 0, score); // best is at least this run
  const isNewBest = hasBest && score >= bestKnown;              // this run tied/beat the record
  const toBeat = hasBest && !isNewBest ? bestKnown - score : null;

  return (
    <div style={{ width: "100%", maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
      {children}

      <div style={{ fontSize: 15, fontWeight: 900, color: t.head, letterSpacing: 0.5 }}>
        {isNewBest ? "🎉 New personal best!" : headline}
      </div>

      {/* Score hero — this run */}
      {hasBest && !isNewBest && (
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: t.sub, textTransform: "uppercase", marginTop: 4 }}>This run</div>
      )}
      <div style={{ fontSize: "clamp(60px, 16vw, 108px)", fontWeight: 900, fontStyle: "italic", lineHeight: 1, color: t.hero, textShadow: theme === "gradient" ? "0 6px 34px rgba(0,0,0,0.28)" : "none", margin: "2px 0" }}>
        {score.toLocaleString()}
      </div>
      {extraStat && (
        <div style={{ fontSize: 14, color: t.sub, fontWeight: 800, letterSpacing: 0.5, marginBottom: 12 }}>{extraStat}</div>
      )}

      {/* Your best vs this run — always shown (server best or device-local) so a
          lower re-run is never invisible. On a new best the headline already says so. */}
      {hasBest && !isNewBest && (
        <div style={{ fontSize: 13.5, color: t.sub, fontWeight: 800, marginBottom: 10 }}>
          🏆 Your best <span style={{ color: t.head }}>{bestKnown.toLocaleString()}</span>
          {toBeat != null && toBeat > 0 && <> · {toBeat.toLocaleString()} to beat it</>}
        </div>
      )}

      {/* Result strip — the save confirmation + best comparison, one tidy line */}
      {saveStatus === "saved" && (
        <div style={{ ...strip, borderColor: isNewBest ? "rgba(255,215,64,0.55)" : t.stripBorder, background: isNewBest ? "rgba(255,215,64,0.12)" : t.stripBg }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: t.head }}>
            {isNewBest ? "New record 🏆" : "✓ Saved to leaderboard"}
          </span>
          {credits != null && <span style={{ ...pill, color: t.head, borderColor: t.stripBorder }}>⚡ {credits}</span>}
        </div>
      )}
      {saveStatus === "saving" && <div style={{ fontSize: 13, color: t.sub, minHeight: 20, fontWeight: 700 }}>Saving your score…</div>}
      {saveStatus === "error" && (
        <div style={{ fontSize: 13, color: "#ff6b6b", minHeight: 20, fontWeight: 700 }}>
          Couldn’t save.{" "}
          {onRetrySave && <button onClick={onRetrySave} style={linkBtn(t.head)}>Retry</button>}
        </div>
      )}

      {/* Named-nudge: signed in but no username → the biggest driver of real names on the board */}
      {saveStatus === "saved" && needsHandle && onClaimName && (
        <button
          onClick={onClaimName}
          style={{ marginTop: 8, padding: "9px 15px", borderRadius: 999, border: `1px dashed ${t.stripBorder}`, background: t.stripBg, color: t.head, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
        >
          🟡 Pick a username — you’re on the board as a guest name
        </button>
      )}

      {/* Logged-out: the email save IS the hero action (web2-first, no wallet) */}
      {saveStatus === "signed_out" && (
        <div style={{ width: "100%", maxWidth: 340, marginTop: 4 }}>
          <button onClick={onSignIn ?? (() => { if (loginHref) window.location.href = loginHref; })} style={{ ...btn, ...t.primary, width: "100%", height: 54 }}>
            💾 Save my score
          </button>
          <div style={{ fontSize: 12, color: t.sub, textAlign: "center", marginTop: 8 }}>Free · just your email · keep your spot 🏆</div>
        </div>
      )}

      {/* Co-primary actions: retention (play again) + virality (challenge). Both
          vibrant, taller, gently pulsing to invite the tap — the addictive loop. */}
      <style>{`
        @keyframes gpCtaPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.018); } }
        .gp-cta { animation: gpCtaPulse 2.4s ease-in-out infinite; }
        .gp-cta:active { transform: scale(0.96); animation: none; }
        @keyframes gpShine { 0% { transform: translateX(-140%); } 55%,100% { transform: translateX(260%); } }
        .gp-shine { position: relative; overflow: hidden; }
        .gp-shine::after { content: ""; position: absolute; top: 0; left: 0; width: 38%; height: 100%; background: linear-gradient(100deg, transparent, rgba(255,255,255,0.22), transparent); animation: gpShine 3.4s ease-in-out infinite; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) { .gp-cta { animation: none; } .gp-shine::after { display: none; } }
      `}</style>
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 360, marginTop: 14 }}>
        <button className="gp-cta" onClick={onPlayAgain} style={{ ...btn, ...t.primary, flex: 1, height: 58, fontSize: 16.5 }}>↻ Play again</button>
        <button className="gp-cta" onClick={onShare} style={{ ...btn, ...t.secondary, flex: 1, height: 58, fontSize: 16.5 }}>{shareLabel}</button>
      </div>

      {/* On-chain "save forever" — a visible secondary reveal, never a hidden accordion */}
      {onChainEnabled && onChainSlot && !web3Off && (
        <div style={{ width: "100%", maxWidth: 360, marginTop: 14 }}>
          {!showOnchain ? (
            // Aspirational, not loud: a premium shimmering "verified forever" flex
            // that invites the paid save without out-shouting the free loops above.
            <button onClick={() => setShowOnchain(true)} className="gp-shine" style={onchainTeaser}>
              <span style={{ fontSize: 14.5, fontWeight: 900, letterSpacing: 0.2, color: "#fff" }}>🔒 Make it permanent — Verified ✓</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.82, marginTop: 3, color: "#cdbcff" }}>Provably yours forever · on Solana · $0.05</span>
            </button>
          ) : (
            <div style={{ width: "100%" }}>{onChainSlot}</div>
          )}
        </div>
      )}

      {/* Footer: tertiary links, out of the primary flow */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 16 }}>
        {onHome ? (
          <button onClick={onHome} style={footerLink(t.sub)}>← Arcade</button>
        ) : (
          <a href={arcadeHref} style={{ ...footerLink(t.sub), textDecoration: "none" }}>← Arcade</a>
        )}
        {onGoPlus && <button onClick={onGoPlus} style={footerLink(t.sub)}>✦ Go Plus</button>}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  height: 52, borderRadius: 13, border: "none", fontSize: 15, fontWeight: 900,
  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "0 16px", boxSizing: "border-box",
};
const onchainTeaser: React.CSSProperties = {
  width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  padding: "12px 16px", borderRadius: 14, cursor: "pointer",
  border: "1px solid rgba(153,69,255,0.55)",
  background: "linear-gradient(135deg, rgba(153,69,255,0.20), rgba(20,241,149,0.10))",
  boxShadow: "0 6px 22px rgba(153,69,255,0.22)",
};
const strip: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center",
  padding: "8px 14px", borderRadius: 12, border: "1px solid", marginBottom: 2, minHeight: 20,
};
const pill: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, padding: "2px 8px", borderRadius: 999, border: "1px solid",
};
function linkBtn(color: string): React.CSSProperties {
  return { background: "none", border: "none", color, fontWeight: 800, cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" };
}
function footerLink(color: string): React.CSSProperties {
  return { background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, color };
}

// Theme tokens ─────────────────────────────────────────────────────────
// primary = replay (retention, white/bright). secondary = challenge (virality —
// vibrant green→cyan, co-equal, NOT a faded ghost). tertiary = the $0.05 upsell,
// deliberately quiet so it never outshouts the two FREE addictive loops.
const GRADIENT = {
  head: "#fff", hero: "#fff", sub: "rgba(255,255,255,0.9)",
  stripBg: "rgba(255,255,255,0.12)", stripBorder: "rgba(255,255,255,0.28)",
  primary: { background: "#fff", color: "#9c27b0", boxShadow: "0 8px 26px rgba(0,0,0,0.28)" } as React.CSSProperties,
  secondary: { background: "linear-gradient(100deg,#14F195,#22d3ee)", color: "#03251b", boxShadow: "0 8px 24px rgba(20,241,149,0.42)" } as React.CSSProperties,
  tertiary: { background: "transparent", color: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.32)", fontSize: 13, height: 44 } as React.CSSProperties,
};
const DARK = {
  head: "#e8e8f0", hero: "#14F195", sub: "#9a9ab0",
  stripBg: "rgba(255,255,255,0.04)", stripBorder: "rgba(255,255,255,0.1)",
  primary: { background: "#fff", color: "#0a0a12", boxShadow: "0 8px 24px rgba(255,255,255,0.12)" } as React.CSSProperties,
  secondary: { background: "linear-gradient(100deg,#14F195,#22d3ee)", color: "#03251b", boxShadow: "0 8px 22px rgba(20,241,149,0.35)" } as React.CSSProperties,
  tertiary: { background: "transparent", color: "#b388ff", border: "1px solid rgba(153,69,255,0.4)", fontSize: 13, height: 44 } as React.CSSProperties,
};
