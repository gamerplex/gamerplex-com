"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import ModeToggle from "../../../../components/games/ModeToggle";
import ShellLeaderboard from "../../../../components/arcade/ShellLeaderboard";
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
import { submitReplay, openSession } from "@gamerplex/sdk/arcade";
import { track, identifyWallet } from "../../../../lib/analytics";
import { EconomyConsentModal, hasEconomyConsent } from "../../../../lib/arcade/economy-gate";
import { getIdentity, getCredits, type IdentityUser } from "../../../../lib/identity/client";
import EmailLoginModal from "../../../../components/arcade/EmailLoginModal";
import { earnCredits } from "../../../../lib/identity/client";
import ContinueWithCredits from "../../../../components/arcade/ContinueWithCredits";
import ReferrerBanner from "../../../../components/arcade/ReferrerBanner";
import {
  startWordForSeed,
  computeScore,
  encodeLadderLog,
  isValidLadderStep,
  isRealWord,
  letterDiffCount,
  MAX_LADDER_STEPS,
  RUN_DURATION_SEC,
  WORD_LENGTH,
} from "./engine";

const EXPLORER_SUFFIX =
  ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;

const TICK_MS = 100;
const POP_DURATION_MS = 400;
const SHAKE_DURATION_MS = 500;

// Gamerplex-branded visual language (carried over from the reskin): purple =
// the live rung / accent, cyan = the letter you changed, slate = board chrome.
// Colors are frontend-only and never touch resolver verification.
const ACCENT = "#9945FF"; // Gamerplex purple
const ACCENT_2 = "#7a2fe0";
const CHANGED = "#22d3ee"; // brand cyan — highlights the one changed letter
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

function todayYmd(): string {
  const t = new Date();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function yesterdayYmd(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - 1);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function dailySeed(ymd: string): Uint8Array {
  const str = `gpx-blockwords-daily-${ymd}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const s = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 7;  h >>>= 0;
    h ^= h << 17; h >>>= 0;
    s[i] = h & 0xff;
  }
  return s;
}

const STREAK_KEY = "gpx-blockwords-daily-streak";
const LAST_PLAYED_KEY = "gpx-blockwords-daily-last";
// A "win" (streak-worthy) run is one where the player built at least this many rungs.
const WIN_LADDER_STEPS = 3;

function loadStreak(): { lastPlayedYmd: string | null; streak: number; playedToday: boolean } {
  if (typeof window === "undefined") return { lastPlayedYmd: null, streak: 0, playedToday: false };
  const last = localStorage.getItem(LAST_PLAYED_KEY);
  const streak = parseInt(localStorage.getItem(STREAK_KEY) || "0", 10);
  return { lastPlayedYmd: last, streak, playedToday: last === todayYmd() };
}

function recordDailyWin(): { streak: number } {
  if (typeof window === "undefined") return { streak: 0 };
  const today = todayYmd();
  const last = localStorage.getItem(LAST_PLAYED_KEY);
  if (last === today) return { streak: parseInt(localStorage.getItem(STREAK_KEY) || "0", 10) };
  let streak = parseInt(localStorage.getItem(STREAK_KEY) || "0", 10);
  streak = last === yesterdayYmd() ? streak + 1 : 1;
  localStorage.setItem(LAST_PLAYED_KEY, today);
  localStorage.setItem(STREAK_KEY, String(streak));
  return { streak };
}

type RunStatus = "idle" | "active" | "ended";
type RunMode = "random" | "daily";
interface RunState {
  seed: Uint8Array;
  /** On-chain session binding for daily mode (server-issued, grind-resistant). */
  sessionPda: PublicKey | null;
  mode: RunMode;
  startedAt: number;
  endedAt: number | null;
  /** The full ladder including the seed-derived start word at index 0. */
  ladder: string[];
  /** Per-STEP delta (seconds) since previous step (or run start for step[0]).
   *  Parallel to ladder.slice(1) — one entry per added rung. */
  stepDeltasSec: number[];
  /** In-progress input for the next rung. */
  current: string;
  invalidUntil: number;
  invalidMsg: string;
  status: RunStatus;
  lastRungIndex: number;
}

function startRun(seed: Uint8Array, mode: RunMode = "random", sessionPda: PublicKey | null = null): RunState {
  const start = startWordForSeed(seed);
  return {
    seed,
    sessionPda,
    mode,
    startedAt: Date.now(),
    endedAt: null,
    ladder: [start],
    stepDeltasSec: [],
    current: "",
    invalidUntil: 0,
    invalidMsg: "",
    status: "active",
    lastRungIndex: 0,
  };
}

/** Ordered STEP words (everything the player added after the start word). */
function stepsOf(r: RunState): string[] {
  return r.ladder.slice(1);
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

// On-screen keyboard: the letter that, if placed at the currently-changed slot,
// would keep exactly one letter different. We don't precompute hints — keyboard
// just reflects letters present in the current word for a light visual cue.
function currentWordLetters(current: string, live: string): Set<string> {
  const src = current.length > 0 ? current : live;
  return new Set(src.toUpperCase().split(""));
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

  // Web2 identity (email-first). Wallet is separate + only powers the optional on-chain save.
  const [me, setMe] = useState<IdentityUser | null>(null);
  const meRef = useRef<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const refreshIdentity = useCallback(async () => {
    const u = await getIdentity();
    setMe(u);
    meRef.current = u;
    if (u) {
      const c = await getCredits();
      setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0);
    } else {
      setCredits(null);
    }
    return u;
  }, []);
  useEffect(() => {
    void (async () => {
      const u = await refreshIdentity();
      // Magic-link round-trip: play → email → tap link → land back here signed in →
      // save the score we stashed while signed out. Idempotent server-side (refId).
      if (u && typeof window !== "undefined") {
        const pend = window.localStorage.getItem("bw_pending_score");
        if (pend) {
          try {
            await fetch("/api/scores/submit", { method: "POST", headers: { "content-type": "application/json" }, body: pend });
          } catch {}
          window.localStorage.removeItem("bw_pending_score");
        }
      }
    })();
  }, [refreshIdentity]);

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

  const [streakInfo, setStreakInfo] = useState(loadStreak);
  const startNewRun = useCallback(async (mode: RunMode = "random") => {
    let seed: Uint8Array;
    let sessionPda: PublicKey | null = null;
    if (mode === "daily" && publicKey) {
      try {
        const opened = await openSession({ player: publicKey, gameId: BLOCKWORDS_ARCADE_GAME_ID });
        seed = opened.seed;
        sessionPda = opened.sessionPda;
      } catch (e) {
        console.warn("openSession failed, falling back to local daily seed:", e);
        seed = dailySeed(todayYmd());
      }
    } else if (mode === "daily") {
      seed = dailySeed(todayYmd());
    } else {
      seed = generateSeed();
    }
    runRef.current = startRun(seed, mode, sessionPda);
    track("game_started", { game: "blockwords", mode });
    track("play_started", { game: "blockwords" });
    setSavedThisRun(false);
    setVerifiedThisRun(false);
    setOwnedThisRun(false);
    setLastSaveSig(null);
    setLastVerifySig(null);
    setLastReceiptSig(null);
    setOnchainError(null);
    setTick((t) => t + 1);
  }, [publicKey]);

  const endRun = useCallback((r: RunState) => {
    r.status = "ended";
    r.endedAt = Date.now();
    const steps = stepsOf(r);
    const score = computeScore(r.ladder, secondsUsed(r));
    if (steps.length >= WIN_LADDER_STEPS) {
      // Web2 Credits earn on a strong ladder (fire-and-forget; capped + idempotent server-side, CREDITS only — never $GAME).
      void earnCredits("game_win", `blockwords:win:${r.startedAt}`);
    }
    // Arcade Shell: free web2 leaderboard save — no wallet, just the email session.
    const payload = JSON.stringify({ gameId: "blockwords", score, refId: `blockwords:${r.startedAt}`, durationSec: secondsUsed(r) });
    void fetch("/api/scores/submit", {
      method: "POST", headers: { "content-type": "application/json" },
      body: payload,
    }).catch(() => {});
    // If signed out, stash it so it saves the moment they tap their email sign-in link.
    if (!meRef.current && typeof window !== "undefined") {
      window.localStorage.setItem("bw_pending_score", payload);
    }
    if (r.mode === "daily" && steps.length >= WIN_LADDER_STEPS) {
      const { streak } = recordDailyWin();
      setStreakInfo({ lastPlayedYmd: todayYmd(), streak, playedToday: true });
    }
  }, []);

  useEffect(() => {
    loopRef.current = setInterval(() => {
      const r = runRef.current;
      if (!r || r.status !== "active") return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (msRemaining(r) <= 0) {
        endRun(r);
      }
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [endRun]);

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

  const reject = useCallback((r: RunState, msg: string) => {
    r.invalidUntil = Date.now() + SHAKE_DURATION_MS;
    r.invalidMsg = msg;
    setTick((t) => t + 1);
  }, []);

  const onSubmit = useCallback(() => {
    const r = runRef.current;
    if (!r || r.status !== "active") return;
    const next = r.current.toUpperCase();
    const prev = r.ladder[r.ladder.length - 1];

    if (next.length !== WORD_LENGTH) {
      return reject(r, `Needs ${WORD_LENGTH} letters`);
    }
    if (r.ladder.includes(next)) {
      return reject(r, `${next} already used`);
    }
    if (!isRealWord(next)) {
      return reject(r, `${next} isn't a word`);
    }
    const diff = letterDiffCount(prev, next);
    if (diff !== 1) {
      return reject(r, diff === 0 ? "Change one letter" : `${diff} letters changed — change just one`);
    }
    // Redundant with the checks above, but the single source of truth for a step.
    if (!isValidLadderStep(prev, next)) {
      return reject(r, "Invalid step");
    }
    if (r.ladder.length - 1 >= MAX_LADDER_STEPS) {
      return reject(r, "Ladder is maxed out!");
    }

    // Track per-step delta in seconds since the previous rung (or run start for the first).
    const nowMs = Date.now();
    const prevMs = r.stepDeltasSec.length === 0
      ? r.startedAt
      : r.startedAt + r.stepDeltasSec.reduce((sum, d) => sum + d * 1000, 0);
    const deltaSec = Math.max(0, Math.min(255, Math.floor((nowMs - prevMs) / 1000)));
    r.stepDeltasSec.push(deltaSec);
    r.ladder.push(next);
    r.current = "";
    r.invalidMsg = "";
    r.lastRungIndex = r.ladder.length - 1;
    setTick((t) => t + 1);
  }, [reject]);

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

  // v1.4: default to USDC. Token picker handles USDC/SOL/$GAME.
  const [paymentToken, setPaymentToken] = useState<PaymentTokenDef>(
    PAYMENT_TOKENS.find((t) => t.symbol === "USDC") ?? PAYMENT_TOKENS[0]
  );

  // §F legal gate: first $GAME payment must accept the 18+/AI/not-gambling attestation.
  const [showEconomyGate, setShowEconomyGate] = useState(false);

  const onSaveOnChain = useCallback(async () => {
    const r = runRef.current;
    if (!r || !anchorWallet || !publicKey) return;
    if (paymentToken.kind === "game" && !hasEconomyConsent()) {
      setShowEconomyGate(true);
      return;
    }
    setBusy("save");
    setOnchainError(null);
    const score = computeScore(r.ladder, secondsUsed(r));
    track("score_save_attempted", { game: "blockwords", mode: r.mode, score, token: paymentToken.symbol });
    identifyWallet(publicKey.toBase58());
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      if (profileExists === false || profileExists === null) {
        tx.add(await buildOpenProfileIx(program, publicKey, getStoredReferrer(publicKey)));
      }

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

      const moveLogBytes = encodeLadderLog(stepsOf(r), r.stepDeltasSec);
      const moveHash = await sha256(moveLogBytes);
      const durationSec = Math.max(1, secondsUsed(r));
      tx.add(
        await buildSubmitScoreIx(program, publicKey, {
          variant: r.mode === "daily" ? `daily|${todayYmd()}` : "random",
          score: new BN(score),
          continuesUsed: 0,
          powerupsUsed: 0,
          sessionSeed: r.seed,
          durationSec,
          moveHash,
          meta: "",
          vsChallenger: PublicKey.default,
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
          session: r.sessionPda ?? undefined,
        }),
      );

      const sig = await program.provider.sendAndConfirm!(tx, [], {
        skipPreflight: false,
      });
      setLastSaveSig(sig);
      setSavedThisRun(true);
      setProfileExists(true);
      track("score_save_succeeded", { game: "blockwords", mode: r.mode, sig, score, sink_type: "save", token: paymentToken.symbol, amount: SCORE_COMMIT_MICRO_USD / 1e6 });
      void submitReplay(sig, moveLogBytes).catch(() => {});
      // Arcade Shell: stitch the on-chain tx onto the web2 leaderboard row → ✓ Verified.
      void fetch("/api/scores/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: "blockwords", refId: `blockwords:${r.startedAt}`, txSig: sig }),
      }).catch(() => {});
    } catch (e: any) {
      console.error("save on-chain failed:", e);
      setOnchainError(e?.message || "Save failed");
      track("score_save_failed", { game: "blockwords", error: e?.message || String(e) });
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
          paymentAmountRaw: new BN(VERIFIED_COMMIT_MICRO_USD),
          externalRef: "",
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
        }),
      );

      const moveLog = encodeLadderLog(stepsOf(r), r.stepDeltasSec);
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
          paymentAmountRaw: new BN(REPLAY_RECEIPT_MICRO_USD),
          externalRef: "",
          gameId: BLOCKWORDS_ARCADE_GAME_ID,
        }),
      );

      const nonce = new BN(r.startedAt);
      const moveLogBytes = encodeLadderLog(stepsOf(r), r.stepDeltasSec);
      const moveHash = await sha256(moveLogBytes);
      const durationSec = Math.max(1, secondsUsed(r));
      const score = computeScore(r.ladder, secondsUsed(r));
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
    return computeScore(r.ladder, secondsUsed(r));
  }, [r, tick]);
  const stepCount = r ? r.ladder.length - 1 : 0;
  const liveWord = r ? r.ladder[r.ladder.length - 1] : "";
  const keyboardHot = useMemo<Set<string>>(() => {
    if (!r) return new Set();
    return currentWordLetters(r.current, liveWord);
  }, [r, tick, liveWord]);
  // In a run at all (active OR game-over): the board frame fills the viewport and
  // the marketing/how-to/leaderboard panels below it are hidden — so both play and
  // game-over are self-contained full-screen states (the game-over shows its own
  // leaderboard inside the overlay). Only the idle START screen is the long page.
  const inRun = !!r;

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* 2026 minimalist top nav — matches home page */}
      <nav className="top-nav" style={{ padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</a>
        </div>
        {/* Identity chip — ALWAYS visible (incl. mobile). Play-first: signed-out shows a subtle Sign in; the real conversion is the game-over save. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/leaderboard" className="nav-links" style={{ textDecoration: "none" }}>Leaderboard</a>
          {me ? (
            <a
              href="/profile"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderRadius: 99, border: "1px solid rgba(153,69,255,0.4)", background: "rgba(153,69,255,0.12)", color: "#e8e8f0", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
            >
              <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.handle || me.email?.split("@")[0] || "you"}</span>
              {credits != null && <span style={{ color: "#14F195", fontWeight: 800 }}>⚡{credits}</span>}
            </a>
          ) : (
            <button
              onClick={() => { setShowLogin(true); track("login_prompt", { game: "blockwords", source: "nav" }); }}
              style={{ height: 32, padding: "0 16px", borderRadius: 99, border: "1px solid rgba(153,69,255,0.4)", background: "rgba(153,69,255,0.10)", color: "#e8e8f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Sign in
            </button>
          )}
        </div>
      </nav>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refreshIdentity(); }} />

      <div className="bw-layout" style={{ maxWidth: 1400, margin: "0 auto", padding: inRun ? "16px 16px 24px" : "64px 16px 24px", gap: 16 }}>
        <div>
          {inRun ? null : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <ModeToggle
              gameLabel="Blockwords"
              active="arcade"
              arcade={{ status: "live-devnet", href: "/play/blockwords?mode=arcade" }}
              battle={{ status: "live-devnet", href: "/play/blockwords?mode=battle", programId: "3XA1rz4f83FoTyvB7g1XHhsb4bx9SrUSBDtpLtAttU4o" }}
            />
          </div>
          )}

          <div className="bw-board-frame" style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(153,69,255,0.4)", background: "linear-gradient(135deg, rgba(25,10,45,0.95), rgba(2,6,20,0.95))", boxShadow: "0 0 40px rgba(153,69,255,0.18)", ...(inRun ? { minHeight: "calc(100dvh - 92px)", marginTop: 10, display: "flex", flexDirection: "column" } : {}) }}>
            {!r ? (
              <IntroOverlay onStart={startNewRun} streak={streakInfo} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <RunHud
                  remainingSec={remainingSec}
                  totalSec={RUN_DURATION_SEC}
                  rungs={stepCount}
                  score={finalScore}
                  status={r.status}
                />

                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", overflowY: "auto" }}>
                  <LadderView
                    ladder={r.ladder}
                    current={r.current}
                    status={r.status}
                    invalid={Date.now() < r.invalidUntil}
                    invalidMsg={r.invalidMsg}
                    lastRungIndex={r.lastRungIndex}
                  />
                </div>

                <Keyboard
                  hot={keyboardHot}
                  onLetter={onLetter}
                  onBackspace={onBackspace}
                  onSubmit={onSubmit}
                  disabled={r.status !== "active"}
                />
              </div>
            )}

            {r && r.status === "ended" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(5,5,20,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 20, overflowY: "auto" }}>
                {stepCount >= WIN_LADDER_STEPS && (
                  <Confetti />
                )}
                <div style={{ fontSize: 11, fontWeight: 800, color: stepCount >= WIN_LADDER_STEPS ? "#14F195" : "#ff5230", letterSpacing: 3, textTransform: "uppercase", zIndex: 1 }}>
                  {stepCount >= WIN_LADDER_STEPS ? `● ${stepCount}-rung ladder` : "● Time's up"}
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
                  <span>Ladder:</span>
                  <span style={{ color: ACCENT, fontFamily: "monospace", fontWeight: 800, letterSpacing: 2, fontSize: 15 }}>
                    {r.ladder.join(" → ")}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#8a8aa0", zIndex: 1 }}>
                  {stepCount} {stepCount === 1 ? "rung" : "rungs"} · {secondsUsed(r)}s
                </div>

                <div style={{ width: "100%", maxWidth: 420, marginTop: 8 }}>
                  <ReferrerBanner connectedWallet={publicKey ?? null} />
                </div>

                <div style={{ width: "100%", maxWidth: 420, marginTop: 8, marginBottom: 4, zIndex: 1 }}>
                  <ContinueWithCredits item="retry" game="blockwords" onSuccess={() => startNewRun(r.mode)} />
                </div>

                {/* WEB2-FIRST save — the primary path (email, no wallet). Play-first, save-anchored (loss-aversion), per the portal benchmark. */}
                {me ? (
                  <div style={{ width: "100%", maxWidth: 380, textAlign: "center", zIndex: 1 }}>
                    <div style={{ fontSize: 14, color: "#14F195", fontWeight: 800 }}>✓ Saved to the leaderboard</div>
                    <div style={{ fontSize: 12, color: "#a8a8c0", marginTop: 4, lineHeight: 1.5 }}>
                      🔥 Come back tomorrow to keep your streak{credits != null ? ` · ⚡ ${credits} Credits` : ""}
                    </div>
                  </div>
                ) : (
                  <div style={{ width: "100%", maxWidth: 340, zIndex: 1 }}>
                    <button
                      onClick={() => { setShowLogin(true); track("login_prompt", { game: "blockwords", source: "gameover" }); }}
                      style={{ width: "100%", height: 52, border: "none", borderRadius: 12, background: "linear-gradient(90deg,#9945FF,#7c3aed)", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer" }}
                    >
                      💾 Save your score &amp; streak
                    </button>
                    <div style={{ fontSize: 11, color: "#8a8aa0", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                      Free · email sign-in, no wallet · don&apos;t lose your spot on the leaderboard
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 12, zIndex: 1 }}>
                  <button onClick={() => startNewRun("random")} style={{ ...btnSecondary, minHeight: 44 }}>↻ Play again</button>
                  <a href="/arcade" style={{ ...btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 44 }}>← Arcade</a>
                </div>

                {/* OPTIONAL on-chain "✓ Verified" save — advanced/secondary. Wallet only ever appears here. */}
                <details style={{ width: "100%", maxWidth: 420, marginTop: 14, zIndex: 1 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "#c99aff", fontWeight: 700, textAlign: "center", listStyle: "none" }}>
                    🔒 Save on-chain forever — ✓ Verified ($0.05) ▾
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    {connected ? (
                      <>
                        {!savedThisRun && (
                          <div style={{ width: "100%", marginBottom: 8 }}>
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
                          onRestart={() => startNewRun(r.mode)}
                        />
                      </>
                    ) : (
                      <button
                        onClick={() => setWalletModalVisible(true)}
                        style={{ width: "100%", height: 48, border: "1px solid rgba(153,69,255,0.5)", borderRadius: 12, background: "rgba(153,69,255,0.12)", color: "#e8e8f0", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                      >
                        Connect wallet to save on-chain
                      </button>
                    )}
                  </div>
                </details>

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

                {/* Leaderboard lives INSIDE the game-over now (the below-page one is hidden in-run). */}
                <div style={{ width: "100%", maxWidth: 460, marginTop: 20, zIndex: 1 }}>
                  <ShellLeaderboard gameId="blockwords" />
                </div>
              </div>
            )}
          </div>

          {/* 2026 minimalist how-to — single line, expandable details */}
          {inRun ? null : (
          <details style={{ marginTop: 12, padding: "10px 14px", background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, fontSize: 11, color: "#8a8aa0" }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 6, userSelect: "none", flexWrap: "wrap" }}>
              <span style={{ color: ACCENT, fontWeight: 700 }}>How to play</span>
              <span>change ONE letter to make a new word · chain the longest ladder before the timer · <kbd style={kbdStyle}>A–Z</kbd> letter · <kbd style={kbdStyle}>↵</kbd> submit · <kbd style={kbdStyle}>⌫</kbd> erase</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#5a5a70" }}>more</span>
            </summary>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a28", lineHeight: 1.6 }}>
              You start on a random {WORD_LENGTH}-letter word. Each rung must be a real word that differs from the one above it in
              <span style={{ color: CHANGED, fontWeight: 700 }}> exactly one letter</span> (e.g. STARE → STORE → SCORE).
              No repeats. Longer ladders and rarer letters score more; finish fast for a speed bonus. Beat the {RUN_DURATION_SEC}s clock.
            </div>
          </details>
          )}
        </div>

        {inRun ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ShellLeaderboard gameId="blockwords" />

          {/* 2026: collapse verbose info panels into a single expandable */}
          <details style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "12px 16px" }}>
            <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: ACCENT, letterSpacing: 2, textTransform: "uppercase", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>💸 Save options · pricing</span>
              <span style={{ fontSize: 14, color: "#6a6a80" }}>+</span>
            </summary>
            <div style={{ marginTop: 10, fontSize: 12, color: "#a8a8c0", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#4fc3f7" }}>💾 Save score</span><b>$0.05</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#ffd740" }}>🏆 Save replay (verified)</span><b>$0.15</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#c99aff" }}>🎴 Claim ownership</span><b>$0.25</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: ACCENT }}>✨ Wrap as cNFT (v1.3)</span><b>$0.50</b></div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 8, lineHeight: 1.5 }}>
                Paid in USDC. ~$0.001/tx Solana gas. PlayerProfile setup ~$0.41 refundable rent (one-time per wallet).
              </div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 6, lineHeight: 1.5 }}>
                Start word deterministic from session seed · every ladder step re-validated on-chain · score = 20/rung + rare-letter bonus + speed bonus.
              </div>
            </div>
          </details>
        </div>
        )}
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
          0%, 100% { text-shadow: 0 0 22px rgba(153,69,255,0.55), 0 0 48px rgba(20,241,149,0.2); }
          50%      { text-shadow: 0 0 38px rgba(153,69,255,0.95), 0 0 80px rgba(20,241,149,0.4); }
        }
        @keyframes bwStartPulse {
          0%, 100% { box-shadow: 0 0 28px rgba(153,69,255,0.4), inset 0 1px 0 rgba(255,255,255,0.2); transform: scale(1); }
          50%      { box-shadow: 0 0 48px rgba(20,241,149,0.6), inset 0 1px 0 rgba(255,255,255,0.2); transform: scale(1.02); }
        }
        @keyframes bwRungPop {
          0%   { transform: translateY(8px) scale(0.96); opacity: 0; }
          60%  { transform: translateY(-2px) scale(1.03); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
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

      {showEconomyGate && (
        <EconomyConsentModal
          onClose={() => setShowEconomyGate(false)}
          onAccept={() => { setShowEconomyGate(false); void onSaveOnChain(); }}
        />
      )}
    </div>
  );
}

function IntroOverlay({
  onStart,
  streak,
}: {
  onStart: (mode: RunMode) => void;
  streak: { streak: number; playedToday: boolean };
}) {
  return (
    <div className="bw-intro-overlay" style={{ position: "relative", minHeight: 420, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 20, overflow: "hidden" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 30% 30%, rgba(153,69,255,0.2), transparent 50%), radial-gradient(circle at 70% 70%, rgba(20,241,149,0.12), transparent 50%)",
          pointerEvents: "none",
        }}
      />
      <div className="bw-intro-emoji" style={{ fontSize: 56, zIndex: 1 }}>🪜</div>
      <div className="bw-title" style={{ fontSize: 40, fontWeight: 900, color: "#f4f2fb", letterSpacing: 3, textAlign: "center", zIndex: 1, lineHeight: 1.1 }}>
        BLOCKWORDS<br />
        <span style={{ fontSize: 20, color: ACCENT, letterSpacing: 5, fontWeight: 800 }}>Word Ladder</span>
      </div>
      <div style={{ fontSize: 14, color: "#a8a8c0", textAlign: "center", maxWidth: 440, zIndex: 1, lineHeight: 1.5 }}>
        Change <strong style={{ color: CHANGED }}>one letter at a time</strong> to build the longest chain of real words before the{" "}
        <strong style={{ color: ACCENT }}>{RUN_DURATION_SEC}s</strong> timer runs out. Longer + rarer + faster = higher score.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6, zIndex: 1, alignItems: "stretch", width: "min(320px, 90%)" }}>
        <button
          onClick={() => onStart("daily")}
          style={{
            padding: "14px 24px",
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
            background: streak.playedToday
              ? "linear-gradient(135deg, #14F195, #0fa572)"
              : "linear-gradient(135deg, #9945FF, #7a2fe0)",
            color: streak.playedToday ? "#062015" : "#fff",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {streak.playedToday ? "✓ Today's Challenge" : "📅 Today's Challenge"}
        </button>
        <button
          onClick={() => onStart("random")}
          style={{
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            background: "transparent",
            color: ACCENT,
            border: `1px solid ${ACCENT}`,
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          ▶ Random Run
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#6a6a80", zIndex: 1, textAlign: "center" }}>
        {streak.streak > 0
          ? `🔥 ${streak.streak}-day streak${streak.playedToday ? " (today done)" : ""}`
          : "Free to play — on-chain scoring optional at game over."}
      </div>
    </div>
  );
}

function RunHud({
  remainingSec,
  totalSec,
  rungs,
  score,
  status,
}: {
  remainingSec: number;
  totalSec: number;
  rungs: number;
  score: number;
  status: RunStatus;
}) {
  const pct = Math.max(0, Math.min(1, remainingSec / totalSec));
  const urgent = remainingSec <= 10;

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(153,69,255,0.25)", background: "rgba(20,8,36,0.6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Rungs</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: ACCENT, fontFamily: "monospace", lineHeight: 1 }}>
              {rungs}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Score</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#14F195", fontFamily: "monospace", lineHeight: 1 }}>
              {score.toLocaleString()}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Goal</div>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>longest ladder</div>
          </div>
          <div style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: urgent ? "rgba(255,82,48,0.18)" : "rgba(153,69,255,0.12)",
            border: `1px solid ${urgent ? "#ff5230" : "rgba(153,69,255,0.4)"}`,
            color: urgent ? "#ff5230" : ACCENT,
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
      <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(30,12,50,0.6)", overflow: "hidden" }}>
        <div style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: urgent ? "linear-gradient(90deg, #ff5230, #ff9a40)" : `linear-gradient(90deg, ${ACCENT}, #14F195)`,
          transition: "width 100ms linear",
        }} />
      </div>
    </div>
  );
}

/** Which letter index differs between two equal-length words (-1 if not exactly one). */
function changedIndex(prev: string, next: string): number {
  if (!prev || !next || prev.length !== next.length) return -1;
  let idx = -1;
  let count = 0;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) { idx = i; count++; }
  }
  return count === 1 ? idx : -1;
}

function WordRow({
  word,
  prev,
  variant,
  pop,
}: {
  word: string;
  prev: string | null;
  variant: "start" | "rung" | "input";
  pop: boolean;
}) {
  const changed = prev ? changedIndex(prev, word.replace(/ /g, "")) : -1;
  const letters = word.padEnd(WORD_LENGTH, " ").split("");
  const isInput = variant === "input";
  const isStart = variant === "start";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${WORD_LENGTH}, 1fr)`,
        gap: 6,
        width: "min(360px, 84vw)",
        animation: pop ? `bwRungPop ${POP_DURATION_MS}ms ease-out` : "none",
      }}
    >
      {letters.map((ch, i) => {
        const filled = ch && ch !== " ";
        const isChanged = !isInput && changed === i && changed >= 0;
        let bg: string = TILE_DEFAULT;
        let borderColor: string = filled ? "#5a5a70" : TILE_BORDER_DEFAULT;
        let color = "#e8e8f0";
        if (isStart) {
          bg = `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})`; borderColor = ACCENT; color = "#fff";
        } else if (isChanged) {
          bg = "rgba(34,211,238,0.16)"; borderColor = CHANGED; color = "#c4f6ff";
        } else if (!isInput && filled) {
          bg = "rgba(153,69,255,0.08)"; borderColor = "rgba(153,69,255,0.3)"; color = "#d8c8ff";
        }
        return (
          <div
            key={i}
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              background: bg,
              border: `2px solid ${borderColor}`,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "min(7vw, 30px)",
              fontWeight: 800,
              color,
              fontFamily: "monospace",
              textTransform: "uppercase",
              boxShadow: isStart ? `0 0 14px ${ACCENT}55` : isChanged ? `0 0 12px ${CHANGED}44` : "none",
              transition: "background 80ms, border-color 80ms",
            }}
            aria-label={filled ? `letter ${ch}` : "empty"}
          >
            {filled ? ch : ""}
          </div>
        );
      })}
    </div>
  );
}

function LadderView({
  ladder,
  current,
  status,
  invalid,
  invalidMsg,
  lastRungIndex,
}: {
  ladder: string[];
  current: string;
  status: RunStatus;
  invalid: boolean;
  invalidMsg: string;
  lastRungIndex: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ladder.length, current]);

  return (
    <div style={{ padding: "16px 16px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          maxHeight: "min(46vh, 380px)",
          overflowY: "auto",
          width: "100%",
          paddingRight: 4,
        }}
      >
        {ladder.map((w, idx) => (
          <WordRow
            key={idx}
            word={w}
            prev={idx > 0 ? ladder[idx - 1] : null}
            variant={idx === 0 ? "start" : "rung"}
            pop={idx === lastRungIndex && idx > 0}
          />
        ))}

        {status === "active" && (
          <div
            style={{
              animation: invalid ? `bwShake ${SHAKE_DURATION_MS}ms ease-in-out` : "none",
            }}
          >
            <WordRow
              word={current}
              prev={null}
              variant="input"
              pop={false}
            />
          </div>
        )}
      </div>

      <div style={{ minHeight: 18, fontSize: 12, fontWeight: 700, color: invalid ? "#ff5230" : "#6a6a80", textAlign: "center" }}>
        {invalid && invalidMsg
          ? `⚠ ${invalidMsg}`
          : status === "active"
          ? `Change one letter of ${ladder[ladder.length - 1]}`
          : ""}
      </div>
    </div>
  );
}

const KB_ROWS: string[] = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function Keyboard({
  hot,
  onLetter,
  onBackspace,
  onSubmit,
  disabled,
}: {
  hot: Set<string>;
  onLetter: (l: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const renderKey = (label: string, onClick: () => void, opts?: { wide?: boolean; hot?: boolean }) => {
    const isHot = !!opts?.hot;
    const bg = isHot ? "rgba(153,69,255,0.22)" : "#1a1a28";
    const color = isHot ? "#e0ccff" : "#e8e8f0";
    const border = isHot ? `1px solid ${ACCENT}` : "1px solid #2a2a3a";
    return (
      <button
        key={label}
        onClick={onClick}
        disabled={disabled}
        style={{
          position: "relative",
          flex: opts?.wide ? "1.6 1 0" : "1 1 0",
          minWidth: 0,
          height: "clamp(40px, 8.2vw, 52px)",
          padding: 0,
          background: bg,
          color,
          border,
          borderRadius: 8,
          fontSize: opts?.wide ? "clamp(9px, 2.4vw, 11px)" : "clamp(13px, 4.2vw, 18px)",
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
    <div style={{ padding: "10px clamp(4px,2vw,10px) calc(12px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "stretch", gap: "clamp(4px,1.2vw,7px)", background: "rgba(0,0,0,0.18)", width: "100%", maxWidth: 620, marginInline: "auto" }}>
      {KB_ROWS.map((row, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            gap: "clamp(3px,1vw,6px)",
            justifyContent: "center",
            width: "100%",
          }}
        >
          {idx === 2 && renderKey("Enter", onSubmit, { wide: true })}
          {row.split("").map((ch) => renderKey(ch, () => onLetter(ch), { hot: hot.has(ch) }))}
          {idx === 2 && renderKey("⌫", onBackspace, { wide: true })}
        </div>
      ))}
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#14F195", "#9945FF", "#22d3ee", "#4fc3f7", "#c99aff"];
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
      why: "Your full ladder is committed on-chain. Anyone can replay it from the seed and cryptographically verify the score — you get the 🏆 VERIFIED badge.",
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
      accent: ACCENT,
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
            <span style={{ color: ACCENT, fontFamily: "monospace", fontWeight: 700 }}>
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
      <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 11 }}>{fee}</span>
      <span style={{ color: "#6a6a80", fontSize: 10, flexBasis: "100%", paddingLeft: 74, marginTop: -2 }}>{detail}</span>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: `linear-gradient(135deg, ${ACCENT}, #14F195)`,
  color: "#050508",
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
  border: "1px solid rgba(153,69,255,0.25)",
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
