"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import ModeToggle from "../../../../components/games/ModeToggle";
import {
  PIECES, isW, isB, pt, initBoard, getValid, isAttacked, execMove,
} from "../_shared/chess-engine";
import { ARCADE_BOTS, botById, computeScore, encodeMoveLog, encodeMoveLogV2, generateSeed, TIMER_PRESETS, DEFAULT_TIMER_SEC, type MoveLogEntry } from "./score";
import {
  makeProgram, buildOpenProfileIx, buildSubmitScoreIx, buildRecordPaymentIx,
  USDC_MINT,
  buildCommitReplayIx, buildMintReceiptIx, buildUsdcTransferIxs,
  profilePda, sha256, sigToBytes, getTreasuryWallet,
  CATEGORY, SCORE_COMMIT_MICRO_USD, VERIFIED_COMMIT_MICRO_USD, REPLAY_RECEIPT_MICRO_USD,
  MAGIC_CHESS_GAME_ID, ARCADE_NETWORK,
} from "../../../../lib/arcade/client";
import { getStoredReferrer } from "../../../../lib/arcade/referral";
import { submitReplay } from "@gamerplex/sdk/arcade";
import { track, identifyWallet } from "../../../../lib/analytics";
import { EconomyConsentModal, hasEconomyConsent } from "../../../../lib/arcade/economy-gate";
import { earnCredits } from "../../../../lib/identity/client";
import ContinueWithCredits from "../../../../components/arcade/ContinueWithCredits";
import ReferrerBanner from "../../../../components/arcade/ReferrerBanner";
import { buildSaveScorePaymentIxs } from "../../../../lib/arcade/save-score-payment";
import { PAYMENT_TOKENS, type PaymentTokenDef } from "../../../../lib/arcade/tokens";
import PaymentMethodPicker from "../../../../components/arcade/PaymentMethodPicker";
import { ArcadeLeaderboard } from "../../../arcade/_components/ArcadeLeaderboard";
import "../_shared/magic.css";

const Chess3DBoard = dynamic(() => import("../_shared/Chess3DBoard"), { ssr: false });
const EXPLORER_SUFFIX = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;

type Phase = "ready" | "playing" | "gameover";

export default function ArcadeMode() {
  const { publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [phase, setPhase] = useState<Phase>("ready");
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
  const [turnTimeSec, setTurnTimeSec] = useState(DEFAULT_TIMER_SEC);
  const [timer, setTimer] = useState(turnTimeSec);
  const [check, setCheck] = useState(false);
  const [experience, setExperience] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [cellSize, setCellSize] = useState(typeof window !== "undefined" && window.innerWidth < 768 ? 48 : 72);

  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);
  const moveLogRef = useRef<MoveLogEntry[]>([]);
  const moveDeltasRef = useRef<number[]>([]);
  const lastMoveAtRef = useRef<number>(0);

  const [busy, setBusy] = useState<null | "save" | "verify" | "receipt">(null);
  const [savedThisRun, setSavedThisRun] = useState(false);
  const [verifiedThisRun, setVerifiedThisRun] = useState(false);
  const [ownedThisRun, setOwnedThisRun] = useState(false);
  const [lastSaveSig, setLastSaveSig] = useState<string | null>(null);
  const [lastVerifySig, setLastVerifySig] = useState<string | null>(null);
  const [lastReceiptSig, setLastReceiptSig] = useState<string | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [profileExists, setProfileExists] = useState<boolean | null>(null);

  const timerRef = useRef<any>(null);
  const histRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!publicKey) { setProfileExists(null); return; }
    const [pda] = profilePda(publicKey);
    connection.getAccountInfo(pda).then(info => setProfileExists(!!info)).catch(() => setProfileExists(null));
  }, [publicKey, connection]);

  useEffect(() => {
    if (phase !== "playing") return;
    setTimer(turnTimeSec);
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setWon(!wTurn);
          setPhase("gameover");
          setStatus(`${wTurn ? "White" : "Black"} timed out`);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, wTurn]);

  // Web2 Credits earn on a win (fire-and-forget; capped + idempotent server-side, CREDITS only — never $GAME).
  const earnedThisRunRef = useRef(false);
  useEffect(() => {
    if (phase !== "gameover") { earnedThisRunRef.current = false; return; }
    if (won === true && !earnedThisRunRef.current) {
      earnedThisRunRef.current = true;
      void earnCredits("game_win", `chess:win:${startedAt}`);
    }
  }, [phase, won, startedAt]);

  useEffect(() => { histRef.current?.scrollTo(0, histRef.current.scrollHeight); }, [hist]);

  const reset = useCallback(() => {
    setBoard(initBoard());
    setCap([]); setMc(0); setWTurn(true); setSel(null); setValid([]);
    setStatus("Your turn"); setWon(null); setEp(255); setCastle(0b1111);
    setHist([]); setCheck(false); setTimer(turnTimeSec);
    moveLogRef.current = [];
    moveDeltasRef.current = [];
    lastMoveAtRef.current = 0;
    setSavedThisRun(false); setVerifiedThisRun(false); setOwnedThisRun(false);
    setLastSaveSig(null); setLastVerifySig(null); setLastReceiptSig(null);
    setOnchainError(null);
  }, []);

  const startGame = useCallback(() => {
    reset();
    setSeed(generateSeed());
    const now = Date.now();
    setStartedAt(now);
    lastMoveAtRef.current = now;
    setPhase("playing");
    track("play_started", { game: "magic-chess" });
  }, [reset]);

  const recordMove = useCallback((entry: MoveLogEntry) => {
    const now = Date.now();
    const prev = lastMoveAtRef.current || now;
    const deltaSec = Math.max(0, Math.min(255, Math.floor((now - prev) / 1000)));
    moveLogRef.current.push(entry);
    moveDeltasRef.current.push(deltaSec);
    lastMoveAtRef.current = now;
  }, []);

  const click = useCallback((idx: number) => {
    if (phase !== "playing" || !wTurn) return;
    if (sel !== null && valid.includes(idx)) {
      const piece = board[sel];
      const isPromotion = pt(piece) === 2 && ((idx >> 3) === 7);
      recordMove({ from: sel, to: idx, promotion: isPromotion ? 10 : 0 });

      const r = execMove(sel, idx, board, ep, castle);
      setBoard(r.nb); setLast({ f: sel, t: idx }); setSel(null); setValid([]);
      setEp(r.nep); setCastle(r.nc);
      if (r.cap > 0) setCap(c => [...c, r.cap]);
      setHist(h => [...h, r.alg]); setMc(m => m + 1); setTimer(turnTimeSec);

      if (r.go) {
        setWon(r.win === 1); setPhase("gameover");
        setStatus(r.win === 1 ? "Checkmate!" : r.win === 2 ? "Checkmate!" : "Stalemate");
        return;
      }
      const bk = r.nb.indexOf(13);
      const inCheck = bk >= 0 && isAttacked(r.nb, bk, true);
      setCheck(inCheck);
      setWTurn(false);
      setStatus(inCheck ? "Check! Bot thinking..." : "Bot thinking...");

      setTimeout(() => {
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
        if (!am.length) { setWon(true); setPhase("gameover"); setStatus("Bot has no moves!"); return; }
        am.sort((a, b) => b.s - a.s);
        const pick = am[Math.floor(Math.random() * Math.min(3, am.length))];
        recordMove({ from: pick.f, to: pick.t, promotion: 0 });
        const r2 = execMove(pick.f, pick.t, r.nb, r.nep, r.nc);
        setBoard(r2.nb); setLast({ f: pick.f, t: pick.t }); setEp(r2.nep); setCastle(r2.nc);
        if (r2.cap > 0) setCap(c => [...c, r2.cap]);
        setHist(h => [...h, r2.alg]); setMc(m => m + 1); setTimer(turnTimeSec);
        if (r2.go) {
          setWon(r2.win === 1 ? true : r2.win === 2 ? false : null);
          setPhase("gameover");
          setStatus(r2.win === 1 ? "Checkmate!" : r2.win === 2 ? "Checkmate!" : "Stalemate");
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
  }, [phase, board, sel, valid, wTurn, ep, castle]);

  const bot = botById(experience);
  const finalScore = useMemo(() => {
    if (!bot || phase !== "gameover") return 0;
    const dur = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    return computeScore(bot.elo, won === true, mc, dur, turnTimeSec);
  }, [bot, won, mc, startedAt, phase, turnTimeSec]);

  // v1.4: default to USDC. Token picker UI ships in the next commit.
  const [paymentToken, setPaymentToken] = useState<PaymentTokenDef>(
    PAYMENT_TOKENS.find((t) => t.symbol === "USDC") ?? PAYMENT_TOKENS[0]
  );

  // §F legal gate: first $GAME payment must accept the 18+/AI/not-gambling attestation.
  const [showEconomyGate, setShowEconomyGate] = useState(false);

  const onSaveOnChain = useCallback(async () => {
    if (!seed || !anchorWallet || !publicKey || !bot) return;
    if (paymentToken.kind === "game" && !hasEconomyConsent()) {
      setShowEconomyGate(true);
      return;
    }
    setBusy("save"); setOnchainError(null);
    track("score_save_attempted", { game: "magic-chess", bot: bot.id, turn_time_sec: turnTimeSec, score: finalScore, token: paymentToken.symbol });
    identifyWallet(publicKey.toBase58());
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      if (profileExists === false || profileExists === null) {
        tx.add(await buildOpenProfileIx(program, publicKey, getStoredReferrer(publicKey)));
      }

      // v1.4: shared multi-token helper. Routes USDC/SOL/$GAME and applies
      // the 20% discount for $GAME automatically via contract-aware quote.
      const { ixs: paymentIxs } = await buildSaveScorePaymentIxs(
        program, connection, publicKey,
        {
          token: paymentToken,
          category: CATEGORY.SCORE_COMMIT,
          basePriceMicroUsd: new BN(SCORE_COMMIT_MICRO_USD),
          gameId: MAGIC_CHESS_GAME_ID,
          externalRef: "",
          treasury,
        },
      );
      paymentIxs.forEach((ix) => tx.add(ix));

      const moveLogBytes = encodeMoveLogV2(moveLogRef.current, moveDeltasRef.current);
      const moveHash = await sha256(moveLogBytes);
      const dur = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      tx.add(await buildSubmitScoreIx(program, publicKey, {
        variant: `${bot.id}|${turnTimeSec}`,
        score: new BN(finalScore),
        continuesUsed: 0,
        powerupsUsed: 0,
        sessionSeed: seed,
        durationSec: dur,
        moveHash,
        meta: "",
        vsChallenger: PublicKey.default,
        gameId: MAGIC_CHESS_GAME_ID,
      }));

      const sig = await program.provider.sendAndConfirm!(tx, [], { skipPreflight: false });
      setLastSaveSig(sig); setSavedThisRun(true); setProfileExists(true);
      track("score_save_succeeded", { game: "magic-chess", bot: bot.id, sig, score: finalScore, sink_type: "save", token: paymentToken.symbol, amount_usd: SCORE_COMMIT_MICRO_USD / 1e6 });
      void submitReplay(sig, moveLogBytes).catch(() => {});
    } catch (e: any) {
      console.error("save failed:", e);
      setOnchainError(e?.message || "Save failed");
      track("score_save_failed", { game: "magic-chess", error: e?.message || String(e) });
    } finally { setBusy(null); }
  }, [anchorWallet, publicKey, connection, profileExists, seed, bot, startedAt, finalScore, paymentToken]);

  const onVerifyRun = useCallback(async () => {
    if (!seed || !anchorWallet || !publicKey) return;
    if (!savedThisRun) { setOnchainError("Save score first before verifying."); return; }
    setBusy("verify"); setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      const usdcIxs = await buildUsdcTransferIxs(connection, publicKey, publicKey, treasury, new BN(VERIFIED_COMMIT_MICRO_USD));
      usdcIxs.forEach(ix => tx.add(ix));

      const emptySig = new Uint8Array(64);
      tx.add(await buildRecordPaymentIx(program, publicKey, {
        category: CATEGORY.VERIFIED_COMMIT,
        amountMicroUsd: new BN(VERIFIED_COMMIT_MICRO_USD),
        paymentTxSig: emptySig,
        paymentMint: USDC_MINT,
          paymentAmountRaw: new BN(VERIFIED_COMMIT_MICRO_USD), // v1.3: stablecoin parity (raw === micro-USD)
        externalRef: "",
        gameId: MAGIC_CHESS_GAME_ID,
      }));

      const moveLog = encodeMoveLogV2(moveLogRef.current, moveDeltasRef.current);
      if (moveLog.length > 400) throw new Error(`Move log ${moveLog.length}B exceeds 400B inline budget`);
      tx.add(await buildCommitReplayIx(program, publicKey, {
        scoreNonce: new BN(startedAt),
        sessionSeed: seed,
        moveLog,
      }));

      const sig = await program.provider.sendAndConfirm!(tx, [], { skipPreflight: false });
      setLastVerifySig(sig); setVerifiedThisRun(true);
    } catch (e: any) {
      console.error("verify failed:", e);
      setOnchainError(e?.message || "Verify failed");
    } finally { setBusy(null); }
  }, [anchorWallet, publicKey, connection, savedThisRun, seed, startedAt]);

  const onMintReceipt = useCallback(async () => {
    if (!seed || !anchorWallet || !publicKey || !lastVerifySig || !bot) return;
    if (!verifiedThisRun) { setOnchainError("Save replay first before minting receipt."); return; }
    setBusy("receipt"); setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      const usdcIxs = await buildUsdcTransferIxs(connection, publicKey, publicKey, treasury, new BN(REPLAY_RECEIPT_MICRO_USD));
      usdcIxs.forEach(ix => tx.add(ix));

      const emptySig = new Uint8Array(64);
      tx.add(await buildRecordPaymentIx(program, publicKey, {
        category: CATEGORY.REPLAY_RECEIPT,
        amountMicroUsd: new BN(REPLAY_RECEIPT_MICRO_USD),
        paymentTxSig: emptySig,
        paymentMint: USDC_MINT,
          paymentAmountRaw: new BN(REPLAY_RECEIPT_MICRO_USD), // v1.3: stablecoin parity (raw === micro-USD)
        externalRef: "",
        gameId: MAGIC_CHESS_GAME_ID,
      }));

      const nonce = new BN(startedAt);
      const moveLogBytes = encodeMoveLogV2(moveLogRef.current, moveDeltasRef.current);
      const moveHash = await sha256(moveLogBytes);
      const dur = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      tx.add(await buildMintReceiptIx(program, publicKey, {
        nonce,
        score: new BN(finalScore),
        continuesUsed: 0,
        powerupsUsed: 0,
        sessionSeed: seed,
        moveHash,
        durationSec: dur,
        gpx5rMemoTx: sigToBytes(lastVerifySig),
        gameId: MAGIC_CHESS_GAME_ID,
      }));

      const sig = await program.provider.sendAndConfirm!(tx, [], { skipPreflight: false });
      setLastReceiptSig(sig); setOwnedThisRun(true);
    } catch (e: any) {
      console.error("mint receipt failed:", e);
      setOnchainError(e?.message || "Mint receipt failed");
    } finally { setBusy(null); }
  }, [anchorWallet, publicKey, connection, verifiedThisRun, lastVerifySig, seed, bot, startedAt, finalScore]);

  const cols = "abcdefgh";
  const tm = Math.floor(timer / 60), ts = (timer % 60).toString().padStart(2, "0");

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* 2026 minimalist top nav — matches home page */}
      <nav className="top-nav" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          {!isMobile && <>
            <Link href="/#featured">Play</Link>
            <Link href="/docs">Build</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/profile">Profile</Link>
          </>}
          <WalletMultiButton
            style={{
              background: "rgba(153,69,255,0.12)",
              color: "#e8e8f0",
              fontSize: 11,
              height: 32,
              padding: "0 12px",
              borderRadius: 99,
              border: "1px solid rgba(153,69,255,0.4)",
              fontWeight: 700,
            }}
          />
        </div>
      </nav>

      {/* READY */}
      {phase === "ready" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}>
          <div style={{ textAlign: "center", maxWidth: 460, padding: 16 }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>♟️</div>
            <h1 className="magic-chess-title magic-pulse" style={{ fontSize: 38, fontWeight: 700, marginBottom: 8 }}>✨ MAGIC CHESS 🪄</h1>
            <p className="magic-chess-text" style={{ fontSize: 13, marginBottom: 4 }}>⚡ 5-second blitz vs Stockfish. Free to play. Save your score on Solana.</p>

            <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 14px" }}>
              <ModeToggle
                gameLabel="Magic Chess"
                active="arcade"
                arcade={{ status: "live-devnet", href: "/play/magic-chess?mode=arcade" }}
                battle={{ status: "live-devnet", href: "/play/magic-chess?mode=battle", programId: "3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr" }}
              />
            </div>

            {!experience && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Select speed</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 14 }}>
                  {TIMER_PRESETS.map(p => {
                    const active = p.sec === turnTimeSec;
                    return (
                      <button
                        key={p.sec}
                        onClick={() => setTurnTimeSec(p.sec)}
                        style={{
                          padding: "8px 4px",
                          background: active ? "rgba(20,241,149,0.18)" : "#14141f",
                          border: `1px solid ${active ? "#14F195" : "#252540"}`,
                          borderRadius: 6,
                          cursor: "pointer",
                          color: active ? "#14F195" : "#e8e8f0",
                          fontSize: 11,
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 16, lineHeight: 1 }}>{p.icon}</div>
                        <div style={{ fontWeight: 700, marginTop: 4 }}>{p.sec}s</div>
                        <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{p.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>Choose your opponent</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ARCADE_BOTS.map(e => (
                    <button key={e.id} onClick={() => setExperience(e.id)} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: isMobile ? "14px 16px" : "12px 16px",
                      background: "#14141f", border: "1px solid #252540", borderRadius: 8,
                      cursor: "pointer", textAlign: "left", width: "100%",
                      transition: "border-color 0.15s", color: "#e8e8f0",
                    }}
                    onMouseEnter={e2 => (e2.currentTarget.style.borderColor = "#14F195")}
                    onMouseLeave={e2 => (e2.currentTarget.style.borderColor = "#252540")}>
                      <span style={{ fontSize: 24 }}>{e.icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{e.label}</div>
                        <div style={{ fontSize: 10, color: "#888" }}>~{e.elo} ELO — {e.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {experience && (
              <div>
                <p style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>
                  Bot: {bot?.label} (~{bot?.elo} ELO) · {turnTimeSec}s/turn
                </p>
                <p style={{ color: "#555", fontSize: 10, marginBottom: 16 }}>Free to play · Optional on-chain save after the game</p>
                <button onClick={startGame} className="magic-chess-btn" style={{ padding: "16px 48px", borderRadius: 10, fontSize: 18, cursor: "pointer" }}>
                  ✦ START ✦
                </button>
                <button onClick={() => setExperience(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", marginTop: 8, display: "block", margin: "8px auto 0" }}>
                  ← Change bot
                </button>
              </div>
            )}
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

          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", pointerEvents: "none" }}>

            {/* Status bar */}
            <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", padding: "8px 12px" }}>
              <div className="magic-chess-status" style={{ display: "flex", gap: 16, padding: "6px 14px", borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>{wTurn ? "⚪" : "⚫"} {status || "Your turn"}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: timer < 30 ? "#ff1744" : timer < 60 ? "#ffd740" : "#888" }}>{tm}:{ts}</span>
                <span style={{ color: "#9945FF" }}>Move {mc}</span>
                <span style={{ color: "#888", fontSize: 10 }}>vs {bot?.icon} {bot?.label}</span>
              </div>
            </div>

            {/* View toggle */}
            <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(153,69,255,0.3)" }}>
                <button onClick={() => setViewMode("3d")} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none", background: viewMode === "3d" ? "#7c4dff" : "#14141f", color: viewMode === "3d" ? "#fff" : "#555" }}>3D</button>
                <button onClick={() => setViewMode("2d")} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none", background: viewMode === "2d" ? "#7c4dff" : "#14141f", color: viewMode === "2d" ? "#fff" : "#555" }}>2D</button>
              </div>
            </div>

            {/* 2D board */}
            {viewMode === "2d" && (
              <div style={{ pointerEvents: "auto", flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 12 }}>
                <div className="magic-board" style={{ display: "inline-grid", gridTemplateColumns: `${Math.max(20, cellSize * 0.35)}px repeat(8, ${cellSize}px)`, gap: 0, border: "2px solid #9945FF60", borderRadius: 6, boxShadow: "0 4px 30px rgba(0,0,0,0.5)" }}>
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
                          {isVal && !piece && <div style={{ width: cellSize * 0.2, height: cellSize * 0.2, borderRadius: "50%", background: "rgba(20,241,149,0.5)", position: "absolute", boxShadow: "0 0 8px rgba(20,241,149,0.4)" }} />}
                          {isVal && piece && <div style={{ position: "absolute", inset: 2, borderRadius: 3, border: "2px solid rgba(153,69,255,0.7)", boxShadow: "inset 0 0 10px rgba(153,69,255,0.3)" }} />}
                        </div>;
                      })}
                    </div>;
                  })}
                </div>
              </div>
            )}

            {/* Captured + size controls (2D only) */}
            {viewMode === "2d" && (
              <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", gap: 8, padding: "0 12px 8px", flexWrap: "wrap" }}>
                <button onClick={() => setCellSize(s => Math.max(40, s - 8))} style={{ background: "#14141f", border: "1px solid #252540", borderRadius: 4, width: 28, height: 28, color: "#888", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>−</button>
                <button onClick={() => setCellSize(s => Math.min(96, s + 8))} style={{ background: "#14141f", border: "1px solid #252540", borderRadius: 4, width: 28, height: 28, color: "#888", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>+</button>
                {captured.length > 0 && <span style={{ fontSize: 11, color: "#555", alignSelf: "center" }}>Captured: {captured.map((p, i) => <span key={i} style={{ fontSize: 14 }}>{PIECES[p]}</span>)}</span>}
              </div>
            )}

            {/* Resign */}
            {phase === "playing" && (
              <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", gap: 8, padding: 8 }}>
                <button onClick={() => { setWon(false); setPhase("gameover"); setStatus("You resigned"); }} style={{
                  padding: "6px 16px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                  background: "rgba(10,0,20,0.7)", border: "1px solid #ff1744", color: "#ff1744", backdropFilter: "blur(8px)",
                }}>🏳 Resign</button>
              </div>
            )}

            {/* GAME OVER overlay */}
            {phase === "gameover" && (
              <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", padding: 12 }}>
                <div className="magic-chess-panel" style={{ borderRadius: 12, padding: 20, maxWidth: 460, width: "100%", textAlign: "center" }}>
                  <div className="magic-chess-title" style={{ fontSize: 32, fontWeight: 700 }}>
                    {won ? "✨ CHECKMATE ✨" : won === false ? "⚫ DEFEATED ⚫" : "🤝 STALEMATE"}
                  </div>
                  <div style={{ fontSize: 13, color: "#b388ff", marginTop: 6 }}>vs {bot?.icon} {bot?.label} (~{bot?.elo} ELO) · {mc} moves</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#14F195", fontFamily: "monospace", marginTop: 10 }}>
                    {finalScore.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: "#666" }}>SCORE</div>

                  {/* SAVE TIERS */}
                  <div style={{ marginTop: 16, padding: 12, background: "rgba(153,69,255,0.06)", borderRadius: 8, border: "1px solid rgba(153,69,255,0.2)" }}>
                    <ReferrerBanner connectedWallet={publicKey ?? null} />
                    {!publicKey ? (
                      <>
                        <button
                          onClick={() => setWalletModalVisible(true)}
                          style={{
                            background: "linear-gradient(90deg, #9945FF, #14F195)",
                            color: "#000",
                            padding: "14px 20px",
                            border: "none",
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: 900,
                            letterSpacing: 0.5,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            boxShadow: "0 0 28px rgba(20,241,149,0.5), 0 0 56px rgba(153,69,255,0.3)",
                            width: "100%",
                          }}
                        >
                          💾 SAVE SCORE — CONNECT WALLET
                        </button>
                        <div style={{ fontSize: 10, color: "#8a8aa0", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                          First save free on devnet · GPX5 memo on Solana, permanent
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {!savedThisRun && (
                          <PaymentMethodPicker
                            value={paymentToken}
                            onChange={setPaymentToken}
                            basePriceMicroUsd={new BN(SCORE_COMMIT_MICRO_USD)}
                            compact
                          />
                        )}
                        <button onClick={onSaveOnChain} disabled={busy !== null || savedThisRun} style={tierBtn(savedThisRun)}>
                          {busy === "save" ? "Saving…" : savedThisRun ? "✓ Score saved (T1)" : `Save Score · $${((50_000 * (10_000 - paymentToken.discountBps) / 10_000) / 1_000_000).toFixed(2)} · ${paymentToken.symbol}`}
                        </button>
                        <button onClick={onVerifyRun} disabled={busy !== null || verifiedThisRun || !savedThisRun} style={tierBtn(verifiedThisRun, !savedThisRun)}>
                          {busy === "verify" ? "Verifying…" : verifiedThisRun ? "✓ Replay saved (T2)" : "Save Verified Replay · $0.15"}
                        </button>
                        <button onClick={onMintReceipt} disabled={busy !== null || ownedThisRun || !verifiedThisRun} style={tierBtn(ownedThisRun, !verifiedThisRun)}>
                          {busy === "receipt" ? "Minting…" : ownedThisRun ? "✓ Receipt minted (T3)" : "Mint Replay Receipt · $0.25"}
                        </button>
                        {onchainError && <div style={{ fontSize: 10, color: "#ff6b6b", marginTop: 4 }}>{onchainError}</div>}
                        {lastSaveSig && <a href={`https://explorer.solana.com/tx/${lastSaveSig}${EXPLORER_SUFFIX}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#14F195" }}>T1 tx ↗</a>}
                        {lastVerifySig && <a href={`https://explorer.solana.com/tx/${lastVerifySig}${EXPLORER_SUFFIX}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#14F195" }}>T2 tx ↗</a>}
                        {lastReceiptSig && <a href={`https://explorer.solana.com/tx/${lastReceiptSig}${EXPLORER_SUFFIX}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#14F195" }}>T3 tx ↗</a>}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <ContinueWithCredits item="retry" game="chess" onSuccess={() => { setExperience(null); setPhase("ready"); reset(); }} />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="magic-chess-btn" onClick={() => { setExperience(null); setPhase("ready"); reset(); }} style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                      ✦ Play Again ✦
                    </button>
                  </div>

                  {/* Embedded leaderboard */}
                  {savedThisRun && (
                    <div style={{ marginTop: 14, textAlign: "left" }}>
                      <ArcadeLeaderboard gameSlug="chess-puzzles" highlightWallet={publicKey?.toBase58()} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Move history (compact, bottom-right) */}
            {phase === "playing" && hist.length > 0 && !isMobile && (
              <div ref={histRef} style={{ pointerEvents: "auto", position: "absolute", bottom: 12, right: 12, width: 160, maxHeight: 200, overflowY: "auto", background: "rgba(10,0,20,0.85)", border: "1px solid rgba(153,69,255,0.2)", borderRadius: 8, padding: 8, fontFamily: "monospace", fontSize: 10, lineHeight: 1.7, backdropFilter: "blur(8px)" }}>
                {Array.from({ length: Math.ceil(hist.length / 2) }, (_, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <span style={{ color: "#555", width: 16 }}>{i + 1}.</span>
                    <span style={{ color: "#ffd740", width: 44 }}>{hist[i * 2] || ""}</span>
                    <span style={{ color: "#b388ff" }}>{hist[i * 2 + 1] || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showEconomyGate && (
        <EconomyConsentModal
          onClose={() => setShowEconomyGate(false)}
          onAccept={() => { setShowEconomyGate(false); void onSaveOnChain(); }}
        />
      )}
    </div>
  );
}

function tierBtn(done: boolean, blocked: boolean = false): React.CSSProperties {
  return {
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    cursor: done || blocked ? "default" : "pointer",
    background: done ? "rgba(20,241,149,0.15)" : blocked ? "#14141f" : "linear-gradient(135deg, #9945FF, #14F195)",
    color: done ? "#14F195" : blocked ? "#444" : "#000",
    border: done ? "1px solid #14F195" : blocked ? "1px solid #252540" : "none",
    opacity: blocked ? 0.5 : 1,
  };
}
