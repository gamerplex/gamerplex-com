"use client";

// 2D top-down renderer; consumes GameStateDecoded straight from chain.ts.

import { useEffect, useRef } from "react";
import type { GameStateDecoded } from "./chain";

const GRID = 32;
const MAX_LEN = 256;
const TICK_MS = 200; // matches BattleClient TICK_MS

const COLOR_BG = "#020614";
const COLOR_GRID_MINOR = "rgba(79, 195, 247, 0.06)";
const COLOR_GRID_MAJOR = "rgba(79, 195, 247, 0.2)";
const COLOR_EDGE = "rgba(153, 69, 255, 0.55)"; // Solana purple

// Player palettes — distinct enough to read at speed.
const COLOR_P1_BODY = "#14F195"; // green (you)
const COLOR_P1_HEAD = "#9bffd2";
const COLOR_P2_BODY = "#ff4d6d"; // pink-red (opponent)
const COLOR_P2_HEAD = "#ffb0c0";
const COLOR_FOOD = "#ffd24a";

interface Props {
  state: GameStateDecoded | null;
  /** Which side is the local viewer? Affects highlight ring + label. */
  localSide: "p1" | "p2" | "viewer";
}

function bodyCells(body: number[], headIdx: number, len: number): number[] {
  const out: number[] = [];
  // body[0..len] with the most-recent head at body[(headIdx + MAX_LEN - 1) % MAX_LEN].
  for (let i = 1; i <= len; i++) {
    const idx = (headIdx + MAX_LEN - i) % MAX_LEN;
    out.push(body[idx]);
  }
  return out;
}

export default function SnakeBattleScene2D({ state, localSide }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const sideRef = useRef(localSide);
  const rafRef = useRef<number | null>(null);

  // Sub-tick interpolation buffers — separate per side so heads glide
  // between grid steps even though we only get a discrete state per tick.
  const prevP1 = useRef<number[]>([]);
  const currP1 = useRef<number[]>([]);
  const prevP2 = useRef<number[]>([]);
  const currP2 = useRef<number[]>([]);
  const lastTick = useRef<number>(-1);
  const tickStart = useRef<number>(performance.now());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    sideRef.current = localSide;
  }, [localSide]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.borderRadius = "12px";
    canvas.style.background = COLOR_BG;
    mount.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      const s = stateRef.current;
      const side = sideRef.current;
      const w = canvas.width;
      const h = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, w, h);

      const cellSize = Math.min(w, h) / (GRID + 2);
      const gridPx = cellSize * GRID;
      const offX = (w - gridPx) / 2;
      const offY = (h - gridPx) / 2;

      // Backdrop — soft radial like the arcade scene.
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        Math.max(w, h) / 1.4,
      );
      grad.addColorStop(0, "rgba(79, 195, 247, 0.06)");
      grad.addColorStop(1, "rgba(2, 6, 20, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Grid lines.
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID; i++) {
        const major = i === 0 || i === GRID || i % 8 === 0;
        ctx.strokeStyle = major ? COLOR_GRID_MAJOR : COLOR_GRID_MINOR;
        const x = offX + i * cellSize;
        const y = offY + i * cellSize;
        ctx.beginPath();
        ctx.moveTo(offX, y);
        ctx.lineTo(offX + gridPx, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, offY);
        ctx.lineTo(x, offY + gridPx);
        ctx.stroke();
      }

      // Edge glow.
      ctx.strokeStyle = COLOR_EDGE;
      ctx.lineWidth = 2;
      ctx.strokeRect(offX, offY, gridPx, gridPx);

      if (s) {
        if (s.tick !== lastTick.current) {
          prevP1.current = currP1.current.length
            ? currP1.current
            : bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
          currP1.current = bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
          prevP2.current = currP2.current.length
            ? currP2.current
            : bodyCells(s.bodyP2, s.headIdxP2, s.lenP2);
          currP2.current = bodyCells(s.bodyP2, s.headIdxP2, s.lenP2);
          lastTick.current = s.tick;
          tickStart.current = now;
        }
        const progress = Math.min(1, (now - tickStart.current) / TICK_MS);

        const drawSnake = (
          curr: number[],
          prev: number[],
          bodyCol: string,
          headCol: string,
          glowMul: number,
        ) => {
          for (let i = curr.length - 1; i >= 0; i--) {
            const ci = curr[i];
            const pi = i < prev.length ? prev[i] : ci;
            const cx = ci % GRID;
            const cy = Math.floor(ci / GRID);
            const px = pi % GRID;
            const py = Math.floor(pi / GRID);
            // Tail body cells don't interpolate — only the head moves a fresh
            // step each tick. Keeping body fixed avoids a "ghost trail" smear.
            const isHead = i === 0;
            const ix = isHead ? px + (cx - px) * progress : cx;
            const iy = isHead ? py + (cy - py) * progress : cy;
            const x = offX + ix * cellSize;
            const y = offY + iy * cellSize;
            const pad = cellSize * 0.08;
            const size = cellSize - pad * 2;

            ctx.fillStyle = isHead ? headCol : bodyCol;
            ctx.shadowColor = isHead ? headCol : bodyCol;
            ctx.shadowBlur = (isHead ? 18 : 9) * glowMul;
            roundRect(
              ctx,
              x + pad,
              y + pad,
              size,
              size,
              cellSize * 0.18,
            );
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        };

        // Render order: opponent first so local snake's head reads on top.
        if (side === "p2") {
          drawSnake(currP1.current, prevP1.current, COLOR_P1_BODY, COLOR_P1_HEAD, 0.7);
          drawSnake(currP2.current, prevP2.current, COLOR_P2_BODY, COLOR_P2_HEAD, 1.1);
        } else {
          drawSnake(currP2.current, prevP2.current, COLOR_P2_BODY, COLOR_P2_HEAD, 0.7);
          drawSnake(currP1.current, prevP1.current, COLOR_P1_BODY, COLOR_P1_HEAD, 1.1);
        }

        // Food — pulsing gold diamond.
        if (s.foodPos < GRID * GRID) {
          const fx = s.foodPos % GRID;
          const fy = Math.floor(s.foodPos / GRID);
          const pulse = 0.85 + Math.sin(now * 0.008) * 0.12;
          const fcx = offX + (fx + 0.5) * cellSize;
          const fcy = offY + (fy + 0.5) * cellSize;
          const fsize = cellSize * 0.4 * pulse;
          ctx.fillStyle = COLOR_FOOD;
          ctx.shadowColor = COLOR_FOOD;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.moveTo(fcx, fcy - fsize);
          ctx.lineTo(fcx + fsize, fcy);
          ctx.lineTo(fcx, fcy + fsize);
          ctx.lineTo(fcx - fsize, fcy);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Local-side head ring — make sure the player sees their head clearly.
        if (side !== "viewer") {
          const myCells = side === "p1" ? currP1.current : currP2.current;
          const myPrev = side === "p1" ? prevP1.current : prevP2.current;
          if (myCells.length > 0) {
            const head = myCells[0];
            const prevHead = myPrev.length ? myPrev[0] : head;
            const cx = head % GRID;
            const cy = Math.floor(head / GRID);
            const px = prevHead % GRID;
            const py = Math.floor(prevHead / GRID);
            const ix = px + (cx - px) * progress;
            const iy = py + (cy - py) * progress;
            const fcx = offX + (ix + 0.5) * cellSize;
            const fcy = offY + (iy + 0.5) * cellSize;
            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 1.5;
            ctx.shadowColor = "#fff";
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(
              fcx,
              fcy,
              cellSize * (0.7 + Math.sin(now * 0.012) * 0.05),
              0,
              Math.PI * 2,
            );
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      canvas.remove();
      canvasRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "320px",
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        background: COLOR_BG,
      }}
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
