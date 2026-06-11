"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import ModeToggle from "../../../../components/games/ModeToggle";
import { ArcadeLeaderboard } from "../../../arcade/_components/ArcadeLeaderboard";
import {
  makeProgram,
  buildOpenProfileIx,
  buildSubmitScoreIx,
  buildRecordPaymentIx,
  USDC_MINT,
  buildCommitReplayIx,
  buildMintReceiptIx,
  buildUsdcTransferIxs,
  profilePda,
  sha256,
  sigToBytes,
  getTreasuryWallet,
  CATEGORY,
  SCORE_COMMIT_MICRO_USD,
  VERIFIED_COMMIT_MICRO_USD,
  REPLAY_RECEIPT_MICRO_USD,
  ARCADE_PROGRAM_ID,
  ARCADE_NETWORK,
  BLOCKWORDS_ARCADE_GAME_ID,
} from "../../../../lib/arcade/client";
import { buildSaveScorePaymentIxs } from "../../../../lib/arcade/save-score-payment";
import { PAYMENT_TOKENS, type PaymentTokenDef } from "../../../../lib/arcade/tokens";
import PaymentMethodPicker from "../../../../components/arcade/PaymentMethodPicker";
import { getStoredReferrer } from "../../../../lib/arcade/referral";
import { submitReplay } from "@gamerplex/sdk/arcade";
import ReferrerBanner from "../../../../components/arcade/ReferrerBanner";
import { WORDS, isAcceptableGuess } from "./words";
import {
  answerForSeed,
  computeScore,
  encodeGuessLog,
  encodeGuessLogV2,
  gradeGuess,
  isWinningGuess,
  LetterState,
  type LetterStateValue,
  MAX_GUESSES,
  RUN_DURATION_SEC,
  WORD_LENGTH,
} from "./engine";

const EXPLORER_SUFFIX =
  ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;

const TICK_MS = 100;
const FLIP_DURATION_MS = 600;
const SHAKE_DURATION_MS = 500;

const TILE_GREEN = "#14F195";
const TILE_YELLOW = "#ffd24a";
const TILE_GREY = "#3a3a4a";
const TILE_DEFAULT = "#1a1a28";
const TILE_BORDER_DEFAULT = "#2a2a3a";

function generateSeed(): Uint8Array {
  const s = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(s);
  } else {
    for (let i = 0; i < 32; i++) s[i] = Math.floor(Math.random() * 256);
  }
  return s;
}

type RunStatus = "idle" | "active" | "ended";
interface RunState {
  seed: Uint8Array;
  startedAt: number;
  endedAt: number | null;
  answer: string;
  guesses: string[];
  /** Per-guess delta (seconds) since previous guess (or run start for [0]).
   *  Parallel to `guesses` — same length. Used for v2 move-log encoding. */
  guessDeltasSec: number[];
  current: string;
  solved: boolean;
  invalidUntil: number;
  status: RunStatus;
  lastFlippedRow: number;
}

function startRun(seed: Uint8Array): RunState {
  const answer = answerForSeed(seed);
  return {
    seed,
    startedAt: Date.now(),
    endedAt: null,
    answer,
    guesses: [],
    guessDeltasSec: [],
    current: "",
    solved: false,
    invalidUntil: 0,
    status: "active",
    lastFlippedRow: -1,
  };
}

function msRemaining(r: RunState): number {
  if (r.status === "ended") return 0;
  const elapsed = Date.now() - r.startedAt;
  return Math.max(0, RUN_DURATION_SEC * 1000 - elapsed);
}

function secondsUsed(r: RunState): number {
  const ms = (r.endedAt ?? Date.now()) - r.startedAt;
  return Math.max(0, Math.min(RUN_DURATION_SEC, Math.floor(ms / 1000)));
}

// Keyboard letter shows the BEST grade ever seen for that letter.
type KeyboardStates = Record<string, LetterStateValue | -1>;

function deriveKeyboardStates(answer: string, guesses: string[]): KeyboardStates {
  const out: KeyboardStates = {};
  for (let i = 0; i < 26; i++) out[String.fromCharCode(65 + i)] = -1;
  for (const g of guesses) {
    const grades = gradeGuess(answer, g);
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = g[i];
      const grade = grades[i];
      const prev = out[ch];
      if (prev === -1 || grade > prev) {
        out[ch] = grade;
      }
    }
  }
  return out;
}

export default function ArcadeMode() {
  const [tick, setTick] = useState(0);
  const runRef = useRef<RunState | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [profileExists, setProfileExists] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | "save" | "verify" | "receipt">(null);
  const [lastSaveSig, setLastSaveSig] = useState<string | null>(null);
  const [lastVerifySig, setLastVerifySig] = useState<string | null>(null);
  const [lastReceiptSig, setLastReceiptSig] = useState<string | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [savedThisRun, setSavedThisRun] = useState(false);
  const [verifiedThisRun, setVerifiedThisRun] = useState(false);
  const [ownedThisRun, setOwnedThisRun] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setProfileExists(null);
      return;
    }
    const [pda] = profilePda(publicKey);
    connection
      .getAccountInfo(pda)
      .then((info) => setProfileExists(!!info))
      .catch(() => setProfileExists(null));
  }, [publicKey, connection]);

  const startNewRun = useCallback(() => {
    runRef.current = startRun(generateSeed());
    setSavedThisRun(false);
    setVerifiedThisRun(false);
    setOwnedThisRun(false);
    setLastSaveSig(null);
    setLastVerifySig(null);
    setLastReceiptSig(null);
    setOnchainError(null);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    loopRef.current = setInterval(() => {
      const r = runRef.current;
      if (!r || r.status !== "active") return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (msRemaining(r) <= 0) {
        r.status = "ended";
        r.endedAt = Date.now();
      }
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, []);

  const onLetter = useCallback((letter: string) => {
    const r = runRef.current;
    if (!r || r.status !== "active") return;
    if (r.current.length >= WORD_LENGTH) return;
    const ch = letter.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return;
    r.current = r.current + ch;
    setTick((t) => t + 1);
  }, []);

  const onBackspace = useCallback(() => {
    const r = runRef.current;
    if (!r || r.status !== "active") return;
    if (r.current.length === 0) return;
    r.current = r.current.slice(0, -1);
    setTick((t) => t + 1);
  }, []);

  const onSubmit = useCallback(() => {
    const r = runRef.current;
    if (!r || r.status !== "active") return;
    const guess = r.current.toUpperCase();
    if (!isAcceptableGuess(guess)) {
      r.invalidUntil = Date.now() + SHAKE_DURATION_MS;
      setTick((t) => t + 1);
      return;
    }
    if (r.guesses.length >= MAX_GUESSES) return;

    // Track per-guess delta in seconds since previous guess (or run start for first).
    const nowMs = Date.now();
    const prevMs = r.guesses.length === 0
      ? r.startedAt
      : r.startedAt + r.guessDeltasSec.reduce((sum, d) => sum + d * 1000, 0);
    const deltaSec = Math.max(0, Math.min(255, Math.floor((nowMs - prevMs) / 1000)));
    r.guessDeltasSec.push(deltaSec);
    r.guesses.push(guess);
    r.current = "";
    r.lastFlippedRow = r.guesses.length - 1;

    if (isWinningGuess(r.answer, guess)) {
      r.solved = true;
      r.status = "ended";
      r.endedAt = Date.now();
    } else if (r.guesses.length >= MAX_GUESSES) {
      r.status = "ended";
      r.endedAt = Date.now();
    }
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = runRef.current;
      if (e.key === " " || e.code === "Space") {
        if (!r || r.status !== "active") {
          e.preventDefault();
          startNewRun();
          return;
        }
      }
      if (!r || r.status !== "active") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onBackspace();
      } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        e.preventDefault();
        onLetter(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startNewRun, onSubmit, onBackspace, onLetter]);

  // v1.4: default to USDC. Token picker UI ships in the next commit; for now
  // the new shared helper handles the existing USDC flow byte-equivalently.
  const [paymentToken, setPaymentToken] = useState<PaymentTokenDef>(
    PAYMENT_TOKENS.find((t) => t.symbol === "USDC") ?? PAYMENT_TOKENS[0]
  );

  const onSaveOnChain = useCallback(async () => {
    const r = runRef.current;
    if (!r || !anchorWallet || !publicKey) return;
    setBusy("save");
    setOnchainError(null);
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
        program,
        connection,
        publicKey,
        {
          token: paymentToken,
          category: CATEGORY.SCORE_COMMIT,
          basePriceMicroUsd: new BN(SCORE_COMMIT_MICRO_USD),
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
          externalRef: "",
          treasury,
        },
      );
      paymentIxs.forEach((ix) => tx.add(ix));

      const moveLogBytes = encodeGuessLogV2(r.guesses, r.guessDeltasSec);
      const moveHash = await sha256(moveLogBytes);
      const durationSec = Math.max(1, secondsUsed(r));
      const score = computeScore(r.solved, r.guesses.length, secondsUsed(r));
      tx.add(
        await buildSubmitScoreIx(program, publicKey, {
          variant: "-",
          score: new BN(score),
          continuesUsed: 0,
          powerupsUsed: 0,
          sessionSeed: r.seed,
          durationSec,
          moveHash,
          meta: "",
          vsChallenger: PublicKey.default,
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
        }),
      );

      const sig = await program.provider.sendAndConfirm!(tx, [], {
        skipPreflight: false,
      });
      setLastSaveSig(sig);
      setSavedThisRun(true);
      setProfileExists(true);
      void submitReplay(sig, moveLogBytes).catch(() => {});
    } catch (e: any) {
      console.error("save on-chain failed:", e);
      setOnchainError(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, profileExists, paymentToken]);

  const onVerifyRun = useCallback(async () => {
    const r = runRef.current;
    if (!r || !anchorWallet || !publicKey) return;
    if (!savedThisRun) {
      setOnchainError("Save this run to the leaderboard before verifying.");
      return;
    }
    setBusy("verify");
    setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(VERIFIED_COMMIT_MICRO_USD),
      );
      usdcIxs.forEach((ix) => tx.add(ix));

      const emptySig = new Uint8Array(64);
      tx.add(
        await buildRecordPaymentIx(program, publicKey, {
          category: CATEGORY.VERIFIED_COMMIT,
          amountMicroUsd: new BN(VERIFIED_COMMIT_MICRO_USD),
          paymentTxSig: emptySig,
          paymentMint: USDC_MINT,
          paymentAmountRaw: new BN(VERIFIED_COMMIT_MICRO_USD), // v1.3: stablecoin parity (raw === micro-USD)
          externalRef: "",
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
        }),
      );

      const moveLog = encodeGuessLogV2(r.guesses, r.guessDeltasSec);
      if (moveLog.length > 400) {
        throw new Error(
          `Move log too long for inline storage (${moveLog.length}B > 400B).`,
        );
      }
      tx.add(
        await buildCommitReplayIx(program, publicKey, {
          scoreNonce: new BN(r.startedAt),
          sessionSeed: r.seed,
          moveLog,
        }),
      );

      const sig = await program.provider.sendAndConfirm!(tx, [], {
        skipPreflight: false,
      });
      setLastVerifySig(sig);
      setVerifiedThisRun(true);
    } catch (e: any) {
      console.error("verify failed:", e);
      setOnchainError(e?.message || "Verify failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, savedThisRun]);

  const onMintReceipt = useCallback(async () => {
    const r = runRef.current;
    if (!r || !anchorWallet || !publicKey || !lastVerifySig) return;
    if (!verifiedThisRun) {
      setOnchainError("Save your replay first (T2) before claiming ownership (T3).");
      return;
    }
    setBusy("receipt");
    setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(REPLAY_RECEIPT_MICRO_USD),
      );
      usdcIxs.forEach((ix) => tx.add(ix));

      const emptySig = new Uint8Array(64);
      tx.add(
        await buildRecordPaymentIx(program, publicKey, {
          category: CATEGORY.REPLAY_RECEIPT,
          amountMicroUsd: new BN(REPLAY_RECEIPT_MICRO_USD),
          paymentTxSig: emptySig,
          paymentMint: USDC_MINT,
          paymentAmountRaw: new BN(REPLAY_RECEIPT_MICRO_USD), // v1.3: stablecoin parity (raw === micro-USD)
          externalRef: "",
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
        }),
      );

      const nonce = new BN(r.startedAt);
      const moveLogBytes = encodeGuessLogV2(r.guesses, r.guessDeltasSec);
      const moveHash = await sha256(moveLogBytes);
      const durationSec = Math.max(1, secondsUsed(r));
      const score = computeScore(r.solved, r.guesses.length, secondsUsed(r));
      tx.add(
        await buildMintReceiptIx(program, publicKey, {
          nonce,
          score: new BN(score),
          continuesUsed: 0,
          powerupsUsed: 0,
          sessionSeed: r.seed,
          moveHash,
          durationSec,
          gpx5rMemoTx: sigToBytes(lastVerifySig),
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
        }),
      );

      const sig = await program.provider.sendAndConfirm!(tx, [], {
        skipPreflight: false,
      });
      setLastReceiptSig(sig);
      setOwnedThisRun(true);
    } catch (e: any) {
      console.error("mint receipt failed:", e);
      setOnchainError(e?.message || "Mint receipt failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, verifiedThisRun, lastVerifySig]);

  const r = runRef.current;
  const remainingMs = r ? msRemaining(r) : RUN_DURATION_SEC * 1000;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const finalScore = useMemo(() => {
    if (!r) return 0;
    return computeScore(r.solved, r.guesses.length, secondsUsed(r));
  }, [r, tick]);
  const keyboardStates = useMemo<KeyboardStates>(() => {
    if (!r) return deriveKeyboardStates("AAAAA", []);
    return deriveKeyboardStates(r.answer, r.guesses);
  }, [r, tick]);

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* 2026 minimalist top nav — matches home page */}
      <nav className="top-nav" style={{ padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</a>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          <a href="/#featured">Play</a>
          <a href="/docs">Build</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/profile">Profile</a>
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

      <div className="bw-layout" style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 16px 24px", gap: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <ModeToggle
              gameLabel="Blockwords"
              active="arcade"
              arcade={{ status: "live-devnet", href: "/play/blockwords?mode=arcade" }}
              battle={{ status: "live-devnet", href: "/play/blockwords?mode=battle", programId: "3XA1rz4f83FoTyvB7g1XHhsb4bx9SrUSBDtpLtAttU4o" }}
            />
          </div>

          <div className="bw-board-frame" style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,210,74,0.4)", background: "linear-gradient(135deg, rgba(40,30,5,0.95), rgba(2,6,20,0.95))", boxShadow: "0 0 40px rgba(255,210,74,0.18)" }}>
            {!r ? (
              <IntroOverlay onStart={startNewRun} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <RunHud
                  remainingSec={remainingSec}
                  totalSec={RUN_DURATION_SEC}
                  guessesUsed={r.guesses.length}
                  status={r.status}
                />

                <GuessGrid
                  answer={r.answer}
                  guesses={r.guesses}
                  current={r.current}
                  status={r.status}
                  invalid={Date.now() < r.invalidUntil}
                  lastFlippedRow={r.lastFlippedRow}
                />

                <Keyboard
                  states={keyboardStates}
                  onLetter={onLetter}
                  onBackspace={onBackspace}
                  onSubmit={onSubmit}
                  disabled={r.status !== "active"}
                />
              </div>
            )}

            {r && r.status === "ended" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(5,5,20,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 20, overflowY: "auto" }}>
                {r.solved && (
                  <Confetti />
                )}
                {/* 2026: status eyebrow (tiny), score (hero), then action — matches Cyber Snake */}
                <div style={{ fontSize: 11, fontWeight: 800, color: r.solved ? "#14F195" : "#ff5230", letterSpacing: 3, textTransform: "uppercase", zIndex: 1 }}>
                  {r.solved ? "● Solved" : "● Time's up"}
                </div>
                {/* SCORE is the hero — huge gradient italic */}
                <div style={{
                  fontSize: "clamp(56px, 11vw, 96px)",
                  fontWeight: 900,
                  fontStyle: "italic",
                  lineHeight: 1,
                  background: "linear-gradient(135deg, #14F195, #00f2ff)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 40px rgba(20,241,149,0.35)",
                  margin: "4px 0 2px",
                  zIndex: 1,
                }}>{finalScore.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 4, zIndex: 1 }}>
                  Your score
                </div>
                <div style={{ fontSize: 13, color: "#a8a8c0", display: "flex", gap: 8, alignItems: "center", zIndex: 1, flexWrap: "wrap", justifyContent: "center" }}>
                  <span>Word:</span>
                  <span style={{ color: "#ffd24a", fontFamily: "monospace", fontWeight: 800, letterSpacing: 3, fontSize: 18 }}>
                    {r.answer}
                  </span>
                  <span style={{ color: "#555" }}>·</span>
                  <span>{r.guesses.length} {r.guesses.length === 1 ? "guess" : "guesses"} · {secondsUsed(r)}s</span>
                </div>

                <div style={{ width: "100%", maxWidth: 420, marginTop: 8 }}>
                  <ReferrerBanner connectedWallet={publicKey ?? null} />
                </div>

                {connected ? (
                  <>
                    {!savedThisRun && (
                      <div style={{ width: "100%", maxWidth: 420, marginBottom: 4 }}>
                        <PaymentMethodPicker
                          value={paymentToken}
                          onChange={setPaymentToken}
                          basePriceMicroUsd={new BN(SCORE_COMMIT_MICRO_USD)}
                        />
                      </div>
                    )}
                    <ProgressiveUpgradeStack
                      busy={busy}
                      profileExists={profileExists}
                      savedThisRun={savedThisRun}
                      verifiedThisRun={verifiedThisRun}
                      ownedThisRun={ownedThisRun}
                      showAdvanced={showAdvanced}
                      setShowAdvanced={setShowAdvanced}
                      onSave={onSaveOnChain}
                      onVerify={onVerifyRun}
                      onMintReceipt={onMintReceipt}
                      onWrapCnft={() => setOnchainError("T4 cNFT wrap ships in v1.3 — Metaplex Bubblegum integration pending.")}
                      onRestart={startNewRun}
                    />
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 4, width: "100%", maxWidth: 420, zIndex: 1 }}>
                    <button
                      onClick={() => setWalletModalVisible(true)}
                      style={{
                        background: "linear-gradient(90deg, #9945FF, #14F195)",
                        color: "#000",
                        padding: "16px 28px",
                        border: "none",
                        borderRadius: 10,
                        fontSize: 16,
                        fontWeight: 900,
                        letterSpacing: 0.5,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        boxShadow: "0 0 32px rgba(20,241,149,0.55), 0 0 64px rgba(153,69,255,0.35)",
                        width: "100%",
                        maxWidth: 360,
                      }}
                    >
                      💾 SAVE SCORE — CONNECT WALLET
                    </button>
                    <div style={{ fontSize: 11, color: "#8a8aa0", textAlign: "center", lineHeight: 1.5 }}>
                      First save free on devnet · GPX5 memo on Solana, permanent
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                      <button onClick={startNewRun} style={{ ...btnSecondary, minHeight: 40 }}>↻ Play Again</button>
                      <a href="/arcade" style={{ ...btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 40 }}>
                        ← Back
                      </a>
                    </div>
                  </div>
                )}

                {onchainError && (
                  <div style={{ fontSize: 11, color: "#ff5252", maxWidth: 420, textAlign: "center", marginTop: 4, zIndex: 1 }}>
                    ⚠ {onchainError}
                  </div>
                )}
                {(lastSaveSig || lastVerifySig || lastReceiptSig) && (
                  <div style={{ fontSize: 10, color: "#8a8aa0", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", zIndex: 1 }}>
                    {lastSaveSig && (
                      <a href={`https://explorer.solana.com/tx/${lastSaveSig}${EXPLORER_SUFFIX}`} target="_blank" rel="noopener noreferrer" style={{ color: "#14F195", textDecoration: "underline" }}>
                        save tx ↗
                      </a>
                    )}
                    {lastVerifySig && (
                      <a href={`https://explorer.solana.com/tx/${lastVerifySig}${EXPLORER_SUFFIX}`} target="_blank" rel="noopener noreferrer" style={{ color: "#ffd740", textDecoration: "underline" }}>
                        replay tx ↗
                      </a>
                    )}
                    {lastReceiptSig && (
                      <a href={`https://explorer.solana.com/tx/${lastReceiptSig}${EXPLORER_SUFFIX}`} target="_blank" rel="noopener noreferrer" style={{ color: "#c99aff", textDecoration: "underline" }}>
                        receipt tx ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2026 minimalist how-to — single line, expandable details */}
          <details style={{ marginTop: 12, padding: "10px 14px", background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, fontSize: 11, color: "#8a8aa0" }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 6, userSelect: "none", flexWrap: "wrap" }}>
              <span style={{ color: "#ffd24a", fontWeight: 700 }}>How to play</span>
              <span>guess the 5-letter word in 6 tries · <kbd style={kbdStyle}>A–Z</kbd> letter · <kbd style={kbdStyle}>↵</kbd> submit · <kbd style={kbdStyle}>⌫</kbd> erase</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#5a5a70" }}>more</span>
            </summary>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a28", lineHeight: 1.6 }}>
              After each guess, tiles flip:
              <span style={{ color: TILE_GREEN, fontWeight: 700 }}> green</span> = right letter, right spot ·{" "}
              <span style={{ color: TILE_YELLOW, fontWeight: 700 }}>yellow</span> = right letter, wrong spot ·{" "}
              <span style={{ color: "#9a9aaf", fontWeight: 700 }}>grey</span> = not in the word. Beat the 90s timer for a bonus.
            </div>
          </details>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ArcadeLeaderboard
            gameSlug="blockwords"
            limit={10}
            highlightWallet={publicKey?.toBase58() ?? null}
          />

          {/* 2026: collapse verbose info panels into a single expandable */}
          <details style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "12px 16px" }}>
            <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: "#ffd24a", letterSpacing: 2, textTransform: "uppercase", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>💸 Save options · pricing</span>
              <span style={{ fontSize: 14, color: "#6a6a80" }}>+</span>
            </summary>
            <div style={{ marginTop: 10, fontSize: 12, color: "#a8a8c0", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#4fc3f7" }}>💾 Save score</span><b>$0.05</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#ffd740" }}>🏆 Save replay (verified)</span><b>$0.15</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#c99aff" }}>🎴 Claim ownership</span><b>$0.25</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#9945FF" }}>✨ Wrap as cNFT (v1.3)</span><b>$0.50</b></div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 8, lineHeight: 1.5 }}>
                Paid in USDC. ~$0.001/tx Solana gas. PlayerProfile setup ~$0.41 refundable rent (one-time per wallet).
              </div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                {WORDS.length} answer words · word deterministic from session seed · score = 1000 − (guesses × 100) + max(0, 300 − seconds).
              </div>
            </div>
          </details>
        </div>
      </div>

      <style>{`
        .bw-layout {
          display: grid;
          grid-template-columns: 1fr 340px;
        }
        @media (max-width: 1100px) {
          .bw-layout { grid-template-columns: 1fr; }
        }
        .bw-title {
          font-family: 'Space Grotesk', sans-serif;
        }
        @keyframes bwTitleGlow {
          0%, 100% { text-shadow: 0 0 22px rgba(255,210,74,0.55), 0 0 48px rgba(255,107,44,0.25); }
          50%      { text-shadow: 0 0 38px rgba(255,210,74,0.95), 0 0 80px rgba(255,107,44,0.5); }
        }
        @keyframes bwStartPulse {
          0%, 100% { box-shadow: 0 0 28px rgba(255,210,74,0.4), inset 0 1px 0 rgba(255,255,255,0.2); transform: scale(1); }
          50%      { box-shadow: 0 0 48px rgba(255,107,44,0.7), inset 0 1px 0 rgba(255,255,255,0.2); transform: scale(1.02); }
        }
        @keyframes bwTileFlip {
          0%   { transform: rotateX(0deg); }
          50%  { transform: rotateX(90deg); }
          100% { transform: rotateX(0deg); }
        }
        @keyframes bwShake {
          0%, 100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
        @keyframes bwConfettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(620px) rotate(540deg); opacity: 0; }
        }
        @keyframes bwPulse {
          0%, 100% { opacity: 1 }
          50%      { opacity: 0.45 }
        }
      `}</style>
    </div>
  );
}

function IntroOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="bw-intro-overlay" style={{ position: "relative", minHeight: 420, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 20, overflow: "hidden" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 30% 30%, rgba(255,210,74,0.18), transparent 50%), radial-gradient(circle at 70% 70%, rgba(255,107,44,0.12), transparent 50%)",
          pointerEvents: "none",
        }}
      />
      <div className="bw-intro-emoji" style={{ fontSize: 56, zIndex: 1 }}>🔤</div>
      <div className="bw-title" style={{ fontSize: 44, fontWeight: 900, color: "#ffd24a", letterSpacing: 4, textAlign: "center", textShadow: "0 0 22px rgba(255,210,74,0.6), 0 0 48px rgba(255,107,44,0.3)", animation: "bwTitleGlow 3s ease-in-out infinite", zIndex: 1, lineHeight: 1.1 }}>
        BLOCKWORDS<br />
        <span style={{ fontSize: 24, color: "#ff8a40", letterSpacing: 6 }}>· ARCADE ·</span>
      </div>
      <div style={{ fontSize: 14, color: "#a8a8c0", textAlign: "center", maxWidth: 420, zIndex: 1, lineHeight: 1.5 }}>
        Pick the secret 5-letter word in <strong style={{ color: "#ffd24a" }}>6 guesses</strong>, against a{" "}
        <strong style={{ color: "#ffd24a" }}>{RUN_DURATION_SEC}s</strong> timer. Faster + fewer guesses = higher score.
      </div>
      <button
        onClick={onStart}
        style={{
          marginTop: 6,
          padding: "14px 36px",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          background: "linear-gradient(135deg, #ffd24a, #ff8a40)",
          color: "#1a0a00",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          boxShadow: "0 0 28px rgba(255,210,74,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
          animation: "bwStartPulse 2s ease-in-out infinite",
          fontFamily: "'Space Grotesk', sans-serif",
          zIndex: 1,
        }}
      >
        ▶ Start Run
      </button>
      <div style={{ fontSize: 11, color: "#6a6a80", zIndex: 1 }}>
        Free to play — on-chain scoring optional at game over.
      </div>
    </div>
  );
}

function RunHud({
  remainingSec,
  totalSec,
  guessesUsed,
  status,
}: {
  remainingSec: number;
  totalSec: number;
  guessesUsed: number;
  status: RunStatus;
}) {
  const pct = Math.max(0, Math.min(1, remainingSec / totalSec));
  const urgent = remainingSec <= 10;

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,210,74,0.25)", background: "rgba(28,18,4,0.6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Guesses</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#ffd24a", fontFamily: "monospace", lineHeight: 1 }}>
              {guessesUsed}<span style={{ color: "#6a6a80", fontSize: 18 }}>/{MAX_GUESSES}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Remaining</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#a8a8c0", fontFamily: "monospace", lineHeight: 1 }}>
              {Math.max(0, MAX_GUESSES - guessesUsed)} rows
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Goal</div>
            <div style={{ fontSize: 11, color: "#ffd24a", fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>find the word</div>
          </div>
          <div style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: urgent ? "rgba(255,82,48,0.18)" : "rgba(255,210,74,0.12)",
            border: `1px solid ${urgent ? "#ff5230" : "rgba(255,210,74,0.4)"}`,
            color: urgent ? "#ff5230" : "#ffd24a",
            fontFamily: "monospace",
            fontSize: 24,
            fontWeight: 900,
            minWidth: 64,
            textAlign: "center",
            animation: urgent && status === "active" ? "bwPulse 0.6s ease-in-out infinite" : "none",
          }}>
            {String(remainingSec).padStart(2, "0")}s
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(40,30,5,0.6)", overflow: "hidden" }}>
        <div style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: urgent ? "linear-gradient(90deg, #ff5230, #ff9a40)" : "linear-gradient(90deg, #ffd24a, #ff8a40)",
          transition: "width 100ms linear",
        }} />
      </div>
    </div>
  );
}

function GuessGrid({
  answer,
  guesses,
  current,
  status,
  invalid,
  lastFlippedRow,
}: {
  answer: string;
  guesses: string[];
  current: string;
  status: RunStatus;
  invalid: boolean;
  lastFlippedRow: number;
}) {
  const rows: { row: number; letters: string[]; grades: LetterStateValue[] | null; isActive: boolean; flipNow: boolean; }[] = [];
  for (let row = 0; row < MAX_GUESSES; row++) {
    if (row < guesses.length) {
      const g = guesses[row];
      rows.push({
        row,
        letters: g.split(""),
        grades: gradeGuess(answer, g),
        isActive: false,
        flipNow: row === lastFlippedRow,
      });
    } else if (row === guesses.length && status === "active") {
      const padded = current.padEnd(WORD_LENGTH, " ").split("");
      rows.push({
        row,
        letters: padded,
        grades: null,
        isActive: true,
        flipNow: false,
      });
    } else {
      rows.push({
        row,
        letters: ["", "", "", "", ""],
        grades: null,
        isActive: false,
        flipNow: false,
      });
    }
  }

  return (
    <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {rows.map((r) => {
        const shake = invalid && r.isActive;
        return (
          <div
            key={r.row}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${WORD_LENGTH}, 1fr)`,
              gap: 6,
              width: "min(360px, 84vw)",
              animation: shake ? `bwShake ${SHAKE_DURATION_MS}ms ease-in-out` : "none",
            }}
          >
            {r.letters.map((ch, i) => {
              const grade = r.grades?.[i];
              const filled = ch && ch !== " ";
              let bg = TILE_DEFAULT;
              let borderColor = filled ? "#5a5a70" : TILE_BORDER_DEFAULT;
              let color = "#e8e8f0";
              if (grade === LetterState.GREEN) {
                bg = TILE_GREEN; borderColor = TILE_GREEN; color = "#0a1810";
              } else if (grade === LetterState.YELLOW) {
                bg = TILE_YELLOW; borderColor = TILE_YELLOW; color = "#221a05";
              } else if (grade === LetterState.GREY) {
                bg = TILE_GREY; borderColor = TILE_GREY; color = "#cfcfdc";
              }

              const animation = r.flipNow && grade !== undefined
                ? `bwTileFlip ${FLIP_DURATION_MS}ms ease-in-out ${i * 100}ms 1`
                : "none";

              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "1 / 1",
                    background: bg,
                    border: `2px solid ${borderColor}`,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "min(7vw, 30px)",
                    fontWeight: 800,
                    color,
                    fontFamily: "monospace",
                    letterSpacing: 0,
                    textTransform: "uppercase",
                    animation,
                    transition: !r.flipNow ? "background 80ms, border-color 80ms" : "none",
                    transformStyle: "preserve-3d",
                  }}
                  aria-label={filled ? `letter ${ch}` : "empty"}
                >
                  {filled ? ch : ""}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const KB_ROWS: string[] = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function Keyboard({
  states,
  onLetter,
  onBackspace,
  onSubmit,
  disabled,
}: {
  states: KeyboardStates;
  onLetter: (l: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const renderKey = (label: string, onClick: () => void, opts?: { wide?: boolean; state?: LetterStateValue | -1 }) => {
    const state = opts?.state ?? -1;
    let bg = "#1a1a28";
    let color = "#e8e8f0";
    let border = "1px solid #2a2a3a";
    if (state === LetterState.GREEN) {
      bg = TILE_GREEN; color = "#0a1810"; border = `1px solid ${TILE_GREEN}`;
    } else if (state === LetterState.YELLOW) {
      bg = TILE_YELLOW; color = "#221a05"; border = `1px solid ${TILE_YELLOW}`;
    } else if (state === LetterState.GREY) {
      bg = TILE_GREY; color = "#cfcfdc"; border = `1px solid ${TILE_GREY}`;
    }
    return (
      <button
        key={label}
        onClick={onClick}
        disabled={disabled}
        style={{
          flex: opts?.wide ? "1.6" : "1",
          minWidth: 28,
          height: 44,
          padding: "0 6px",
          background: bg,
          color,
          border,
          borderRadius: 6,
          fontSize: opts?.wide ? 11 : 14,
          fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          letterSpacing: opts?.wide ? 1 : 0,
          textTransform: "uppercase",
          cursor: disabled ? "default" : "pointer",
          transition: "background 80ms",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: "12px 12px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.18)" }}>
      {KB_ROWS.map((row, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            gap: 4,
            justifyContent: "center",
            width: "min(560px, 96vw)",
          }}
        >
          {idx === 2 && renderKey("Enter", onSubmit, { wide: true })}
          {row.split("").map((ch) => renderKey(ch, () => onLetter(ch), { state: states[ch] }))}
          {idx === 2 && renderKey("⌫", onBackspace, { wide: true })}
        </div>
      ))}
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#14F195", "#ffd24a", "#9945FF", "#4fc3f7", "#ff8a40"];
    const arr: { left: number; delay: number; duration: number; color: string; size: number; rot: number }[] = [];
    for (let i = 0; i < 40; i++) {
      arr.push({
        left: Math.random() * 100,
        delay: Math.random() * 600,
        duration: 1400 + Math.random() * 1200,
        color: colors[i % colors.length],
        size: 6 + Math.random() * 6,
        rot: Math.random() * 360,
      });
    }
    return arr;
  }, []);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animation: `bwConfettiFall ${p.duration}ms ease-in ${p.delay}ms forwards`,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

type StackProps = {
  busy: null | "save" | "verify" | "receipt";
  profileExists: boolean | null;
  savedThisRun: boolean;
  verifiedThisRun: boolean;
  ownedThisRun: boolean;
  showAdvanced: boolean;
  setShowAdvanced: (b: boolean) => void;
  onSave: () => void;
  onVerify: () => void;
  onMintReceipt: () => void;
  onWrapCnft: () => void;
  onRestart: () => void;
};

function ProgressiveUpgradeStack(p: StackProps) {
  const nextTier: 1 | 2 | 3 | 4 = !p.savedThisRun
    ? 1
    : !p.verifiedThisRun
    ? 2
    : !p.ownedThisRun
    ? 3
    : 4;

  const tier1Text = !p.profileExists
    ? "Save to the global leaderboard · $0.05 + ~$0.41 rent (refundable)"
    : "Save to the global leaderboard · $0.05";
  const tier1Why = !p.profileExists
    ? "Your score lives forever on Solana. One-time wallet onboarding ($0.41 refundable) on first save; $0.05 each run after."
    : "Your score lives forever on Solana — anyone can verify it. GPX5 memo permanent in tx history.";

  const primaryConfig = {
    1: {
      label: p.busy === "save" ? "Saving on-chain…" : tier1Text,
      why: tier1Why,
      action: p.onSave,
      disabled: p.busy !== null,
      busy: p.busy === "save",
      accent: "#4fc3f7",
    },
    2: {
      label: p.busy === "verify" ? "Saving replay…" : "Add replay proof · $0.15",
      why: "Full guess log committed on-chain. Anyone can replay your run from the seed and cryptographically verify the score — you get the 🏆 VERIFIED badge.",
      action: p.onVerify,
      disabled: p.busy !== null,
      busy: p.busy === "verify",
      accent: "#ffd740",
    },
    3: {
      label: p.busy === "receipt" ? "Minting receipt…" : "Claim ownership · $0.25 + ~$0.33 rent",
      why: "A transferable on-chain certificate of your run. Keep it, sell it on marketplaces later, or refund the rent by closing it. Your name as original player stays forever.",
      action: p.onMintReceipt,
      disabled: p.busy !== null,
      busy: p.busy === "receipt",
      accent: "#c99aff",
    },
    4: {
      label: "Wrap as cNFT · $0.50 (v1.3)",
      why: "Your run as a tradeable Solana NFT on Magic Eden / Tensor. Ships in v1.3 with Metaplex Bubblegum integration.",
      action: p.onWrapCnft,
      disabled: true,
      busy: false,
      accent: "#9945FF",
    },
  }[nextTier];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", width: "100%", maxWidth: 480, zIndex: 1 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#6a6a80", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
        <TierPill done={p.savedThisRun} busy={p.busy === "save"} label="1· Saved" />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={p.verifiedThisRun} busy={p.busy === "verify"} label="2· Verified" pending={!p.savedThisRun} />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={p.ownedThisRun} busy={p.busy === "receipt"} label="3· Owned" pending={!p.verifiedThisRun} />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={false} busy={false} label="4· cNFT" pending={true} />
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <button
          onClick={primaryConfig.action}
          disabled={primaryConfig.disabled}
          title={primaryConfig.why}
          style={{
            background: primaryConfig.disabled ? "#14141f" : `linear-gradient(135deg, ${primaryConfig.accent}, ${primaryConfig.accent}dd)`,
            color: primaryConfig.disabled ? "#6a6a80" : "#050508",
            padding: "14px 28px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 800,
            border: primaryConfig.disabled ? "1px solid #252540" : "none",
            cursor: primaryConfig.disabled ? "not-allowed" : "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: 0.3,
            minWidth: 380,
            opacity: primaryConfig.busy ? 0.7 : 1,
          }}
        >
          {primaryConfig.label}
        </button>
        <div style={{ fontSize: 11, color: "#8a8aa0", textAlign: "center", maxWidth: 420, lineHeight: 1.5 }}>
          {primaryConfig.why}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <a
          href="/arcade"
          style={{ ...btnSecondarySmall, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          ← Back to arcade
        </a>
        <button onClick={p.onRestart} disabled={p.busy !== null} style={btnPrimary}>
          🔄 Play Again
        </button>
      </div>

      <button
        onClick={() => p.setShowAdvanced(!p.showAdvanced)}
        style={{
          background: "transparent",
          border: "none",
          color: "#6a6a80",
          fontSize: 11,
          cursor: "pointer",
          textDecoration: "underline",
          fontFamily: "'Space Grotesk', sans-serif",
          marginTop: 4,
        }}
      >
        {p.showAdvanced ? "Hide" : "Show"} all 4 tiers + running total
      </button>

      {p.showAdvanced && (
        <div style={{ width: "100%", background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, padding: "14px 16px", fontSize: 11, lineHeight: 1.6 }}>
          <div style={{ color: "#8a8aa0", marginBottom: 8, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
            4-tier progression · each tier builds on the last
          </div>
          <AdvancedRow done={p.savedThisRun} tier="T1" label="Save score" fee="$0.05" detail="GPX5 memo, global leaderboard" />
          <AdvancedRow done={p.verifiedThisRun} tier="T2" label="Save replay" fee="$0.15" detail="GPX5R memo, cryptographic proof, 🏆 VERIFIED" />
          <AdvancedRow done={p.ownedThisRun} tier="T3" label="Claim ownership" fee="$0.25 + ~$0.33 rent" detail="Transferable PDA receipt, sellable, rent-refundable on close" />
          <AdvancedRow done={false} tier="T4" label="Wrap as cNFT" fee="$0.50 (v1.3)" detail="Metaplex Bubblegum — Magic Eden tradeable" pending />
          <div style={{ borderTop: "1px solid #1a1a28", marginTop: 10, paddingTop: 10, fontSize: 11, color: "#a8a8c0", display: "flex", justifyContent: "space-between" }}>
            <span>Total Gamerplex fees spent this run:</span>
            <span style={{ color: "#ffd24a", fontFamily: "monospace", fontWeight: 700 }}>
              ${(
                (p.savedThisRun ? 0.05 : 0) +
                (p.verifiedThisRun ? 0.15 : 0) +
                (p.ownedThisRun ? 0.25 : 0)
              ).toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: 9, color: "#555", marginTop: 6 }}>
            Plus Solana gas (~$0.001/tx). Each tier is optional — skip anytime.
          </div>
        </div>
      )}
    </div>
  );
}

function TierPill({ done, busy, label, pending }: { done: boolean; busy: boolean; label: string; pending?: boolean }) {
  const color = done ? "#14F195" : busy ? "#ffd740" : pending ? "#3a3a50" : "#8a8aa0";
  const bg = done ? "rgba(20,241,149,0.12)" : busy ? "rgba(255,215,64,0.12)" : "transparent";
  return (
    <span style={{
      padding: "3px 7px",
      border: `1px solid ${done ? "#14F19555" : "#2a2a40"}`,
      borderRadius: 4,
      color,
      background: bg,
      fontWeight: 700,
    }}>{done ? `✓ ${label}` : label}</span>
  );
}

function AdvancedRow({ done, tier, label, fee, detail, pending }: { done: boolean; tier: string; label: string; fee: string; detail: string; pending?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", opacity: pending ? 0.5 : 1 }}>
      <span style={{ color: done ? "#14F195" : "#6a6a80", fontFamily: "monospace", fontWeight: 700, width: 32 }}>
        {done ? "✓" : pending ? "—" : "○"}
      </span>
      <span style={{ color: "#a8a8c0", fontWeight: 700, width: 30 }}>{tier}</span>
      <span style={{ color: "#e8e8f0", flex: 1 }}>{label}</span>
      <span style={{ color: "#ffd24a", fontFamily: "monospace", fontSize: 11 }}>{fee}</span>
      <span style={{ color: "#6a6a80", fontSize: 10, flexBasis: "100%", paddingLeft: 74, marginTop: -2 }}>{detail}</span>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #ffd24a, #ff8a40)",
  color: "#1a0a00",
  padding: "12px 28px",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontFamily: "'Space Grotesk', sans-serif",
};
const btnSecondary: React.CSSProperties = {
  background: "#14141f",
  color: "#e8e8f0",
  padding: "11px 20px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  border: "1px solid #ffd24a40",
  cursor: "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
};
const btnSecondarySmall: React.CSSProperties = {
  background: "#14141f",
  color: "#a8a8c0",
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #252540",
  cursor: "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
};
const kbdStyle: React.CSSProperties = {
  padding: "1px 6px",
  background: "#14141f",
  border: "1px solid #2a3f55",
  borderRadius: 3,
  fontSize: 10,
};

