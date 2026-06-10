"use client";

// Cyber Snake Battle Mode — 2-player wagered match wired to CM v2.1 escrow.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import ModeToggle from "../../../../components/games/ModeToggle";
import { getSfx } from "../../../../lib/arcade/sfx";
import {
  CYBER_SNAKE_PROGRAM_ID,
  ER_RPC,
  L1_RPC,
  STATUS_WAITING,
  STATUS_ACTIVE,
  STATUS_FINISHED,
  WINNER_DRAW,
  WINNER_P1,
  WINNER_P2,
  DIR_N,
  DIR_E,
  DIR_S,
  DIR_W,
  type Direction,
  type GameStateDecoded,
  newGameId,
  gamePda,
  createLobby,
  joinLobby,
  delegateToEr,
  submitDirection,
  advanceTick,
  finishGame,
  pollState,
  subscribeState,
  buildShareLink,
  explorerUrl,
} from "./chain";
import {
  createWageredMarket,
  depositToMarket,
  resolveWageredMarket,
  readMarketSnapshot,
  marketPdaFromEventId,
  stakeToRaw,
  type Stake as WagerStake,
} from "../../../../lib/wagered-battle/client";

const SnakeBattleScene2D = dynamic(() => import("./SnakeBattleScene2D"), {
  ssr: false,
});

// ── Tunables ──────────────────────────────────────────────────────────
const TICK_MS = 200; // matches scene + intended battle pace
const POLL_MS = 220; // L1 poll fallback when no ER subscription
// Stake tiers shown in lobby. Real wagering is gated until CM v2.1 binding
// ships — for now this is just the price-anchor UI.
const STAKES = [0.5, 1, 5, 10] as const;
type Stake = typeof STAKES[number];

// ── Helpers ───────────────────────────────────────────────────────────
function shortAddr(pk: PublicKey | string | null | undefined): string {
  if (!pk) return "—";
  const s = typeof pk === "string" ? pk : pk.toBase58();
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function dirLabel(d: number): string {
  return d === DIR_N ? "N" : d === DIR_E ? "E" : d === DIR_S ? "S" : d === DIR_W ? "W" : "?";
}

function isOpposite(a: number, b: number): boolean {
  return (
    (a === DIR_N && b === DIR_S) ||
    (a === DIR_S && b === DIR_N) ||
    (a === DIR_E && b === DIR_W) ||
    (a === DIR_W && b === DIR_E)
  );
}

// ── Phases ────────────────────────────────────────────────────────────
type Phase =
  | "lobby-create"   // no match in URL, wallet may or may not be connected
  | "lobby-join"     // ?match=<id>, host has created, joiner sees details
  | "pre-match"      // both joined + delegated, waiting on click-Start
  | "match"          // active gameplay
  | "end";           // finished + state committed back to L1

type LogEntry = {
  msg: string;
  sig?: string;
  isEr?: boolean;
  type: "system" | "tx" | "error";
  t: number;
};

// ── Component ─────────────────────────────────────────────────────────
export default function CyberSnakeBattle() {
  const { connection: l1Conn } = useConnection();
  const wallet = useWallet();
  const params = useSearchParams();
  const matchParam = params.get("match");

  // Persisted ER connection — one Connection instance for the whole match.
  const erConnRef = useRef<Connection>(new Connection(ER_RPC, "processed"));

  // Phase + match identity
  const [phase, setPhase] = useState<Phase>(matchParam ? "lobby-join" : "lobby-create");
  const [stake, setStake] = useState<Stake>(1);
  const [gameId, setGameId] = useState<bigint | null>(
    matchParam ? safeBigInt(matchParam) : null,
  );
  const [game, setGame] = useState<PublicKey | null>(null);

  // Live game state (polled or subscribed)
  const [state, setState] = useState<GameStateDecoded | null>(null);

  // UX state
  const [busy, setBusy] = useState<string | null>(null); // status message during tx
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingDir, setPendingDir] = useState<Direction | null>(null);
  const [matchStart, setMatchStart] = useState<number | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [crankIsMe, setCrankIsMe] = useState<boolean>(true);

  // Wagered escrow state. CM v2.1 market PDA derives deterministically from
  // gameId-as-eventId so both wallets agree without URL surgery.
  const [marketReady, setMarketReady] = useState(false);
  const [p1Deposited, setP1Deposited] = useState(false);
  const [p2Deposited, setP2Deposited] = useState(false);
  const [resolved, setResolved] = useState(false);
  const marketPda = useMemo(() => (gameId ? marketPdaFromEventId(gameId) : null), [gameId]);

  // ── Init: derive PDA from gameId, init sfx ───────────────────────────
  useEffect(() => {
    if (gameId !== null && !game) {
      try {
        const [pda] = gamePda(gameId);
        setGame(pda);
      } catch (e) {
        // bad gameId — surface to user
        log(`Bad match id: ${(e as Error).message}`, "error");
      }
    }
  }, [gameId, game]);

  useEffect(() => {
    setMuted(getSfx().isMuted());
  }, []);

  const log = useCallback(
    (msg: string, type: LogEntry["type"] = "system", sig?: string, isEr?: boolean) => {
      setLogs((l) => [{ msg, sig, isEr, type, t: Date.now() }, ...l.slice(0, 99)]);
      // Cheap console mirror to make field debugging easier.
      // eslint-disable-next-line no-console
      console.log(`[snake-battle] ${msg}${sig ? ` | ${sig.slice(0, 16)}…` : ""}`);
    },
    [],
  );

  const sfx = useMemo(() => getSfx(), []);

  // ── Local side ────────────────────────────────────────────────────────
  const localSide: "p1" | "p2" | "viewer" = useMemo(() => {
    if (!wallet.publicKey || !state) return "viewer";
    if (state.p1.equals(wallet.publicKey)) return "p1";
    if (state.p2.equals(wallet.publicKey)) return "p2";
    return "viewer";
  }, [wallet.publicKey, state]);

  // ── Polling / subscription loop ───────────────────────────────────────
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;

    // Initial fetch
    pollState(l1Conn, erConnRef.current, game)
      .then((s) => {
        if (!cancelled && s) setState(s);
      })
      .catch(() => {});

    // Subscribe on ER (cheap; gives us live updates after delegation)
    try {
      unsub = subscribeState(erConnRef.current, game, (s) => {
        if (!cancelled) setState(s);
      });
    } catch {
      /* ER subscribe may not be available — fall back to polling */
    }

    // Polling fallback — covers L1 phase before delegation + ER hiccups.
    const pollT = setInterval(async () => {
      if (cancelled) return;
      try {
        const s = await pollState(l1Conn, erConnRef.current, game);
        if (s && !cancelled) setState(s);
      } catch {}
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (unsub) unsub();
      clearInterval(pollT);
    };
  }, [game, l1Conn]);

  // ── Phase transitions driven by state ────────────────────────────────
  useEffect(() => {
    if (!state) return;
    if (state.status === STATUS_ACTIVE) {
      // If we're not yet in match phase and this is a fresh join, advance.
      setPhase((p) => (p === "match" || p === "end" ? p : "pre-match"));
    } else if (state.status === STATUS_FINISHED) {
      setPhase("end");
    }
  }, [state]);

  // ── Crank loop — only when actively in match. Permissionless: anyone in
  // the room can call advance_tick. We let p1 be the primary cranker so we
  // don't double-tick from both browsers; p2 takes over if p1 falls behind.
  useEffect(() => {
    if (phase !== "match" || !game || !wallet.publicKey || !state) return;
    if (state.status !== STATUS_ACTIVE) return;

    // Default cranker policy: p1 cranks. p2 cranks if p1 hasn't ticked in
    // a while (rough liveness fallback). Either way `crankIsMe` gates the
    // local browser. Toggle in the UI to share crank load manually.
    const iAmCranker =
      crankIsMe &&
      ((localSide === "p1" && state.p1.equals(wallet.publicKey)) ||
        (localSide === "p2" && state.p2.equals(wallet.publicKey)));
    if (!iAmCranker) return;

    let cancelled = false;
    let lastSentTick = state.tick;
    const t = setInterval(async () => {
      if (cancelled) return;
      // Don't crank if state shows finished or we've raced ahead of network.
      const cur = state;
      if (!cur || cur.status !== STATUS_ACTIVE) return;
      if (cur.tick !== lastSentTick) {
        // Tick already advanced (likely peer cranked) — wait one cycle.
        lastSentTick = cur.tick;
        return;
      }
      try {
        const sig = await advanceTick(erConnRef.current, wallet, game);
        log(`tick advanced`, "tx", sig, true);
      } catch (e: any) {
        log(`crank failed: ${e.message?.slice(0, 80)}`, "error");
      }
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // We intentionally depend only on stable identifiers — if state.tick
    // changes we don't want to tear the interval down each tick. We read
    // the latest state via the closure on the interval boundary instead.
  }, [phase, game, wallet, state?.status, localSide, crankIsMe]);

  // ── Keyboard input ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "match" || !game || !wallet.publicKey) return;
    if (localSide === "viewer") return;

    const onKey = async (e: KeyboardEvent) => {
      let dir: Direction | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dir = DIR_N as Direction;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dir = DIR_E as Direction;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dir = DIR_S as Direction;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dir = DIR_W as Direction;
          break;
      }
      if (dir === null) return;
      e.preventDefault();
      await sendDir(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // sendDir is recreated each render but that's fine — handler closes
    // over latest via the listener swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, game, wallet.publicKey, localSide, state?.dirP1, state?.dirP2]);

  const sendDir = useCallback(
    async (dir: Direction) => {
      if (!game || !wallet.publicKey || !state) return;
      const cur = localSide === "p1" ? state.dirP1 : state.dirP2;
      if (isOpposite(cur, dir)) {
        // 180° — chain rejects. Don't burn a tx.
        log(`ignored 180° reverse (${dirLabel(cur)} → ${dirLabel(dir)})`, "error");
        return;
      }
      setPendingDir(dir);
      try {
        sfx.turn();
        const sig = await submitDirection(erConnRef.current, wallet, game, dir);
        log(`turn ${dirLabel(dir)}`, "tx", sig, true);
      } catch (e: any) {
        log(`turn failed: ${e.message?.slice(0, 80)}`, "error");
      }
    },
    [game, wallet, state, localSide, log, sfx],
  );

  // ── Lobby actions ─────────────────────────────────────────────────────
  const onCreateLobby = useCallback(async () => {
    if (!wallet.publicKey) {
      log("connect a wallet first", "error");
      return;
    }
    setBusy("creating lobby on devnet…");
    try {
      const id = newGameId();
      log(`generated game id ${id.toString()}`);
      const r = await createLobby(l1Conn, wallet, id);
      setGameId(r.gameId);
      setGame(r.game);
      log("lobby created", "tx", r.sig, false);
      // Stay on lobby-create UI — the page now shows the share link.
    } catch (e: any) {
      log(`create failed: ${e.message?.slice(0, 100)}`, "error");
    } finally {
      setBusy(null);
    }
  }, [wallet, l1Conn, log]);

  const onJoinLobby = useCallback(async () => {
    if (!wallet.publicKey || gameId === null || !game) {
      log("connect a wallet first", "error");
      return;
    }
    setBusy("joining lobby…");
    try {
      const r = await joinLobby(l1Conn, wallet, gameId);
      log("joined lobby", "tx", r.sig, false);
      // Joiner triggers the wagered market init (best-effort — both pubkeys
      // are now known, eventId = gameId so derivation matches across wallets).
      // We re-fetch state to get p1 from chain (the joiner doesn't have it yet).
      setBusy("creating skill-contest market on CM v2.1…");
      try {
        const fresh = await pollState(l1Conn, erConnRef.current, r.game);
        if (fresh) {
          const m = await createWageredMarket({
            gameSlug: "cyber-snake",
            p1: fresh.p1,
            p2: fresh.p2,
            gameStatePda: r.game,
            eventId: gameId,
          });
          log(`market created`, "tx", m.sig, false);
        }
      } catch (mErr: any) {
        log(`market init skipped: ${mErr.message?.slice(0, 80)}`, "error");
      }
      setBusy("delegating to MagicBlock ER…");
      const dsig = await delegateToEr(l1Conn, wallet, r.game);
      log("delegated to ER", "tx", dsig, false);
      setPhase("pre-match");
    } catch (e: any) {
      log(`join/delegate failed: ${e.message?.slice(0, 100)}`, "error");
    } finally {
      setBusy(null);
    }
  }, [wallet, l1Conn, gameId, game, log]);

  // Solo-test helper — host can also delegate (e.g. if joiner's machine is
  // offline). Visible after both players are in the lobby.
  const onHostDelegate = useCallback(async () => {
    if (!wallet.publicKey || !game) return;
    setBusy("delegating to MagicBlock ER…");
    try {
      const dsig = await delegateToEr(l1Conn, wallet, game);
      log("delegated to ER (host)", "tx", dsig, false);
      setPhase("pre-match");
    } catch (e: any) {
      log(`delegate failed: ${e.message?.slice(0, 100)}`, "error");
    } finally {
      setBusy(null);
    }
  }, [wallet, l1Conn, game, log]);

  const onStartMatch = useCallback(() => {
    sfx.start();
    setMatchStart(Date.now());
    setPhase("match");
  }, [sfx]);

  const onFinishGame = useCallback(async () => {
    if (!game || !wallet.publicKey) return;
    setBusy("committing final state to L1…");
    try {
      const sig = await finishGame(erConnRef.current, wallet, game);
      log("finish_game committed", "tx", sig, true);
    } catch (e: any) {
      log(`finish failed: ${e.message?.slice(0, 100)}`, "error");
    } finally {
      setBusy(null);
    }
  }, [game, wallet, log]);

  // Wagered escrow: stake into the CM v2.1 market for this match.
  const onWageredStake = useCallback(async () => {
    if (!wallet.publicKey || !marketPda) {
      log("connect a wallet first", "error");
      return;
    }
    setBusy(`staking $${stake} USDF…`);
    try {
      const sig = await depositToMarket({
        conn: l1Conn,
        wallet,
        market: marketPda,
        amount: stakeToRaw(stake as WagerStake),
      });
      log(`staked $${stake} USDF`, "tx", sig, false);
    } catch (e: any) {
      log(`stake failed: ${e.message?.slice(0, 100)}`, "error");
    } finally {
      setBusy(null);
    }
  }, [wallet, l1Conn, marketPda, stake, log]);

  // Permissionless: anyone calls resolve_market_from_game_pda after L1 commit.
  // Contract reads game_state.winner byte and pays the winner atomically.
  const onSettleMatch = useCallback(async () => {
    if (!wallet.publicKey || !marketPda || !state || !game) {
      log("nothing to settle", "error");
      return;
    }
    setBusy("settling match…");
    try {
      const sig = await resolveWageredMarket({
        conn: l1Conn,
        wallet,
        market: marketPda,
        gameSlug: "cyber-snake",
        gameStatePda: game,
        p1: state.p1,
        p2: state.p2,
      });
      log("market resolved + winner paid", "tx", sig, false);
      setResolved(true);
    } catch (e: any) {
      log(`settle failed: ${e.message?.slice(0, 100)}`, "error");
    } finally {
      setBusy(null);
    }
  }, [wallet, l1Conn, marketPda, state, game, log]);

  // Poll market existence + per-player deposit status while we have a market.
  useEffect(() => {
    if (!marketPda) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const snap = await readMarketSnapshot(l1Conn, marketPda);
        if (cancelled) return;
        setMarketReady(snap.exists);
        setP1Deposited(snap.p1Deposit > BigInt(0));
        setP2Deposited(snap.p2Deposit > BigInt(0));
        setResolved(snap.resolved);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [marketPda, l1Conn]);

  // Auto-finish when state.status flips to FINISHED on ER. Either player
  // can crank the commit; we don't double-fire if the peer already did.
  useEffect(() => {
    if (state?.status !== STATUS_FINISHED) return;
    if (busy) return;
    // Only one commit needed. Heuristic: p1 commits first; p2 only if p1
    // hasn't within ~3s. Cheap and adequate for this hackathon scope.
    if (localSide === "p1") {
      onFinishGame();
    } else if (localSide === "p2") {
      const t = setTimeout(() => onFinishGame(), 3000);
      return () => clearTimeout(t);
    }
  }, [state?.status, localSide, onFinishGame, busy]);

  // ── End-screen win/lose audio ────────────────────────────────────────
  const announcedRef = useRef<number | null>(null);
  useEffect(() => {
    if (state?.status !== STATUS_FINISHED) return;
    if (announcedRef.current === state.tick) return;
    announcedRef.current = state.tick;
    const won =
      (state.winnerFlag === WINNER_P1 && localSide === "p1") ||
      (state.winnerFlag === WINNER_P2 && localSide === "p2");
    if (won) sfx.eat();
    else sfx.crash();
  }, [state, localSide, sfx]);

  // ── Render ───────────────────────────────────────────────────────────
  const elapsed = matchStart && phase === "match" ? Math.floor((Date.now() - matchStart) / 1000) : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050508",
        color: "#e8e8f0",
        fontFamily: "'Space Grotesk', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 2026 minimalist top nav — matches home */}
      <nav className="top-nav" style={{ padding: "14px 24px", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <ModeToggle
          gameLabel="Cyber Snake"
          active="battle"
          arcade={{ status: "live-devnet", href: "/play/cyber-snake?mode=arcade" }}
          battle={{ status: "live-devnet", href: "/play/cyber-snake?mode=battle", programId: CYBER_SNAKE_PROGRAM_ID.toBase58() }}
        />
        <div className="nav-links">
          <button
            onClick={() => {
              const m = !muted;
              getSfx().setMuted(m);
              setMuted(m);
            }}
            style={iconBtn}
            title={muted ? "unmute" : "mute"}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
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

      {/* Main grid: board on the left, info panel on the right */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 18,
          padding: 18,
          maxWidth: 1480,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Left — board area */}
        <div
          style={{
            position: "relative",
            background: "#0a0a14",
            border: "1px solid #1c1c2c",
            borderRadius: 16,
            minHeight: 540,
            overflow: "hidden",
          }}
        >
          <SnakeBattleScene2D state={state} localSide={localSide} />

          {/* HUD overlay */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              pointerEvents: "none",
              gap: 12,
            }}
          >
            <PlayerCard
              label="P1"
              you={localSide === "p1"}
              addr={state?.p1}
              len={state?.lenP1}
              dir={state?.dirP1}
              color="#14F195"
            />
            <div
              style={{
                color: "#8a8aa0",
                fontFamily: "monospace",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 800, color: "#fff", fontSize: 18 }}>
                tick {state?.tick ?? 0}
              </div>
              {phase === "match" && (
                <div style={{ marginTop: 2 }}>
                  {Math.floor(elapsed / 60).toString().padStart(2, "0")}:
                  {(elapsed % 60).toString().padStart(2, "0")}
                </div>
              )}
              <div style={{ fontSize: 10, marginTop: 4, color: "#5a5a70" }}>
                {state ? statusName(state.status) : "no game"}
              </div>
            </div>
            <PlayerCard
              label="P2"
              you={localSide === "p2"}
              addr={state?.p2}
              len={state?.lenP2}
              dir={state?.dirP2}
              color="#ff4d6d"
            />
          </div>

          {/* Phase overlays */}
          {phase === "lobby-create" && !game && (
            <PhaseOverlay>
              <LobbyCreate
                wallet={wallet}
                stake={stake}
                setStake={setStake}
                onCreate={onCreateLobby}
                busy={busy}
                onShowHowTo={() => setShowHowTo(true)}
              />
            </PhaseOverlay>
          )}
          {phase === "lobby-create" && game && state && state.status === STATUS_WAITING && (
            <PhaseOverlay>
              <LobbyShare
                gameId={gameId!}
                game={game}
                state={state}
                onCopied={() => {
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 1200);
                }}
                shareCopied={shareCopied}
                onHostDelegate={onHostDelegate}
                busy={busy}
              />
            </PhaseOverlay>
          )}
          {phase === "lobby-join" && (
            <PhaseOverlay>
              <LobbyJoin
                wallet={wallet}
                state={state}
                gameId={gameId}
                onJoin={onJoinLobby}
                busy={busy}
              />
            </PhaseOverlay>
          )}
          {phase === "pre-match" && (
            <PhaseOverlay translucent>
              <PreMatch
                state={state}
                localSide={localSide}
                onStart={onStartMatch}
              />
            </PhaseOverlay>
          )}
          {phase === "end" && state && (
            <PhaseOverlay>
              <MatchEnd
                state={state}
                localSide={localSide}
                stake={stake}
                onFinishGame={onFinishGame}
                busy={busy}
              />
            </PhaseOverlay>
          )}
        </div>

        {/* Right — info / controls panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
          }}
        >
          {/* Connection card */}
          <Card title="Connection">
            <Row k="Cluster">devnet (L1) + magicblock (ER)</Row>
            <Row k="Program">{shortAddr(CYBER_SNAKE_PROGRAM_ID)}</Row>
            <Row k="Wallet">
              {wallet.publicKey ? shortAddr(wallet.publicKey) : "not connected"}
            </Row>
            {gameId !== null && (
              <Row k="Match">{gameId.toString().slice(0, 14)}…</Row>
            )}
            {game && <Row k="Game PDA">{shortAddr(game)}</Row>}
            <Row k="Side">{localSide}</Row>
          </Card>

          {/* Skill-contest escrow — CM v2.1. Equal entry, winner takes 98% of the prize pool. */}
          <Card title={`Escrow · CM v2.1`}>
            <Row k="Stake">${stake.toFixed(2)} USDF / side</Row>
            <Row k="Pot">${(stake * 2).toFixed(2)} USDF · 98% to winner</Row>
            <Row k="Market">
              {marketReady && marketPda ? shortAddr(marketPda) : "(awaiting joiner)"}
            </Row>
            <Row k="P1 staked">{p1Deposited ? "✓" : "—"}</Row>
            <Row k="P2 staked">{p2Deposited ? "✓" : "—"}</Row>
            {marketReady && wallet.publicKey && (() => {
              const isP1 = state?.p1.equals(wallet.publicKey);
              const isP2 = state?.p2.equals(wallet.publicKey);
              const myDeposited = (isP1 && p1Deposited) || (isP2 && p2Deposited);
              if (!isP1 && !isP2) return null;
              return (
                <button
                  onClick={onWageredStake}
                  disabled={!!busy || myDeposited}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: myDeposited ? "rgba(20, 241, 149, 0.12)" : "rgba(153, 69, 255, 0.18)",
                    border: `1px solid ${myDeposited ? "#14F195" : "#9945FF"}`,
                    color: myDeposited ? "#14F195" : "#c99aff",
                    borderRadius: 6,
                    cursor: myDeposited || busy ? "default" : "pointer",
                  }}
                >
                  {myDeposited ? `✓ Staked $${stake.toFixed(2)} USDF` : `💰 Stake $${stake.toFixed(2)} USDF`}
                </button>
              );
            })()}
            {state?.status === STATUS_FINISHED && marketReady && !resolved && (
              <button
                onClick={onSettleMatch}
                disabled={!!busy}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "rgba(255, 210, 74, 0.18)",
                  border: "1px solid #ffd24a",
                  color: "#ffd24a",
                  borderRadius: 6,
                  cursor: busy ? "default" : "pointer",
                }}
              >
                ⚖️ Settle match · pay winner
              </button>
            )}
            {resolved && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#14F195", textAlign: "center" }}>
                ✓ Settled — winner paid by contract
              </div>
            )}
          </Card>

          {/* Controls card */}
          <Card title="Controls">
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <Kbd>↑</Kbd>
              <Kbd>←</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>→</Kbd>
              <span style={{ color: "#5a5a70", fontSize: 11 }}>or</span>
              <Kbd>W</Kbd>
              <Kbd>A</Kbd>
              <Kbd>S</Kbd>
              <Kbd>D</Kbd>
            </div>
            {phase === "match" && localSide !== "viewer" && (
              <DPad onPress={(d) => sendDir(d)} pendingDir={pendingDir} />
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: "#8a8aa0", lineHeight: 1.5 }}>
              Each direction = one ER tx. 180° reversals are filtered locally + rejected on-chain.
            </div>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
                color: "#a8a8c0",
                marginTop: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={crankIsMe}
                onChange={(e) => setCrankIsMe(e.target.checked)}
              />
              Crank ticks from this browser ({TICK_MS}ms)
            </label>
          </Card>

          {/* Status / busy indicator */}
          {busy && (
            <Card>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 13,
                  color: "#ffd24a",
                }}
              >
                <Spinner /> {busy}
              </div>
            </Card>
          )}

          {/* Activity log */}
          <Card title="Activity" grow>
            <div
              style={{
                maxHeight: 280,
                overflowY: "auto",
                fontSize: 11,
                fontFamily: "monospace",
                color: "#a8a8c0",
                lineHeight: 1.5,
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: "#5a5a70" }}>No activity yet.</div>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={`${l.t}-${i}`}
                    style={{
                      color:
                        l.type === "error"
                          ? "#ff4d6d"
                          : l.type === "tx"
                            ? "#9bffd2"
                            : "#a8a8c0",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: "#5a5a70" }}>
                      {new Date(l.t).toLocaleTimeString().slice(3)}
                    </span>{" "}
                    {l.msg}
                    {l.sig && (
                      <a
                        href={explorerUrl(l.sig, l.isEr)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#4fc3f7",
                          marginLeft: 6,
                          textDecoration: "underline",
                        }}
                      >
                        {l.sig.slice(0, 6)}…
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Settlement — honest scaffold */}
          <Card title="Settlement · CM v2.1">
            <div style={{ fontSize: 12, color: "#a8a8c0", lineHeight: 1.5 }}>
              This match runs <strong>free on devnet</strong>. The real-money
              path requires a market PDA bound to this game state via Contention
              Markets v2.1 (<code style={{ fontSize: 10 }}>resolve_market_from_game_pda</code>),
              which depends on Cyber Snake being registered server-side first.
            </div>
            <div style={{ fontSize: 10, color: "#5a5a70", marginTop: 6 }}>
              Stake selector at the top is shown for UI parity — no funds move.
            </div>
          </Card>
        </div>
      </div>

      {/* How-to modal */}
      {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function statusName(s: number): string {
  if (s === STATUS_WAITING) return "WAITING";
  if (s === STATUS_ACTIVE) return "ACTIVE";
  if (s === STATUS_FINISHED) return "FINISHED";
  return "UNKNOWN";
}

function safeBigInt(s: string): bigint | null {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function PlayerCard({
  label,
  you,
  addr,
  len,
  dir,
  color,
}: {
  label: string;
  you: boolean;
  addr?: PublicKey;
  len?: number;
  dir?: number;
  color: string;
}) {
  const filled =
    addr && !addr.equals(new PublicKey("11111111111111111111111111111111"));
  return (
    <div
      style={{
        background: "rgba(2,6,20,0.7)",
        border: `1px solid ${color}66`,
        borderRadius: 10,
        padding: "8px 12px",
        backdropFilter: "blur(4px)",
        minWidth: 130,
        boxShadow: you ? `0 0 18px ${color}44` : "none",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.5,
          fontWeight: 800,
          color,
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        {label}
        {you && " · YOU"}
      </div>
      <div style={{ fontSize: 12, fontFamily: "monospace", color: "#e8e8f0" }}>
        {filled ? shortAddr(addr) : <em style={{ color: "#5a5a70" }}>waiting…</em>}
      </div>
      {filled && (
        <div style={{ fontSize: 10, color: "#a8a8c0", marginTop: 3 }}>
          len {len ?? 0} · dir {dir !== undefined ? dirLabel(dir) : "?"}
        </div>
      )}
    </div>
  );
}

function PhaseOverlay({
  children,
  translucent,
}: {
  children: React.ReactNode;
  translucent?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: translucent ? "rgba(2,6,20,0.55)" : "rgba(2,6,20,0.85)",
        backdropFilter: "blur(8px)",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function LobbyCreate({
  wallet,
  stake,
  setStake,
  onCreate,
  busy,
  onShowHowTo,
}: {
  wallet: ReturnType<typeof useWallet>;
  stake: Stake;
  setStake: (s: Stake) => void;
  onCreate: () => void;
  busy: string | null;
  onShowHowTo: () => void;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        maxWidth: 460,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 42,
          fontWeight: 900,
          letterSpacing: 4,
          background: "linear-gradient(135deg, #9945FF, #ff4d6d)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        BATTLE MODE
      </div>
      <div style={{ fontSize: 14, color: "#a8a8c0", lineHeight: 1.55 }}>
        Two snakes. One grid. Last one alive wins. Each direction change is a
        real Solana tx on the MagicBlock ephemeral rollup.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.5,
            color: "#8a8aa0",
            textTransform: "uppercase",
            fontWeight: 800,
          }}
        >
          Stake (UI only — devnet)
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {STAKES.map((s) => (
            <button
              key={s}
              onClick={() => setStake(s)}
              style={{
                padding: "8px 14px",
                fontWeight: 800,
                fontSize: 13,
                borderRadius: 8,
                border:
                  stake === s
                    ? "1px solid #9945FF"
                    : "1px solid #252540",
                background:
                  stake === s ? "rgba(153,69,255,0.18)" : "transparent",
                color: stake === s ? "#c99aff" : "#a8a8c0",
                cursor: "pointer",
              }}
            >
              ${s.toFixed(2)}
            </button>
          ))}
        </div>
      </div>
      {!wallet.publicKey ? (
        <div style={{ fontSize: 13, color: "#ffd24a" }}>
          Connect your Phantom wallet (top right) to create a match.
        </div>
      ) : (
        <button
          onClick={onCreate}
          disabled={!!busy}
          style={{
            padding: "14px 28px",
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            border: "none",
            borderRadius: 12,
            background: "linear-gradient(135deg, #9945FF, #ff4d6d)",
            color: "#020614",
            cursor: busy ? "wait" : "pointer",
            boxShadow: "0 0 28px rgba(153,69,255,0.45)",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? busy : "▶ Create Match"}
        </button>
      )}
      <button
        onClick={onShowHowTo}
        style={{
          background: "transparent",
          border: "none",
          color: "#8a8aa0",
          fontSize: 12,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        How does this work?
      </button>
    </div>
  );
}

function LobbyShare({
  gameId,
  game,
  state,
  shareCopied,
  onCopied,
  onHostDelegate,
  busy,
}: {
  gameId: bigint;
  game: PublicKey;
  state: GameStateDecoded;
  shareCopied: boolean;
  onCopied: () => void;
  onHostDelegate: () => void;
  busy: string | null;
}) {
  const link = buildShareLink(gameId);
  const p2Joined = !state.p2.equals(
    new PublicKey("11111111111111111111111111111111"),
  );
  return (
    <div
      style={{
        textAlign: "center",
        maxWidth: 540,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: 2,
          color: "#c99aff",
        }}
      >
        WAITING FOR OPPONENT
      </div>
      <div style={{ fontSize: 13, color: "#a8a8c0" }}>
        Share this link. Whoever opens it joins the match.
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          width: "100%",
          maxWidth: 480,
          alignItems: "stretch",
        }}
      >
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            flex: 1,
            padding: "10px 12px",
            fontSize: 12,
            fontFamily: "monospace",
            background: "#0c0c14",
            border: "1px solid #252540",
            borderRadius: 8,
            color: "#e8e8f0",
            minWidth: 0,
          }}
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(link).catch(() => {});
            onCopied();
          }}
          style={{
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1,
            border: "1px solid #9945FF",
            borderRadius: 8,
            background: "rgba(153,69,255,0.18)",
            color: "#c99aff",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          {shareCopied ? "copied!" : "copy"}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          width: "100%",
          maxWidth: 480,
          fontSize: 11,
          color: "#a8a8c0",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            border: "1px solid #14F19560",
            borderRadius: 8,
            background: "rgba(20,241,149,0.08)",
          }}
        >
          <div style={{ fontWeight: 800, color: "#14F195", fontSize: 10, letterSpacing: 1 }}>
            P1 (HOST)
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>
            {shortAddr(state.p1)}
          </div>
          <div style={{ color: "#5a5a70", fontSize: 9, marginTop: 2 }}>READY</div>
        </div>
        <div
          style={{
            padding: "8px 12px",
            border: `1px solid ${p2Joined ? "#ff4d6d60" : "#5a5a7060"}`,
            borderRadius: 8,
            background: p2Joined ? "rgba(255,77,109,0.08)" : "transparent",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              color: p2Joined ? "#ff4d6d" : "#5a5a70",
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            P2
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>
            {p2Joined ? shortAddr(state.p2) : "—"}
          </div>
          <div style={{ color: "#5a5a70", fontSize: 9, marginTop: 2 }}>
            {p2Joined ? "READY" : "WAITING"}
          </div>
        </div>
      </div>
      {p2Joined && (
        <button
          onClick={onHostDelegate}
          disabled={!!busy}
          style={{
            padding: "12px 22px",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            border: "none",
            borderRadius: 10,
            background: "linear-gradient(135deg, #9945FF, #4fc3f7)",
            color: "#020614",
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ?? "Delegate to ER"}
        </button>
      )}
      <div style={{ fontSize: 10, color: "#5a5a70", marginTop: 4 }}>
        Game ID {gameId.toString().slice(0, 14)}… · PDA {shortAddr(game)}
      </div>
    </div>
  );
}

function LobbyJoin({
  wallet,
  state,
  gameId,
  onJoin,
  busy,
}: {
  wallet: ReturnType<typeof useWallet>;
  state: GameStateDecoded | null;
  gameId: bigint | null;
  onJoin: () => void;
  busy: string | null;
}) {
  if (!state) {
    return (
      <div style={{ textAlign: "center", color: "#a8a8c0" }}>
        <Spinner /> loading match {gameId?.toString().slice(0, 14)}…
      </div>
    );
  }
  if (state.status === STATUS_FINISHED) {
    return (
      <div style={{ textAlign: "center", color: "#ff4d6d" }}>
        This match has already finished.
      </div>
    );
  }
  if (state.status === STATUS_ACTIVE) {
    return (
      <div style={{ textAlign: "center", color: "#ffd24a" }}>
        This match is already in progress.
      </div>
    );
  }
  return (
    <div
      style={{
        textAlign: "center",
        maxWidth: 460,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: 2,
          background: "linear-gradient(135deg, #4fc3f7, #14F195)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        JOIN MATCH
      </div>
      <div style={{ fontSize: 13, color: "#a8a8c0", lineHeight: 1.55 }}>
        <strong style={{ color: "#14F195" }}>{shortAddr(state.p1)}</strong> is
        waiting for you. Click below to join — your wallet signs one tx to enter
        the lobby and one to delegate the match to the ER.
      </div>
      {!wallet.publicKey ? (
        <div style={{ fontSize: 13, color: "#ffd24a" }}>
          Connect your Phantom wallet (top right) to join.
        </div>
      ) : wallet.publicKey.equals(state.p1) ? (
        <div style={{ fontSize: 13, color: "#ffd24a" }}>
          You're already P1 (the host). Open this link in a different wallet.
        </div>
      ) : (
        <button
          onClick={onJoin}
          disabled={!!busy}
          style={{
            padding: "14px 28px",
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            border: "none",
            borderRadius: 12,
            background: "linear-gradient(135deg, #14F195, #4fc3f7)",
            color: "#020614",
            cursor: busy ? "wait" : "pointer",
            boxShadow: "0 0 28px rgba(20,241,149,0.45)",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ?? "▶ Join Match"}
        </button>
      )}
    </div>
  );
}

function PreMatch({
  state,
  localSide,
  onStart,
}: {
  state: GameStateDecoded | null;
  localSide: "p1" | "p2" | "viewer";
  onStart: () => void;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        maxWidth: 420,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 900, color: "#9bffd2" }}>
        READY
      </div>
      <div style={{ fontSize: 13, color: "#a8a8c0" }}>
        Both players are in. The match runs on the MagicBlock ER — moves land
        in &lt; 50ms. Use arrow keys / WASD to steer.
      </div>
      <div style={{ fontSize: 11, color: "#5a5a70" }}>
        You are <strong style={{ color: localSide === "p1" ? "#14F195" : "#ff4d6d" }}>
          {localSide === "p1" ? "P1 (green)" : localSide === "p2" ? "P2 (pink)" : "viewer"}
        </strong>.
      </div>
      <button
        onClick={onStart}
        disabled={!state}
        style={{
          padding: "14px 28px",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          border: "none",
          borderRadius: 12,
          background: "linear-gradient(135deg, #14F195, #ffd24a)",
          color: "#020614",
          cursor: state ? "pointer" : "wait",
          boxShadow: "0 0 28px rgba(20,241,149,0.45)",
        }}
      >
        ▶ Start
      </button>
    </div>
  );
}

function MatchEnd({
  state,
  localSide,
  stake,
  onFinishGame,
  busy,
}: {
  state: GameStateDecoded;
  localSide: "p1" | "p2" | "viewer";
  stake: Stake;
  onFinishGame: () => void;
  busy: string | null;
}) {
  const won =
    (state.winnerFlag === WINNER_P1 && localSide === "p1") ||
    (state.winnerFlag === WINNER_P2 && localSide === "p2");
  const draw = state.winnerFlag === WINNER_DRAW;
  const winnerLabel = draw
    ? "DRAW"
    : state.winnerFlag === WINNER_P1
      ? "P1 WINS"
      : "P2 WINS";
  const headline = draw ? "DRAW" : won ? "YOU WIN" : "YOU LOSE";
  const headlineColor = draw ? "#ffd24a" : won ? "#14F195" : "#ff4d6d";

  return (
    <div
      style={{
        textAlign: "center",
        maxWidth: 480,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: 50,
          fontWeight: 900,
          letterSpacing: 4,
          color: headlineColor,
          textShadow: `0 0 40px ${headlineColor}`,
        }}
      >
        {headline}
      </div>
      <div style={{ fontSize: 13, color: "#a8a8c0" }}>
        {winnerLabel} after {state.tick} ticks · lengths P1={state.lenP1} P2={state.lenP2}
      </div>
      <div style={{ fontSize: 11, color: "#5a5a70", maxWidth: 360, lineHeight: 1.5 }}>
        Final state has been committed back to L1 devnet. Settlement of the
        ${stake.toFixed(2)} pot would happen here via{" "}
        <code style={{ fontSize: 10 }}>resolve_market_from_game_pda</code> once the
        Cyber Snake game program is registered on Contention Markets v2.1.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          onClick={onFinishGame}
          disabled={!!busy}
          style={btnSecondary}
          title="Re-commit ER state to L1"
        >
          {busy ?? "Re-commit"}
        </button>
        <Link
          href="/play/cyber-snake?mode=battle"
          style={{
            ...btnPrimary,
            display: "inline-block",
            textDecoration: "none",
            color: "#020614",
          }}
        >
          ▶ Rematch
        </Link>
        <Link
          href="/play/cyber-snake?mode=arcade"
          style={{
            ...btnSecondary,
            display: "inline-block",
            textDecoration: "none",
          }}
        >
          back to arcade
        </Link>
      </div>
    </div>
  );
}

function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,20,0.85)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          background: "#0a0a14",
          border: "1px solid #252540",
          borderRadius: 16,
          padding: 28,
          color: "#e8e8f0",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12, color: "#c99aff" }}>
          How Battle Mode works
        </div>
        <ol
          style={{
            paddingLeft: 18,
            margin: 0,
            fontSize: 13,
            lineHeight: 1.7,
            color: "#a8a8c0",
          }}
        >
          <li><strong>You create a match</strong> — one tx on devnet creates the lobby PDA.</li>
          <li><strong>Share the link</strong> with your opponent. They join with a second tx.</li>
          <li><strong>Lobby delegates to MagicBlock ER</strong> — the on-chain account moves to the ephemeral rollup for &lt;50ms moves.</li>
          <li><strong>Both players steer</strong> with arrow keys / WASD. Each direction is its own ER tx.</li>
          <li><strong>Anyone cranks ticks</strong> every 200ms. The program advances both snakes simultaneously.</li>
          <li><strong>Last snake alive wins</strong>. Hit a wall, your trail, or the opponent's — you lose.</li>
          <li><strong>finish_game commits</strong> the final state back to L1, where settlement (when wired up via CM v2.1) pays the winner.</li>
        </ol>
        <button
          onClick={onClose}
          style={{
            marginTop: 18,
            padding: "10px 18px",
            border: "1px solid #252540",
            background: "transparent",
            color: "#a8a8c0",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          got it
        </button>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  grow,
}: {
  title?: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <div
      style={{
        background: "#0a0a14",
        border: "1px solid #1c1c2c",
        borderRadius: 12,
        padding: "12px 14px",
        flex: grow ? 1 : "0 0 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "#8a8aa0",
            marginBottom: 8,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12,
        color: "#a8a8c0",
        margin: "2px 0",
      }}
    >
      <span style={{ color: "#5a5a70" }}>{k}</span>
      <span style={{ fontFamily: "monospace", textAlign: "right" }}>{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        background: "#0c0c14",
        border: "1px solid #252540",
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "monospace",
        color: "#e8e8f0",
      }}
    >
      {children}
    </span>
  );
}

function DPad({
  onPress,
  pendingDir,
}: {
  onPress: (d: Direction) => void;
  pendingDir: Direction | null;
}) {
  const cell = (d: Direction, label: string, gridArea: string) => {
    const active = pendingDir === d;
    return (
      <button
        onClick={() => onPress(d)}
        style={{
          gridArea,
          background: active ? "rgba(153,69,255,0.3)" : "#0c0c14",
          border: active ? "1px solid #9945FF" : "1px solid #252540",
          color: "#e8e8f0",
          fontSize: 18,
          fontWeight: 700,
          borderRadius: 8,
          cursor: "pointer",
          height: 38,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateAreas: `". up ." "left mid right" ". down ."`,
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4,
        marginTop: 6,
      }}
    >
      {cell(DIR_N as Direction, "↑", "up")}
      {cell(DIR_W as Direction, "←", "left")}
      <div style={{ gridArea: "mid" }} />
      {cell(DIR_E as Direction, "→", "right")}
      {cell(DIR_S as Direction, "↓", "down")}
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid #ffd24a",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "csbSpin 0.8s linear infinite",
        verticalAlign: "middle",
      }}
    >
      <style>{`
        @keyframes csbSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}

// ── Inline styles ─────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #252540",
  borderRadius: 8,
  padding: "6px 10px",
  color: "#a8a8c0",
  cursor: "pointer",
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  border: "none",
  borderRadius: 10,
  background: "linear-gradient(135deg, #14F195, #4fc3f7)",
  color: "#020614",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  border: "1px solid #252540",
  borderRadius: 10,
  background: "transparent",
  color: "#a8a8c0",
  cursor: "pointer",
};
