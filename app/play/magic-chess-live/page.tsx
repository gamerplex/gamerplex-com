"use client";

// Live PvP (arena) — interactive, player-funded. The player clicks to play White;
// every move is signed by their wallet and submitted to the MagicBlock ER. Black
// is played on-chain by a wallet-funded ephemeral key (v1 single-browser: auto-
// moves a legal reply). On game end: finish + commit to L1 → resolver validates.
// Real 2-human matchmaking (a lobby that pairs two wallets) is the next step.
import { useCallback, useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  initBoard, getValid, execMove, isW, isB, pt, PIECES,
} from "../magic-chess/_shared/chess-engine";
import {
  ixSubmitAction, ixFinishMatch, ixCommitMatch, signAndSend, requestMatch, validateMatch,
  matchPda, erConnection, type SignTx,
} from "../../../lib/arena/client";

const ARENA_CHESS_GAME_ID = Number(process.env.NEXT_PUBLIC_ARENA_CHESS_GAME_ID || "1");
const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keypairSigner = (kp: Keypair): SignTx => async (tx: Transaction) => { tx.partialSign(kp); return tx; };
const FILES = "abcdefgh";

type Phase = "idle" | "starting" | "playing" | "settling" | "done";

export default function LivePvPPage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const er = useRef(erConnection());
  const black = useRef<Keypair | null>(null);
  const game = useRef<{ gameId: number; matchId: number } | null>(null);
  const actionLog = useRef<number[][]>([]);
  const st = useRef({ ep: 255, castle: 0b1111 }); // ep square + castling rights

  const [board, setBoard] = useState<number[]>(initBoard());
  const [sel, setSel] = useState<number | null>(null);
  const [valid, setValid] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Connect a devnet-funded wallet to start.");
  const [result, setResult] = useState<string | null>(null);

  const submit = useCallback(async (player: "white" | "black", from: number, to: number, promo: number) => {
    const g = game.current!;
    const signerPk = player === "white" ? publicKey! : black.current!.publicKey;
    const sign = player === "white" ? (signTransaction as SignTx) : keypairSigner(black.current!);
    await signAndSend(er.current, signerPk, sign, ixSubmitAction(signerPk, g.gameId, g.matchId, Uint8Array.from([from, to, promo])));
    actionLog.current.push([from, to, promo]);
  }, [publicKey, signTransaction]);

  const settle = useCallback(async (winner: "white" | "black" | "draw") => {
    setPhase("settling"); setStatus("Settling on-chain (finish + commit)…");
    const g = game.current!;
    const w = winner === "white" ? publicKey! : winner === "black" ? black.current!.publicKey : null;
    await signAndSend(er.current, publicKey!, signTransaction as SignTx, ixFinishMatch(publicKey!, g.gameId, g.matchId, w));
    await signAndSend(er.current, publicKey!, signTransaction as SignTx, ixCommitMatch(publicKey!, g.gameId, g.matchId));
    setStatus("Validating off-chain…");
    const v = await validateMatch(RESOLVER, g.gameId, g.matchId, actionLog.current);
    setResult(v?.ok && v.valid ? `✓ ${v.winner} wins — validated on-chain (${v.plies} plies)` : `result: ${JSON.stringify(v)}`);
    setPhase("done");
  }, [publicKey, signTransaction]);

  // Black's on-chain reply: pick a legal move, submit via the ephemeral key.
  const playBlack = useCallback(async (b: number[]) => {
    const moves: [number, number][] = [];
    for (let i = 0; i < 64; i++) if (isB(b[i])) for (const t of getValid(b, i, st.current.ep, st.current.castle)) moves.push([i, t]);
    if (moves.length === 0) return; // no legal moves handled by execMove.go on white's side
    const [from, to] = moves[Math.floor(moves.length / 2)] || moves[0]; // deterministic-ish reply
    const promo = pt(b[from]) === 2 && (to >> 3) === 0 ? 11 : 0;
    const r = execMove(from, to, b, st.current.ep, st.current.castle);
    st.current = { ep: r.nep, castle: r.nc };
    setBoard(r.nb);
    await submit("black", from, to, promo);
    if (r.go) { await settle(r.win === 2 ? "black" : r.win === 1 ? "white" : "draw"); return; }
    setStatus("Your move (White).");
  }, [submit, settle]);

  const click = useCallback(async (idx: number) => {
    if (phase !== "playing") return;
    if (sel !== null && valid.includes(idx)) {
      const promo = pt(board[sel]) === 2 && (idx >> 3) === 7 ? 10 : 0;
      const r = execMove(sel, idx, board, st.current.ep, st.current.castle);
      st.current = { ep: r.nep, castle: r.nc };
      setBoard(r.nb); setSel(null); setValid([]);
      setStatus("Submitting your move on-chain…");
      try {
        await submit("white", sel, idx, promo);
      } catch (e: any) { setStatus(`✗ ${e?.message ?? e}`); return; }
      if (r.go) { await settle(r.win === 1 ? "white" : r.win === 2 ? "black" : "draw"); return; }
      setStatus("Black is replying on-chain…");
      await playBlack(r.nb);
      return;
    }
    if (isW(board[idx])) { setSel(idx); setValid(getValid(board, idx, st.current.ep, st.current.castle)); }
  }, [phase, sel, valid, board, submit, settle, playBlack]);

  const start = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setPhase("starting"); setResult(null); actionLog.current = []; st.current = { ep: 255, castle: 0b1111 };
    setBoard(initBoard()); setSel(null); setValid([]);
    try {
      const b = Keypair.generate(); black.current = b;
      setStatus("Funding the opponent key…");
      await signAndSend(connection, publicKey, signTransaction as SignTx,
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: b.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL }));
      setStatus("Creating the match on arena…");
      const m = await requestMatch(RESOLVER, ARENA_CHESS_GAME_ID, [publicKey.toBase58(), b.publicKey.toBase58()]);
      game.current = { gameId: m.gameId, matchId: m.matchId };
      for (let i = 0; i < 25; i++) { if (await er.current.getAccountInfo(matchPda(m.gameId, m.matchId))) break; await sleep(1500); }
      setPhase("playing"); setStatus("Your move (White).");
    } catch (e: any) { setStatus(`✗ ${e?.message ?? e} (needs a funded devnet wallet)`); setPhase("idle"); }
  }, [publicKey, signTransaction, connection]);

  return (
    <div style={{ padding: 24, color: "#e8e8f0", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Magic Chess — Live PvP (arena, devnet)</h1>
      <div style={{ margin: "12px 0" }}><WalletMultiButton /></div>
      <button data-testid="start-live" onClick={start} disabled={!publicKey || phase === "starting" || phase === "playing"}
        className="magic-chess-btn" style={{ padding: "10px 22px", borderRadius: 8, cursor: publicKey ? "pointer" : "not-allowed", opacity: publicKey ? 1 : 0.5 }}>
        {phase === "playing" ? "Match in progress" : phase === "starting" ? "Starting…" : "▶ Start Live match"}
      </button>
      <p data-testid="live-status" style={{ color: "#9aa", fontSize: 13, margin: "12px 0" }}>{status}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", maxWidth: 400, border: "1px solid #252540" }}>
        {Array.from({ length: 8 }, (_, dr) => 7 - dr).flatMap((row) =>
          Array.from({ length: 8 }, (_, col) => {
            const idx = row * 8 + col, p = board[idx];
            const dark = (row + col) % 2 === 0, isSel = sel === idx, isVal = valid.includes(idx);
            return (
              <div key={idx} data-sq={`${FILES[col]}${row + 1}`} onClick={() => click(idx)}
                style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                  background: isSel ? "#14F195" : isVal ? "rgba(20,241,149,0.25)" : dark ? "#1a0a30" : "#2a1548",
                  color: p && isW(p) ? "#e8d0ff" : "#14F195", fontSize: 22, cursor: phase === "playing" ? "pointer" : "default" }}>
                {PIECES[p] || ""}
              </div>
            );
          }),
        )}
      </div>
      {result && <div data-testid="live-result" style={{ marginTop: 14, color: "#14F195", fontWeight: 700 }}>{result}</div>}
    </div>
  );
}
