"use client";

// Live PvP (arena) — player-funded model. Proves the whole stack from the
// browser with the player's OWN wallet: matchmaking (resolver) → delegate →
// submit_action on the MagicBlock ER → finish + commit → off-chain validation.
// v1 demo runs a scripted legal game (Fool's mate); the player's wallet signs
// White and a wallet-funded ephemeral key signs Black. Interactive board play is
// a follow-up — this is the end-to-end devnet proof.
import { useState, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  ixSubmitAction, ixFinishMatch, ixCommitMatch, signAndSend, requestMatch, validateMatch,
  matchPda, erConnection, type SignTx,
} from "../../../lib/arena/client";

const ARENA_CHESS_GAME_ID = Number(process.env.NEXT_PUBLIC_ARENA_CHESS_GAME_ID || "1");
const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

// Fool's mate as board-index [from, to, promo] (idx = (rank-1)*8 + file).
const SCRIPT: { who: "white" | "black"; mv: number[] }[] = [
  { who: "white", mv: [13, 21, 0] }, // f2-f3
  { who: "black", mv: [52, 36, 0] }, // e7-e5
  { who: "white", mv: [14, 30, 0] }, // g2-g4
  { who: "black", mv: [59, 31, 0] }, // Qd8-h4#
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keypairSigner = (kp: Keypair): SignTx => async (tx: Transaction) => { tx.partialSign(kp); return tx; };

export default function LivePvPPage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | string>(null);
  const er = useRef(erConnection());
  const add = (m: string) => setLog((l) => [...l, m]);

  async function run() {
    if (!publicKey || !signTransaction) return;
    setBusy(true); setLog([]); setDone(null);
    try {
      const white = publicKey;
      const whiteSign = signTransaction as SignTx;
      const black = Keypair.generate();

      add("Funding the opponent (ephemeral) key…");
      await signAndSend(connection, white, whiteSign,
        SystemProgram.transfer({ fromPubkey: white, toPubkey: black.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL }));

      add("Creating + delegating the match on arena (via resolver)…");
      const { gameId, matchId } = await requestMatch(
        RESOLVER, ARENA_CHESS_GAME_ID, [white.toBase58(), black.publicKey.toBase58()]);
      add(`Match ${matchId} live on the ER. Playing the game…`);

      // wait for the ER to sync the delegated account
      for (let i = 0; i < 25; i++) {
        if (await er.current.getAccountInfo(matchPda(gameId, matchId))) break;
        await sleep(1500);
      }

      const actionLog: number[][] = [];
      for (const { who, mv } of SCRIPT) {
        const player = who === "white" ? white : black.publicKey;
        const sign = who === "white" ? whiteSign : keypairSigner(black);
        await signAndSend(er.current, player, sign,
          ixSubmitAction(player, gameId, matchId, Uint8Array.from(mv)));
        actionLog.push(mv);
        add(`  ${who} played ${mv[0]}→${mv[1]} on the ER`);
      }

      add("Finishing + committing back to L1…");
      await signAndSend(er.current, white, whiteSign, ixFinishMatch(white, gameId, matchId, black.publicKey));
      await signAndSend(er.current, white, whiteSign, ixCommitMatch(white, gameId, matchId));

      add("Validating off-chain (resolver replay)…");
      const verdict = await validateMatch(RESOLVER, gameId, matchId, actionLog);
      if (verdict.ok && verdict.valid) {
        setDone(`✓ Validated: ${verdict.winner} wins by checkmate (${verdict.plies} plies).`);
      } else {
        setDone(`Validation: ${JSON.stringify(verdict)}`);
      }
    } catch (e: any) {
      add(`✗ ${e?.message ?? e}`);
      setDone("failed — see log (needs a funded devnet wallet).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 32, color: "#e8e8f0", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>Magic Chess — Live PvP (arena, devnet)</h1>
      <p style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
        Plays a full match on the shared arena contract, signed by your wallet (player-funded).
        Needs a devnet-funded wallet.
      </p>
      <div style={{ margin: "16px 0" }}>
        <WalletMultiButton />
      </div>
      <button
        data-testid="run-live-match"
        onClick={run}
        disabled={!publicKey || busy}
        className="magic-chess-btn"
        style={{ padding: "12px 28px", borderRadius: 8, fontSize: 15, cursor: publicKey && !busy ? "pointer" : "not-allowed", opacity: publicKey && !busy ? 1 : 0.5 }}
      >
        {busy ? "Running…" : "▶ Run a Live arena match"}
      </button>
      <div style={{ marginTop: 20, fontFamily: "monospace", fontSize: 12, color: "#9aa" }}>
        {log.map((l, i) => <div key={i}>{l}</div>)}
        {done && <div data-testid="live-result" style={{ marginTop: 8, color: "#14F195", fontWeight: 700 }}>{done}</div>}
      </div>
    </div>
  );
}
