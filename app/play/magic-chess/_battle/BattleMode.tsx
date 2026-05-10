"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import dynamic from "next/dynamic";
import ModeToggle from "../../../../components/games/ModeToggle";
import { WageredEscrowBadge } from "../../../../components/wagered-battle/EscrowBadge";
import { marketPdaFromEventId } from "../../../../lib/wagered-battle/client";
import { ChessOnChain } from "../chain";
import {
  PIECES, isW, isB, pt, initBoard, getValid, isAttacked, execMove,
} from "../_shared/chess-engine";
import "../_shared/magic.css";

const Chess3DBoard = dynamic(() => import("../_shared/Chess3DBoard"), { ssr: false });

type Phase = "lobby" | "playing" | "gameover";
type LobbyMode = "find" | "create" | "join";
interface TxLog { msg: string; sig?: string; type: "move" | "bet" | "settle" | "system" }

const MOVE_TIME = 120;

export default function BattleMode() {
  const { publicKey } = useWallet();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>("find");
  const [stake, setStake] = useState<number>(1);
  const [joinCode, setJoinCode] = useState("");
  const [matchEventId, setMatchEventId] = useState<string | null>(null);
  const [matchSettled, setMatchSettled] = useState(false);

  const [board, setBoard] = useState(initBoard);
  const [sel, setSel] = useState<number | null>(null);
  const [valid, setValid] = useState<number[]>([]);
  const [wTurn, setWTurn] = useState(true);
  const [mc, setMc] = useState(0);
  const [hist, setHist] = useState<string[]>([]);
  const [captured, setCap] = useState<number[]>([]);
  const [last, setLast] = useState<{ f: number; t: number } | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [ep, setEp] = useState(255);
  const [castle, setCastle] = useState(0b1111);
  const [timer, setTimer] = useState(MOVE_TIME);
  const [check, setCheck] = useState(false);
  const [txLogs, setTxLogs] = useState<TxLog[]>([]);
  const [showTx, setShowTx] = useState(!isMobile);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [cellSize, setCellSize] = useState(typeof window !== "undefined" && window.innerWidth < 768 ? 48 : 72);

  const timerRef = useRef<any>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const chainRef = useRef<ChessOnChain | null>(null);

  const totalPot = stake * 2;
  const isWagered = matchEventId !== null && stake > 0;

  const derivedMarketPda = useMemo(() => {
    if (!matchEventId) return null;
    const numeric = matchEventId.replace(/[^0-9]/g, "") || "1";
    try { return marketPdaFromEventId(BigInt(numeric)).toBase58(); } catch { return null; }
  }, [matchEventId]);

  const addTx = useCallback((msg: string, type: TxLog["type"], sig?: string) => {
    setTxLogs(l => [{ msg, sig, type }, ...l.slice(0, 49)]);
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    setTimer(MOVE_TIME);
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setWon(!wTurn);
          setPhase("gameover");
          setStatus(`${wTurn ? "White" : "Black"} timed out`);
          addTx("TIMEOUT — game over", "system");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, wTurn, addTx]);

  useEffect(() => { txRef.current?.scrollTo(0, 0); }, [txLogs]);

  const reset = () => {
    setBoard(initBoard()); setCap([]); setMc(0); setWTurn(true); setSel(null); setValid([]);
    setStatus(""); setWon(null); setEp(255); setCastle(0b1111); setHist([]); setCheck(false);
    setTimer(MOVE_TIME); setTxLogs([]); setMatchSettled(false);
  };

  const click = useCallback((idx: number) => {
    if (phase !== "playing" || !wTurn) return;
    if (sel !== null && valid.includes(idx)) {
      const r = execMove(sel, idx, board, ep, castle);
      setBoard(r.nb); setLast({ f: sel, t: idx }); setSel(null); setValid([]);
      setEp(r.nep); setCastle(r.nc);
      if (r.cap > 0) setCap(c => [...c, r.cap]);
      setHist(h => [...h, r.alg]); setMc(m => m + 1); setTimer(MOVE_TIME);

      const erReady = chainRef.current?.isReady;
      const sendWhite = async () => {
        if (!erReady) return;
        const sig = await chainRef.current!.sendPlayerMove(sel, idx, r.alg);
        if (sig) addTx(`White: ${r.alg}`, "move", sig);
        else addTx(`White: ${r.alg} (local)`, "move");
      };
      const whitePromise = sendWhite();
      if (!erReady) addTx(`White: ${r.alg}`, "move");

      if (r.go) {
        setWon(r.win === 1); setPhase("gameover");
        setStatus(r.win === 1 ? "Checkmate!" : r.win === 2 ? "Checkmate!" : "Stalemate");
        addTx(r.win ? "CHECKMATE" : "STALEMATE", "system");
        return;
      }
      const bk = r.nb.indexOf(13);
      const inCheck = bk >= 0 && isAttacked(r.nb, bk, true);
      setCheck(inCheck);
      setWTurn(false);
      setStatus(inCheck ? "Check! Opponent thinking..." : "Opponent thinking...");

      setTimeout(async () => {
        const bp: number[] = [];
        for (let i = 0; i < 64; i++) if (isB(r.nb[i])) bp.push(i);
        type AM = { f: number; t: number; s: number };
        const am: AM[] = [];
        for (const f of bp) {
          const mv = getValid(r.nb, f, r.nep, r.nc);
          for (const t of mv) {
            let s = 0;
            if (r.nb[t] > 0) s += 10 + r.nb[t];
            const tt = [...r.nb]; tt[t] = tt[f]; tt[f] = 0;
            const wk = tt.indexOf(12);
            if (wk >= 0 && isAttacked(tt, wk, false)) s += 5;
            const tr = t >> 3, tc = t & 7;
            if (tr >= 2 && tr <= 5 && tc >= 2 && tc <= 5) s += 1;
            am.push({ f, t, s });
          }
        }
        if (!am.length) { setWon(true); setPhase("gameover"); setStatus("Opponent has no moves!"); addTx("NO MOVES — White wins", "system"); return; }
        am.sort((a, b) => b.s - a.s);
        const pick = am[Math.floor(Math.random() * Math.min(3, am.length))];
        const r2 = execMove(pick.f, pick.t, r.nb, r.nep, r.nc);
        setBoard(r2.nb); setLast({ f: pick.f, t: pick.t }); setEp(r2.nep); setCastle(r2.nc);
        if (r2.cap > 0) setCap(c => [...c, r2.cap]);
        setHist(h => [...h, r2.alg]); setMc(m => m + 1); setTimer(MOVE_TIME);
        if (erReady) {
          await whitePromise;
          chainRef.current!.sendAiMove(pick.f, pick.t).then(sig => {
            if (sig) addTx(`Black: ${r2.alg}`, "move", sig);
            else addTx(`Black: ${r2.alg} (local)`, "move");
          });
        } else {
          addTx(`Black: ${r2.alg}`, "move");
        }
        if (r2.go) {
          setWon(r2.win === 1 ? true : r2.win === 2 ? false : null);
          setPhase("gameover");
          setStatus(r2.win === 1 ? "Checkmate!" : r2.win === 2 ? "Checkmate!" : "Stalemate");
          addTx(r2.win ? "CHECKMATE" : "STALEMATE", "system");
          return;
        }
        const wk = r2.nb.indexOf(12);
        const wkCheck = wk >= 0 && isAttacked(r2.nb, wk, false);
        setCheck(wkCheck);
        setWTurn(true);
        setStatus(wkCheck ? "Check!" : "Your turn");
      }, 500 + Math.random() * 500);
    } else if (isW(board[idx])) {
      const moves = getValid(board, idx, ep, castle);
      setSel(idx); setValid(moves);
    } else { setSel(null); setValid([]); }
  }, [phase, board, sel, valid, wTurn, ep, castle, addTx]);

  const startMatch = useCallback(async () => {
    reset();
    if (!publicKey) { addTx("⚠ Connect a wallet to wager", "system"); return; }
    addTx("🧙‍♂️ Connecting to MagicBlock ER...", "system");
    const eventId = `chess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMatchEventId(eventId);
    addTx(`Match created: ${eventId}`, "bet");
    addTx(`⚠ Two-wallet wagered escrow: pending two-wallet QA. Match plays out unwagered.`, "system");
    const chain = new ChessOnChain();
    chainRef.current = chain;
    const ok = await chain.requestGame("medium");
    if (ok && chain.isReady) {
      addTx(`Game PDA: ${chain.gamePda!.toBase58().slice(0, 8)}...`, "system");
      addTx(`Every move is a real Solana transaction on MagicBlock ER`, "system");
    } else {
      addTx("⚠ ER unavailable — playing locally", "system");
    }
    setPhase("playing");
    setStatus("Your turn");
  }, [publicKey, addTx]);

  const cols = "abcdefgh";
  const tm = Math.floor(timer / 60), ts = (timer % 60).toString().padStart(2, "0");

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #252540" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 16, fontWeight: 700, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", paddingRight: 6 }}>GAMERPLEX</Link>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(153,69,255,0.15)", border: "1px solid rgba(153,69,255,0.4)", color: "#9945FF", letterSpacing: 1, textTransform: "uppercase" }}>Battle</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(255,170,0,0.15)", border: "1px solid rgba(255,170,0,0.4)", color: "#ffaa00", letterSpacing: 1, textTransform: "uppercase" }}>Devnet</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!isMobile && <>
            <Link href="/games" style={{ color: "#555", textDecoration: "none", fontSize: 12 }}>Tournaments</Link>
            <Link href="/leaderboard" style={{ color: "#555", textDecoration: "none", fontSize: 12 }}>Leaderboard</Link>
            <Link href="/docs" style={{ color: "#555", textDecoration: "none", fontSize: 12 }}>Docs</Link>
          </>}
          <WalletMultiButton style={{ fontSize: 12, height: 32 }} />
        </div>
      </div>

      {/* LOBBY */}
      {phase === "lobby" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}>
          <div style={{ textAlign: "center", maxWidth: 460, padding: 16 }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>⚔️</div>
            <h1 className="magic-chess-title magic-pulse" style={{ fontSize: 38, fontWeight: 700, marginBottom: 8 }}>✨ MAGIC CHESS 🪄</h1>
            <p className="magic-chess-text" style={{ fontSize: 13, marginBottom: 4 }}>Wagered 1v1 chess. Winner takes 98% of the pot.</p>

            <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 14px" }}>
              <ModeToggle
                gameLabel="Magic Chess"
                active="battle"
                arcade={{ status: "live-devnet", href: "/play/magic-chess?mode=arcade" }}
                battle={{ status: "live-devnet", href: "/play/magic-chess?mode=battle", programId: "3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr" }}
              />
            </div>

            {/* Lobby tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#0c0c14", border: "1px solid #252540", borderRadius: 999, padding: 4, justifyContent: "center" }}>
              {(["find", "create", "join"] as const).map(t => (
                <button key={t} onClick={() => setLobbyMode(t)} style={{
                  padding: "6px 18px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  background: lobbyMode === t ? "linear-gradient(135deg, #9945FF, #ff4d6d)" : "transparent",
                  color: lobbyMode === t ? "#020614" : "#8a8aa0",
                  border: "none", borderRadius: 999, cursor: "pointer",
                }}>{t === "find" ? "Find Match" : t === "create" ? "Create Match" : "Join via Link"}</button>
              ))}
            </div>

            {lobbyMode === "find" && (
              <div className="magic-chess-panel" style={{ borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Quick-match against the next available opponent at your stake.</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, justifyContent: "center" }}>
                  {[0.5, 1, 5, 10].map(amt => (
                    <button key={amt} onClick={() => setStake(amt)} style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                      background: stake === amt ? "linear-gradient(135deg, #9945FF, #ff4d6d)" : "#14141f",
                      color: stake === amt ? "#020614" : "#888",
                      border: stake === amt ? "none" : "1px solid #252540",
                    }}>${amt}</button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 12 }}>Pot: ${totalPot} · Winner gets ${(totalPot * 0.98).toFixed(2)}</div>
                <button onClick={startMatch} className="magic-chess-btn" style={{ padding: "12px 32px", borderRadius: 8, fontSize: 14, cursor: "pointer", width: "100%" }}>
                  ⚔ Find Opponent (${stake})
                </button>
              </div>
            )}

            {lobbyMode === "create" && (
              <div className="magic-chess-panel" style={{ borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Create a private match — share the link with a friend.</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, justifyContent: "center" }}>
                  {[0.5, 1, 5, 10].map(amt => (
                    <button key={amt} onClick={() => setStake(amt)} style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                      background: stake === amt ? "linear-gradient(135deg, #9945FF, #ff4d6d)" : "#14141f",
                      color: stake === amt ? "#020614" : "#888",
                      border: stake === amt ? "none" : "1px solid #252540",
                    }}>${amt}</button>
                  ))}
                </div>
                <button onClick={startMatch} className="magic-chess-btn" style={{ padding: "12px 32px", borderRadius: 8, fontSize: 14, cursor: "pointer", width: "100%" }}>
                  ⚔ Create Match (${stake})
                </button>
              </div>
            )}

            {lobbyMode === "join" && (
              <div className="magic-chess-panel" style={{ borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Paste a challenge code from a friend.</div>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="chess-..."
                  style={{ width: "100%", padding: "8px 10px", fontSize: 12, background: "#14141f", border: "1px solid #252540", borderRadius: 6, color: "#e8e8f0", outline: "none", marginBottom: 10, fontFamily: "monospace" }}
                />
                <button onClick={() => { setMatchEventId(joinCode || `chess-join-${Date.now()}`); startMatch(); }} className="magic-chess-btn" style={{ padding: "12px 32px", borderRadius: 8, fontSize: 14, cursor: "pointer", width: "100%" }}>
                  ⚔ Join Match
                </button>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <WageredEscrowBadge slug="magic-chess" stake={stake} status="scaffold" marketPda={derivedMarketPda} />
            </div>

            <div style={{ marginTop: 16, fontSize: 10, color: "#444" }}>Program: 3LVg8u...3QYr · MagicBlock ER · Contention Markets</div>
          </div>
        </div>
      )}

      {/* PLAYING / GAMEOVER */}
      {(phase === "playing" || phase === "gameover") && (
        <div style={{ position: "relative", height: "calc(100vh - 56px)", overflow: "hidden" }}>
          {viewMode === "3d" && (
            <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
              <Chess3DBoard board={board} selected={sel} validMoves={valid} lastMove={last} check={check} phase={phase} onClick={click} />
            </div>
          )}
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%", pointerEvents: "none" }}>

            {/* TX LOG */}
            <div style={{ width: isMobile ? (showTx ? 220 : 28) : (showTx ? 260 : 36), transition: "width 0.2s", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column", pointerEvents: "auto", background: showTx ? "rgba(10,0,20,0.85)" : "rgba(10,0,20,0.6)", borderRight: "1px solid rgba(153,69,255,0.2)", backdropFilter: "blur(12px)" }}>
              <div onClick={() => setShowTx(!showTx)} style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid rgba(153,69,255,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {showTx && <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: "#9945FF" }}>{chainRef.current?.isReady ? "On-Chain Stream" : "Game Log"}</span>}
                <span style={{ fontSize: 12, color: "#888" }}>{showTx ? "◀" : "▶"}</span>
              </div>
              {showTx && (
                <div ref={txRef} style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                  {txLogs.map((tx, i) => (
                    <div key={i} style={{ fontSize: 10, fontFamily: "monospace", marginBottom: 6, borderLeft: `2px solid ${tx.type === "move" ? "#00e676" : tx.type === "bet" ? "#ffd740" : tx.type === "settle" ? "#ff6b2c" : "#555"}`, paddingLeft: 6 }}>
                      <div style={{ color: tx.type === "system" ? "#666" : "#e0b3ff" }}>{tx.msg}</div>
                      {tx.sig && (
                        <a href={`https://explorer.solana.com/tx/${tx.sig}?cluster=custom&customUrl=https%3A%2F%2Fdevnet.magicblock.app`} target="_blank" rel="noopener noreferrer" style={{ color: "#448aff", fontSize: 8, textDecoration: "underline" }}>TX ↗</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CENTER */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", overflow: "visible", pointerEvents: viewMode === "3d" ? "none" : "auto" }}>
              {/* Controls */}
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
                <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)" }}>
                  <button onClick={() => setViewMode("3d")} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none", background: viewMode === "3d" ? "#7c4dff" : "#14141f", color: viewMode === "3d" ? "#fff" : "#555" }}>3D</button>
                  <button onClick={() => setViewMode("2d")} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none", background: viewMode === "2d" ? "#7c4dff" : "#14141f", color: viewMode === "2d" ? "#fff" : "#555" }}>2D</button>
                </div>
                {viewMode === "2d" && <>
                  <button onClick={() => setCellSize(s => Math.max(40, s - 8))} style={{ background: "#14141f", border: "1px solid #252540", borderRadius: 4, width: 28, height: 28, color: "#888", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>−</button>
                  <button onClick={() => setCellSize(s => Math.min(96, s + 8))} style={{ background: "#14141f", border: "1px solid #252540", borderRadius: 4, width: 28, height: 28, color: "#888", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>+</button>
                </>}
              </div>

              <div className="magic-chess-status" style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, padding: "6px 12px", borderRadius: 6, width: viewMode === "3d" ? "100%" : 8 * cellSize + 20, maxWidth: viewMode === "3d" ? 600 : undefined, fontSize: 11, pointerEvents: "auto" }}>
                <span style={{ fontWeight: 700 }}>{wTurn ? "⚪" : "⚫"} {status || "Your turn"}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: timer < 30 ? "#ff1744" : timer < 60 ? "#ffd740" : "#888" }}>{tm}:{ts}</span>
                <span style={{ color: "#9945FF" }}>Move {mc}</span>
              </div>

              {viewMode === "2d" && (
                <div className="magic-board" style={{ display: "inline-grid", gridTemplateColumns: `${Math.max(20, cellSize * 0.35)}px repeat(8, ${cellSize}px)`, gap: 0, border: "2px solid #9945FF60", borderRadius: 6, boxShadow: "0 4px 30px rgba(0,0,0,0.5)", pointerEvents: "auto" }}>
                  <div />
                  {Array.from({ length: 8 }, (_, i) => <div key={i} style={{ textAlign: "center", fontSize: Math.max(8, cellSize / 6), color: "#555" }}>{cols[i]}</div>)}
                  {Array.from({ length: 8 }, (_, dr) => {
                    const row = 7 - dr;
                    return <div key={`row${row}`} style={{ display: "contents" }}>
                      <div style={{ fontSize: Math.max(8, cellSize / 6), color: "#555", display: "flex", alignItems: "center", justifyContent: "center" }}>{row + 1}</div>
                      {Array.from({ length: 8 }, (_, col) => {
                        const idx = row * 8 + col, piece = board[idx], isDark = (row + col) % 2 === 0;
                        const isSel = sel === idx, isVal = valid.includes(idx), isLast = last?.f === idx || last?.t === idx;
                        const isKC = check && piece === 12;
                        const th = { light: "#2a1548", dark: "#1a0a30", sel: "#14F195", lastMove: "rgba(153,69,255,0.25)", wp: "#e8d0ff", bp: "#14F195" };
                        let bg = isDark ? th.dark : th.light;
                        if (isSel) bg = th.sel;
                        else if (isKC) bg = "rgba(255,23,68,0.35)";
                        else if (isLast) bg = th.lastMove;
                        const pieceColor = piece && isW(piece) ? th.wp : th.bp;
                        return <div key={idx} onClick={() => click(idx)} style={{ width: cellSize, height: cellSize, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: piece ? Math.round(cellSize * 0.6) : 0, cursor: phase === "playing" ? "pointer" : "default", position: "relative", color: pieceColor, transition: "all 0.1s" }}>
                          {PIECES[piece] || ""}
                          {isVal && !piece && <div style={{ width: cellSize * 0.2, height: cellSize * 0.2, borderRadius: "50%", background: "rgba(20,241,149,0.5)", position: "absolute" }} />}
                          {isVal && piece && <div style={{ position: "absolute", inset: 2, borderRadius: 3, border: "2px solid rgba(153,69,255,0.7)" }} />}
                        </div>;
                      })}
                    </div>;
                  })}
                </div>
              )}

              {captured.length > 0 && <div style={{ marginTop: 4, fontSize: 9, color: "#555", pointerEvents: "auto" }}>Captured: {captured.map((p, i) => <span key={i} style={{ fontSize: 14 }}>{PIECES[p]}</span>)}</div>}

              {phase === "playing" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, pointerEvents: "auto" }}>
                  <button onClick={() => { setWon(null); setPhase("gameover"); setStatus("Draw by agreement"); addTx("DRAW AGREED", "system"); }} style={{
                    padding: "6px 16px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                    background: "rgba(10,0,20,0.7)", border: "1px solid rgba(153,69,255,0.3)", color: "#e0b3ff", backdropFilter: "blur(8px)",
                  }}>½ Draw</button>
                  <button onClick={() => { setWon(false); setPhase("gameover"); setStatus("You resigned"); addTx("WHITE RESIGNED", "system"); }} style={{
                    padding: "6px 16px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                    background: "rgba(10,0,20,0.7)", border: "1px solid #ff1744", color: "#ff1744", backdropFilter: "blur(8px)",
                  }}>🏳 Resign</button>
                </div>
              )}

              {phase === "gameover" && (
                <div className="magic-chess-panel" style={{ marginTop: 12, textAlign: "center", borderRadius: 12, padding: 20, maxWidth: 420, pointerEvents: "auto", borderColor: won ? "#14F195" : won === false ? "#ff1744" : "#9945FF" }}>
                  <div className="magic-chess-title" style={{ fontSize: 32, fontWeight: 700 }}>{won ? "✨ CHECKMATE ✨" : won === false ? "⚫ DEFEATED ⚫" : "🤝 STALEMATE"}</div>
                  {isWagered ? (
                    <div style={{ fontSize: 22, fontWeight: 700, color: won ? "#ffd740" : "#ff1744", fontFamily: "monospace", marginTop: 8 }}>
                      {won ? `+$${(totalPot * 0.98).toFixed(2)} USDC` : won === false ? `-$${stake.toFixed(2)} USDC` : "Draw — stakes returned"}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "#b388ff", marginTop: 6 }}>{mc} moves played</div>
                  )}
                  <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{status}</div>
                  {isWagered && (
                    <div style={{ marginTop: 10, textAlign: "left" }}>
                      <WageredEscrowBadge slug="magic-chess" stake={stake} status="scaffold" marketPda={derivedMarketPda} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="magic-chess-btn" onClick={() => { reset(); setPhase("lobby"); setMatchEventId(null); }} style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                      ✦ New Match ✦
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: match info */}
            <div style={{ width: isMobile ? 0 : 260, flexShrink: 0, pointerEvents: "auto", background: "rgba(10,0,20,0.85)", borderLeft: "1px solid rgba(153,69,255,0.2)", backdropFilter: "blur(12px)", padding: 8, overflowY: "auto", display: isMobile ? "none" : "block" }}>
              <div style={{ background: "#0c0c14", borderRadius: 6, padding: 10, border: "1px solid #252540", marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Match Entry</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#888" }}>You (White)</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffd740", fontFamily: "monospace" }}>${stake}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#555", fontWeight: 700 }}>vs</div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#888" }}>Opponent (Black)</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#b388ff", fontFamily: "monospace" }}>${stake}</div>
                  </div>
                </div>
                <div style={{ background: "#14141f", borderRadius: 4, padding: "6px 8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: "#888" }}>Pot</span>
                    <span style={{ color: "#ff6b2c", fontWeight: 700, fontFamily: "monospace" }}>${totalPot} USDC</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 2 }}>
                    <span style={{ color: "#888" }}>Winner</span>
                    <span style={{ color: "#00e676", fontWeight: 700, fontFamily: "monospace" }}>${(totalPot * 0.98).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div style={{ background: "#0c0c14", borderRadius: 6, padding: 10, border: "1px solid #252540" }}>
                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Settlement</div>
                <div style={{ fontSize: 9, color: "#444", lineHeight: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Game State</span><span style={{ color: "#18ffff" }}>MagicBlock ER</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Wager Protocol</span><span style={{ color: "#ff6b2c" }}>Contention Markets</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>Status</span><span style={{ color: "#ffaa00" }}>2-wallet QA pending</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
