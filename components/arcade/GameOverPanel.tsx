"use client";

// Shared Arcade Shell game-over flow — identical across every game.
// The web2-first loop: on game-over we auto-save the score to the FREE
// leaderboard (email login only, no wallet). Then, optionally, "Make it
// permanent — $0.05" runs the on-chain arcade save and stitches the tx onto the
// leaderboard row (the ✓ Verified flex). Wallet only ever appears at that
// upgrade click. Fully responsive, one-thumb, clear hierarchy.

import { useCallback, useEffect, useRef, useState } from "react";
import ShellLeaderboard from "./ShellLeaderboard";
import { maybeCelebrateBest } from "../Hype";
import GoPlusModal from "./GoPlusModal";
import { track } from "../../lib/analytics";
import { purchasesEnabled } from "../../lib/arcade/killswitch";

type SaveState = "saving" | "saved" | "signed_out" | "error";

export default function GameOverPanel({
  gameId,
  score,
  refId,
  variant,
  durationSec,
  userId,
  onSaveOnChain,
  onPlayAgain,
  onHome,
  loginHref = "/?login=1",
}: {
  gameId: string;
  score: number;
  refId: string;                 // run seed — idempotency
  variant?: string;
  durationSec?: number;
  userId?: string | null;        // for "you" highlight; optional
  onSaveOnChain?: () => Promise<string>; // returns the tx signature; wallet flow lives in the game
  onPlayAgain: () => void;
  onHome: () => void;
  loginHref?: string;
}) {
  const [save, setSave] = useState<SaveState>("saving");
  const [myBest, setMyBest] = useState<number | null>(null);
  const [verify, setVerify] = useState<"idle" | "saving" | "verified" | "error">("idle");
  const [showPlus, setShowPlus] = useState(false);
  const submitted = useRef(false);

  const doSave = useCallback(async () => {
    setSave("saving");
    try {
      const res = await fetch("/api/scores/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, score, refId, variant, durationSec }),
      });
      if (res.status === 401) { setSave("signed_out"); return; }
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && typeof body.best === "number") setMyBest(body.best);
        setSave("saved");
      } else setSave("error");
    } catch { setSave("error"); }
  }, [gameId, score, refId, variant, durationSec]);

  // Auto web2-save once, on mount.
  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    doSave();
  }, [doSave]);

  // best is greatest(stored, new), so score >= best ⇒ this run IS the record.
  const isNewBest = save === "saved" && myBest !== null && score >= myBest;

  // Distinct personal-best effect (shared with the other games' ShellLeaderboard
  // path) — fires once on save if this run beat the prior device best for the game.
  useEffect(() => {
    if (save === "saved") maybeCelebrateBest(gameId, score);
  }, [save, gameId, score]);

  const upgrade = async () => {
    if (!onSaveOnChain) return;
    setVerify("saving");
    try {
      const sig = await onSaveOnChain();               // game runs the wallet + SDK save
      await fetch("/api/scores/verify", {              // stitch tx → Verified column
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, refId, txSig: sig }),
      });
      setVerify("verified");
    } catch { setVerify("error"); }
  };

  const gold = "#ffd740";
  const green = "#14F195";

  return (
    <div style={{ width: "100%", maxWidth: 420, margin: "0 auto", padding: "clamp(12px, 4vw, 20px)", boxSizing: "border-box" }}>
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: 3, color: "#777" }}>
        {isNewBest ? "🎉  NEW PERSONAL BEST" : "GAME OVER"}
      </div>

      {/* Result: this run vs your best — the payoff, the biggest thing on screen. */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <StatTile label="THIS RUN" value={score} accent={isNewBest ? gold : green} glow={isNewBest} />
        {save !== "signed_out" && (
          <StatTile
            label="YOUR BEST"
            value={isNewBest ? score : myBest ?? score}
            accent={isNewBest ? gold : "#e8e8f0"}
          />
        )}
      </div>

      {/* One tiny, muted save-status line — never competes with the CTAs. */}
      <div style={{ minHeight: 18, marginTop: 10, textAlign: "center", fontSize: 12 }}>
        {save === "saving" && <span style={{ color: "#888" }}>Saving your score…</span>}
        {save === "saved" && (
          <span style={{ color: "#7a8a80" }}>
            ✓ Saved{!isNewBest && myBest !== null ? ` · ${(myBest - score).toLocaleString()} to beat your best` : ""}
          </span>
        )}
        {save === "error" && (
          <span style={{ color: "#ff6b6b" }}>
            Couldn’t save.{" "}
            <button onClick={doSave} style={{ background: "none", border: "none", color: green, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 }}>Retry</button>
          </span>
        )}
      </div>

      {/* Signed-out: the save-CTA IS the hero. No wallet, just email. */}
      {save === "signed_out" && (
        <a href={loginHref} style={{ ...cta, background: "linear-gradient(90deg,#9945FF,#14F195)", color: "#00110a", marginTop: 4 }}>
          Sign in to save your score &amp; rank
        </a>
      )}

      {/* Primary + secondary actions — one clear next step. */}
      <button onClick={onPlayAgain} style={{ ...cta, background: green, color: "#00110a", marginTop: 12 }}>
        ✦ Play Again
      </button>
      <button onClick={onHome} style={{ ...cta, background: "transparent", color: "#c8c8d4", border: "1px solid rgba(255,255,255,0.14)", marginTop: 8 }}>
        Home
      </button>

      {/* On-chain upgrade — a quiet secondary link, wallet appears only here.
          Hidden by the kill-switch (NEXT_PUBLIC_GAME_PURCHASES_ENABLED=false). */}
      {save === "saved" && onSaveOnChain && purchasesEnabled() && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          {verify === "verified" ? (
            <span style={{ fontSize: 12, color: green, fontWeight: 700 }}>✓ Verified on-chain — permanent</span>
          ) : (
            <button
              onClick={upgrade}
              disabled={verify === "saving"}
              style={{ background: "none", border: "none", cursor: verify === "saving" ? "default" : "pointer", fontSize: 12, fontWeight: 700, color: "#b388ff" }}
            >
              {verify === "saving" ? "Saving on-chain…" : "🔒 Make this score permanent · $0.05"}
            </button>
          )}
          {verify === "error" && <div style={{ fontSize: 11, color: "#ff6b6b", marginTop: 4 }}>On-chain save failed — your leaderboard score is safe.</div>}
        </div>
      )}

      {/* Leaderboard section — clearly delimited, its own block. */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <ShellLeaderboard gameId={gameId} highlightUserId={userId ?? undefined} limit={10} />
      </div>

      {/* Go Plus — a genuine footer link, out of the primary flow. */}
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button
          onClick={() => { setShowPlus(true); track("plus_opened", { source: "gameover", game: gameId }); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#666" }}
        >
          ✦ Go Plus — more play, no ads
        </button>
      </div>
      <GoPlusModal open={showPlus} onClose={() => setShowPlus(false)} source="gameover" />
    </div>
  );
}

function StatTile({ label, value, accent, glow }: { label: string; value: number; accent: string; glow?: boolean }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "14px 8px", borderRadius: 14,
      background: glow ? "rgba(255,215,64,0.08)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${glow ? "rgba(255,215,64,0.5)" : "rgba(255,255,255,0.08)"}`,
    }}>
      <div style={{ fontSize: "clamp(26px, 9vw, 38px)", fontWeight: 900, fontFamily: "monospace", color: accent, lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#777", marginTop: 6, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

const cta: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box",
  padding: "14px 16px", borderRadius: 12, fontSize: 15, fontWeight: 800,
  textAlign: "center", textDecoration: "none", cursor: "pointer", border: "none",
};
