export const ARCADE_BOTS = [
  { id: "600",  icon: "🦞", label: "ELO 600",  elo: 600,  desc: "Just learning, makes mistakes" },
  { id: "900",  icon: "🪸", label: "ELO 900",  elo: 900,  desc: "Plays safe, good for warming up" },
  { id: "1200", icon: "🥷", label: "ELO 1200", elo: 1200, desc: "Club level, punishes blunders" },
  { id: "1600", icon: "⚡", label: "ELO 1600", elo: 1600, desc: "Tournament level, fast and sharp" },
  { id: "2000", icon: "🐡", label: "ELO 2000", elo: 2000, desc: "Near-master, deep calculation" },
  { id: "2400", icon: "🛡️", label: "ELO 2400", elo: 2400, desc: "Grandmaster level. Good luck." },
] as const;

export function botById(id: string | null): typeof ARCADE_BOTS[number] | null {
  if (!id) return null;
  return ARCADE_BOTS.find(b => b.id === id) || null;
}

// Per-move timer presets. Per-move (not per-game) keeps UX simple: one clear
// countdown, no hidden clock management. Labels borrow from chess.com/lichess
// time-class vocabulary even though the standard is per-game there.
export const TIMER_PRESETS = [
  { sec: 3,  label: "Bullet",    icon: "⚡", desc: "hyper-fast" },
  { sec: 5,  label: "Blitz",     icon: "🔥", desc: "fast (default)" },
  { sec: 10, label: "Rapid",     icon: "⚡", desc: "quick" },
  { sec: 30, label: "Standard",  icon: "🧠", desc: "normal" },
  { sec: 60, label: "Classical", icon: "🐢", desc: "thoughtful" },
] as const;

export const DEFAULT_TIMER_SEC = 5;

// Speed-chess scoring: win=1000+bot.elo+speedBonus+pressureBonus; draw=250; loss=0.
export function computeScore(
  botElo: number,
  won: boolean | null,
  _movesUsed: number,
  durationSec: number,
  turnTimeSec: number = DEFAULT_TIMER_SEC,
): number {
  if (won === true) {
    const speedBonus = Math.max(0, 60 - durationSec) * 50;
    const pressureBonus = Math.max(0, 60 - turnTimeSec) * 20;
    return 1000 + botElo + speedBonus + pressureBonus;
  }
  if (won === false) return 0;
  return 250; // draw
}

export interface MoveLogEntry { from: number; to: number; promotion: number }

// 4 bytes/move [from,to,promotion,_pad]; cap=50 keeps memo ≤200B under the contract 400B ceiling.
export const MAX_MOVES_INLINE = 50;

export function encodeMoveLog(moves: MoveLogEntry[]): Uint8Array {
  const trimmed = moves.slice(0, MAX_MOVES_INLINE);
  const buf = new Uint8Array(trimmed.length * 4);
  for (let i = 0; i < trimmed.length; i++) {
    const m = trimmed[i];
    buf[i * 4] = m.from & 0xff;
    buf[i * 4 + 1] = m.to & 0xff;
    buf[i * 4 + 2] = m.promotion & 0xff;
    buf[i * 4 + 3] = 0;
  }
  return buf;
}

/** v2 move log: 5 bytes per move = [from, to, promotion, delta_sec, _pad].
 *  Mirror @gamerplex/sdk/verify/chess/decoder.ts decodeV2. 50 moves × 5 = 250B
 *  under the 400B memo cap. Used for statistical timing anti-cheat. */
export function encodeMoveLogV2(moves: MoveLogEntry[], deltasSec: number[]): Uint8Array {
  if (deltasSec.length !== moves.length) {
    throw new Error(`encodeMoveLogV2: deltas length ${deltasSec.length} != moves length ${moves.length}`);
  }
  const trimmed = moves.slice(0, MAX_MOVES_INLINE);
  const trimmedDeltas = deltasSec.slice(0, MAX_MOVES_INLINE);
  const buf = new Uint8Array(trimmed.length * 5);
  for (let i = 0; i < trimmed.length; i++) {
    const m = trimmed[i];
    buf[i * 5] = m.from & 0xff;
    buf[i * 5 + 1] = m.to & 0xff;
    buf[i * 5 + 2] = m.promotion & 0xff;
    buf[i * 5 + 3] = Math.min(255, Math.max(0, Math.floor(trimmedDeltas[i]))) & 0xff;
    buf[i * 5 + 4] = 0;
  }
  return buf;
}

export function generateSeed(): Uint8Array {
  const s = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(s);
  } else {
    for (let i = 0; i < 32; i++) s[i] = Math.floor(Math.random() * 256);
  }
  return s;
}
