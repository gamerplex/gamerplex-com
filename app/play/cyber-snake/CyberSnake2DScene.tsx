"use client";

// 2D top-down Canvas renderer for Cyber Snake.
//
// Alternative to the WebGL scene for players who prefer classic 2D, don't
// like 3D camera disorientation, or are on very low-end devices. Consumes
// the same SnakeSceneState the 3D version does so the parent component can
// swap between them without re-architecting.

import { useEffect, useRef } from "react";
import type { SnakeSceneState } from "./CyberSnake3DScene";

const GRID = 32;
const MAX_LEN = 256;

const COLOR_BG = "#020614";
const COLOR_GRID_MINOR = "rgba(79, 195, 247, 0.06)";
const COLOR_GRID_MAJOR = "rgba(79, 195, 247, 0.22)";
const COLOR_EDGE = "rgba(153, 69, 255, 0.55)"; // Solana purple — same as 3D scene
const COLOR_BODY = "#4fc3f7";
const COLOR_HEAD = "#d9f2ff";
const COLOR_FOOD = "#ffd24a";

interface Props {
  state: SnakeSceneState | null;
}

function bodyCells(body: number[], headIdx: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= len; i++) {
    const idx = (headIdx + MAX_LEN - i) % MAX_LEN;
    out.push(body[idx]);
  }
  return out;
}

export default function CyberSnake2DScene({ state }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const rafRef = useRef<number | null>(null);
  const prevCellsRef = useRef<number[]>([]);
  const currCellsRef = useRef<number[]>([]);
  const lastTickRef = useRef<number>(-1);
  const tickStartRef = useRef<number>(performance.now());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const TICK_MS = 140;

    const render = (now: number) => {
      const s = stateRef.current;
      const w = canvas.width;
      const h = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, w, h);

      // Letterbox the grid to keep square cells regardless of aspect ratio.
      const cellSize = Math.min(w, h) / (GRID + 2); // +2 for edge padding
      const gridPx = cellSize * GRID;
      const offX = (w - gridPx) / 2;
      const offY = (h - gridPx) / 2;

      // Subtle radial backdrop so the board isn't pure black in empty areas.
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.4);
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

      // Purple edge glow (mirrors 3D scene's particle walls, attenuated).
      ctx.strokeStyle = COLOR_EDGE;
      ctx.lineWidth = 2;
      ctx.strokeRect(offX, offY, gridPx, gridPx);

      if (s) {
        // Sub-tick interpolation so the snake glides between grid ticks.
        if (s.tick !== lastTickRef.current) {
          prevCellsRef.current = currCellsRef.current.length
            ? currCellsRef.current
            : bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
          currCellsRef.current = bodyCells(s.bodyP1, s.headIdxP1, s.lenP1);
          lastTickRef.current = s.tick;
          tickStartRef.current = now;
        }
        const progress = Math.min(1, (now - tickStartRef.current) / TICK_MS);

        const curr = currCellsRef.current;
        const prev = prevCellsRef.current;
        // Render body tail-first so head draws on top.
        for (let i = curr.length - 1; i >= 0; i--) {
          const ci = curr[i];
          const pi = i < prev.length ? prev[i] : ci;
          const cx = ci % GRID, cy = Math.floor(ci / GRID);
          const px = pi % GRID, py = Math.floor(pi / GRID);
          const ix = px + (cx - px) * progress;
          const iy = py + (cy - py) * progress;
          const x = offX + ix * cellSize;
          const y = offY + iy * cellSize;
          const isHead = i === 0;
          const pad = cellSize * 0.08;
          const size = cellSize - pad * 2;

          // Rounded-rect fill with a soft glow.
          ctx.fillStyle = isHead ? COLOR_HEAD : COLOR_BODY;
          ctx.shadowColor = isHead ? COLOR_HEAD : COLOR_BODY;
          ctx.shadowBlur = isHead ? 18 : 10;
          roundRect(ctx, x + pad, y + pad, size, size, cellSize * 0.18);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Food — pulsing gold diamond.
        const f = s.foodPos;
        const fx = f % GRID, fy = Math.floor(f / GRID);
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
        minHeight: "300px",
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
