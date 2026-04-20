"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { useState, useCallback } from "react";

const RESOLVER_URL = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
const MINT = new PublicKey(process.env.NEXT_PUBLIC_MINT || "5cfYRyjyzq5DSHpJPr5ipQQ48RHSn49Y75AWNMxaambt");

export type GamePhase = "connect" | "challenge-created" | "matchmaking" | "depositing" | "playing" | "resolving" | "result";

export interface MatchState {
  eventId: string;
  market: string;
  vault: string;
  stake: number;
  p1: string;
  p2: string;
}

export function useGameSession(gameName: string, stake: number = 5) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [phase, setPhase] = useState<GamePhase>("connect");
  const [challengeLink, setChallengeLink] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Create a shareable challenge link (P2 joins later)
  const createChallenge = useCallback(async () => {
    if (!publicKey) return;
    setError(null);

    try {
      const res = await fetch(`${RESOLVER_URL}/challenge/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: publicKey.toBase58(),
          game: gameName,
          stake,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const link = `${window.location.origin}/challenge/${data.challenge.id}`;
      setChallengeLink(link);
      setPhase("challenge-created");
    } catch (err: any) {
      setError(err.message);
    }
  }, [publicKey, gameName, stake]);

  // Quick match vs AI (devnet demo)
  const createMatch = useCallback(async () => {
    if (!publicKey) return;
    setPhase("matchmaking");
    setError(null);

    try {
      // For devnet demo: P2 is a test wallet (in production, matchmaking pairs real players)
      const res = await fetch(`${RESOLVER_URL}/match/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p1: publicKey.toBase58(),
          p2: "9wtqNLRB9YtpxWnFwCnyGUHT4wqEzedD8QoHpeJbK9r5", // Test P2
          game: gameName,
          stake,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setMatch({
        eventId: data.match.eventId,
        market: data.match.market,
        vault: data.match.vault,
        stake: data.match.stake,
        p1: data.match.p1,
        p2: data.match.p2,
      });
      setPhase("depositing");
    } catch (err: any) {
      setError(err.message);
      setPhase("connect");
    }
  }, [publicKey, gameName, stake]);

  const deposit = useCallback(async () => {
    if (!publicKey || !match) return;

    try {
      const userAta = await getAssociatedTokenAddress(MINT, publicKey);
      const vaultPubkey = new PublicKey(match.vault);
      const amount = match.stake * 1_000_000; // 6 decimals

      const tx = new Transaction();

      // Check if user has ATA, create if not
      try {
        await getAccount(connection, userAta);
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(publicKey, userAta, publicKey, MINT)
        );
      }

      tx.add(
        createTransferInstruction(userAta, vaultPubkey, publicKey, amount)
      );

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setPhase("playing");
    } catch (err: any) {
      setError(`Deposit failed: ${err.message}`);
    }
  }, [publicKey, match, connection, sendTransaction]);

  const resolveMatch = useCallback(async (winnerOutcome: number) => {
    if (!match) return;
    setPhase("resolving");

    try {
      const res = await fetch(`${RESOLVER_URL}/match/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: match.eventId,
          winner: winnerOutcome,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setWinner(winnerOutcome);
      setTxSig(data.match.txSignatures.resolve);
      setPhase("result");
    } catch (err: any) {
      setError(`Resolve failed: ${err.message}`);
    }
  }, [match]);

  const reset = useCallback(() => {
    setPhase("connect");
    setMatch(null);
    setError(null);
    setWinner(null);
    setTxSig(null);
  }, []);

  return {
    phase, match, error, winner, txSig, challengeLink,
    publicKey, createMatch, createChallenge, deposit, resolveMatch, reset,
  };
}

// Shared UI components
export function GameShell({
  title, children, phase, error, publicKey, challengeLink, onStart, onChallenge,
}: {
  title: string;
  children: React.ReactNode;
  phase: GamePhase;
  error: string | null;
  publicKey: PublicKey | null;
  challengeLink?: string | null;
  onStart: () => void;
  onChallenge?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div style={{
      minHeight: "100vh", background: "#050508", color: "#e8e8f0",
      fontFamily: "'Space Grotesk', sans-serif", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <WalletMultiButton />
      </div>

      <a href="/" style={{
        position: "absolute", top: 20, left: 20, textDecoration: "none",
        fontSize: 18, fontWeight: 700,
        background: "linear-gradient(135deg, #9945FF, #14F195)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>GAMERPLEX</a>

      <h1 style={{
        fontSize: 32, fontWeight: 700, marginBottom: 8,
        background: "linear-gradient(135deg, #9945FF, #14F195)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>{title}</h1>

      <p style={{ color: "#555570", fontSize: 13, marginBottom: 24, fontFamily: "monospace" }}>
        Settled on Contention Markets (Solana Devnet)
      </p>

      {error && (
        <div style={{
          background: "#1a0000", border: "1px solid #ff1744", borderRadius: 8,
          padding: "10px 16px", marginBottom: 16, color: "#ff1744", fontSize: 13, maxWidth: 400,
        }}>{error}</div>
      )}

      {phase === "connect" && !publicKey && (
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#555570", fontSize: 14, marginBottom: 8 }}>Connect your Solana wallet to play</p>
          <p style={{ color: "#333", fontSize: 11 }}>Devnet &bull; No real money</p>
        </div>
      )}

      {phase === "connect" && publicKey && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <button onClick={onStart} style={{
            background: "linear-gradient(135deg, #ff6b2c, #ff8f35)", color: "white",
            border: "none", padding: "14px 40px", borderRadius: 8, fontSize: 16,
            fontWeight: 700, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
          }}>Play vs Agent — ${5}</button>
          {onChallenge && (
            <button onClick={onChallenge} style={{
              background: "transparent", color: "#ff6b2c",
              border: "1px solid #ff6b2c", padding: "12px 32px", borderRadius: 8, fontSize: 14,
              fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
            }}>Challenge a Friend — ${5}</button>
          )}
        </div>
      )}

      {phase === "challenge-created" && challengeLink && (
        <div style={{
          background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
          padding: 24, textAlign: "center", maxWidth: 440, width: "100%",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Challenge Created!</div>
          <div style={{ fontSize: 12, color: "#555570", marginBottom: 12 }}>Send this link to your opponent:</div>
          <div style={{
            background: "#14141f", borderRadius: 8, padding: "12px 16px", marginBottom: 12,
            fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#18ffff",
          }}>{challengeLink}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => {
              navigator.clipboard.writeText(challengeLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }} style={{
              background: copied ? "#00e676" : "#448aff", color: "white", border: "none",
              padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{copied ? "Copied!" : "Copy Link"}</button>
            <button onClick={() => {
              const text = encodeURIComponent(`I bet you $5 you can't beat me at ${title} on @gamerplex_com\n\n${challengeLink}`);
              window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
            }} style={{
              background: "#14141f", color: "#e8e8f0", border: "1px solid #252540",
              padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Share on X</button>
          </div>
          <div style={{ fontSize: 11, color: "#333", marginTop: 12 }}>
            Waiting for opponent to accept...
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

export function ResultCard({
  won, payout, opponent, score, opponentScore, txSig, onPlayAgain, onShare,
}: {
  won: boolean; payout: string; opponent: string;
  score: string; opponentScore: string;
  txSig: string | null; onPlayAgain: () => void; onShare: () => void;
}) {
  return (
    <div style={{
      background: "#0c0c14", border: "1px solid #252540", borderRadius: 16,
      padding: 32, textAlign: "center", maxWidth: 400, width: "100%",
    }}>
      <div style={{ fontSize: 40, fontWeight: 700, color: won ? "#00e676" : "#ff1744", marginBottom: 8 }}>
        {won ? "YOU WON" : "YOU LOST"}
      </div>
      <div style={{ fontSize: 24, color: won ? "#ffd740" : "#ff1744", marginBottom: 16, fontFamily: "monospace" }}>
        {won ? `+${payout}` : `-$5.00`}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 16 }}>
        <div><div style={{ fontSize: 12, color: "#555570" }}>YOU</div><div style={{ fontSize: 20, fontWeight: 700, color: won ? "#00e676" : "#ff1744" }}>{score}</div></div>
        <div style={{ color: "#555570", fontSize: 16, alignSelf: "center" }}>VS</div>
        <div><div style={{ fontSize: 12, color: "#555570" }}>{opponent}</div><div style={{ fontSize: 20, fontWeight: 700, color: !won ? "#00e676" : "#ff1744" }}>{opponentScore}</div></div>
      </div>
      {txSig && (
        <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank"
          style={{ fontSize: 11, color: "#448aff", display: "block", marginBottom: 16 }}>
          View on Solana Explorer →
        </a>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={onShare} style={{
          background: "#448aff", color: "white", border: "none", padding: "10px 20px",
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Share on X</button>
        <button onClick={onPlayAgain} style={{
          background: "#14141f", color: "#e8e8f0", border: "1px solid #252540",
          padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Play Again</button>
      </div>
    </div>
  );
}
