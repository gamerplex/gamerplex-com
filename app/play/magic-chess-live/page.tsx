"use client";

// Live PvP (arena) — REAL 2-player. Find-a-match queue pairs two humans; each
// plays their own colour, signing moves with their own wallet to the MagicBlock
// ER; the opponent's moves arrive by polling the match on the ER. On game end,
// the resolver (match creator) settles to L1. Player-funded (each signs their
// own moves; needs a devnet-funded wallet).
import { useEffect, useReducer, useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { initBoard, getValid, execMove, isW, PIECES } from "../magic-chess/_shared/chess-engine";
import { ixSubmitAction, signAndSend, decodeMatch, matchPda, erConnection, type SignTx } from "../../../lib/arena/client";

const ARENA_CHESS_GAME_ID = Number(process.env.NEXT_PUBLIC_ARENA_CHESS_GAME_ID || "1");
const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
const FILES = "abcdefgh";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "searching" | "syncing" | "playing" | "done";
interface Match { gameId: number; matchId: number; color: "white" | "black"; opponent: string }

// Identity = the connected wallet, OR (test/e2e only, gated by an env flag) a
// keypair injected on window — so Playwright can drive moves without a wallet popup.
function useSigner(): { publicKey: PublicKey | null; signTransaction: SignTx | undefined } {
  const wallet = useWallet();
  const [test, setTest] = useState<Keypair | null>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ALLOW_TEST_WALLET !== "1") return;
    const sk = (globalThis as unknown as { __ARENA_TEST_SK__?: number[] }).__ARENA_TEST_SK__;
    if (Array.isArray(sk)) { try { setTest(Keypair.fromSecretKey(Uint8Array.from(sk))); } catch { /* ignore */ } }
  }, []);
  if (test) {
    const signTransaction: SignTx = async (tx: Transaction) => { tx.partialSign(test); return tx; };
    return { publicKey: test.publicKey, signTransaction };
  }
  return { publicKey: wallet.publicKey ?? null, signTransaction: wallet.signTransaction as SignTx | undefined };
}

export default function LivePvPPage() {
  const { publicKey, signTransaction } = useSigner();
  const { connection } = useConnection();
  const er = useRef(erConnection());
  const match = useRef<Match | null>(null);
  // authoritative game state (refs to avoid stale closures in poll/click)
  const gs = useRef({ board: initBoard(), applied: 0, ep: 255, castle: 0b1111, log: [] as number[][] });
  const sel = useRef<number | null>(null);
  const valid = useRef<number[]>([]);
  const phase = useRef<Phase>("idle");
  const status = useRef("Connect a devnet-funded wallet, then find a match.");
  const result = useRef<string | null>(null);
  const [, render] = useReducer((x) => x + 1, 0);
  const set = (p: Partial<{ phase: Phase; status: string; result: string | null }>) => {
    if (p.phase !== undefined) phase.current = p.phase;
    if (p.status !== undefined) status.current = p.status;
    if (p.result !== undefined) result.current = p.result;
    render();
  };

  const myColor = () => match.current?.color ?? "white";
  const myTurn = () => (gs.current.applied % 2 === 0) === (myColor() === "white");

  async function settle() {
    const m = match.current!;
    set({ phase: "done", status: "Settling on-chain…" });
    try {
      const r = await fetch(`${RESOLVER}/arena/settle/${m.gameId}/${m.matchId}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionLog: gs.current.log }),
      }).then((x) => x.json());
      set({ result: r?.ok ? `✓ ${r.winner} wins — settled on-chain` : `game over — ${JSON.stringify(r)}` });
    } catch (e: any) { set({ result: `game over (settle: ${e?.message ?? e})` }); }
  }

  function applyMove(from: number, to: number, promo: number) {
    const g = gs.current;
    const r = execMove(from, to, g.board, g.ep, g.castle);
    g.board = r.nb; g.ep = r.nep; g.castle = r.nc; g.applied += 1; g.log.push([from, to, promo]);
    sel.current = null; valid.current = [];
    if (r.go) { void settle(); return; }
    set({ status: myTurn() ? "Your move." : "Opponent's move…" });
  }

  // click to move (only on my turn)
  async function click(idx: number) {
    if (phase.current !== "playing" || !myTurn() || !publicKey || !signTransaction) return;
    const g = gs.current;
    if (sel.current !== null && valid.current.includes(idx)) {
      const from = sel.current;
      const piece = g.board[from];
      const promo = (piece & 0xfe) === 2 && (idx >> 3) === (isW(piece) ? 7 : 0) ? (isW(piece) ? 10 : 11) : 0;
      set({ status: "Submitting your move…" });
      try {
        const m = match.current!;
        await signAndSend(er.current, publicKey, signTransaction as SignTx, ixSubmitAction(publicKey, m.gameId, m.matchId, Uint8Array.from([from, idx, promo])));
      } catch (e: any) { set({ status: `✗ ${e?.message ?? e}` }); return; }
      applyMove(from, idx, promo);
      return;
    }
    const p = g.board[idx];
    const mine = myColor() === "white" ? isW(p) : (p > 0 && !isW(p));
    if (mine) { sel.current = idx; valid.current = getValid(g.board, idx, g.ep, g.castle); render(); }
  }

  // poll the ER for the opponent's move when it's their turn
  useEffect(() => {
    if (phase.current !== "playing") return;
    const id = setInterval(async () => {
      if (phase.current !== "playing" || myTurn()) return;
      try {
        const m = match.current!;
        const info = await er.current.getAccountInfo(matchPda(m.gameId, m.matchId));
        if (!info) return;
        const st = decodeMatch(info.data);
        if (st.actionCount === gs.current.applied + 1) {
          const [from, to, promo] = Array.from(st.lastAction);
          applyMove(from, to, promo);
        }
      } catch { /* transient */ }
    }, 1500);
    return () => clearInterval(id);
  }, [phase.current === "playing", match.current?.matchId]);

  async function findMatch() {
    if (!publicKey) return;
    set({ phase: "searching", status: "Finding an opponent…", result: null });
    gs.current = { board: initBoard(), applied: 0, ep: 255, castle: 0b1111, log: [] };
    const me = publicKey.toBase58();
    try {
      const join = await fetch(`${RESOLVER}/arena/queue/join`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: ARENA_CHESS_GAME_ID, player: me }),
      }).then((x) => x.json());
      let assign = join.status === "matched" ? join.assignment : null;
      // poll until matched
      for (let i = 0; i < 120 && !assign; i++) {
        await sleep(2500);
        try {
          const resp = await fetch(`${RESOLVER}/arena/queue/status?player=${me}`);
          if (!resp.ok) continue; // transient (rate limit etc.) — keep polling
          const s = await resp.json();
          if (s.status === "matched") assign = s.assignment;
        } catch { /* transient — keep polling */ }
      }
      if (!assign) { set({ phase: "idle", status: "No opponent found — try again." }); return; }
      match.current = { gameId: assign.gameId, matchId: assign.matchId, color: assign.color, opponent: assign.opponent };
      set({ phase: "syncing", status: "Match found — syncing the board…" });
      for (let i = 0; i < 25; i++) { if (await er.current.getAccountInfo(matchPda(assign.gameId, assign.matchId))) break; await sleep(1500); }
      set({ phase: "playing", status: myTurn() ? "Your move." : "Opponent's move…" });
    } catch (e: any) { set({ phase: "idle", status: `✗ ${e?.message ?? e}` }); }
  }

  const board = gs.current.board;
  return (
    <div style={{ padding: 24, color: "#e8e8f0", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Magic Chess — Live PvP (arena, devnet)</h1>
      <div style={{ margin: "12px 0" }}><WalletMultiButton /></div>
      <button data-testid="find-match" onClick={findMatch} disabled={!publicKey || phase.current === "searching" || phase.current === "playing"}
        className="magic-chess-btn" style={{ padding: "10px 22px", borderRadius: 8, cursor: publicKey ? "pointer" : "not-allowed", opacity: publicKey ? 1 : 0.5 }}>
        {phase.current === "playing" ? `Playing (${myColor()})` : phase.current === "searching" ? "Searching…" : "▶ Find a match"}
      </button>
      <p data-testid="live-status" style={{ color: "#9aa", fontSize: 13, margin: "12px 0" }}>{status.current}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", maxWidth: 400, border: "1px solid #252540" }}>
        {Array.from({ length: 8 }, (_, dr) => 7 - dr).flatMap((row) =>
          Array.from({ length: 8 }, (_, col) => {
            const idx = row * 8 + col, p = board[idx];
            const dark = (row + col) % 2 === 0, isSel = sel.current === idx, isVal = valid.current.includes(idx);
            return (
              <div key={idx} data-sq={`${FILES[col]}${row + 1}`} onClick={() => click(idx)}
                style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                  background: isSel ? "#14F195" : isVal ? "rgba(20,241,149,0.25)" : dark ? "#1a0a30" : "#2a1548",
                  color: p && isW(p) ? "#e8d0ff" : "#14F195", fontSize: 22, cursor: phase.current === "playing" && myTurn() ? "pointer" : "default" }}>
                {PIECES[p] || ""}
              </div>
            );
          }),
        )}
      </div>
      {result.current && <div data-testid="live-result" style={{ marginTop: 14, color: "#14F195", fontWeight: 700 }}>{result.current}</div>}
    </div>
  );
}
