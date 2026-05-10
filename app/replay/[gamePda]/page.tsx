"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Connection, PublicKey } from "@solana/web3.js";

const Chess3DBoard = dynamic(() => import("../../play/magic-chess/_shared/Chess3DBoard"), { ssr: false });

// Piece encoding (matches Rust program)
const W_PAWN = 2;  const B_PAWN = 3;
const W_ROOK = 4;  const B_ROOK = 5;
const W_KNIGHT = 6; const B_KNIGHT = 7;
const W_BISHOP = 8; const B_BISHOP = 9;
const W_QUEEN = 10; const B_QUEEN = 11;
const W_KING = 12;  const B_KING = 13;
const EMPTY = 0;

function standardBoard(): number[] {
  const b = new Array(64).fill(EMPTY);
  b[0]=W_ROOK;b[1]=W_KNIGHT;b[2]=W_BISHOP;b[3]=W_QUEEN;b[4]=W_KING;
  b[5]=W_BISHOP;b[6]=W_KNIGHT;b[7]=W_ROOK;
  for (let i = 8; i < 16; i++) b[i] = W_PAWN;
  for (let i = 48; i < 56; i++) b[i] = B_PAWN;
  b[56]=B_ROOK;b[57]=B_KNIGHT;b[58]=B_BISHOP;b[59]=B_QUEEN;b[60]=B_KING;
  b[61]=B_BISHOP;b[62]=B_KNIGHT;b[63]=B_ROOK;
  return b;
}

// Apply a move to a board (simple: just move piece, handle captures)
function applyMove(board: number[], from: number, to: number): number[] {
  const b = [...board];
  const piece = b[from];
  b[to] = piece;
  b[from] = EMPTY;

  // Handle castling (king moves 2 squares)
  const pieceType = piece & 0xfe;
  if (pieceType === 12) { // king
    if (to - from === 2) { // kingside
      b[from + 1] = b[from + 3]; b[from + 3] = EMPTY;
    } else if (from - to === 2) { // queenside
      b[from - 1] = b[from - 4]; b[from - 4] = EMPTY;
    }
  }

  // Handle en passant (pawn moves diagonally to empty square)
  if (pieceType === 2 && board[to] === EMPTY && (from & 7) !== (to & 7)) {
    const captured = piece % 2 === 0 ? to - 8 : to + 8; // white captures down, black captures up
    b[captured] = EMPTY;
  }

  // Handle promotion (pawn reaches last rank → queen)
  if (pieceType === 2) {
    const rank = to >> 3;
    if (rank === 7 && piece % 2 === 0) b[to] = W_QUEEN; // white promotes
    if (rank === 0 && piece % 2 !== 0) b[to] = B_QUEEN; // black promotes
  }

  return b;
}

// Parse GameState PDA data
function parseGameState(data: Buffer) {
  // 8 disc + 8 game_id + 32 white + 32 black + 1 status + 1 turn + 2 move_count
  // + 1 winner + 2 time_per_move + 8 last_move_at + 1 en_passant + 1 castling
  // + 64 board + moves[u16; 256]
  const gameId = Number(data.readBigUInt64LE(8));
  const white = new PublicKey(data.slice(16, 48)).toBase58();
  const black = new PublicKey(data.slice(48, 80)).toBase58();
  const status = data[80];
  const turn = data[81];
  const moveCount = data.readUInt16LE(82);
  const winner = data[84];
  const boardOffset = 80 + 4 + 1 + 2 + 8 + 1 + 1; // status(1) + turn(1) + moveCount(2) + winner(1) + timePerMove(2) + lastMoveAt(8) + enPassant(1) + castling(1) = 17 from offset 80
  const board = Array.from(data.slice(boardOffset, boardOffset + 64));

  // Moves start after board
  const movesOffset = boardOffset + 64;
  const moves: { from: number; to: number }[] = [];
  for (let i = 0; i < moveCount && i < 256; i++) {
    const encoded = data.readUInt16LE(movesOffset + i * 2);
    moves.push({ from: (encoded >> 8) & 0xFF, to: encoded & 0xFF });
  }

  return { gameId, white, black, status, turn, moveCount, winner, board, moves };
}

const RPC_URL = "https://api.devnet.solana.com";

export default function ReplayPage() {
  const params = useParams();
  const gamePda = params.gamePda as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameData, setGameData] = useState<ReturnType<typeof parseGameState> | null>(null);
  const [currentMove, setCurrentMove] = useState(0);
  const [boards, setBoards] = useState<number[][]>([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000); // ms per move
  const playingRef = useRef(false);

  const [source, setSource] = useState<"er"|"l1"|null>(null);

  // Keyboard controls: ← → Home End Space
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { setCurrentMove(m => Math.max(0, m - 1)); setPlaying(false); }
      if (e.key === "ArrowRight") { setCurrentMove(m => Math.min(boards.length - 1, m + 1)); setPlaying(false); }
      if (e.key === "Home") { setCurrentMove(0); setPlaying(false); }
      if (e.key === "End") { setCurrentMove(boards.length - 1); setPlaying(false); }
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [boards.length]);
  const [moveSigs, setMoveSigs] = useState<string[]>([]);

  // Fetch game: try ER replay endpoint first (fast, free), fallback to L1 PDA
  useEffect(() => {
    async function fetchGame() {
      // Try ER replay endpoint first
      try {
        const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
        const res = await fetch(`${RESOLVER}/game-pool/replay/${gamePda}`);
        const data = await res.json();
        if (data.ok && data.moves?.length > 0) {
          const cols = "abcdefgh";
          const erMoves = data.moves.map((m: any) => ({
            from: (parseInt(m.from[1]) - 1) * 8 + (m.from.charCodeAt(0) - 97),
            to: (parseInt(m.to[1]) - 1) * 8 + (m.to.charCodeAt(0) - 97),
          }));
          setMoveSigs(data.moves.map((m: any) => m.sig));
          setGameData({ gameId: 0, white: "", black: "", status: 1, turn: 0, moveCount: erMoves.length, winner: 0, board: standardBoard(), moves: erMoves } as any);

          const boardStates: number[][] = [standardBoard()];
          let current = standardBoard();
          for (const move of erMoves) {
            current = applyMove(current, move.from, move.to);
            boardStates.push(current);
          }
          setBoards(boardStates);
          setSource("er");
          setLoading(false);
          return;
        }
      } catch {}

      // Fallback to L1 PDA
      try {
        const conn = new Connection(RPC_URL, "confirmed");
        const pubkey = new PublicKey(gamePda);
        const info = await conn.getAccountInfo(pubkey);

        if (!info) {
          setError("Game not found. Check the game PDA address.");
          setLoading(false);
          return;
        }

        const parsed = parseGameState(Buffer.from(info.data));
        setGameData(parsed);

        const boardStates: number[][] = [standardBoard()];
        let current = standardBoard();
        for (const move of parsed.moves) {
          current = applyMove(current, move.from, move.to);
          boardStates.push(current);
        }
        setBoards(boardStates);
        setSource("l1");
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchGame();
  }, [gamePda]);

  // Auto-play
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;

    const interval = setInterval(() => {
      if (!playingRef.current) return;
      setCurrentMove(prev => {
        if (prev >= boards.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [playing, speed, boards.length]);

  const lastMove = currentMove > 0 && gameData
    ? { f: gameData.moves[currentMove - 1].from, t: gameData.moves[currentMove - 1].to }
    : null;

  const winnerText = gameData
    ? gameData.winner === 1 ? "White wins" : gameData.winner === 2 ? "Black wins" : gameData.winner === 3 ? "Draw" : "In progress"
    : "";

  const squareName = (idx: number) => {
    const file = "abcdefgh"[idx & 7];
    const rank = (idx >> 3) + 1;
    return `${file}${rank}`;
  };

  if (loading) {
    return (
      <div style={{ background: "#0d001a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>♚</div>
          <div style={{ fontSize: 14 }}>Loading game from Solana...</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4, fontFamily: "monospace" }}>{gamePda.slice(0, 20)}...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "#0d001a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4466" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>{error}</div>
          <a href="/" style={{ color: "#9945ff", fontSize: 13 }}>Back to Home</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0d001a", minHeight: "100vh", color: "#e8e8f0" }}>
      {/* NAV */}
      <nav className="top-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" className="nav-logo" style={{ textDecoration: "none", color: "inherit" }}>GAMERPLEX</a>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          <a href="/play/magic-chess">Play</a>
          <a href="/activity">Activity</a>
          <a href="/leaderboard">Leaderboard</a>
        </div>
      </nav>

      {/* HEADER */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "80px 20px 20px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#9945FF", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
          Game Replay — On-Chain
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "#e0b3ff" }}>
          {winnerText} &bull; {gameData?.moveCount} moves
        </h1>
        <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", marginBottom: 20 }}>
          PDA: <a
            href={`https://explorer.solana.com/address/${gamePda}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#9945ff" }}
          >{gamePda}</a>
        </div>
      </div>

      {/* 3D BOARD */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px" }}>
        <div style={{
          position: "relative", width: "100%", height: 480, borderRadius: 12, overflow: "hidden",
          border: "1px solid rgba(153,69,255,0.3)", boxShadow: "0 0 30px rgba(153,69,255,0.2)",
          marginBottom: 16,
        }}>
          <Chess3DBoard
            board={boards[currentMove] || standardBoard()}
            selected={null}
            validMoves={[]}
            lastMove={lastMove}
            check={false}
            phase="playing"
            onClick={() => {}}
            autoRotate={false}
          />
          <div style={{
            position: "absolute", top: 12, left: 12, background: "rgba(10,0,20,0.85)",
            backdropFilter: "blur(8px)", padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(153,69,255,0.4)", pointerEvents: "none",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e0b3ff" }}>
              Move {currentMove}/{gameData?.moveCount}
            </div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
              {currentMove % 2 === 0 ? "⚪ White" : "⚫ Black"} to play
            </div>
          </div>
        </div>

        {/* MOVE SLIDER — chess.com style scrubber */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
          <span style={{ fontSize: 10, color: "#555", minWidth: 24 }}>0</span>
          <input
            type="range"
            min={0}
            max={boards.length - 1}
            value={currentMove}
            onChange={e => { setCurrentMove(parseInt(e.target.value)); setPlaying(false); }}
            style={{ flex: 1, accentColor: "#9945FF", cursor: "pointer", height: 6 }}
          />
          <span style={{ fontSize: 10, color: "#555", minWidth: 24, textAlign: "right" }}>{gameData?.moveCount}</span>
        </div>

        {/* CONTROLS */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
          padding: "4px 0 12px", flexWrap: "wrap",
        }}>
          <button onClick={() => { setCurrentMove(0); setPlaying(false); }} style={btnStyle}>
            ⏮ Start
          </button>
          <button onClick={() => setCurrentMove(Math.max(0, currentMove - 1))} style={btnStyle}>
            ◀ Prev
          </button>
          <button
            onClick={() => {
              if (currentMove >= boards.length - 1) setCurrentMove(0);
              setPlaying(!playing);
            }}
            style={{ ...btnStyle, background: playing ? "rgba(255,68,102,0.2)" : "rgba(153,69,255,0.2)", minWidth: 80 }}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={() => setCurrentMove(Math.min(boards.length - 1, currentMove + 1))} style={btnStyle}>
            Next ▶
          </button>
          <button onClick={() => { setCurrentMove(boards.length - 1); setPlaying(false); }} style={btnStyle}>
            End ⏭
          </button>

          <div style={{ width: 1, height: 24, background: "#252540", margin: "0 8px" }} />

          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={{
              background: "#0c0c14", border: "1px solid #252540", borderRadius: 6,
              color: "#aaa", padding: "6px 10px", fontSize: 12,
            }}
          >
            <option value={2000}>0.5x</option>
            <option value={1000}>1x</option>
            <option value={500}>2x</option>
            <option value={250}>4x</option>
          </select>
          <div style={{ fontSize: 9, color: "#555", marginLeft: 8 }}>← → keys · Space to play</div>
        </div>

        {/* Source + current move TX */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 10 }}>
          <span style={{ color: "#555" }}>
            Source: {source === "er" ? "MagicBlock ER Validator" : source === "l1" ? "Solana L1" : "Loading..."}
          </span>
          {currentMove > 0 && moveSigs[currentMove - 1] && (
            <a
              href={`https://explorer.solana.com/tx/${moveSigs[currentMove - 1]}?cluster=custom&customUrl=https%3A%2F%2Fdevnet.magicblock.app`}
              target="_blank"
              rel="noopener"
              style={{ color: "#9945FF" }}
            >
              TX: {moveSigs[currentMove - 1].slice(0, 16)}... ↗
            </a>
          )}
        </div>

        {/* MOVE LIST */}
        <div style={{
          background: "#0c0c14", border: "1px solid #252540", borderRadius: 12,
          padding: "16px 20px", marginTop: 16, maxHeight: 300, overflowY: "auto",
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            Move History (On-Chain)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {gameData?.moves.map((move, i) => (
              <button
                key={i}
                onClick={() => { setCurrentMove(i + 1); setPlaying(false); }}
                style={{
                  background: currentMove === i + 1 ? "rgba(153,69,255,0.3)" : "transparent",
                  border: currentMove === i + 1 ? "1px solid #9945ff" : "1px solid transparent",
                  borderRadius: 4, padding: "3px 6px", cursor: "pointer",
                  color: i % 2 === 0 ? "#ddd" : "#888", fontSize: 11, fontFamily: "monospace",
                }}
              >
                {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ""}{squareName(move.from)}{squareName(move.to)}
              </button>
            ))}
          </div>
        </div>

        {/* GAME INFO */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
          marginTop: 16, marginBottom: 40,
        }}>
          <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>White</div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: "#ddd" }}>{gameData?.white.slice(0, 8)}...{gameData?.white.slice(-4)}</div>
          </div>
          <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Black</div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: "#ddd" }}>{gameData?.black.slice(0, 8)}...{gameData?.black.slice(-4)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "rgba(37,37,64,0.6)", border: "1px solid #252540", borderRadius: 6,
  color: "#aaa", padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
};
