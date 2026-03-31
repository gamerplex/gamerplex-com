"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const RESOLVER_URL = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://gamerplex-resolver-508521387980.us-central1.run.app";

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

  const shortWallet = (w: string) => w.slice(0, 4) + "..." + w.slice(-4);
  const gameEmoji: Record<string, string> = {
    "Reaction Duel": "⚡",
    "Math Race": "🧮",
    "Trivia Battle": "🧠",
  };

  const gameRoute: Record<string, string> = {
    "Reaction Duel": "/play/reaction-duel",
    "Math Race": "/play/math-race",
    "Trivia Battle": "/play/trivia-battle",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#050508", color: "#e8e8f0",
      fontFamily: "'Space Grotesk', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <Link href="/" style={{
        position: "absolute", top: 20, left: 20,
        fontSize: 18, fontWeight: 700, textDecoration: "none",
        background: "linear-gradient(135deg, #ff6b2c, #ffd740)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>GAMERPLEX</Link>

      {loading && (
        <div style={{ color: "#555570", fontFamily: "monospace" }}>Loading challenge...</div>
      )}

      {error && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😵</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Challenge Not Found</div>
          <div style={{ color: "#555570", fontSize: 14, marginBottom: 24 }}>{error}</div>
          <Link href="/" style={{
            background: "#14141f", border: "1px solid #252540", borderRadius: 8,
            padding: "10px 24px", color: "#e8e8f0", textDecoration: "none", fontSize: 13,
          }}>Back to Arena</Link>
        </div>
      )}

      {challenge && challenge.status === "open" && (
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          {/* The Challenge Card */}
          <div style={{
            background: "#0c0c14", border: "1px solid #252540", borderRadius: 16,
            padding: 32, marginBottom: 24,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {gameEmoji[challenge.game] || "🎮"}
            </div>

            <div style={{ fontSize: 13, color: "#555570", marginBottom: 4, textTransform: "uppercase", letterSpacing: 2 }}>
              You've been challenged
            </div>

            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
              {challenge.game}
            </div>

            <div style={{
              display: "inline-block", background: "linear-gradient(135deg, #ff6b2c, #ffd740)",
              borderRadius: 8, padding: "8px 20px", marginBottom: 16,
            }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#000" }}>
                ${challenge.stake} USDC
              </span>
            </div>

            <div style={{ color: "#555570", fontSize: 13, marginBottom: 20 }}>
              <span style={{ color: "#448aff" }}>{shortWallet(challenge.creator)}</span> wants to play you for ${challenge.stake}.
              <br />Winner takes ${(challenge.stake * 2 * 0.98).toFixed(2)}.
            </div>

            {/* How it works */}
            <div style={{
              background: "#14141f", borderRadius: 8, padding: 16, marginBottom: 20,
              textAlign: "left", fontSize: 12, color: "#555570", lineHeight: 1.8,
            }}>
              <div style={{ color: "#888", fontWeight: 600, marginBottom: 4 }}>HOW IT WORKS</div>
              <div>1. Connect your Solana wallet</div>
              <div>2. Deposit ${challenge.stake} USDC into escrow</div>
              <div>3. Play the game — winner takes the pot</div>
              <div>4. Settled atomically on-chain via <span style={{ color: "#18ffff" }}>Contention Markets</span></div>
            </div>

            {/* Accept Button */}
            <Link
              href={`${gameRoute[challenge.game] || "/play/reaction-duel"}?challenge=${challenge.id}`}
              style={{
                display: "block", textAlign: "center",
                background: "linear-gradient(135deg, #ff6b2c, #ff8f35)",
                color: "white", padding: "16px 40px", borderRadius: 10,
                fontSize: 18, fontWeight: 700, textDecoration: "none",
                transition: "transform 0.1s",
              }}
            >
              Accept Challenge
            </Link>

            <div style={{ fontSize: 10, color: "#333", marginTop: 12 }}>
              Solana Devnet &bull; 2% protocol fee &bull; Settled by Contention Markets
            </div>
          </div>

          {/* Create your own */}
          <div style={{ color: "#555570", fontSize: 13 }}>
            Want to challenge someone?{" "}
            <Link href="/play/reaction-duel" style={{ color: "#ff6b2c", textDecoration: "none" }}>
              Create your own →
            </Link>
          </div>
        </div>
      )}

      {challenge && challenge.status === "accepted" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Challenge Already Accepted</div>
          <div style={{ color: "#555570", fontSize: 14, marginBottom: 8 }}>
            {shortWallet(challenge.acceptedBy || "")} is playing against {shortWallet(challenge.creator)}
          </div>
          <Link href="/" style={{
            display: "inline-block", marginTop: 16,
            background: "#ff6b2c", color: "white", padding: "10px 24px", borderRadius: 8,
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}>Create Your Own Challenge</Link>
        </div>
      )}

      {challenge && (challenge.status === "expired" || challenge.status === "cancelled") && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Challenge {challenge.status === "expired" ? "Expired" : "Cancelled"}
          </div>
          <Link href="/" style={{
            display: "inline-block", marginTop: 16,
            background: "#ff6b2c", color: "white", padding: "10px 24px", borderRadius: 8,
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}>Create Your Own Challenge</Link>
        </div>
      )}
    </div>
  );
}
