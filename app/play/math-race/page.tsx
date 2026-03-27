"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useGameSession, GameShell, ResultCard } from "../shared";

type Problem = { a: number; b: number; op: string; answer: number };

function generateProblem(difficulty: number): Problem {
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * (difficulty > 5 ? 3 : 2))];
  const max = 10 + difficulty * 5;
  const a = Math.floor(Math.random() * max) + 1;
  const b = Math.floor(Math.random() * (max / 2)) + 1;
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return { a, b, op, answer };
}

export default function MathRace() {
  const { phase, match, error, winner, txSig, publicKey, createMatch, deposit, resolveMatch, reset } = useGameSession("Math Race", 5);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [input, setInput] = useState("");
  const [playerScore, setPlayerScore] = useState(0);
  const [agentScore, setAgentScore] = useState(0);
  const [round, setRound] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);
  const agentRef = useRef<any>(null);

  const TARGET = 10; // First to 10 wins

  useEffect(() => {
    if (phase === "depositing") deposit();
  }, [phase, deposit]);

  const nextProblem = useCallback(() => {
    const p = generateProblem(round);
    setProblem(p);
    setInput("");
    setFeedback(null);
    setRound((r) => r + 1);

    // Agent solves in 1.5-4 seconds
    clearTimeout(agentRef.current);
    agentRef.current = setTimeout(() => {
      setAgentScore((s) => {
        const next = s + 1;
        if (next >= TARGET) setTimeout(() => resolveMatch(1), 500);
        return next;
      });
    }, 1500 + Math.random() * 2500);

    setTimeout(() => inputRef.current?.focus(), 100);
  }, [round, resolveMatch]);

  // Start game
  useEffect(() => {
    if (phase === "playing") {
      setPlayerScore(0);
      setAgentScore(0);
      setRound(0);
      setTimeLeft(60);
      nextProblem();

      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            // Time's up: whoever has more wins
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(agentRef.current);
    };
  }, [phase]);

  // Time's up check
  useEffect(() => {
    if (timeLeft === 0 && phase === "playing") {
      resolveMatch(playerScore > agentScore ? 0 : 1);
    }
  }, [timeLeft, phase, playerScore, agentScore, resolveMatch]);

  const submitAnswer = useCallback(() => {
    if (!problem || !input) return;
    const answer = parseInt(input);
    if (answer === problem.answer) {
      setFeedback("correct");
      clearTimeout(agentRef.current);
      setPlayerScore((s) => {
        const next = s + 1;
        if (next >= TARGET) setTimeout(() => resolveMatch(0), 500);
        return next;
      });
      setTimeout(nextProblem, 300);
    } else {
      setFeedback("wrong");
      setInput("");
    }
  }, [problem, input, nextProblem, resolveMatch]);

  const payout = match ? ((match.stake * 2) * 0.98).toFixed(2) : "0";

  return (
    <GameShell title="Math Race" phase={phase} error={error} publicKey={publicKey} onStart={createMatch}>
      {phase === "matchmaking" && (
        <div style={{ color: "#18ffff", fontSize: 14, fontFamily: "monospace" }}>Finding opponent...</div>
      )}
      {phase === "depositing" && (
        <div style={{ color: "#ffd740", fontSize: 14, fontFamily: "monospace" }}>Depositing $5 USDC...</div>
      )}

      {phase === "playing" && problem && (
        <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
          {/* Timer + Scores */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>YOU</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#00e676" }}>{playerScore}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>TIME</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: timeLeft < 10 ? "#ff1744" : "#ffd740" }}>{timeLeft}s</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>AGENT</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#b388ff" }}>{agentScore}</div>
            </div>
          </div>

          {/* Progress bars */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, height: 6 }}>
            <div style={{ flex: 1, background: "#14141f", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${(playerScore / TARGET) * 100}%`, height: "100%", background: "linear-gradient(90deg, #448aff, #18ffff)", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ flex: 1, background: "#14141f", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${(agentScore / TARGET) * 100}%`, height: "100%", background: "linear-gradient(90deg, #b388ff, #ff80ab)", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#555570", marginBottom: 8 }}>First to {TARGET} wins</div>

          {/* Problem */}
          <div style={{
            background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
            padding: 32, marginBottom: 16,
          }}>
            <div style={{ fontSize: 48, fontWeight: 700, marginBottom: 16, fontFamily: "monospace" }}>
              {problem.a} {problem.op} {problem.b} = ?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <input
                ref={inputRef}
                type="number"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                placeholder="Answer"
                autoFocus
                style={{
                  background: "#14141f",
                  border: `2px solid ${feedback === "correct" ? "#00e676" : feedback === "wrong" ? "#ff1744" : "#252540"}`,
                  color: "#e8e8f0", padding: "12px 16px", borderRadius: 8,
                  fontSize: 24, fontFamily: "monospace", textAlign: "center", width: 150,
                  outline: "none",
                }}
              />
              <button onClick={submitAnswer} style={{
                background: "#ff6b2c", color: "white", border: "none",
                padding: "12px 24px", borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>→</button>
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
          score={`${playerScore} pts`}
          opponentScore={`${agentScore} pts`}
          txSig={txSig}
          onPlayAgain={reset}
          onShare={() => {
            const text = encodeURIComponent(`Just ${winner === 0 ? "won" : "lost"} a Math Race on @gamerplex_com!\n\nScore: ${playerScore} vs Agent: ${agentScore}\nSettled on Contention Markets (Solana)\n\ngamerplex.com/play/math-race`);
            window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
          }}
        />
      )}
    </GameShell>
  );
}
