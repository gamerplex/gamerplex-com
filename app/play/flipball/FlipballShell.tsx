"use client";

// Flipball inside the Gamerplex Arcade Shell. Flipball is a separate Astro +
// Rapier app (its own bundle/stack), so we embed it as an iframe here and bridge
// its score out via postMessage. The shell (this page, same gamerplex.com origin)
// owns nav + login + the free web2 leaderboard save — so flipball needs NO wallet
// to be ranked, fixing its "Select Wallet"-only dead-end. Fully responsive.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShellLeaderboard from "../../../components/arcade/ShellLeaderboard";

const FLIPBALL_ORIGIN = "https://flipball.gamerplex.com";

export default function FlipballShell() {
  const [saved, setSaved] = useState<null | "saving" | "saved" | "signed_out">(null);
  const lastRun = useRef<string | null>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Only trust messages from the embedded flipball origin.
      if (e.origin !== FLIPBALL_ORIGIN) return;
      const d = e.data;
      if (!d || d.type !== "flipball:gameover" || typeof d.score !== "number") return;
      const refId = `flipball:${d.runId ?? d.score}:${Math.floor(d.durationSec ?? 0)}`;
      if (lastRun.current === refId) return; // de-dupe
      lastRun.current = refId;
      setSaved("saving");
      void fetch("/api/scores/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "flipball", score: d.score, refId, durationSec: d.durationSec }),
      })
        .then((r) => setSaved(r.status === 401 ? "signed_out" : "saved"))
        .catch(() => setSaved("saved"));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0d001a", color: "#e8e8f0", fontFamily: "'Space Grotesk', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px clamp(12px, 4vw, 20px)", borderBottom: "1px solid rgba(153,69,255,0.2)" }}>
        <Link href="/" style={{ fontWeight: 900, letterSpacing: 1, color: "#e8e8f0", textDecoration: "none" }}>GAMERPLEX</Link>
        <span style={{ fontWeight: 800, color: "#b388ff", letterSpacing: 2 }}>FLIPBALL</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="https://x.com/gamerplex_com" target="_blank" rel="noopener noreferrer" aria-label="Follow @gamerplex_com on X" title="@gamerplex_com" style={{ display: "inline-flex", alignItems: "center", color: "#b0b0c8" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <Link href="/#featured" style={{ fontSize: 12, color: "#b0b0c8", textDecoration: "none" }}>← Arcade</Link>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 16, padding: "clamp(12px, 3vw, 20px)", alignItems: "flex-start", justifyContent: "center" }}>
        {/* The game — flexible, keeps a play-friendly aspect on all sizes */}
        <div style={{ flex: "1 1 340px", maxWidth: 640, width: "100%" }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 4", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)", background: "#000" }}>
            <iframe
              src={FLIPBALL_ORIGIN}
              title="Flipball"
              allow="autoplay; fullscreen"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
          {saved && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, fontWeight: 700 }}>
              {saved === "saving" && <span style={{ color: "#888" }}>Saving to leaderboard…</span>}
              {saved === "saved" && <span style={{ color: "#14F195" }}>✓ Saved to leaderboard · 🔥 come back tomorrow to keep your streak</span>}
              {saved === "signed_out" && <a href="/?login=1" style={{ color: "#000", background: "linear-gradient(90deg,#9945FF,#14F195)", padding: "8px 14px", borderRadius: 8, textDecoration: "none" }}>Sign in to save your score & rank →</a>}
            </div>
          )}
        </div>

        {/* The shared leaderboard — beside on desktop, below on mobile */}
        <div style={{ flex: "1 1 300px", maxWidth: 560, width: "100%" }}>
          <ShellLeaderboard gameId="flipball" />
        </div>
      </div>
    </div>
  );
}
