"use client";

// Shared Arcade Shell game-over flow — identical across every game.
// The web2-first loop: on game-over we auto-save the score to the FREE
// leaderboard (email login only, no wallet). Then, optionally, "Make it
// permanent & verified — $0.05" runs the on-chain arcade save and stitches the
// tx onto the leaderboard row (the ✓ Verified flex). Wallet only ever appears
// at that upgrade click. Fully responsive.

import { useEffect, useRef, useState } from "react";
import ShellLeaderboard from "./ShellLeaderboard";
import GoPlusModal from "./GoPlusModal";
import { track } from "../../lib/analytics";

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
  const [verify, setVerify] = useState<"idle" | "saving" | "verified" | "error">("idle");
  const [showPlus, setShowPlus] = useState(false);
  const submitted = useRef(false);

  // Auto web2-save once, on mount.
  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    (async () => {
      try {
        const res = await fetch("/api/scores/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId, score, refId, variant, durationSec }),
        });
        if (res.status === 401) { setSave("signed_out"); return; }
        setSave(res.ok ? "saved" : "error");
      } catch { setSave("error"); }
    })();
  }, [gameId, score, refId, variant, durationSec]);

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

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "clamp(12px, 4vw, 20px)", boxSizing: "border-box", textAlign: "center" }}>
      <div style={{ fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, color: "#e8e8f0" }}>GAME OVER</div>
      <div style={{ fontSize: "clamp(28px, 9vw, 40px)", fontWeight: 900, color: "#14F195", fontFamily: "monospace", marginTop: 6 }}>
        {score.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 1 }}>SCORE</div>

      {/* web2 save status — the default, free, no-wallet path */}
      <div style={{ marginTop: 14, minHeight: 22 }}>
        {save === "saving" && <span style={{ fontSize: 12, color: "#888" }}>Saving to leaderboard…</span>}
        {save === "saved" && (
          <span style={{ fontSize: 13, color: "#14F195", fontWeight: 700 }}>
            ✓ Saved to leaderboard · 🔥 come back tomorrow to keep your streak
          </span>
        )}
        {save === "signed_out" && (
          <a href={loginHref} style={{ fontSize: 13, color: "#000", fontWeight: 800, background: "linear-gradient(90deg,#9945FF,#14F195)", padding: "10px 16px", borderRadius: 10, textDecoration: "none", display: "inline-block" }}>
            Sign in to save your score & rank →
          </a>
        )}
        {save === "error" && <span style={{ fontSize: 12, color: "#ff6b6b" }}>Couldn’t save — try again.</span>}
      </div>

      {/* optional on-chain upgrade — the paid "verified" flex; wallet appears here only */}
      {save === "saved" && onSaveOnChain && (
        <div style={{ marginTop: 8 }}>
          {verify === "verified" ? (
            <span style={{ fontSize: 12, color: "#14F195", fontWeight: 700 }}>✓ Verified on-chain — permanent & provably legit</span>
          ) : (
            <button
              onClick={upgrade}
              disabled={verify === "saving"}
              style={{ fontSize: 12, fontWeight: 700, color: "#b388ff", background: "rgba(153,69,255,0.08)", border: "1px solid rgba(153,69,255,0.4)", borderRadius: 8, padding: "8px 14px", cursor: verify === "saving" ? "default" : "pointer" }}
            >
              {verify === "saving" ? "Saving on-chain…" : "🔒 Make it permanent & verified — $0.05"}
            </button>
          )}
          {verify === "error" && <div style={{ fontSize: 11, color: "#ff6b6b", marginTop: 4 }}>On-chain save failed — your leaderboard score is safe.</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={onPlayAgain} style={btn("#14F195")}>✦ Play Again</button>
        <button onClick={onHome} style={btn("#9945FF")}>← Home</button>
      </div>

      {/* Subtle Gamerplex Plus fake-door — every game gets it via the shared shell. */}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={() => { setShowPlus(true); track("plus_opened", { source: "gameover", game: gameId }); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#b388ff", opacity: 0.85 }}
        >
          ✦ Go Plus — more play, no ads
        </button>
      </div>
      <GoPlusModal open={showPlus} onClose={() => setShowPlus(false)} source="gameover" />

      <div style={{ marginTop: 18 }}>
        <ShellLeaderboard gameId={gameId} highlightUserId={userId ?? undefined} limit={10} />
      </div>
    </div>
  );
}

function btn(accent: string): React.CSSProperties {
  return {
    flex: "1 1 auto", minWidth: 120, maxWidth: 220,
    padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer",
    color: "#e8e8f0", background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}55`,
  };
}
