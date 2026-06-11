"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import ModeToggle from "../../../../components/games/ModeToggle";
import { BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { getSfx } from "../../../../lib/arcade/sfx";
import { fetchArcadeScore, shortAddr, type ArcadeScoreDetail } from "../../../../lib/arcade/leaderboard";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
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
  receiptPda,
  encodeMoveLog,
  sha256,
  sigToBytes,
  getTreasuryWallet,
  CATEGORY,
  SCORE_COMMIT_MICRO_USD,
  VERIFIED_COMMIT_MICRO_USD,
  REPLAY_RECEIPT_MICRO_USD,
  CNFT_WRAP_MICRO_USD,
  ARCADE_PROGRAM_ID,
  ARCADE_NETWORK,
  CYBER_SNAKE_GAME_ID,
} from "../../../../lib/arcade/client";
import { buildSaveScorePaymentIxs } from "../../../../lib/arcade/save-score-payment";
import { PAYMENT_TOKENS, type PaymentTokenDef } from "../../../../lib/arcade/tokens";
import PaymentMethodPicker from "../../../../components/arcade/PaymentMethodPicker";
import { getStoredReferrer } from "../../../../lib/arcade/referral";
import { submitReplay } from "@gamerplex/sdk/arcade";
import ReferrerBanner from "../../../../components/arcade/ReferrerBanner";
import { ArcadeLeaderboard } from "../../../arcade/_components/ArcadeLeaderboard";

const EXPLORER_SUFFIX = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;

const CyberSnake3DScene = dynamic(() => import("./CyberSnake3DScene"), { ssr: false });
const CyberSnake2DScene = dynamic(() => import("./CyberSnake2DScene"), { ssr: false });

const GRID = 32;
const MAX_LEN = 256;
const START_LEN = 3;
const TICK_MS = 140;
const DIR_N = 0, DIR_E = 1, DIR_S = 2, DIR_W = 3;
// Snake starves if it doesn't eat within this many ticks (~30s).
const FOOD_STARVATION_TICKS = 210;
const FOOD_WARNING_TICKS = 140;
// Move-log cap so GPX5R memo always fits in MAX_MOVE_LOG_BYTES=400.
const MAX_MOVE_CHANGES = 130;
const MOVE_CHANGE_WARN = 110;

function makeRng(seedBytes: Uint8Array): () => number {
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

interface GameState {
  seed: Uint8Array;
  body: number[];
  headIdx: number;
  len: number;
  dir: number;
  queuedDir: number;
  foodPos: number;
  grid: Uint8Array;
  tick: number;
  score: number;
  status: "active" | "crashed" | "paused" | "gameover";
  startedAt: number;
  moveLog: Array<{ tick: number; dir: number }>;
  rng: () => number;
  continuesUsed: number;
  ticksSinceLastFood: number;
  moveLogCapped: boolean;
}

function freshGame(seed: Uint8Array): GameState {
  const rng = makeRng(seed);
  const body = new Array<number>(MAX_LEN).fill(0);
  const grid = new Uint8Array(GRID * GRID);
  const startRow = GRID / 2;
  const startCol = GRID / 4;
  for (let i = 0; i < START_LEN; i++) {
    const pos = startRow * GRID + (startCol - (START_LEN - 1 - i));
    body[i] = pos;
    grid[pos] = 1;
  }
  const headIdx = START_LEN;
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
  if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return null;
  return nr * GRID + nc;
}

function tickGame(g: GameState): GameState {
  if (g.status !== "active") return g;

  if (g.ticksSinceLastFood >= FOOD_STARVATION_TICKS) {
    g.status = "crashed";
    return g;
  }

  if (g.queuedDir !== opposite(g.dir)) g.dir = g.queuedDir;
  if (g.dir !== g.moveLog[g.moveLog.length - 1]?.dir) {
    if (g.moveLog.length < MAX_MOVE_CHANGES) {
      g.moveLog.push({ tick: g.tick, dir: g.dir });
    } else {
      g.moveLogCapped = true;
    }
  }

  const headPos = g.body[(g.headIdx + MAX_LEN - 1) % MAX_LEN];
  const nextPos = stepDir(headPos, g.dir);

  if (nextPos === null) {
    g.status = "crashed";
    return g;
  }

  const eating = nextPos === g.foodPos;

  // Tail cell vacates this tick when not eating, so collision with tailPos is OK.
  const tailIdx = (g.headIdx + MAX_LEN - g.len) % MAX_LEN;
  const tailPos = g.body[tailIdx];
  if (g.grid[nextPos] === 1 && !(nextPos === tailPos && !eating)) {
    g.status = "crashed";
    return g;
  }

  g.body[g.headIdx] = nextPos;
  g.headIdx = (g.headIdx + 1) % MAX_LEN;
  g.grid[nextPos] = 1;

  if (eating) {
    g.len++;
    g.score += 10 + Math.floor(g.len / 5);
    g.ticksSinceLastFood = 0;
    let newFood = g.foodPos;
    for (let attempts = 0; attempts < 200; attempts++) {
      const candidate = g.rng() % (GRID * GRID);
      if (g.grid[candidate] === 0) {
        newFood = candidate;
        break;
      }
    }
    g.foodPos = newFood;
    if (g.len > MAX_LEN) g.len = MAX_LEN;
  } else {
    g.grid[tailPos] = 0;
    g.ticksSinceLastFood++;
  }

  g.tick++;
  return g;
}

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
  // 0-continues first (1CC), then score desc.
  board.sort((a, b) => {
    if (a.continues !== b.continues) return a.continues - b.continues;
    return b.score - a.score;
  });
  const top = board.slice(0, 10);
  saveLocalBoard(top);
  return top;
}

function toSceneState(g: GameState) {
  return {
    bodyP1: Array.from(g.body),
    bodyP2: new Array<number>(MAX_LEN).fill(0),
    headIdxP1: g.headIdx,
    headIdxP2: 0,
    lenP1: g.len,
    lenP2: 0,
    dirP1: g.dir,
    dirP2: 0,
    foodPos: g.foodPos,
    status: g.status === "active" ? 1 : 2,
    winnerFlag: 0,
    tick: g.tick,
  };
}

type SnakeCamera = "top" | "tps-p1" | "fpv-p1" | "2d-top";

export default function CyberSnakeSolo() {
  const [view, setView] = useState<SnakeCamera>("top");
  const [tick, setTick] = useState(0);
  const sfx = useMemo(() => getSfx(), []);
  const [muted, setMuted] = useState<boolean>(false);
  useEffect(() => { setMuted(sfx.isMuted()); }, [sfx]);
  const boardRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<GameState["status"] | null>(null);
  const prevScoreRef = useRef<number>(0);
  const prevDirRef = useRef<number>(DIR_E);
  const [viewKey, setViewKey] = useState(0);
  const isFirstViewRender = useRef(true);
  useEffect(() => {
    if (isFirstViewRender.current) { isFirstViewRender.current = false; return; }
    setViewKey((k) => k + 1);
  }, [view]);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  }, []);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem("gp.snake.swipeHint.v1") === "1";
    const touchDevice =
      window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true
      || window.matchMedia?.("(max-width: 900px)").matches === true;
    if (!dismissed && touchDevice) setShowSwipeHint(true);
  }, []);
  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false);
    try { window.localStorage.setItem("gp.snake.swipeHint.v1", "1"); } catch {}
  }, []);
  const [board, setBoard] = useState<LocalScore[]>([]);
  const gameRef = useRef<GameState | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedRef = useRef<boolean>(false);

  // ?challenge=<sig> uses the challenger's exact seed once, then clears.
  const searchParams = useSearchParams();
  const [challenger, setChallenger] = useState<ArcadeScoreDetail | null>(null);
  const challengerSeedRef = useRef<Uint8Array | null>(null);
  useEffect(() => {
    const sig = searchParams?.get("challenge");
    if (!sig) return;
    let cancelled = false;
    fetchArcadeScore(sig).then((d) => {
      if (cancelled || !d) return;
      try {
        const seed = bs58.decode(d.seedB58);
        if (seed.length === 32) {
          challengerSeedRef.current = seed;
          setChallenger(d);
        }
      } catch {}
    });
    return () => { cancelled = true; };
  }, [searchParams]);

  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [profileExists, setProfileExists] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | "save" | "verify" | "receipt">(null);
  const [lastSaveSig, setLastSaveSig] = useState<string | null>(null);
  const [lastVerifySig, setLastVerifySig] = useState<string | null>(null);
  const [lastReceiptSig, setLastReceiptSig] = useState<string | null>(null);
  const [receiptNonce, setReceiptNonce] = useState<BN | null>(null);
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

  useEffect(() => {
    setBoard(loadLocalBoard());
  }, []);

  const startNewGame = useCallback(() => {
    sfx.unlock();
    sfx.start();
    let seed: Uint8Array;
    if (challengerSeedRef.current) {
      seed = challengerSeedRef.current;
      challengerSeedRef.current = null;
    } else {
      seed = generateSeed();
    }
    gameRef.current = freshGame(seed);
    savedRef.current = false;
    prevStatusRef.current = "active";
    prevScoreRef.current = 0;
    prevDirRef.current = DIR_E;
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
    g.ticksSinceLastFood = 0;
    for (let attempts = 0; attempts < 200; attempts++) {
      const candidate = g.rng() % (GRID * GRID);
      if (g.grid[candidate] === 0) { g.foodPos = candidate; break; }
    }
  }, []);

  // v1.4: default to USDC. Token picker UI ships in the next commit.
  const [paymentToken, setPaymentToken] = useState<PaymentTokenDef>(
    PAYMENT_TOKENS.find((t) => t.symbol === "USDC") ?? PAYMENT_TOKENS[0]
  );

  const onSaveOnChain = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !anchorWallet || !publicKey) return;
    setBusy("save");
    setOnchainError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const treasury = await getTreasuryWallet(program);
      const tx = new Transaction();

      if (profileExists === false || profileExists === null) {
        tx.add(
          await buildOpenProfileIx(program, publicKey, getStoredReferrer(publicKey))
        );
      }

      // v1.4: shared multi-token helper. Routes USDC/SOL/$GAME and applies
      // the 20% discount for $GAME automatically via contract-aware quote.
      const { ixs: paymentIxs } = await buildSaveScorePaymentIxs(
        program, connection, publicKey,
        {
          token: paymentToken,
          category: CATEGORY.SCORE_COMMIT,
          basePriceMicroUsd: new BN(SCORE_COMMIT_MICRO_USD),
          gameId: CYBER_SNAKE_GAME_ID,
          externalRef: "",
          treasury,
        },
      );
      paymentIxs.forEach((ix) => tx.add(ix));

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
      void submitReplay(sig, moveLogBytes).catch(() => {});
    } catch (e: any) {
      console.error("save on-chain failed:", e);
      setOnchainError(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }, [anchorWallet, publicKey, connection, profileExists, paymentToken]);

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

      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(VERIFIED_COMMIT_MICRO_USD)
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
        })
      );

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

      const usdcIxs = await buildUsdcTransferIxs(
        connection,
        publicKey,
        publicKey,
        treasury,
        new BN(REPLAY_RECEIPT_MICRO_USD)
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
        })
      );

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

  // Pauses while tab is hidden so the snake doesn't tick out of view.
  useEffect(() => {
    loopRef.current = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (g.status === "active") {
        tickGame(g);
        setTick((t) => t + 1);
      }
    }, TICK_MS);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, []);

  const queueDir = useCallback((nextDir: number) => {
    const g = gameRef.current;
    if (!g || g.status !== "active") return;
    if (nextDir !== opposite(g.dir) && nextDir !== g.queuedDir) {
      g.queuedDir = nextDir;
      sfx.turn();
      if (showSwipeHint) dismissSwipeHint();
    }
  }, [sfx, showSwipeHint, dismissSwipeHint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let nextDir: number | null = null;
      switch (e.key) {
        case "ArrowUp": case "w": case "W": nextDir = DIR_N; break;
        case "ArrowRight": case "d": case "D": nextDir = DIR_E; break;
        case "ArrowDown": case "s": case "S": nextDir = DIR_S; break;
        case "ArrowLeft": case "a": case "A": nextDir = DIR_W; break;
        case "v": case "V": {
          const order: SnakeCamera[] = ["top", "tps-p1", "fpv-p1", "2d-top"];
          const idx = order.indexOf(view);
          const next = order[(idx + 1) % order.length];
          setView(next);
          sfx.uiClick();
          break;
        }
        case "m": case "M": {
          const m = !sfx.isMuted();
          sfx.setMuted(m);
          setMuted(m);
          break;
        }
        case "f": case "F": {
          toggleFullscreen();
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
  }, [view, sfx, queueDir, toggleFullscreen]);

  // Touch swipe must listen on window because OrbitControls captures canvas touches.
  useEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;
    let startX = 0, startY = 0, startT = 0;
    let active = false;
    const SWIPE_MIN = 24;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (!target || !(boardEl.contains(target) || target === boardEl)) {
        active = false;
        return;
      }
      active = true;
      startX = t.clientX; startY = t.clientY; startT = Date.now();
      sfx.unlock();
    };
    const onEnd = (e: TouchEvent) => {
      if (!active || e.changedTouches.length === 0) { active = false; return; }
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      if (Date.now() - startT > 800) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        queueDir(dx > 0 ? DIR_E : DIR_W);
      } else {
        queueDir(dy > 0 ? DIR_S : DIR_N);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", () => { active = false; }, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [sfx, queueDir]);

  const haptic = useCallback((ms: number) => {
    if (typeof navigator === "undefined") return;
    const v: ((p: number) => boolean) | undefined = (navigator as any).vibrate?.bind(navigator);
    if (v) v(ms);
  }, []);

  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.status === "active" && g.score > prevScoreRef.current) {
      sfx.eat();
      haptic(18);
    }
    prevScoreRef.current = g.score;
    if (g.status === "crashed" && prevStatusRef.current === "active") {
      if (g.ticksSinceLastFood >= FOOD_STARVATION_TICKS) {
        sfx.starve();
        haptic(70);
      } else {
        sfx.crash();
        haptic(120);
      }
    }
    prevStatusRef.current = g.status;
  }, [tick, sfx, haptic]);

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

      <div className="arcade-layout" style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 16px 24px", gap: 16 }}>
        <div>
          {/* 2026: camera toggles hidden on mobile (3D views useless on small screens) — also tightens above-fold */}
          <div className="arcade-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div className="arcade-cam-toggle" style={{ display: "inline-flex", padding: 3, background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, flexWrap: "wrap" }}>
              {([
                { key: "top",    label: "🗺️ TV" },
                { key: "tps-p1", label: "🎥 TPS" },
                { key: "fpv-p1", label: "👁 FPS" },
                { key: "2d-top", label: "▦ 2D" },
              ] as { key: SnakeCamera; label: string }[]).map((opt) => {
                const active = view === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => { setView(opt.key); sfx.uiClick(); }}
                    style={{
                      padding: "7px 12px",
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
            <div style={{ display: "flex", gap: 8 }}>
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
                {muted ? "🔇" : "🔊"}
              </button>
              <button
                onClick={toggleFullscreen}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen (F)"}
                aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                style={{
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: "1px solid #252540",
                  background: "#0c0c14",
                  color: fullscreen ? "#14F195" : "#8a8aa0",
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {fullscreen ? "⤢" : "⛶"}
              </button>
            </div>
          </div>
          <div ref={boardRef} className="arcade-board" style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid #252540", background: "#020614", touchAction: "none" }}>
            {sceneState ? (
              view === "2d-top" ? (
                <CyberSnake2DScene state={sceneState} />
              ) : (
                <CyberSnake3DScene state={sceneState} view={view} />
              )
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

                {/* 2026: clamp keeps title tight on mobile, full glory on desktop */}
                <div
                  style={{
                    fontSize: "clamp(28px, 6vw, 56px)",
                    fontWeight: 900,
                    color: "#4fc3f7",
                    letterSpacing: "clamp(2px, 0.5vw, 6px)",
                    textShadow:
                      "0 0 22px rgba(79,195,247,0.5), 0 0 48px rgba(79,195,247,0.25)",
                    animation: "csTitleGlow 2.6s ease-in-out infinite",
                    zIndex: 1,
                  }}
                >
                  CYBER SNAKE
                </div>

                <div style={{ zIndex: 1 }}>
                  <ModeToggle
                    gameLabel="Cyber Snake"
                    active="arcade"
                    arcade={{ status: "live-devnet", href: "/play/cyber-snake?mode=arcade" }}
                    battle={{ status: "live-devnet", href: "/play/cyber-snake?mode=battle", programId: "EK8gFE1ojW61QuLTvy6dHyLxCq5yjCnauJz8eisNPTk3" }}
                  />
                </div>

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

                {challenger && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,154,64,0.4)",
                      background: "rgba(80,40,10,0.45)",
                      color: "#ffd24a",
                      fontFamily: "monospace",
                      fontSize: 13,
                      maxWidth: 420,
                      textAlign: "center",
                      zIndex: 1,
                      boxShadow: "0 0 20px rgba(255,154,64,0.18)",
                    }}
                  >
                    🏁 Challenge from <strong>{shortAddr(challenger.player)}</strong>
                    <div style={{ color: "#ff9a40", fontSize: 22, fontWeight: 800, marginTop: 2 }}>
                      score {challenger.score}
                    </div>
                    <div style={{ color: "#8a8aa0", fontSize: 11, marginTop: 4 }}>
                      Same seed · same food spawns · pure skill
                    </div>
                  </div>
                )}

                <button
                  onClick={startNewGame}
                  style={{
                    marginTop: 8,
                    padding: "14px 36px",
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    background: challenger
                      ? "linear-gradient(135deg, #ff9a40, #ffd24a)"
                      : "linear-gradient(135deg, #14F195, #4fc3f7)",
                    color: "#020614",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    boxShadow: challenger
                      ? "0 0 28px rgba(255,154,64,0.45), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "0 0 28px rgba(20,241,149,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                    animation: "csStartPulse 2s ease-in-out infinite",
                    zIndex: 1,
                  }}
                >
                  {challenger ? "▶ Accept Challenge" : "▶ Start Game"}
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

            {g && g.status === "active" && (
              <div style={{ position: "absolute", top: 14, left: 14, color: "#e8e8f0", fontFamily: "monospace", fontSize: 13, background: "rgba(2,6,20,0.85)", padding: "8px 12px", borderRadius: 8, border: "1px solid #252540", minWidth: 150 }}>
                <div>score <span style={{ color: "#ffd24a", fontSize: 16, fontWeight: 700 }}>{g.score}</span></div>
                <div style={{ color: "#8a8aa0", marginTop: 4 }}>len {g.len} · tick {g.tick}</div>
                {(() => {
                  const ticksLeft = FOOD_STARVATION_TICKS - g.ticksSinceLastFood;
                  const secsLeft = Math.ceil(ticksLeft / (1000 / TICK_MS));
                  if (g.ticksSinceLastFood >= FOOD_WARNING_TICKS) {
                    const urgent = ticksLeft <= 35;
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

            {viewKey > 0 && (
              <div key={viewKey} className="view-toast">
                {view === "top" ? "TV · TOP-DOWN"
                 : view === "tps-p1" ? "TPS · THIRD-PERSON"
                 : view === "fpv-p1" ? "FPS · FIRST-PERSON"
                 : "2D · CLASSIC"}
              </div>
            )}

            {g && g.status === "active" && showSwipeHint && (
              <div className="swipe-hint" onClick={dismissSwipeHint} style={{ pointerEvents: "auto", cursor: "pointer" }}>
                swipe anywhere on the board<br/>
                or use the ◆ pad at the bottom-right
                <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 8 }}>tap to dismiss</div>
              </div>
            )}

            {g && g.status === "crashed" && (
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(13,0,26,0.7), rgba(5,5,20,0.96))", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 20 }}>
                {/* 2026: status eyebrow (tiny), score (hero), then action */}
                {g.ticksSinceLastFood >= FOOD_STARVATION_TICKS ? (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#ff9a40", letterSpacing: 3, textTransform: "uppercase" }}>● Starved</div>
                ) : (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#ff5230", letterSpacing: 3, textTransform: "uppercase" }}>● Game Over</div>
                )}
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
                }}>{g.score.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "#8a8aa0", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                  Your score
                  {g.ticksSinceLastFood >= FOOD_STARVATION_TICKS && <span style={{ marginLeft: 8, color: "#ff9a40" }}>· hunger killed you</span>}
                </div>

                <div style={{ width: "100%", maxWidth: 420, marginBottom: 4 }}>
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
                      onRestart={startNewGame}
                    />
                  </>
                ) : (
                  <div className="snake-end-actions" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 4, width: "100%", maxWidth: 420 }}>
                    <button
                      onClick={() => setWalletModalVisible(true)}
                      className="snake-end-save"
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
                    <div className="snake-end-secondary" style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                      <button onClick={startNewGame} style={{ ...btnSecondary, minHeight: 40 }}>↻ Try Again</button>
                      <a href="/arcade" style={{ ...btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 40 }}>
                        ← Back
                      </a>
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
                {lastSaveSig && g && (
                  <ChallengeShareRow
                    sig={lastSaveSig}
                    score={g.score}
                  />
                )}
              </div>
            )}
          </div>

          {g && g.status === "active" && (
            <div className="arcade-dpad" aria-hidden={false}>
              <button className="dpad-btn dpad-up"    aria-label="Up"    onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_N); }}>▲</button>
              <button className="dpad-btn dpad-left"  aria-label="Left"  onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_W); }}>◀</button>
              <button className="dpad-btn dpad-right" aria-label="Right" onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_E); }}>▶</button>
              <button className="dpad-btn dpad-down"  aria-label="Down"  onPointerDown={(e) => { e.preventDefault(); queueDir(DIR_S); }}>▼</button>
            </div>
          )}

          <style>{`
            @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
            @keyframes viewToast { 0% { opacity: 0; transform: translate(-50%, -8px); } 15% { opacity: 1; transform: translate(-50%, 0); } 85% { opacity: 1; } 100% { opacity: 0; } }

            .arcade-board {
              height: 600px;
              min-height: 360px;
            }
            @media (max-width: 900px) {
              .arcade-board { height: 70vh; max-height: 560px; }
            }
            @media (max-width: 600px) {
              .arcade-board { height: 52vh; min-height: 280px; max-height: 420px; }
            }

            .arcade-layout {
              display: grid;
              grid-template-columns: 1fr 340px;
            }
            @media (max-width: 1100px) {
              .arcade-layout { grid-template-columns: 1fr; }
            }

            .arcade-dpad { display: none; }
            @media (hover: none) and (pointer: coarse), (max-width: 900px) {
              .arcade-dpad {
                display: block;
                position: fixed;
                bottom: env(safe-area-inset-bottom, 16px);
                right: 12px;
                width: min(180px, 44vw);
                aspect-ratio: 3 / 2;
                z-index: 50;
                pointer-events: none;
              }
              .arcade-dpad .dpad-btn { pointer-events: auto; }
            }
            @media (max-width: 420px) {
              .arcade-dpad {
                right: 50%;
                transform: translateX(50%);
                width: min(170px, 52vw);
              }
            }
            .dpad-btn {
              position: absolute;
              width: 33.33%;
              height: 50%;
              border: 1px solid rgba(79, 195, 247, 0.35);
              background: linear-gradient(180deg, rgba(20,241,149,0.22), rgba(79,195,247,0.14));
              color: #e8f3ff;
              font-size: 22px;
              font-weight: 800;
              border-radius: 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              -webkit-tap-highlight-color: transparent;
              user-select: none;
              touch-action: manipulation;
              font-family: 'Space Grotesk', sans-serif;
              transition: transform 80ms ease, background 120ms;
              backdrop-filter: blur(6px);
              box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
            }
            .dpad-btn:active {
              transform: scale(0.92);
              background: linear-gradient(180deg, rgba(20,241,149,0.42), rgba(79,195,247,0.28));
            }
            .dpad-up    { top: 0;    left: 33.33%; }
            .dpad-down  { top: 50%;  left: 33.33%; }
            .dpad-left  { top: 25%;  left: 0;      height: 50%; }
            .dpad-right { top: 25%;  right: 0;     height: 50%; }

            .swipe-hint {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              padding: 14px 22px;
              background: rgba(2, 6, 20, 0.82);
              border: 1px solid rgba(79, 195, 247, 0.4);
              border-radius: 12px;
              color: #e8f3ff;
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 0.3px;
              text-align: center;
              pointer-events: none;
              backdrop-filter: blur(6px);
              animation: pulse 2.4s ease-in-out 2;
              z-index: 40;
            }

            .view-toast {
              position: absolute;
              top: 14px;
              left: 50%;
              transform: translate(-50%, 0);
              padding: 6px 18px;
              background: rgba(2, 6, 20, 0.82);
              border: 1px solid rgba(20, 241, 149, 0.45);
              border-radius: 20px;
              color: #14F195;
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 2.5px;
              text-transform: uppercase;
              pointer-events: none;
              z-index: 30;
              animation: viewToast 900ms ease-out forwards;
            }
          `}</style>
          {/* 2026 minimalist controls — single line, expandable details */}
          <details style={{ marginTop: 12, padding: "10px 14px", background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, fontSize: 11, color: "#8a8aa0" }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
              <span style={{ color: "#4fc3f7", fontWeight: 700 }}>Controls</span>
              <span>arrow keys / WASD · swipe on mobile · <kbd style={{ padding: "1px 5px", background: "#14141f", border: "1px solid #2a3f55", borderRadius: 3, fontSize: 9 }}>M</kbd> mute</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#5a5a70" }}>more</span>
            </summary>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1a28", lineHeight: 1.6 }}>
              <strong style={{ color: "#ff9a40" }}>Hunger:</strong> eat within 30s or snake starves · <strong style={{ color: "#ff9a40" }}>Moves:</strong> max 130 direction changes per session
            </div>
          </details>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 2026: hide entirely when empty — no fake empty-state cards */}
          {board.length > 0 && <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              🏆 Local top 10
            </div>
            {false ? (
              <div style={{ color: "#6a6a80", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                No scores yet — play to appear here.
              </div>
            ) : (
              <div>
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
          </div>}

          <ArcadeLeaderboard
            gameSlug="cyber-snake"
            limit={10}
            highlightWallet={publicKey?.toBase58() ?? null}
          />

          <details style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 12, padding: "12px 16px" }}>
            <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: "#14F195", letterSpacing: 2, textTransform: "uppercase", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>💸 Save options · pricing</span>
              <span style={{ fontSize: 14, color: "#6a6a80" }}>+</span>
            </summary>
            <div style={{ marginTop: 10, fontSize: 12, color: "#a8a8c0", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#4fc3f7" }}>💾 Save score</span><b>$0.05</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#ffd740" }}>🏆 Save replay (verified)</span><b>$0.15</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: "#9945FF" }}>🎴 Mint cNFT receipt</span><b>$0.25</b></div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 8, lineHeight: 1.5 }}>
                Paid in USDC. ~$0.001/tx Solana gas. PlayerProfile setup ~$0.41 refundable rent (one-time per wallet).
              </div>
            </div>
          </details>
        </div>
      </div>

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
  const nextTier: 1 | 2 | 3 | 4 | null = !p.savedThisRun
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
      <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "#6a6a80", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
        <TierPill done={p.savedThisRun} busy={p.busy === "save"} label="1· Saved" />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={p.verifiedThisRun} busy={p.busy === "verify"} label="2· Verified" pending={!p.savedThisRun} />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={p.ownedThisRun} busy={p.busy === "receipt"} label="3· Owned" pending={!p.verifiedThisRun} />
        <span style={{ color: "#2a2a40" }}>›</span>
        <TierPill done={false} busy={false} label="4· cNFT" pending={true} />
      </div>

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

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <a
          href="/arcade"
          style={{ ...btnSecondarySmall, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          ← Back to arcade
        </a>
        <button onClick={p.onRestart} disabled={p.busy !== null} style={btnPrimary}>
          🔄 Restart
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

function ChallengeShareRow({ sig, score }: { sig: string; score: number }) {
  const [copied, setCopied] = useState(false);
  const link = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/play/cyber-snake?mode=arcade&challenge=${sig}`;
  }, [sig]);
  const tweetHref = useMemo(() => {
    const text = `🐍 Just scored ${score} on Cyber Snake. Beat me on the same seed?`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
  }, [link, score]);
  const onCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }, [link]);
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <button onClick={onCopy} style={btnSecondarySmall} aria-label="Copy challenge link">
        {copied ? "✓ link copied" : "🔗 Copy challenge link"}
      </button>
      <a
        href={tweetHref}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...btnSecondarySmall, textDecoration: "none", display: "inline-flex", alignItems: "center", color: "#7cd1ff", borderColor: "#1a3a4a" }}
      >
        🐦 Share on X
      </a>
    </div>
  );
}
