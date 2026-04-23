"use client";

// Cyber Snake Solo — single-player arcade game engine.
//
// v1.1 scope:
//   - 32×32 grid, classic Snake mechanic (eat food, grow, avoid wall + self)
//   - Deterministic xorshift food spawn seeded from session_seed (matches
//     on-chain game program's RNG)
//   - Keyboard input (arrow keys + WASD)
//   - Local leaderboard (top 10) via localStorage — free play, no wallet
//   - Wallet connect (Phantom) → on-chain score submission via submit_score
//   - Paid Continue ($0.05 × 2ⁿ) via Solana Pay USDC + record_payment
//   - VERIFIED commit ($0.10) via commit_session_replay → 🏆 badge

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BN } from "@coral-xyz/anchor";
import { getSfx } from "../../../lib/arcade/sfx";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  makeProgram,
  buildOpenProfileIx,
  buildSubmitScoreIx,
  buildRecordPaymentIx,
  buildCommitReplayIx,
  buildMintReceiptIx,
  buildUsdcTransferIxs,
  profilePda,
  receiptPda,
  encodeMoveLog,
  sha256,
  sigToBytes,
  continueCostMicroUsd,
  getTreasuryWallet,
  CATEGORY,
  SCORE_COMMIT_MICRO_USD,
  VERIFIED_COMMIT_MICRO_USD,
  REPLAY_RECEIPT_MICRO_USD,
  CNFT_WRAP_MICRO_USD,
  ARCADE_PROGRAM_ID,
  ARCADE_NETWORK,
} from "../../../lib/arcade/client";
import { ArcadeLeaderboard } from "../_components/ArcadeLeaderboard";

const EXPLORER_SUFFIX = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;

// 3D scene — reuse the existing component from the Duel surface.
const CyberSnake3DScene = dynamic(
  () => import("../../play/cyber-snake/CyberSnake3DScene"),
  { ssr: false }
);

// ── Constants ──────────────────────────────────────────────────────────
const GRID = 32;
const MAX_LEN = 256;
const START_LEN = 3;
const TICK_MS = 140; // snake speed — ~7 ticks per second
const DIR_N = 0, DIR_E = 1, DIR_S = 2, DIR_W = 3;
// Anti-infinite-loop: snake starves if it doesn't eat within this many ticks.
// 30 seconds of circling without eating = death. Authentic arcade pressure.
const FOOD_STARVATION_TICKS = 210; // 30s at 7 ticks/sec
const FOOD_WARNING_TICKS = 140;    // warn on HUD for last 10s of the timer
// Move-log cap so GPX5R memo always fits in Solana's memo budget.
// 130 × 3 bytes/change = 390 bytes raw, well under MAX_MOVE_LOG_BYTES=400.
// 130 direction changes in 60s = 2.2/sec, well above realistic human play.
const MAX_MOVE_CHANGES = 130;
const MOVE_CHANGE_WARN = 110; // warn the player when approaching the cap

// ── Xorshift RNG (matches on-chain Xorshift64 for determinism) ─────────
function makeRng(seedBytes: Uint8Array): () => number {
  // Fold 32 bytes into a u64 seed. Pragmatic; on-chain program does the same.
  const ZERO = BigInt(0);
  const U64_MASK = BigInt("0xffffffffffffffff");
  const U32_MASK = BigInt("0xffffffff");
  let state = ZERO;
  for (let i = 0; i < 8; i++) {
    state = (state << BigInt(8)) | BigInt(seedBytes[i] || 0);
  }
  if (state === ZERO) state = BigInt("0xdeadbeef");
  return () => {
    state ^= state << BigInt(13);
    state &= U64_MASK;
    state ^= state >> BigInt(7);
    state ^= state << BigInt(17);
    state &= U64_MASK;
    return Number(state & U32_MASK);
  };
}

// ── Seed helpers ───────────────────────────────────────────────────────
function generateSeed(): Uint8Array {
  const s = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(s);
  } else {
    for (let i = 0; i < 32; i++) s[i] = Math.floor(Math.random() * 256);
  }
  return s;
}

function seedToHex(s: Uint8Array): string {
  return Array.from(s).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Game state ─────────────────────────────────────────────────────────
interface GameState {
  seed: Uint8Array;
  body: number[];         // ring buffer of positions (MAX_LEN)
  headIdx: number;        // write cursor
  len: number;            // current snake length
  dir: number;            // current direction
  queuedDir: number;      // pending input for next tick (anti-180°)
  foodPos: number;
  grid: Uint8Array;       // cell occupancy bitmap
  tick: number;
  score: number;
  status: "active" | "crashed" | "paused" | "gameover";
  startedAt: number;      // unix ms
  moveLog: Array<{ tick: number; dir: number }>;  // for GPX5R replay
  rng: () => number;
  continuesUsed: number;
  ticksSinceLastFood: number; // reset on eat; when hits FOOD_STARVATION_TICKS → starve
  moveLogCapped: boolean;     // true once MAX_MOVE_CHANGES exceeded (log stops growing)
}

function freshGame(seed: Uint8Array): GameState {
  const rng = makeRng(seed);
  const body = new Array<number>(MAX_LEN).fill(0);
  const grid = new Uint8Array(GRID * GRID);
  // Start mid-grid heading east.
  const startRow = GRID / 2;
  const startCol = GRID / 4;
  for (let i = 0; i < START_LEN; i++) {
    const pos = startRow * GRID + (startCol - (START_LEN - 1 - i));
    body[i] = pos;
    grid[pos] = 1;
  }
  const headIdx = START_LEN; // next write cursor
  // Initial food — walk the RNG until we find an empty cell.
  let food = 0;
  for (let attempts = 0; attempts < 50; attempts++) {
    food = rng() % (GRID * GRID);
    if (grid[food] === 0) break;
  }
  return {
    seed,
    body,
    headIdx,
    len: START_LEN,
    dir: DIR_E,
    queuedDir: DIR_E,
    foodPos: food,
    grid,
    tick: 0,
    score: 0,
    status: "active",
    startedAt: Date.now(),
    moveLog: [],
    rng,
    continuesUsed: 0,
    ticksSinceLastFood: 0,
    moveLogCapped: false,
  };
}

function opposite(d: number): number {
  return (d + 2) % 4;
}

function stepDir(pos: number, dir: number): number | null {
  const r = Math.floor(pos / GRID);
  const c = pos % GRID;
  let nr = r, nc = c;
  switch (dir) {
    case DIR_N: nr = r - 1; break;
    case DIR_E: nc = c + 1; break;
    case DIR_S: nr = r + 1; break;
    case DIR_W: nc = c - 1; break;
  }
  if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return null; // wall
  return nr * GRID + nc;
}

function tickGame(g: GameState): GameState {
  if (g.status !== "active") return g;

  // Food-starvation check: die if too long since last eat. Blocks the
  // "circle forever" attack — every session must be economically engaged.
  if (g.ticksSinceLastFood >= FOOD_STARVATION_TICKS) {
    g.status = "crashed";
    return g;
  }

  // Commit queued direction unless it's a 180° flip.
  if (g.queuedDir !== opposite(g.dir)) g.dir = g.queuedDir;
  // Move-log append, capped at MAX_MOVE_CHANGES so GPX5R memo always fits.
  if (g.dir !== g.moveLog[g.moveLog.length - 1]?.dir) {
    if (g.moveLog.length < MAX_MOVE_CHANGES) {
      g.moveLog.push({ tick: g.tick, dir: g.dir });
    } else {
      g.moveLogCapped = true;
    }
  }

  const headPos = g.body[(g.headIdx + MAX_LEN - 1) % MAX_LEN];
  const nextPos = stepDir(headPos, g.dir);

  // Wall crash
  if (nextPos === null) {
    g.status = "crashed";
    return g;
  }

  const eating = nextPos === g.foodPos;

  // Self-collision: need to check against body cells that WON'T move away.
  // If NOT eating, the tail cell will vacate this tick — so collision with
  // the tail position is OK (classic Snake).
  const tailIdx = (g.headIdx + MAX_LEN - g.len) % MAX_LEN;
  const tailPos = g.body[tailIdx];
  if (g.grid[nextPos] === 1 && !(nextPos === tailPos && !eating)) {
    g.status = "crashed";
    return g;
  }

  // Move: write new head
  g.body[g.headIdx] = nextPos;
  g.headIdx = (g.headIdx + 1) % MAX_LEN;
  g.grid[nextPos] = 1;

  if (eating) {
    g.len++;
    g.score += 10 + Math.floor(g.len / 5); // accelerating score as snake grows
    g.ticksSinceLastFood = 0; // reset starvation timer
    // Spawn new food on an empty cell
    let newFood = g.foodPos;
    for (let attempts = 0; attempts < 200; attempts++) {
      const candidate = g.rng() % (GRID * GRID);
      if (g.grid[candidate] === 0) {
        newFood = candidate;
        break;
      }
    }
    g.foodPos = newFood;
    // Cap at max length
    if (g.len > MAX_LEN) g.len = MAX_LEN;
  } else {
    // Tail retracts
    g.grid[tailPos] = 0;
    g.ticksSinceLastFood++;
  }

  g.tick++;
  return g;
}

// ── Local leaderboard ──────────────────────────────────────────────────
const LB_KEY = "gp.arcade.cyber-snake.local.v1";
interface LocalScore {
  score: number;
  continues: number;
  duration_sec: number;
  at: number;
  seed: string;
}
function loadLocalBoard(): LocalScore[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LB_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalScore[];
  } catch {
    return [];
  }
}
function saveLocalBoard(entries: LocalScore[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LB_KEY, JSON.stringify(entries));
  } catch {}
}
function insertLocalScore(entry: LocalScore): LocalScore[] {
  const board = loadLocalBoard();
  board.push(entry);
  // Sort: 0-continues first (1CC principle), then score desc
  board.sort((a, b) => {
    if (a.continues !== b.continues) return a.continues - b.continues;
    return b.score - a.score;
  });
  const top = board.slice(0, 10);
  saveLocalBoard(top);
  return top;
}

// ── Scene-state adapter: GameState → SnakeSceneState ──────────────────
function toSceneState(g: GameState) {
  return {
    bodyP1: Array.from(g.body),
    bodyP2: new Array<number>(MAX_LEN).fill(0),
    headIdxP1: g.headIdx,
    headIdxP2: 0,
    lenP1: g.len,
    lenP2: 0, // solo — P2 body hidden
    dirP1: g.dir,
    dirP2: 0,
    foodPos: g.foodPos,
    status: g.status === "active" ? 1 : 2,
    winnerFlag: 0,
    tick: g.tick,
  };
}

// ── View mode ─────────────────────────────────────────────────────────
type SnakeCamera = "top" | "tps-p1" | "fpv-p1";

// ── Component ──────────────────────────────────────────────────────────
export default function CyberSnakeSolo() {
  const [view, setView] = useState<SnakeCamera>("top");
  const [tick, setTick] = useState(0); // drives React re-renders
  const sfx = useMemo(() => getSfx(), []);
  const [muted, setMuted] = useState<boolean>(false);
  useEffect(() => { setMuted(sfx.isMuted()); }, [sfx]);
  const boardRef = useRef<HTMLDivElement>(null);
  // Previous game status + score — lets us fire one-shot SFX on transitions.
  const prevStatusRef = useRef<GameState["status"] | null>(null);
  const prevScoreRef = useRef<number>(0);
  const prevDirRef = useRef<number>(DIR_E);
  const [board, setBoard] = useState<LocalScore[]>([]);
  const gameRef = useRef<GameState | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedRef = useRef<boolean>(false);

  // ── On-chain wallet state ──────────────────────────────────────────
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const [profileExists, setProfileExists] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | "save" | "verify" | "receipt" | "continue">(null);
  const [lastSaveSig, setLastSaveSig] = useState<string | null>(null);
  const [lastVerifySig, setLastVerifySig] = useState<string | null>(null);
  const [lastReceiptSig, setLastReceiptSig] = useState<string | null>(null);
  const [receiptNonce, setReceiptNonce] = useState<BN | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [savedThisRun, setSavedThisRun] = useState(false);
  const [verifiedThisRun, setVerifiedThisRun] = useState(false);
  const [ownedThisRun, setOwnedThisRun] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Detect whether this wallet already has a PlayerProfile opened. Updates
  // on wallet-connect so the onSaveOnChain flow knows whether to bundle
  // open_player_profile + submit_score (first time) or just submit_score.
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

  // Init leaderboard on mount
  useEffect(() => {
    setBoard(loadLocalBoard());
  }, []);

  const startNewGame = useCallback(() => {
    sfx.unlock();
    sfx.start();
    gameRef.current = freshGame(generateSeed());
    savedRef.current = false;
    prevStatusRef.current = "active";
    prevScoreRef.current = 0;
    prevDirRef.current = DIR_E;
    // Monotonic increment forces React to re-render even if tick was already 0.
    setTick((t) => t + 1);
  }, [sfx]);

  const resetSnakePosition = useCallback((g: GameState) => {
    g.body.fill(0);
    g.grid.fill(0);
    const startRow = GRID / 2;
    const startCol = GRID / 4;
    for (let i = 0; i < START_LEN; i++) {
      const pos = startRow * GRID + (startCol - (START_LEN - 1 - i));
      g.body[i] = pos;
      g.grid[pos] = 1;
    }
    g.headIdx = START_LEN;
    g.len = START_LEN;
    g.dir = DIR_E;
    g.queuedDir = DIR_E;
    g.status = "active";
    g.ticksSinceLastFood = 0; // fresh food window on continue
    for (let attempts = 0; attempts < 200; attempts++) {
      const candidate = g.rng() % (GRID * GRID);
      if (g.grid[candidate] === 0) { g.foodPos = candidate; break; }
    }
  }, []);

  // ── On-chain actions ───────────────────────────────────────────────

  // Save score to the on-chain leaderboard — $0.05 Gamerplex fee +
  // Solana gas (~$0.001). If this is the wallet's first save, also pays the
  // ~$0.41 refundable PlayerProfile rent-exempt deposit.
  //
  // One tx bundles: [open_player_profile if needed] + USDC $0.05 transfer
  // → treasury + record_payment(ScoreCommit, $0.05) + submit_score(GPX5 memo).
  const onSaveOnChain = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !anchorWallet || !publicKey) return;
    setBusy("save");
    setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      // First-time profile onboarding.
      if (profileExists === false || profileExists === null) {
        tx.add(
          await buildOpenProfileIx(program, publicKey, PublicKey.default)
        );
      }

      // USDC $0.05 → treasury.
      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(SCORE_COMMIT_MICRO_USD)
      );
      usdcIxs.forEach((ix) => tx.add(ix));

      // Record the payment.
      const emptySig = new Uint8Array(64);
      tx.add(
        await buildRecordPaymentIx(program, publicKey, {
          category: CATEGORY.SCORE_COMMIT,
          amountMicroUsd: new BN(SCORE_COMMIT_MICRO_USD),
          paymentTxSig: emptySig,
          gamerPaid: false,
          externalRef: "",
        })
      );

      // Submit score (emits GPX5 memo).
      const moveLogBytes = encodeMoveLog(g.moveLog);
      const moveHash = await sha256(moveLogBytes);
      tx.add(
        await buildSubmitScoreIx(program, publicKey, {
          variant: "-",
          score: new BN(g.score),
          continuesUsed: g.continuesUsed,
          powerupsUsed: 0,
          sessionSeed: g.seed,
          durationSec: Math.max(1, Math.floor((Date.now() - g.startedAt) / 1000)),
          moveHash,
          meta: "",
          vsChallenger: PublicKey.default,
        })
      );

      const sig = await program.provider.sendAndConfirm!(tx, [], {
        skipPreflight: false,
      });
      setLastSaveSig(sig);
      setSavedThisRun(true);
      setProfileExists(true);
    } catch (e: any) {
      console.error("save on-chain failed:", e);
      setOnchainError(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, profileExists]);

  // VERIFIED commit — $0.10 USDC → treasury, then commit full move log as
  // GPX5R memo. Triggers 🏆 VERIFIED badge on global leaderboard.
  const onVerifyRun = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !anchorWallet || !publicKey) return;
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

      // USDC $0.10 transfer → treasury
      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(VERIFIED_COMMIT_MICRO_USD)
      );
      usdcIxs.forEach((ix) => tx.add(ix));

      // record_payment with empty tx_sig (same tx — resolver correlates via
      // neighboring instructions). external_ref empty; inline replay lands next.
      const emptySig = new Uint8Array(64);
      tx.add(
        await buildRecordPaymentIx(program, publicKey, {
          category: CATEGORY.VERIFIED_COMMIT,
          amountMicroUsd: new BN(VERIFIED_COMMIT_MICRO_USD),
          paymentTxSig: emptySig,
          gamerPaid: false,
          externalRef: "",
        })
      );

      // commit_session_replay — emits GPX5R memo with compact move log.
      const moveLog = encodeMoveLog(g.moveLog);
      if (moveLog.length > 400) {
        throw new Error(
          `Move log too long for inline storage (${moveLog.length}B > 400B). External_ref fallback needed.`
        );
      }
      tx.add(
        await buildCommitReplayIx(program, publicKey, {
          scoreNonce: new BN(g.startedAt),
          sessionSeed: g.seed,
          moveLog,
        })
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

  // T3 — Mint ReplayReceipt PDA ($0.25 USDC + ~$0.33 refundable rent).
  // Transferable, tradeable certificate of ownership bound to the canonical
  // GPX5R memo. original_player is stamped immutably = current wallet;
  // owner starts = original_player and can be transferred via separate ix.
  const onMintReceipt = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !anchorWallet || !publicKey || !lastVerifySig) return;
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

      // USDC $0.25 → treasury
      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(REPLAY_RECEIPT_MICRO_USD)
      );
      usdcIxs.forEach((ix) => tx.add(ix));

      // record_payment for audit
      const emptySig = new Uint8Array(64);
      tx.add(
        await buildRecordPaymentIx(program, publicKey, {
          category: CATEGORY.REPLAY_RECEIPT,
          amountMicroUsd: new BN(REPLAY_RECEIPT_MICRO_USD),
          paymentTxSig: emptySig,
          gamerPaid: false,
          externalRef: "",
        })
      );

      // Mint the ReplayReceipt PDA
      const nonce = new BN(g.startedAt);
      const moveLogBytes = encodeMoveLog(g.moveLog);
      const moveHash = await sha256(moveLogBytes);
      tx.add(
        await buildMintReceiptIx(program, publicKey, {
          nonce,
          score: new BN(g.score),
          continuesUsed: g.continuesUsed,
          powerupsUsed: 0,
          sessionSeed: g.seed,
          moveHash,
          durationSec: Math.max(1, Math.floor((Date.now() - g.startedAt) / 1000)),
          gpx5rMemoTx: sigToBytes(lastVerifySig),
        })
      );

      const sig = await program.provider.sendAndConfirm!(tx, [], { skipPreflight: false });
      setLastReceiptSig(sig);
      setReceiptNonce(nonce);
      setOwnedThisRun(true);
    } catch (e: any) {
      console.error("mint receipt failed:", e);
      setOnchainError(e?.message || "Mint receipt failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, verifiedThisRun, lastVerifySig]);

  // Paid continue — $0.05 × 2ⁿ USDC → treasury + record_payment, then resume.
  const onPaidContinue = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !anchorWallet || !publicKey) return;
    setBusy("continue");
    setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const amount = continueCostMicroUsd(g.continuesUsed);
      const tx = new Transaction();

      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        amount
      );
      usdcIxs.forEach((ix) => tx.add(ix));

      const emptySig = new Uint8Array(64);
      tx.add(
        await buildRecordPaymentIx(program, publicKey, {
          category: CATEGORY.CONTINUE,
          amountMicroUsd: amount,
          paymentTxSig: emptySig,
          gamerPaid: false,
          externalRef: "",
        })
      );

      await program.provider.sendAndConfirm!(tx, [], { skipPreflight: false });

      // Payment confirmed — reset the snake + increment counter.
      g.continuesUsed++;
      resetSnakePosition(g);
      setSavedThisRun(false); // need to re-save after beating previous score
      setVerifiedThisRun(false);
    } catch (e: any) {
      console.error("continue failed:", e);
      setOnchainError(e?.message || "Continue failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, resetSnakePosition]);

  // Free-play continue (no wallet required) — legacy local behavior.
  const continueGame = useCallback(() => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    resetSnakePosition(g);
    g.continuesUsed++;
  }, [resetSnakePosition]);

  // Game loop — runs once on mount, no-ops when there's no game.
  // Driven by a single interval; re-renders triggered via setTick inside.
  useEffect(() => {
    loopRef.current = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      if (g.status === "active") {
        tickGame(g);
        setTick((t) => t + 1);
      }
    }, TICK_MS);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, []);

  // Input — keyboard + touch swipe. Both pipe through the same direction
  // queue so behaviour is identical.
  const queueDir = useCallback((nextDir: number) => {
    const g = gameRef.current;
    if (!g || g.status !== "active") return;
    if (nextDir !== opposite(g.dir) && nextDir !== g.queuedDir) {
      g.queuedDir = nextDir;
      sfx.turn();
    }
  }, [sfx]);

  // Keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let nextDir: number | null = null;
      switch (e.key) {
        case "ArrowUp": case "w": case "W": nextDir = DIR_N; break;
        case "ArrowRight": case "d": case "D": nextDir = DIR_E; break;
        case "ArrowDown": case "s": case "S": nextDir = DIR_S; break;
        case "ArrowLeft": case "a": case "A": nextDir = DIR_W; break;
        case "v": case "V": {
          // Cycle views: top → tps-p1 → fpv-p1 → top
          const next: SnakeCamera = view === "top" ? "tps-p1" : view === "tps-p1" ? "fpv-p1" : "top";
          setView(next);
          sfx.uiClick();
          break;
        }
        case "m": case "M": {
          // Mute toggle
          const m = !sfx.isMuted();
          sfx.setMuted(m);
          setMuted(m);
          break;
        }
      }
      if (nextDir !== null) {
        e.preventDefault();
        queueDir(nextDir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, sfx, queueDir]);

  // Touch swipe input — any swipe over the board threshold fires a dir change.
  // Uses touchstart / touchend rather than live touchmove for crisp gestures.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    let startX = 0, startY = 0, startT = 0;
    const SWIPE_MIN = 30;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; startT = Date.now();
      sfx.unlock(); // first touch unlocks iOS AudioContext
    };
    const onEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      if (Date.now() - startT > 800) return; // too slow → ignore
      if (Math.abs(dx) > Math.abs(dy)) {
        queueDir(dx > 0 ? DIR_E : DIR_W);
      } else {
        queueDir(dy > 0 ? DIR_S : DIR_N);
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [sfx, queueDir]);

  // One-shot SFX on state transitions (eat = score went up, crash, starve)
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    // Eat — score jumped since last tick
    if (g.status === "active" && g.score > prevScoreRef.current) {
      sfx.eat();
    }
    prevScoreRef.current = g.score;
    // Crash / starve
    if (g.status === "crashed" && prevStatusRef.current === "active") {
      if (g.ticksSinceLastFood >= FOOD_STARVATION_TICKS) sfx.starve();
      else sfx.crash();
    }
    prevStatusRef.current = g.status;
  }, [tick, sfx]);

  // Submit to local board on crash (one-shot)
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.status === "crashed" && !savedRef.current) {
      const duration = Math.floor((Date.now() - g.startedAt) / 1000);
      if (g.score > 0) {
        const entry: LocalScore = {
          score: g.score,
          continues: g.continuesUsed,
          duration_sec: duration,
          at: Date.now(),
          seed: seedToHex(g.seed),
        };
        const top = insertLocalScore(entry);
        setBoard(top);
      }
      savedRef.current = true;
    }
  }, [tick]);

  const g = gameRef.current;
  const sceneState = g ? toSceneState(g) : null;
  const continueCost = g ? (0.05 * Math.pow(2, g.continuesUsed)).toFixed(2) : "0.05";

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #252540", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ textDecoration: "none", fontSize: 24, fontWeight: 900, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", paddingRight: 8 }}>GAMERPLEX</a>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: "rgba(79,195,247,0.15)", border: "1px solid rgba(79,195,247,0.4)", color: "#4fc3f7", letterSpacing: 1, textTransform: "uppercase" }}>Arcade · Cyber Snake</span>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 13, alignItems: "center" }}>
          <a href="/arcade" style={{ color: "#8a8aa0", textDecoration: "none" }}>Arcade</a>
          <a href="/leaderboard" style={{ color: "#8a8aa0", textDecoration: "none" }}>Leaderboard</a>
          <a href="/docs" style={{ color: "#8a8aa0", textDecoration: "none" }}>Docs</a>
          <WalletMultiButton
            style={{
              background: "#14141f",
              color: "#e8e8f0",
              fontSize: 12,
              height: 36,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid #252540",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
            }}
          />
        </div>
      </div>

      <div className="arcade-layout" style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 16px 24px", gap: 16 }}>
        {/* ── LEFT: game scene ── */}
        <div>
          {/* View selector — above the board. Tri-toggle: TV · TPS · FPS */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", padding: 3, background: "#0c0c14", border: "1px solid #252540", borderRadius: 10 }}>
              {([
                { key: "top",    label: "🗺️ TV" },
                { key: "tps-p1", label: "🎥 TPS" },
                { key: "fpv-p1", label: "👁 FPS" },
              ] as { key: SnakeCamera; label: string }[]).map((opt) => {
                const active = view === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => { setView(opt.key); sfx.uiClick(); }}
                    style={{
                      padding: "7px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      borderRadius: 7,
                      border: "none",
                      background: active ? "linear-gradient(135deg, #4fc3f7, #14F195)" : "transparent",
                      color: active ? "#020614" : "#8a8aa0",
                      cursor: "pointer",
                      fontFamily: "'Space Grotesk', sans-serif",
                      transition: "background 120ms",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { const m = !sfx.isMuted(); sfx.setMuted(m); setMuted(m); }}
              title={muted ? "Sound off — click to unmute (M)" : "Sound on — click to mute (M)"}
              style={{
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                border: "1px solid #252540",
                background: "#0c0c14",
                color: muted ? "#6a6a80" : "#14F195",
                cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {muted ? "🔇 Muted" : "🔊 Sound"}
            </button>
          </div>
          <div ref={boardRef} className="arcade-board" style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid #252540", background: "#020614", touchAction: "none" }}>
            {sceneState ? (
              <CyberSnake3DScene state={sceneState} view={view} />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: 24,
                  overflow: "hidden",
                  background:
                    "radial-gradient(ellipse at center, rgba(79,195,247,0.08) 0%, rgba(2,6,20,0) 60%)",
                }}
              >
                {/* Animated grid — subtle scanline pulse so the board never looks dead. */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                      "linear-gradient(rgba(79,195,247,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(79,195,247,0.05) 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                    maskImage:
                      "radial-gradient(ellipse at center, black 0%, transparent 70%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse at center, black 0%, transparent 70%)",
                    animation: "csScanline 6s ease-in-out infinite",
                  }}
                />

                <div
                  style={{
                    fontSize: 56,
                    fontWeight: 900,
                    color: "#4fc3f7",
                    letterSpacing: 6,
                    textShadow:
                      "0 0 22px rgba(79,195,247,0.5), 0 0 48px rgba(79,195,247,0.25)",
                    animation: "csTitleGlow 2.6s ease-in-out infinite",
                    zIndex: 1,
                  }}
                >
                  CYBER SNAKE
                </div>

                {/* Controls — keyboard chips instead of plain text */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", zIndex: 1, flexWrap: "wrap", justifyContent: "center" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <KeyChip>↑</KeyChip>
                    <KeyChip>←</KeyChip>
                    <KeyChip>↓</KeyChip>
                    <KeyChip>→</KeyChip>
                  </div>
                  <span style={{ color: "#5a5a70", fontSize: 12 }}>or</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <KeyChip>W</KeyChip>
                    <KeyChip>A</KeyChip>
                    <KeyChip>S</KeyChip>
                    <KeyChip>D</KeyChip>
                  </div>
                  <span style={{ color: "#5a5a70", fontSize: 12 }}>·</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <KeyChip>V</KeyChip>
                    <span style={{ color: "#8a8aa0", fontSize: 12 }}>toggle view</span>
                  </div>
                </div>

                <button
                  onClick={startNewGame}
                  style={{
                    marginTop: 8,
                    padding: "14px 36px",
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    background: "linear-gradient(135deg, #14F195, #4fc3f7)",
                    color: "#020614",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    boxShadow: "0 0 28px rgba(20,241,149,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                    animation: "csStartPulse 2s ease-in-out infinite",
                    zIndex: 1,
                  }}
                >
                  ▶ Start Game
                </button>

                <div style={{ fontSize: 11, color: "#5a5a70", zIndex: 1, textAlign: "center", maxWidth: 320 }}>
                  Free to play — on-chain scoring optional at game over.
                </div>

                <style>{`
                  @keyframes csTitleGlow {
                    0%, 100% { text-shadow: 0 0 22px rgba(79,195,247,0.5), 0 0 48px rgba(79,195,247,0.25); }
                    50%      { text-shadow: 0 0 34px rgba(79,195,247,0.9), 0 0 72px rgba(79,195,247,0.5); }
                  }
                  @keyframes csStartPulse {
                    0%, 100% { box-shadow: 0 0 28px rgba(20,241,149,0.35), inset 0 1px 0 rgba(255,255,255,0.2); transform: scale(1); }
                    50%      { box-shadow: 0 0 44px rgba(20,241,149,0.65), inset 0 1px 0 rgba(255,255,255,0.2); transform: scale(1.02); }
                  }
                  @keyframes csScanline {
                    0%, 100% { opacity: 0.55; background-position: 0 0, 0 0; }
                    50%      { opacity: 0.85; background-position: 0 32px, 32px 0; }
                  }
                `}</style>
              </div>
            )}

            {/* HUD overlay — score + tick + hunger/move warnings, top-left */}
            {g && g.status === "active" && (
              <div style={{ position: "absolute", top: 14, left: 14, color: "#e8e8f0", fontFamily: "monospace", fontSize: 13, background: "rgba(2,6,20,0.85)", padding: "8px 12px", borderRadius: 8, border: "1px solid #252540", minWidth: 150 }}>
                <div>score <span style={{ color: "#ffd24a", fontSize: 16, fontWeight: 700 }}>{g.score}</span></div>
                <div style={{ color: "#8a8aa0", marginTop: 4 }}>len {g.len} · tick {g.tick}</div>
                {(() => {
                  const ticksLeft = FOOD_STARVATION_TICKS - g.ticksSinceLastFood;
                  const secsLeft = Math.ceil(ticksLeft / (1000 / TICK_MS));
                  if (g.ticksSinceLastFood >= FOOD_WARNING_TICKS) {
                    const urgent = ticksLeft <= 35; // last ~5s
                    return (
                      <div style={{ color: urgent ? "#ff5230" : "#ff9a40", marginTop: 4, fontWeight: 700, animation: urgent ? "pulse 0.6s ease-in-out infinite" : "none" }}>
                        🍎 starving · {secsLeft}s
                      </div>
                    );
                  }
                  return null;
                })()}
                {g.moveLog.length >= MOVE_CHANGE_WARN && !g.moveLogCapped && (
                  <div style={{ color: "#ff9a40", marginTop: 4, fontSize: 11 }}>
                    ⚠ moves {g.moveLog.length}/{MAX_MOVE_CHANGES}
                  </div>
                )}
                {g.moveLogCapped && (
                  <div style={{ color: "#ff5230", marginTop: 4, fontSize: 11, fontWeight: 700 }}>
                    ⚠ move-log full · replay will truncate
                  </div>
                )}
              </div>
            )}
            {/* (Corner view button removed — tri-selector sits above the board.) */}

            {/* CRASH overlay */}
            {g && g.status === "crashed" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(5,5,20,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 20 }}>
                {g.ticksSinceLastFood >= FOOD_STARVATION_TICKS ? (
                  <>
                    <div style={{ fontSize: 54, fontWeight: 900, color: "#ff9a40", letterSpacing: 4, textShadow: "0 0 20px rgba(255,154,64,0.6)" }}>STARVED</div>
                    <div style={{ fontSize: 12, color: "#8a8aa0" }}>Eat food within 30 seconds or the snake dies of hunger.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 54, fontWeight: 900, color: "#ff5230", letterSpacing: 4, textShadow: "0 0 20px rgba(255,82,48,0.6)" }}>CRASHED</div>
                )}
                <div style={{ fontSize: 14, color: "#8a8aa0" }}>
                  Score <span style={{ color: "#ffd24a", fontWeight: 700, fontSize: 18 }}>{g.score}</span> ·
                  Continues used <span style={{ color: "#ff9a40", fontWeight: 700 }}>{g.continuesUsed}</span>
                </div>

                {/* wallet-aware action row — progressive disclosure UX */}
                {connected ? (
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
                    onContinue={onPaidContinue}
                    onNewGame={startNewGame}
                    continueCost={continueCost}
                  />
                ) : (
                  <div style={{ display: "flex", gap: 14, marginTop: 6, flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "#8a8aa0" }}>
                      Connect wallet to save on-chain · or keep playing locally
                    </div>
                    <div style={{ display: "flex", gap: 14 }}>
                      <button onClick={continueGame} style={btnSecondary}>
                        Continue free (no wallet)
                      </button>
                      <button onClick={startNewGame} style={btnPrimary}>New Game</button>
                    </div>
                  </div>
                )}

                {onchainError && (
                  <div style={{ fontSize: 11, color: "#ff5252", maxWidth: 420, textAlign: "center", marginTop: 4 }}>
                    ⚠ {onchainError}
                  </div>
                )}
                {(lastSaveSig || lastVerifySig || lastReceiptSig) && (
                  <div style={{ fontSize: 10, color: "#8a8aa0", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
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
                <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                  local leaderboard updated · program <code>{ARCADE_PROGRAM_ID.toBase58().slice(0, 8)}…</code> on devnet
                </div>
              </div>
            )}
          </div>

          {/* Mobile D-pad — only shown on touch devices via CSS. Same handlers as swipe + keyboard. */}
          <div className="arcade-dpad" aria-hidden={false}>
            <button className="dpad-btn dpad-up"    aria-label="Up"    onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_N); }}>▲</button>
            <button className="dpad-btn dpad-left"  aria-label="Left"  onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_W); }}>◀</button>
            <button className="dpad-btn dpad-right" aria-label="Right" onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_E); }}>▶</button>
            <button className="dpad-btn dpad-down"  aria-label="Down"  onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_S); }}>▼</button>
          </div>

          <style>{`
            @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }

            /* Board responsive height — keeps a pleasant aspect ratio across
               phones, tablets, desktops. Mobile is landscape-friendly too. */
            .arcade-board {
              height: 600px;
              min-height: 360px;
            }
            @media (max-width: 900px) {
              .arcade-board { height: 70vh; max-height: 560px; }
            }
            @media (max-width: 600px) {
              .arcade-board { height: 62vh; min-height: 320px; }
            }

            /* Layout: sidebar on wide, stacked on mobile. */
            .arcade-layout {
              display: grid;
              grid-template-columns: 1fr 340px;
            }
            @media (max-width: 1100px) {
              .arcade-layout { grid-template-columns: 1fr; }
            }

            /* D-pad — hidden on wide screens (keyboard-only), shown on touch. */
            .arcade-dpad {
              display: none;
              position: relative;
              width: min(240px, 60%);
              margin: 14px auto 0;
              aspect-ratio: 3 / 2;
            }
            @media (hover: none) and (pointer: coarse), (max-width: 900px) {
              .arcade-dpad { display: block; }
            }
            .dpad-btn {
              position: absolute;
              width: 33.33%;
              height: 50%;
              border: 1px solid #2a3f55;
              background: linear-gradient(180deg, rgba(20,241,149,0.12), rgba(79,195,247,0.08));
              color: #cfe3ff;
              font-size: 22px;
              font-weight: 800;
              border-radius: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              -webkit-tap-highlight-color: transparent;
              user-select: none;
              touch-action: manipulation;
              font-family: 'Space Grotesk', sans-serif;
              transition: transform 80ms ease, background 120ms;
            }
            .dpad-btn:active {
              transform: scale(0.94);
              background: linear-gradient(180deg, rgba(20,241,149,0.28), rgba(79,195,247,0.18));
            }
            .dpad-up    { top: 0;    left: 33.33%; }
            .dpad-down  { top: 50%;  left: 33.33%; }
            .dpad-left  { top: 25%;  left: 0;      height: 50%; }
            .dpad-right { top: 25%;  right: 0;     height: 50%; }
          `}</style>
          <div style={{ marginTop: 14, padding: "12px 14px", background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, fontSize: 12, color: "#8a8aa0", lineHeight: 1.6 }}>
            <strong style={{ color: "#4fc3f7" }}>Controls:</strong> arrow keys / WASD · swipe on mobile · <kbd style={{ padding: "1px 6px", background: "#14141f", border: "1px solid #2a3f55", borderRadius: 3, fontSize: 10 }}>V</kbd> cycle view · <kbd style={{ padding: "1px 6px", background: "#14141f", border: "1px solid #2a3f55", borderRadius: 3, fontSize: 10 }}>M</kbd> mute · eat gold food to grow · avoid walls + yourself<br />
            <strong style={{ color: "#ff9a40" }}>Hunger:</strong> eat food within 30s or snake starves · <strong style={{ color: "#ff9a40" }}>Moves:</strong> max 130 direction changes per session (keep replay compact)
          </div>
        </div>

        {/* ── RIGHT: leaderboard + info ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              🏆 Local top 10
            </div>
            {board.length === 0 ? (
              <div style={{ color: "#6a6a80", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                No scores yet — play to appear here.
              </div>
            ) : (
              <div>
                {/* Column header */}
                <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 64px 56px", gap: 8, fontSize: 10, color: "#555570", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>
                  <div>#</div>
                  <div>Score</div>
                  <div style={{ textAlign: "right" }}>Cont.</div>
                  <div style={{ textAlign: "right" }}>Time</div>
                </div>
                {board.map((e, i) => (
                  <div key={`${e.at}-${i}`} style={{
                    display: "grid",
                    gridTemplateColumns: "30px 1fr 64px 56px",
                    gap: 8,
                    padding: "8px 2px",
                    borderBottom: i < board.length - 1 ? "1px solid #1a1a28" : "none",
                    alignItems: "center",
                    background: e.continues === 0 ? "linear-gradient(90deg, rgba(255,215,64,0.08), transparent)" : "transparent",
                  }}>
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: i === 0 ? "#ffd740" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "#6a6a80",
                      fontFamily: "monospace",
                    }}>{i + 1}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: e.continues === 0 ? "#ffd24a" : "#e8e8f0", fontFamily: "monospace" }}>
                      {e.score.toLocaleString()}
                      {e.continues === 0 && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: "#ffd740", letterSpacing: 1, textTransform: "uppercase", fontWeight: 800 }}>1CC</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: e.continues === 0 ? "#6a6a80" : "#ff9a40", fontFamily: "monospace", textAlign: "right" }}>
                      {e.continues > 0 ? `🪙 ${e.continues}` : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "#6a6a80", fontFamily: "monospace", textAlign: "right" }}>{e.duration_sec}s</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ArcadeLeaderboard
            gameSlug="cyber-snake"
            limit={10}
            highlightWallet={publicKey?.toBase58() ?? null}
          />

          <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              On-chain actions
            </div>
            <div style={{ fontSize: 11, color: "#6a6a80", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Per action (Gamerplex fee)</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#a8a8c0", lineHeight: 1.7 }}>
              <li><strong style={{ color: "#4fc3f7" }}>Save score — $0.05</strong> · GPX5 memo, permanent</li>
              <li><strong style={{ color: "#ffd740" }}>Save replay — $0.15</strong> · 3× base · full move log → 🏆</li>
              <li><strong style={{ color: "#9945FF" }}>Mint cNFT — $0.25</strong> · 5× base · tradeable NFT (v1.2)</li>
              <li>Continue — $0.05 × 2ⁿ · exponential per crash</li>
            </ul>
            <div style={{ fontSize: 11, color: "#6a6a80", marginTop: 12, marginBottom: 4, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>One-time (per wallet)</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#a8a8c0", lineHeight: 1.7 }}>
              <li>PlayerProfile verification — <strong style={{ color: "#e8e8f0" }}>~$0.41 refundable Solana rent</strong> (no Gamerplex fee)</li>
            </ul>
            <div style={{ fontSize: 10, color: "#555", marginTop: 10, lineHeight: 1.5 }}>
              Plus Solana network gas ~$0.001/tx. Paid in USDC to the treasury, auditable on-chain.
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9945FF", letterSpacing: 2, textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>
              Coming next
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#a8a8c0", lineHeight: 1.7 }}>
              <li>cNFT mint via Metaplex Bubblegum (v1.2)</li>
              <li>Affiliate 20% cut on referred spend</li>
              <li>SNS avatar + cosmetic skins</li>
              <li>Global on-chain leaderboard</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Progressive upgrade stack (value-first sales UX) ──────────────────
//
// Sales principles applied:
//  • Free option always primary ("Play again" is the largest non-paid action)
//  • Single adaptive CTA advances the user along the 4-tier progression,
//    never overwhelming with parallel upsells
//  • Value-first copy (what the user GETS, not what the fee is for)
//  • Advanced toggle reveals all 4 tiers for users who want the full menu
//  • Running "total spent this run" transparency; never hidden cost surprises
//  • No urgency, no dark patterns, no pre-checked boxes, clean "skip" path
type StackProps = {
  busy: null | "save" | "verify" | "receipt" | "continue";
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
  onContinue: () => void;
  onNewGame: () => void;
  continueCost: string;
};

function ProgressiveUpgradeStack(p: StackProps) {
  // Determine the "next tier" to offer as the primary upsell CTA.
  const nextTier: 1 | 2 | 3 | 4 | null = !p.savedThisRun
    ? 1
    : !p.verifiedThisRun
    ? 2
    : !p.ownedThisRun
    ? 3
    : 4; // once T3 done, T4 is next (but disabled pending v1.3)

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
      valueLine: "Global leaderboard forever",
    },
    2: {
      label: p.busy === "verify" ? "Saving replay…" : "Add replay proof · $0.15",
      why: "Full move log committed on-chain. Anyone can replay your run and cryptographically verify the score — you get the 🏆 VERIFIED badge.",
      action: p.onVerify,
      disabled: p.busy !== null,
      busy: p.busy === "verify",
      accent: "#ffd740",
      valueLine: "Cryptographically provable run",
    },
    3: {
      label: p.busy === "receipt" ? "Minting receipt…" : "Claim ownership · $0.25 + ~$0.33 rent",
      why: "A transferable on-chain certificate of your run. Keep it, sell it on marketplaces later, or refund the rent by closing it. Your name as original player stays forever.",
      action: p.onMintReceipt,
      disabled: p.busy !== null,
      busy: p.busy === "receipt",
      accent: "#c99aff",
      valueLine: "Owned, tradeable, refundable",
    },
    4: {
      label: "Mint as cNFT · $0.50 (v1.3)",
      why: "Your run as a tradeable Solana NFT on Magic Eden / Tensor. Ships in v1.3 with Metaplex Bubblegum integration.",
      action: p.onWrapCnft,
      disabled: true,
      busy: false,
      accent: "#9945FF",
      valueLine: "Coming in v1.3",
    },
  }[nextTier ?? 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", width: "100%", maxWidth: 480 }}>
      {/* Progression pills — shows what's already unlocked */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#6a6a80", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
        <TierPill done={p.savedThisRun} busy={p.busy === "save"} label="1· Saved" />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={p.verifiedThisRun} busy={p.busy === "verify"} label="2· Verified" pending={!p.savedThisRun} />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={p.ownedThisRun} busy={p.busy === "receipt"} label="3· Owned" pending={!p.verifiedThisRun} />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={false} busy={false} label="4· cNFT" pending={true} />
      </div>

      {/* Primary adaptive CTA */}
      {nextTier !== null && nextTier <= 4 && (
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
      )}

      {/* Secondary always-visible: new game + paid continue */}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          onClick={p.onContinue}
          disabled={p.busy !== null}
          style={p.busy === "continue" ? btnBusy : btnSecondarySmall}
          title="Resume this run from death position. Exponential per crash — each continue costs twice the last."
        >
          {p.busy === "continue" ? "Processing…" : `Continue · $${p.continueCost}`}
        </button>
        <button onClick={p.onNewGame} disabled={p.busy !== null} style={btnPrimary}>
          New game
        </button>
      </div>

      {/* Advanced disclosure */}
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
            Your score is already saved to your browser; on-chain is for permanence + ownership.
          </div>
        </div>
      )}
    </div>
  );
}

function KeyChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 28,
        height: 28,
        padding: "0 8px",
        borderRadius: 6,
        border: "1px solid #2a3f55",
        background: "linear-gradient(180deg, #0e1a2b, #06101e)",
        color: "#cfe3ff",
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {children}
    </span>
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

// ── Styles ─────────────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #4fc3f7, #14F195)",
  color: "#020614",
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
const btnSmall: React.CSSProperties = {
  background: "rgba(12,12,20,0.85)",
  color: "#e8e8f0",
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 700,
  border: "1px solid #252540",
  cursor: "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
};
const btnGhostDisabled: React.CSSProperties = {
  background: "#14141f",
  color: "#6a6a80",
  padding: "12px 24px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  border: "1px solid #252540",
  cursor: "not-allowed",
  opacity: 0.7,
  fontFamily: "'Space Grotesk', sans-serif",
};
const btnSecondary: React.CSSProperties = {
  background: "#14141f",
  color: "#e8e8f0",
  padding: "11px 20px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  border: "1px solid #4fc3f740",
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
const btnGold: React.CSSProperties = {
  background: "linear-gradient(135deg, #ffd740, #ff9a40)",
  color: "#050508",
  padding: "11px 20px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
  fontFamily: "'Space Grotesk', sans-serif",
};
const btnBusy: React.CSSProperties = {
  background: "#14141f",
  color: "#8a8aa0",
  padding: "11px 20px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  border: "1px solid #252540",
  cursor: "wait",
  fontFamily: "'Space Grotesk', sans-serif",
  opacity: 0.7,
};
const btnGhostDone: React.CSSProperties = {
  background: "#0a1a0d",
  color: "#14F195",
  padding: "11px 20px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  border: "1px solid #14F19540",
  cursor: "default",
  fontFamily: "'Space Grotesk', sans-serif",
};
