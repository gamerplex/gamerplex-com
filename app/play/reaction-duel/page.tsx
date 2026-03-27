"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGameSession, GameShell, ResultCard } from "../shared";

export default function ReactionDuel() {
  const { phase, match, error, winner, txSig, publicKey, createMatch, deposit, resolveMatch, reset } = useGameSession("Reaction Duel", 5);
  const [zoneState, setZoneState] = useState<"idle" | "ready" | "go" | "done" | "early">("idle");
  const [playerTime, setPlayerTime] = useState<number | null>(null);
  const [agentTime, setAgentTime] = useState<number | null>(null);
  const goTimestamp = useRef(0);
  const timeoutRef = useRef<any>(null);

  // Auto-deposit when match is created (devnet demo)
  useEffect(() => {
    if (phase === "depositing") deposit();
  }, [phase, deposit]);

  const startGame = useCallback(() => {
    setZoneState("ready");
    setPlayerTime(null);
    setAgentTime(null);

    const delay = 1500 + Math.random() * 3000;
    timeoutRef.current = setTimeout(() => {
      setZoneState("go");
      goTimestamp.current = performance.now();

      // Agent reacts in 150-350ms
      const agentReaction = 150 + Math.random() * 200;
      setTimeout(() => {
        setAgentTime(Math.round(agentReaction));
      }, agentReaction);
    }, delay);
  }, []);

  useEffect(() => {
    if (phase === "playing") startGame();
    return () => clearTimeout(timeoutRef.current);
  }, [phase, startGame]);

  const handleClick = useCallback(() => {
    if (zoneState === "ready") {
      clearTimeout(timeoutRef.current);
      setZoneState("early");
      setPlayerTime(-1);
      // Early click = auto-lose
      const fakeAgent = 200 + Math.random() * 100;
      setAgentTime(Math.round(fakeAgent));
      setTimeout(() => resolveMatch(1), 1000);
      return;
    }
    if (zoneState !== "go" || playerTime !== null) return;
    const t = Math.round(performance.now() - goTimestamp.current);
    setPlayerTime(t);
    setZoneState("done");
  }, [zoneState, playerTime, resolveMatch]);

  // Check if both responded
  useEffect(() => {
    if (playerTime !== null && playerTime > 0 && agentTime !== null && phase === "playing") {
      const playerWins = playerTime <= agentTime;
      setTimeout(() => resolveMatch(playerWins ? 0 : 1), 800);
    }
  }, [playerTime, agentTime, phase, resolveMatch]);

  const payout = match ? ((match.stake * 2) * 0.98).toFixed(2) : "0";

  return (
    <GameShell title="Reaction Duel" phase={phase} error={error} publicKey={publicKey} onStart={createMatch}>
      {phase === "matchmaking" && (
        <div style={{ color: "#18ffff", fontSize: 14, fontFamily: "monospace" }}>Finding opponent...</div>
      )}

      {phase === "depositing" && (
        <div style={{ color: "#ffd740", fontSize: 14, fontFamily: "monospace" }}>Depositing $5 USDC...</div>
      )}

      {phase === "playing" && (
        <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
          <div
            onClick={handleClick}
            style={{
              height: 200, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 700, cursor: "pointer", userSelect: "none", transition: "background 0.15s",
              marginBottom: 16,
              background: zoneState === "idle" ? "#14141f" :
                          zoneState === "ready" ? "#eab308" :
                          zoneState === "go" ? "#22c55e" :
                          zoneState === "early" ? "#ef4444" : "#14141f",
              color: zoneState === "ready" || zoneState === "go" ? "#000" : "#e8e8f0",
            }}
          >
            {zoneState === "idle" && "Waiting..."}
            {zoneState === "ready" && "Wait for GREEN..."}
            {zoneState === "go" && "CLICK NOW!"}
            {zoneState === "done" && `${playerTime}ms`}
            {zoneState === "early" && "Too early!"}
          </div>

          <div style={{ display: "flex", justifyContent: "space-around" }}>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>YOU</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: playerTime && playerTime > 0 ? "#00e676" : "#555570" }}>
                {playerTime !== null ? (playerTime < 0 ? "EARLY" : `${playerTime}ms`) : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>AGENT</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: agentTime ? "#b388ff" : "#555570" }}>
                {agentTime !== null ? `${agentTime}ms` : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "resolving" && (
        <div style={{ color: "#18ffff", fontSize: 14, fontFamily: "monospace" }}>Settling on Contention Markets...</div>
      )}

      {phase === "result" && (
        <ResultCard
          won={winner === 0}
          payout={`$${payout}`}
          opponent="Agent"
          score={playerTime && playerTime > 0 ? `${playerTime}ms` : "EARLY"}
          opponentScore={`${agentTime}ms`}
          txSig={txSig}
          onPlayAgain={reset}
          onShare={() => {
            const text = encodeURIComponent(`Just ${winner === 0 ? "won" : "lost"} a Reaction Duel on @gamerplex_com!\n\nMy time: ${playerTime}ms vs Agent: ${agentTime}ms\nSettled on Contention Markets (Solana)\n\ngamerplex.com/play/reaction-duel`);
            window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
          }}
        />
      )}
    </GameShell>
  );
}
