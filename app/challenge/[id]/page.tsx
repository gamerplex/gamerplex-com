"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const RESOLVER_URL = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

interface Challenge {
  id: string;
  creator: string;
  game: string;
  stake: number;
  status: "open" | "accepted" | "expired" | "cancelled";
  acceptedBy: string | null;
  matchEventId: string | null;
  createdAt: number;
}

const GAME_META: Record<string, { emoji: string; label: string; route: string; accent: string }> = {
  chess: { emoji: "♟", label: "Magic Chess", route: "/play/magic-chess", accent: "var(--purple)" },
  blockwords: { emoji: "🔮", label: "Blockwords", route: "/play/blockwords", accent: "var(--yellow)" },
  pla: { emoji: "⚔️", label: "Pet Legends Arena", route: "/play/pla", accent: "var(--orange)" },
  "cyber-snake": { emoji: "🐍", label: "Cyber Snake", route: "/play/cyber-snake-battle", accent: "var(--green)" },
};

const shortWallet = (w: string) => w.slice(0, 4) + "…" + w.slice(-4);

export default function ChallengePage() {
  const params = useParams();
  const id = params.id as string;
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${RESOLVER_URL}/challenge/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setChallenge(data.challenge);
        else setError(data.error);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const game = challenge ? GAME_META[challenge.game] : null;

  return (
    <>
      {/* Minimalist top nav — matches home */}
      <nav className="top-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          <Link href="/#featured">Play</Link>
          <Link href="/docs">Build</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/profile">Profile</Link>
        </div>
      </nav>

      {/* Hero: full-screen Tron-grid bg, single card centered */}
      <section style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        position: "relative",
        background: "radial-gradient(ellipse at 30% 10%, rgba(153,69,255,0.18), transparent 60%), radial-gradient(ellipse at 70% 90%, rgba(0,242,255,0.10), transparent 55%)",
      }}>
        {/* Tron grid mesh */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(153,69,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(153,69,255,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }} />

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480 }}>
          {loading && (
            <div style={{ textAlign: "center", color: "var(--dim)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              Loading challenge…
            </div>
          )}

          {error && (
            <div style={{
              textAlign: "center",
              padding: "32px 28px",
              background: "var(--card-bg-hi)",
              border: "1px solid rgba(255,82,48,0.35)",
              borderRadius: 16,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.5 }}>⚠️</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, fontStyle: "italic" }}>Challenge not found</div>
              <div style={{ color: "var(--dim)", fontSize: 13, marginBottom: 20 }}>{error}</div>
              <Link href="/" style={{
                display: "inline-block",
                padding: "12px 28px",
                background: "linear-gradient(90deg, #9945FF, #14F195)",
                color: "#000",
                borderRadius: 8,
                fontWeight: 900,
                fontStyle: "italic",
                fontSize: 13,
                textDecoration: "none",
              }}>← Back to home</Link>
            </div>
          )}

          {challenge && challenge.status === "open" && game && (
            <>
              {/* Eyebrow */}
              <div style={{
                textAlign: "center",
                fontSize: 11,
                letterSpacing: 3,
                color: "var(--green)",
                fontWeight: 800,
                textTransform: "uppercase",
                marginBottom: 10,
              }}>
                ● You've been challenged
              </div>

              {/* Hero card */}
              <div style={{
                background: "var(--card-bg-hi)",
                border: "1px solid rgba(153,69,255,0.55)",
                borderRadius: 18,
                padding: "32px 28px",
                backdropFilter: "blur(12px)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 80px rgba(153,69,255,0.25)",
                textAlign: "center",
              }}>
                {/* Big game icon */}
                <div style={{ fontSize: 96, lineHeight: 1, marginBottom: 8, filter: "drop-shadow(0 0 32px " + game.accent + ")" }}>
                  {game.emoji}
                </div>

                {/* Game name */}
                <div style={{ fontSize: 28, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5, marginBottom: 4 }}>
                  {game.label}
                </div>

                {/* Challenger */}
                <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 22, letterSpacing: 0.5 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>{shortWallet(challenge.creator)}</span> wants to compete 1v1
                </div>

                {/* Prize pool — hero element */}
                <div style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "16px 32px",
                  background: "linear-gradient(135deg, rgba(153,69,255,0.15), rgba(20,241,149,0.1))",
                  border: "1px solid rgba(153,69,255,0.4)",
                  borderRadius: 14,
                  marginBottom: 24,
                }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--dim)", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                    Entry · winner takes
                  </div>
                  <div style={{
                    fontSize: 48,
                    fontWeight: 900,
                    fontStyle: "italic",
                    lineHeight: 1,
                    background: "linear-gradient(135deg, #9945FF, #14F195)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>
                    ${challenge.stake}<span style={{ fontSize: 18, color: "var(--dim)", WebkitTextFillColor: "var(--dim)", marginLeft: 4, fontStyle: "normal" }}>→</span>
                    <span style={{ color: "var(--green)", WebkitTextFillColor: "var(--green)" }}>${(challenge.stake * 2 * 0.98).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 6, letterSpacing: 0.5 }}>
                    USDF · 2% service fee · settled on-chain
                  </div>
                </div>

                {/* Primary CTA */}
                <Link
                  href={`${game.route}?challenge=${challenge.id}`}
                  style={{
                    display: "block",
                    padding: "18px 32px",
                    background: "linear-gradient(90deg, #9945FF, #14F195)",
                    color: "#000",
                    borderRadius: 12,
                    fontSize: 17,
                    fontWeight: 900,
                    fontStyle: "italic",
                    letterSpacing: 0.5,
                    textDecoration: "none",
                    boxShadow: "0 0 32px rgba(20,241,149,0.55), 0 0 64px rgba(153,69,255,0.35)",
                    marginBottom: 14,
                  }}
                >
                  ⚔ Accept Challenge
                </Link>

                {/* How it works — collapsed by default */}
                <details style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(153,69,255,0.18)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 6,
                  textAlign: "left",
                }}>
                  <summary style={{
                    cursor: "pointer",
                    listStyle: "none",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    color: "var(--cyan)",
                    textTransform: "uppercase",
                    display: "flex",
                    justifyContent: "space-between",
                  }}>
                    <span>How it works</span><span style={{ color: "var(--dim)" }}>+</span>
                  </summary>
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
                    <div>1. Connect your Solana wallet (Phantom / Solflare / Backpack)</div>
                    <div>2. Deposit <b style={{ color: "var(--green)" }}>${challenge.stake} USDF</b> into escrow PDA</div>
                    <div>3. Play the match — every move on Solana via MagicBlock ER</div>
                    <div>4. Winner takes <b style={{ color: "var(--green)" }}>98%</b> · settled by CM v2.1 permissionless resolve</div>
                  </div>
                </details>
              </div>

              {/* Create your own */}
              <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--dim)" }}>
                Want to challenge someone?{" "}
                <Link href={game.route} style={{ color: "var(--green)", textDecoration: "none", fontWeight: 700 }}>
                  Create your own →
                </Link>
              </div>
            </>
          )}

          {challenge && challenge.status === "accepted" && (
            <div style={{
              textAlign: "center",
              padding: "32px 28px",
              background: "var(--card-bg-hi)",
              border: "1px solid rgba(153,69,255,0.35)",
              borderRadius: 16,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ fontSize: 64, marginBottom: 12 }}>⚔️</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, fontStyle: "italic" }}>Match in progress</div>
              <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 20, fontFamily: "'JetBrains Mono', monospace" }}>
                {shortWallet(challenge.acceptedBy || "")} vs {shortWallet(challenge.creator)}
              </div>
              <Link href="/" style={{
                display: "inline-block",
                padding: "12px 28px",
                background: "linear-gradient(90deg, #9945FF, #14F195)",
                color: "#000",
                borderRadius: 8,
                fontWeight: 900,
                fontStyle: "italic",
                fontSize: 13,
                textDecoration: "none",
              }}>Create your own →</Link>
            </div>
          )}

          {challenge && (challenge.status === "expired" || challenge.status === "cancelled") && (
            <div style={{
              textAlign: "center",
              padding: "32px 28px",
              background: "var(--card-bg-hi)",
              border: "1px solid rgba(255,82,48,0.3)",
              borderRadius: 16,
              backdropFilter: "blur(8px)",
            }}>
              <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.5 }}>⌛</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, fontStyle: "italic" }}>
                Challenge {challenge.status}
              </div>
              <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 20 }}>
                This invite is no longer active
              </div>
              <Link href="/" style={{
                display: "inline-block",
                padding: "12px 28px",
                background: "linear-gradient(90deg, #9945FF, #14F195)",
                color: "#000",
                borderRadius: 8,
                fontWeight: 900,
                fontStyle: "italic",
                fontSize: 13,
                textDecoration: "none",
              }}>Create your own →</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
