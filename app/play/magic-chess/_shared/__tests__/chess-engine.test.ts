import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  initBoard, execMove, getValid, isB, idxToSq, boardToFen,
} from "../chess-engine";

// The engine wraps chess.js but tracks board/ep/castle by hand. These tests
// exercise the two things that actually broke in play:
//   1. false game-over ("you lost" mid-game) — execMove must only end the game
//      when chess.js agrees, never on a failed FEN load.
//   2. an illegal AI move — every move getValid offers (and the AI picks) must
//      be legal in the real position.

const FEN_ENC: Record<string, number> = { P: 2, p: 3, R: 4, r: 5, N: 6, n: 7, B: 8, b: 9, Q: 10, q: 11, K: 12, k: 13 };
function fenToBoard(placement: string): number[] {
  const b = Array(64).fill(0);
  const rows = placement.split(" ")[0].split("/"); // rows[0] = rank 8
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) file += parseInt(ch, 10);
      else { b[rank * 8 + file] = FEN_ENC[ch]; file++; }
    }
  }
  return b;
}
const sq = (s: string) => (s.charCodeAt(0) - 97) + (parseInt(s[1], 10) - 1) * 8;

describe("chess-engine — game-over is authoritative (chess.js), never false", () => {
  it("does NOT report game-over on a normal opening move", () => {
    const r = execMove(sq("e2"), sq("e4"), initBoard(), 255, 0b1111);
    expect(r.go).toBe(false);
    expect(r.win).toBe(0);
  });

  it("detects Fool's mate — black delivers mate (win=2), matching chess.js", () => {
    // 1. f3 e5 2. g4 Qh4#
    let b = initBoard(), ep = 255, c = 0b1111;
    let r = execMove(sq("f2"), sq("f3"), b, ep, c); b = r.nb; ep = r.nep; c = r.nc; expect(r.go).toBe(false);
    r = execMove(sq("e7"), sq("e5"), b, ep, c); b = r.nb; ep = r.nep; c = r.nc; expect(r.go).toBe(false);
    r = execMove(sq("g2"), sq("g4"), b, ep, c); b = r.nb; ep = r.nep; c = r.nc; expect(r.go).toBe(false);
    r = execMove(sq("d8"), sq("h4"), b, ep, c);
    expect(r.go).toBe(true);
    expect(r.win).toBe(2); // black wins → the human (white) correctly loses ONLY here
    // cross-check with chess.js
    expect(new Chess(boardToFen(r.nb, true, r.nc, r.nep)).isCheckmate()).toBe(true);
  });

  it("detects stalemate as a draw (go=true, win=0) — NOT a loss", () => {
    // white Qb7→b6 stalemates the lone black king on a8
    const b = fenToBoard("k7/1Q6/8/8/8/8/8/7K");
    const r = execMove(sq("b7"), sq("b6"), b, 255, 0);
    expect(r.go).toBe(true);
    expect(r.win).toBe(0);
    expect(new Chess(boardToFen(r.nb, false, 0, 255)).isStalemate()).toBe(true);
  });
});

describe("chess-engine — every offered/AI move is legal (cross-checked vs chess.js)", () => {
  const positions = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",              // start (white)
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R",     // Italian-ish (white)
    "rnbqkb1r/pp2pppp/3p1n2/2p5/4P3/2N2N2/PPPP1PPP/R1BQKB1R",  // black to move soon
  ];

  for (const [i, placement] of positions.entries()) {
    it(`position ${i}: getValid matches chess.js legal destinations for every piece`, () => {
      const b = fenToBoard(placement);
      // try both side-to-move perspectives via the pieces present
      for (let from = 0; from < 64; from++) {
        if (!b[from]) continue;
        const whiteToMove = b[from] % 2 === 0;
        const fen = boardToFen(b, whiteToMove, 0b1111, 255);
        let chessMoves: string[] = [];
        try { chessMoves = new Chess(fen).moves({ square: idxToSq(from), verbose: true }).map((m) => m.to).sort(); } catch { continue; }
        const engineMoves = getValid(b, from, 255, 0b1111).map(idxToSq).sort();
        expect(engineMoves).toEqual([...new Set(chessMoves)].sort());
      }
    });
  }

  it("the AI move generator (as used in play) only ever produces LEGAL moves", () => {
    // Replicate ArcadeMode's candidate generation over 40 random black replies
    // and assert each executes to a position chess.js accepts (no self-check).
    let b = initBoard(), ep = 255, c = 0b1111;
    // one white move to hand the turn to black
    let r = execMove(sq("e2"), sq("e4"), b, ep, c); b = r.nb; ep = r.nep; c = r.nc;
    for (let n = 0; n < 40; n++) {
      const bp: number[] = [];
      for (let idx = 0; idx < 64; idx++) if (isB(b[idx])) bp.push(idx);
      const cand: Array<{ f: number; t: number }> = [];
      for (const f of bp) for (const t of getValid(b, f, ep, c)) cand.push({ f, t });
      if (!cand.length) break; // checkmate/stalemate — fine
      // every candidate must be legal in the real position
      const legal = new Chess(boardToFen(b, false, c, ep)).moves({ verbose: true }).map((m) => `${m.from}${m.to}`);
      for (const { f, t } of cand) expect(legal).toContain(`${idxToSq(f)}${idxToSq(t)}`);
      // play one, then a white reply, to advance the game
      const pick = cand[n % cand.length];
      r = execMove(pick.f, pick.t, b, ep, c); b = r.nb; ep = r.nep; c = r.nc;
      if (r.go) break;
      const wp: number[] = [];
      for (let idx = 0; idx < 64; idx++) if (b[idx] && b[idx] % 2 === 0) wp.push(idx);
      let wm: { f: number; t: number } | null = null;
      for (const f of wp) { const v = getValid(b, f, ep, c); if (v.length) { wm = { f, t: v[0] }; break; } }
      if (!wm) break;
      r = execMove(wm.f, wm.t, b, ep, c); b = r.nb; ep = r.nep; c = r.nc;
      if (r.go) break;
    }
  });
});
