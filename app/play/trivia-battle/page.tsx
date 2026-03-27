"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useGameSession, GameShell, ResultCard } from "../shared";

const QUESTIONS = [
  { q: "What is the max TPS of Solana?", opts: ["1,000", "65,000", "400", "10,000"], answer: 1 },
  { q: "Who founded Solana?", opts: ["Vitalik Buterin", "Anatoly Yakovenko", "Satoshi Nakamoto", "Sam Bankman-Fried"], answer: 1 },
  { q: "What consensus does Solana use?", opts: ["Proof of Work", "Proof of History", "Proof of Stake only", "Delegated PoS"], answer: 1 },
  { q: "What language are Solana programs written in?", opts: ["Solidity", "JavaScript", "Rust", "Python"], answer: 2 },
  { q: "What is Solana's native token?", opts: ["ETH", "SOL", "SLP", "SRM"], answer: 1 },
  { q: "What is an SPL token?", opts: ["A meme token", "Solana Program Library token", "A stablecoin", "A wrapped BTC"], answer: 1 },
  { q: "What is Jupiter on Solana?", opts: ["A validator", "A DEX aggregator", "A wallet", "An NFT marketplace"], answer: 1 },
  { q: "What year was Solana mainnet launched?", opts: ["2017", "2019", "2020", "2022"], answer: 2 },
  { q: "What is Anchor?", opts: ["A wallet", "A framework for Solana programs", "A DEX", "A bridge"], answer: 1 },
  { q: "What does PDA stand for?", opts: ["Private Data Account", "Program Derived Address", "Public Direct Access", "Proof of Digital Asset"], answer: 1 },
  { q: "What is MagicBlock?", opts: ["A game engine for Solana", "A validator", "A wallet", "A bridge"], answer: 0 },
  { q: "What is rent on Solana?", opts: ["Monthly fee", "Min SOL balance for account storage", "Transaction fee", "Staking reward"], answer: 1 },
  { q: "How many decimals does USDC have?", opts: ["18", "8", "6", "2"], answer: 2 },
  { q: "What is Jito on Solana?", opts: ["A wallet", "MEV infrastructure", "A DEX", "An oracle"], answer: 1 },
  { q: "What is a CPI in Solana?", opts: ["Cost Per Instruction", "Cross-Program Invocation", "Central Processing Index", "Crypto Payment Interface"], answer: 1 },
];

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function TriviaBattle() {
  const { phase, match, error, winner, txSig, publicKey, createMatch, deposit, resolveMatch, reset } = useGameSession("Trivia Battle", 5);
  const [questions, setQuestions] = useState(QUESTIONS);
  const [qIndex, setQIndex] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [agentScore, setAgentScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const timerRef = useRef<any>(null);
  const TOTAL_QUESTIONS = 8;

  useEffect(() => {
    if (phase === "depositing") deposit();
  }, [phase, deposit]);

  useEffect(() => {
    if (phase === "playing") {
      setQuestions(shuffleArray(QUESTIONS).slice(0, TOTAL_QUESTIONS));
      setQIndex(0);
      setPlayerScore(0);
      setAgentScore(0);
    }
  }, [phase]);

  // Per-question timer
  useEffect(() => {
    if (phase !== "playing" || showAnswer) return;
    setTimeLeft(10);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [qIndex, phase, showAnswer]);

  const handleTimeout = useCallback(() => {
    if (showAnswer) return;
    setShowAnswer(true);
    // Agent gets it right 60% of the time
    if (Math.random() < 0.6) setAgentScore((s) => s + 1);
    setTimeout(nextQuestion, 1500);
  }, [showAnswer]);

  const handleAnswer = useCallback((idx: number) => {
    if (showAnswer || selected !== null) return;
    clearInterval(timerRef.current);
    setSelected(idx);
    setShowAnswer(true);

    const correct = idx === questions[qIndex].answer;
    if (correct) setPlayerScore((s) => s + 1);

    // Agent answers independently (65% accuracy)
    if (Math.random() < 0.65) setAgentScore((s) => s + 1);

    setTimeout(nextQuestion, 1500);
  }, [showAnswer, selected, questions, qIndex]);

  const nextQuestion = useCallback(() => {
    setSelected(null);
    setShowAnswer(false);
    setQIndex((i) => {
      const next = i + 1;
      if (next >= TOTAL_QUESTIONS) {
        // Game over — resolve after state updates
        setTimeout(() => {
          setPlayerScore((ps) => {
            setAgentScore((as) => {
              resolveMatch(ps > as ? 0 : ps < as ? 1 : 255);
              return as;
            });
            return ps;
          });
        }, 100);
      }
      return next;
    });
  }, [resolveMatch]);

  const currentQ = questions[qIndex];
  const payout = match ? ((match.stake * 2) * 0.98).toFixed(2) : "0";

  return (
    <GameShell title="Trivia Battle" phase={phase} error={error} publicKey={publicKey} onStart={createMatch}>
      {phase === "matchmaking" && (
        <div style={{ color: "#18ffff", fontSize: 14, fontFamily: "monospace" }}>Finding opponent...</div>
      )}
      {phase === "depositing" && (
        <div style={{ color: "#ffd740", fontSize: 14, fontFamily: "monospace" }}>Depositing $5 USDC...</div>
      )}

      {phase === "playing" && currentQ && qIndex < TOTAL_QUESTIONS && (
        <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
          {/* Scores */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>YOU</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#00e676" }}>{playerScore}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>Q{qIndex + 1}/{TOTAL_QUESTIONS}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: timeLeft < 4 ? "#ff1744" : "#ffd740" }}>{timeLeft}s</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#555570" }}>AGENT</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#b388ff" }}>{agentScore}</div>
            </div>
          </div>

          {/* Question */}
          <div style={{
            background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
            padding: 24, marginBottom: 16,
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, lineHeight: 1.4 }}>
              {currentQ.q}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {currentQ.opts.map((opt, i) => {
                let bg = "#14141f";
                let border = "#252540";
                if (showAnswer) {
                  if (i === currentQ.answer) { bg = "rgba(0,230,118,0.15)"; border = "#00e676"; }
                  else if (i === selected && i !== currentQ.answer) { bg = "rgba(255,23,68,0.15)"; border = "#ff1744"; }
                }
                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={showAnswer}
                    style={{
                      background: bg, border: `1px solid ${border}`, borderRadius: 8,
                      padding: "12px 16px", color: "#e8e8f0", fontSize: 14,
                      cursor: showAnswer ? "default" : "pointer",
                      fontFamily: "'Space Grotesk', sans-serif",
                      transition: "all 0.15s",
                    }}
                  >{opt}</button>
                );
              })}
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
          score={`${playerScore}/${TOTAL_QUESTIONS}`}
          opponentScore={`${agentScore}/${TOTAL_QUESTIONS}`}
          txSig={txSig}
          onPlayAgain={reset}
          onShare={() => {
            const text = encodeURIComponent(`Just ${winner === 0 ? "won" : "lost"} Solana Trivia on @gamerplex_com!\n\nScore: ${playerScore}/${TOTAL_QUESTIONS} vs Agent: ${agentScore}/${TOTAL_QUESTIONS}\nSettled on Contention Markets (Solana)\n\ngamerplex.com/play/trivia-battle`);
            window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
          }}
        />
      )}
    </GameShell>
  );
}
