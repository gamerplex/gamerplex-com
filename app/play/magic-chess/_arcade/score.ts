export const ARCADE_BOTS = [
  { id: "molty",   icon: "🦞", label: "Molty",   elo: 600,  desc: "Just learning, makes mistakes" },
  { id: "coral",   icon: "🪸", label: "Coral",   elo: 900,  desc: "Plays safe, good for warming up" },
  { id: "shadow",  icon: "🥷", label: "Shadow",  elo: 1200, desc: "Club level, punishes blunders" },
  { id: "neon",    icon: "⚡", label: "Neon",    elo: 1600, desc: "Tournament level, fast and sharp" },
  { id: "quantum", icon: "🐡", label: "Quantum", elo: 2000, desc: "Near-master, deep calculation" },
  { id: "zero",    icon: "🛡️", label: "Zero",    elo: 2400, desc: "Grandmaster level. Good luck." },
] as const;

export function botById(id: string | null): typeof ARCADE_BOTS[number] | null {
  if (!id) return null;
  return ARCADE_BOTS.find(b => b.id === id) || null;
}

export function computeScore(botElo: number, won: boolean, movesUsed: number, durationSec: number): number {
  return (
    (botElo * 100) +
    (won ? 500 : 0) +
    Math.max(0, 60 - movesUsed) * 10 +
    Math.max(0, 600 - durationSec)
  );
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

export function generateSeed(): Uint8Array {
  const s = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(s);
  } else {
    for (let i = 0; i < 32; i++) s[i] = Math.floor(Math.random() * 256);
  }
  return s;
}
