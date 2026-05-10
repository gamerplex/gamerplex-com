import { Chess, type Square } from "chess.js";

export const PIECES: Record<number, string> = { 0: "", 2: "♙", 3: "♟", 4: "♖", 5: "♜", 6: "♘", 7: "♞", 8: "♗", 9: "♝", 10: "♕", 11: "♛", 12: "♔", 13: "♚" };
export const PN: Record<number, string> = { 2: "", 3: "", 4: "R", 5: "R", 6: "N", 7: "N", 8: "B", 9: "B", 10: "Q", 11: "Q", 12: "K", 13: "K" };

export const isW = (p: number) => p > 0 && p % 2 === 0;
export const isB = (p: number) => p > 0 && p % 2 === 1;
export const pt = (p: number) => p & 0xfe;

export function initBoard(): number[] {
  const b = Array(64).fill(0);
  b[0] = 4; b[1] = 6; b[2] = 8; b[3] = 10; b[4] = 12; b[5] = 8; b[6] = 6; b[7] = 4;
  for (let i = 8; i < 16; i++) b[i] = 2;
  for (let i = 48; i < 56; i++) b[i] = 3;
  b[56] = 5; b[57] = 7; b[58] = 9; b[59] = 11; b[60] = 13; b[61] = 9; b[62] = 7; b[63] = 5;
  return b;
}

const ENC_TO_FEN: Record<number, string> = { 2: "P", 3: "p", 4: "R", 5: "r", 6: "N", 7: "n", 8: "B", 9: "b", 10: "Q", 11: "q", 12: "K", 13: "k" };
export const idxToSq = (i: number): Square => `${"abcdefgh"[i & 7]}${(i >> 3) + 1}` as Square;
export const sqToIdx = (s: string): number => (s.charCodeAt(0) - 97) + (parseInt(s[1]) - 1) * 8;

export function boardToFen(b: number[], whiteToMove: boolean, castle: number, ep: number): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "", empty = 0;
    for (let file = 0; file < 8; file++) {
      const c = ENC_TO_FEN[b[rank * 8 + file]];
      if (!c) { empty++; } else { if (empty > 0) { row += empty; empty = 0; } row += c; }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  let cr = "";
  if (castle & 1) cr += "K"; if (castle & 2) cr += "Q"; if (castle & 4) cr += "k"; if (castle & 8) cr += "q";
  if (!cr) cr = "-";
  let epStr = "-";
  if (ep !== 255) {
    const er = ep >> 3, ef = ep & 7, ar = whiteToMove ? er - 1 : er + 1, ap = whiteToMove ? 2 : 3;
    if (ar >= 0 && ar <= 7 && ((ef > 0 && b[ar * 8 + ef - 1] === ap) || (ef < 7 && b[ar * 8 + ef + 1] === ap))) epStr = idxToSq(ep);
  }
  return `${rows.join("/")} ${whiteToMove ? "w" : "b"} ${cr} ${epStr} 0 1`;
}

export function loadChess(b: number[], whiteToMove: boolean, castle: number, ep: number): Chess | null {
  try { return new Chess(boardToFen(b, whiteToMove, castle, ep)); } catch { return null; }
}

export function isAttacked(b: number[], sq: number, byW: boolean): boolean {
  const c = loadChess(b, !byW, 0, 255);
  if (!c) return false;
  try { return c.isAttacked(idxToSq(sq), byW ? "w" : "b"); } catch { return false; }
}

export function getValid(b: number[], from: number, ep: number, castle: number): number[] {
  const p = b[from]; if (!p) return [];
  const c = loadChess(b, isW(p), castle, ep);
  if (!c) return [];
  try {
    const moves = c.moves({ square: idxToSq(from), verbose: true });
    const seen = new Set<number>();
    for (const m of moves) seen.add(sqToIdx(m.to));
    return [...seen];
  } catch { return []; }
}

export function updCastle(c: number, f: number, t: number): number {
  let n = c;
  if (f === 4 || t === 4) n &= 0b1100;
  if (f === 60 || t === 60) n &= 0b0011;
  if (f === 0 || t === 0) n &= 0b1101;
  if (f === 7 || t === 7) n &= 0b1110;
  if (f === 56 || t === 56) n &= 0b0111;
  if (f === 63 || t === 63) n &= 0b1011;
  return n;
}

export function toAlg(f: number, t: number, p: number, b: number[], cap: boolean, ep: number, castle: number): string {
  const c = loadChess(b, isW(p), castle, ep);
  if (c) {
    try {
      const mv = c.move({ from: idxToSq(f), to: idxToSq(t), promotion: "q" });
      if (mv) return mv.san;
    } catch {}
  }
  const cs = "abcdefgh";
  if (pt(p) === 12 && Math.abs((t & 7) - (f & 7)) === 2) return (t & 7) === 6 ? "O-O" : "O-O-O";
  return `${pt(p) === 2 && cap ? cs[f & 7] : ""}${PN[p] || ""}${cap ? "x" : ""}${cs[t & 7]}${(t >> 3) + 1}`;
}

export interface MoveResult {
  nb: number[];
  cap: number;
  alg: string;
  nep: number;
  nc: number;
  go: boolean;
  win: number;
}

export function execMove(from: number, to: number, b: number[], epSq: number, cas: number): MoveResult {
  const p = b[from], tgt = b[to], w = isW(p), tp = pt(p);
  const nb = [...b];
  let nep = 255, nc = updCastle(cas, from, to), cap = tgt;
  if (tp === 12 && Math.abs((to & 7) - (from & 7)) === 2) {
    const row = from >> 3;
    nb[to] = p; nb[from] = 0;
    if ((to & 7) === 6) { nb[row * 8 + 5] = nb[row * 8 + 7]; nb[row * 8 + 7] = 0; }
    if ((to & 7) === 2) { nb[row * 8 + 3] = nb[row * 8 + 0]; nb[row * 8 + 0] = 0; }
  } else { nb[to] = p; nb[from] = 0; }
  if (tp === 2 && to === epSq) { const cs = (to & 7) + (from >> 3) * 8; cap = nb[cs]; nb[cs] = 0; }
  if (tp === 2 && Math.abs((to >> 3) - (from >> 3)) === 2) nep = ((from >> 3) + (to >> 3)) / 2 * 8 + (from & 7);
  if (tp === 2 && ((to >> 3) === (w ? 7 : 0))) nb[to] = w ? 10 : 11;
  const alg = toAlg(from, to, p, b, cap > 0, epSq, cas);
  const ok = w ? 13 : 12;
  const oks = nb.indexOf(ok);
  let go = false, win = 0;
  if (oks >= 0) {
    const ic = isAttacked(nb, oks, w);
    let hl = false;
    for (let i = 0; i < 64 && !hl; i++) {
      if (!nb[i] || isW(nb[i]) === w) continue;
      if (getValid(nb, i, nep, nc).length > 0) hl = true;
    }
    if (!hl) { go = true; win = ic ? (w ? 1 : 2) : 0; }
  }
  return { nb, cap, alg: alg + (go && win ? "#" : ""), nep, nc, go, win };
}
