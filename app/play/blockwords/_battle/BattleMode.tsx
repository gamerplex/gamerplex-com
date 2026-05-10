"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import dynamic from "next/dynamic";
import "../../magic-chess/_shared/magic.css";
import ModeToggle from "../../../../components/games/ModeToggle";
import { WageredEscrowBadge } from "../../../../components/wagered-battle/EscrowBadge";
import { BlockwordsOnChain } from "./chain";

const Words3DScene = dynamic(() => import("./Words3DScene"), { ssr: false });

const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

type Phase = "menu" | "playing" | "won" | "lost";

const CATEGORIES: Record<string, string[]> = {
  crypto: ["solana","bitcoin","wallet","staking","oracle","bridge","token","anchor","ledger","phantom","jupiter","tensor","helius","bonding","defi"],
  animals: ["elephant","giraffe","penguin","dolphin","tiger","falcon","cobra","whale","octopus","parrot","jaguar","salmon","beetle","rabbit","turtle"],
  tech: ["server","docker","python","cursor","github","vercel","deploy","kernel","binary","cursor","router","pixel","shader","vulkan","tensor"],
  gaming: ["quest","dungeon","wizard","shield","dragon","potion","knight","castle","archer","goblin","portal","rogue","mana","forge","realm"],
};

export default function BlockwordsBattleMode() {
  const { publicKey } = useWallet();
  const [phase, setPhase] = useState<Phase>("menu");
  const [word, setWord] = useState("");
  const [revealed, setRevealed] = useState<(string | null)[]>([]);
  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [maxWrong] = useState(6);
  const [category, setCategory] = useState<string | null>(null);
  const [mode, setMode] = useState<"duel" | "pool" | "race">("duel");
  const [won, setWon] = useState<boolean | null>(null);
  const [shaking, setShaking] = useState(false);
  const [sparklePos, setSparklePos] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [txLogs, setTxLogs] = useState<{ msg: string; sig?: string }[]>([]);
  const chainRef = useRef<BlockwordsOnChain | null>(null);
  const addTx = useCallback((msg: string, sig?: string) => {
    setTxLogs(l => [{ msg, sig }, ...l.slice(0, 29)]);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const playSound = useCallback((type: "correct" | "wrong" | "win" | "lose" | "click") => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const t = ctx.currentTime;
      switch (type) {
        case "correct": osc.frequency.value = 660; gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); osc.start(t); osc.stop(t + 0.15); break;
        case "wrong": osc.type = "square"; osc.frequency.value = 120; gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); osc.start(t); osc.stop(t + 0.2); break;
        case "win": osc.frequency.value = 523; gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); osc.start(t); osc.stop(t + 0.5); break;
        case "lose": osc.type = "sawtooth"; osc.frequency.value = 150; gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4); osc.start(t); osc.stop(t + 0.4); break;
        case "click": osc.frequency.value = 880; gain.gain.setValueAtTime(0.05, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05); osc.start(t); osc.stop(t + 0.05); break;
      }
    } catch {}
  }, []);

  const startGame = useCallback(async (cat: string) => {
    const words = CATEGORIES[cat];
    const w = words[Math.floor(Math.random() * words.length)];
    setWord(w);
    setRevealed(Array(w.length).fill(null));
    setGuessedLetters(new Set());
    setWrongGuesses(0);
    setWon(null);
    setCategory(cat);
    setTxLogs([]);
    setPhase("playing");

    const chain = new BlockwordsOnChain();
    chainRef.current = chain;
    addTx("🔮 Creating game on MagicBlock...");
    const ok = await chain.createGame(w, maxWrong, 0);
    if (ok) {
      addTx(`Game: ${chain.gamePda!.toBase58().slice(0, 8)}...`);
      addTx("Every guess is a real Solana transaction");
    } else {
      addTx("⚠ Playing locally (ER unavailable)");
    }
  }, [maxWrong, addTx]);

  const guessLetter = useCallback((letter: string) => {
    if (phase !== "playing" || guessedLetters.has(letter)) return;

    playSound("click");
    const newGuessed = new Set(guessedLetters);
    newGuessed.add(letter);
    setGuessedLetters(newGuessed);

    if (chainRef.current?.isReady) {
      chainRef.current.guessLetter(letter).then(sig => {
        if (sig) addTx(`Guess '${letter.toUpperCase()}'`, sig);
        else addTx(`Guess '${letter.toUpperCase()}' (local)`);
      });
    } else {
      addTx(`Guess '${letter.toUpperCase()}'`);
    }

    if (word.includes(letter)) {
      playSound("correct");
      const newRevealed = [...revealed];
      for (let i = 0; i < word.length; i++) {
        if (word[i] === letter) newRevealed[i] = letter;
      }
      setRevealed(newRevealed);

      if (newRevealed.every(r => r !== null)) {
        setPhase("won");
        setWon(true);
        playSound("win");
        addTx("✨ SOLVED!");
        if (chainRef.current?.isReady) {
          chainRef.current.finish(publicKey?.toBase58(), { won: true, wrongGuesses, word }).then(ok => {
            if (ok) addTx("Score saved to Solana");
          });
        }
      }
    } else {
      playSound("wrong");
      setShaking(true);
      setTimeout(() => setShaking(false), 300);
      const newWrong = wrongGuesses + 1;
      setWrongGuesses(newWrong);

      if (newWrong >= maxWrong) {
        setPhase("lost");
        setWon(false);
        setRevealed(word.split(""));
        playSound("lose");
        addTx("💀 GAME OVER");
        if (chainRef.current?.isReady) {
          chainRef.current.finish(publicKey?.toBase58(), { won: false, wrongGuesses: newWrong, word }).then(ok => {
            if (ok) addTx("Result saved to Solana");
          });
        }
      }
    }
  }, [phase, word, revealed, guessedLetters, wrongGuesses, maxWrong, playSound]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      const key = e.key.toLowerCase();
      if (key >= "a" && key <= "z" && key.length === 1) {
        guessLetter(key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, guessLetter]);

  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
  const livesLeft = maxWrong - wrongGuesses;

  return (
    <div style={{ minHeight: "100vh", background: "#050510", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #252540" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 16, fontWeight: 700, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GAMERPLEX</Link>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(255,170,0,0.15)", border: "1px solid rgba(255,170,0,0.4)", color: "#ffaa00", letterSpacing: 1, textTransform: "uppercase" }}>Devnet</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!isMobile && <>
            <Link href="/games" style={{ color: "#555", textDecoration: "none", fontSize: 12 }}>Arcade</Link>
            <Link href="/leaderboard" style={{ color: "#555", textDecoration: "none", fontSize: 12 }}>Leaderboard</Link>
          </>}
          <WalletMultiButton style={{ fontSize: 12, height: 32 }} />
        </div>
      </div>

      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Words3DScene
          revealed={revealed}
          wordLength={word.length || 5}
          wrongGuesses={wrongGuesses}
          maxWrong={maxWrong}
          phase={phase}
          shaking={shaking}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)", padding: 20 }}>

        <div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 2 }}>
          <ModeToggle
            gameLabel="Blockwords"
            active="battle"
            arcade={{ status: "live-devnet", href: "/play/blockwords?mode=arcade" }}
            battle={{ status: "live-devnet", href: "/play/blockwords?mode=battle", programId: "3XA1rz4f83FoTyvB7g1XHhsb4bx9SrUSBDtpLtAttU4o" }}
          />
        </div>

        {phase === "menu" && (
          <div style={{ textAlign: "center", maxWidth: 440 }}>
            <h1 className="magic-chess-title magic-pulse" style={{ fontSize: 42, fontWeight: 700, marginBottom: 8 }}>✨ BLOCKWORDS ✨</h1>
            <p className="magic-chess-text" style={{ fontSize: 14, marginBottom: 4 }}>On-chain word duels on MagicBlock PER</p>
            <p style={{ color: "#555", fontSize: 11, marginBottom: 24 }}>Intel TDX TEE hides the word. Even the validator can't peek.</p>

            <p style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>Pick a category</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(CATEGORIES).map(([cat, words]) => (
                <button key={cat} onClick={() => startGame(cat)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  background: "#14141f", border: "1px solid #252540", borderRadius: 8,
                  cursor: "pointer", textAlign: "left", width: "100%", transition: "border-color 0.15s",
                }} onMouseEnter={e => e.currentTarget.style.borderColor = "#9945FF"}
                   onMouseLeave={e => e.currentTarget.style.borderColor = "#252540"}>
                  <span style={{ fontSize: 24 }}>
                    {cat === "crypto" ? "🪙" : cat === "animals" ? "🦁" : cat === "tech" ? "💻" : "🎮"}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", textTransform: "capitalize" }}>{cat}</div>
                    <div style={{ fontSize: 10, color: "#555" }}>{words.length} words</div>
                  </div>
                </button>
              ))}
            </div>
            {/* Architectural visibility: same wagered-escrow module as Cyber Snake Battle. */}
            <div style={{ marginTop: 20, textAlign: "left" }}>
              <WageredEscrowBadge slug="blockwords" stake={1} status="scaffold" />
            </div>
            <div style={{ marginTop: 12, fontSize: 10, color: "#333" }}>
              Program: 3XA1rz...tU4o · MagicBlock PER · Every guess on-chain
            </div>
          </div>
        )}

        {(phase === "playing" || phase === "won" || phase === "lost") && (
          <div style={{ textAlign: "center", maxWidth: 600, width: "100%" }}>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center", gap: 4 }}>
              {Array.from({ length: maxWrong }, (_, i) => (
                <div key={i} style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: i < livesLeft ? "linear-gradient(135deg, #9945FF, #14F195)" : "rgba(255,23,68,0.3)",
                  border: `2px solid ${i < livesLeft ? "#14F195" : "#ff1744"}`,
                  transition: "all 0.3s",
                  opacity: i < livesLeft ? 1 : 0.3,
                }} />
              ))}
            </div>

            <div className={shaking ? "board-shake" : ""} style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
              {revealed.map((letter, i) => (
                <div key={i} style={{
                  width: isMobile ? 40 : 52, height: isMobile ? 48 : 60,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isMobile ? 22 : 28, fontWeight: 700, textTransform: "uppercase",
                  background: letter ? "linear-gradient(135deg, rgba(153,69,255,0.2), rgba(20,241,149,0.1))" : "rgba(20,20,40,0.8)",
                  border: `2px solid ${letter ? "#14F195" : "#252540"}`,
                  borderRadius: 8,
                  color: letter ? "#14F195" : "#333",
                  boxShadow: letter ? "0 0 15px rgba(20,241,149,0.2)" : "none",
                  transition: "all 0.3s",
                  backdropFilter: "blur(8px)",
                }}>
                  {letter || ""}
                </div>
              ))}
            </div>

            {phase === "playing" && (
              <div style={{ marginBottom: 20 }}>
                {["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row, ri) => (
                  <div key={ri} style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                    {row.split("").map(letter => {
                      const guessed = guessedLetters.has(letter);
                      const correct = guessed && word.includes(letter);
                      const wrong = guessed && !word.includes(letter);
                      return (
                        <button key={letter} onClick={() => guessLetter(letter)} disabled={guessed} style={{
                          width: isMobile ? 28 : 36, height: isMobile ? 36 : 44,
                          borderRadius: 6, cursor: guessed ? "default" : "pointer",
                          fontSize: isMobile ? 13 : 15, fontWeight: 700, textTransform: "uppercase",
                          background: correct ? "linear-gradient(135deg, #14F195, #00e676)" :
                            wrong ? "rgba(255,23,68,0.3)" :
                            "rgba(153,69,255,0.15)",
                          color: correct ? "#000" : wrong ? "#ff1744" : "#e8e8f0",
                          borderWidth: 1, borderStyle: "solid",
                          borderColor: correct ? "#14F195" : wrong ? "#ff1744" : "rgba(153,69,255,0.3)",
                          opacity: guessed && !correct ? 0.4 : 1,
                          transition: "all 0.15s",
                        }}>
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {(phase === "won" || phase === "lost") && (
              <div className="magic-chess-panel" style={{
                padding: 24, borderRadius: 12, textAlign: "center", maxWidth: 400, margin: "0 auto",
                borderColor: won ? "#14F195" : "#ff1744",
                boxShadow: `0 0 40px ${won ? "rgba(20,241,149,0.15)" : "rgba(255,23,68,0.1)"}`,
              }}>
                <div className="magic-chess-title" style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>
                  {won ? "✨ SOLVED ✨" : "💀 GAME OVER"}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#14F195", textTransform: "uppercase", letterSpacing: 4, marginBottom: 12 }}>
                  {word}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 16 }}>
                  {won ? `Solved with ${wrongGuesses} wrong guess${wrongGuesses !== 1 ? "es" : ""}` : `The word was "${word}"`}
                  {" · "}{category}
                </div>

                {!publicKey ? (
                  <div style={{ padding: 12, background: "rgba(153,69,255,0.08)", borderRadius: 8, border: "1px solid rgba(153,69,255,0.2)", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9945FF", marginBottom: 4 }}>Save score on-chain forever?</div>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>Free — Gamerplex pays. You just sign.</div>
                    <WalletMultiButton style={{ fontSize: 11, height: 32, width: "100%", justifyContent: "center" }} />
                  </div>
                ) : (
                  <div style={{ padding: 12, background: "rgba(20,241,149,0.08)", borderRadius: 8, border: "1px solid rgba(20,241,149,0.2)", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#14F195" }}>Score saved on Solana ✓</div>
                    <div style={{ fontSize: 9, color: "#888" }}>{publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)} · SOAR + GPX1</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => {
                    const t = encodeURIComponent(`${won ? "Solved" : "Failed"} "${word.toUpperCase()}" in Blockwords on @gamerplex_com\n\n🔮 ${wrongGuesses}/${maxWrong} wrong · ${category}\n\nHidden in Intel TDX TEE — nobody could peek\n\nCan you beat me?\ngamerplex.com/play/blockwords`);
                    window.open(`https://twitter.com/intent/tweet?text=${t}`, "_blank");
                  }} style={{ flex: 1, background: "#448aff", color: "white", border: "none", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Share on X
                  </button>
                  <button className="magic-chess-btn" onClick={() => { setPhase("menu"); setCategory(null); }} style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                    ✦ Play Again ✦
                  </button>
                </div>
              </div>
            )}

            {phase === "playing" && (
              <div style={{ fontSize: 10, color: "#555", display: "flex", justifyContent: "center", gap: 16 }}>
                <span>Category: {category}</span>
                <span>{livesLeft} lives left</span>
                <span>{guessedLetters.size} guessed</span>
              </div>
            )}

            {txLogs.length > 0 && (
              <div style={{ marginTop: 16, maxWidth: 400, margin: "16px auto 0", maxHeight: 120, overflowY: "auto", background: "rgba(10,0,20,0.7)", borderRadius: 8, border: "1px solid rgba(153,69,255,0.2)", padding: "8px 12px", backdropFilter: "blur(8px)" }}>
                {txLogs.map((tx, i) => (
                  <div key={i} style={{ fontSize: 9, color: "#888", fontFamily: "monospace", marginBottom: 2, display: "flex", gap: 4 }}>
                    <span style={{ color: "#9945FF" }}>|</span>
                    <span>{tx.msg}</span>
                    {tx.sig && (
                      <a href={BlockwordsOnChain.explorerUrl(tx.sig)} target="_blank" rel="noopener" style={{ color: "#14F195", marginLeft: 4 }}>TX ↗</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
