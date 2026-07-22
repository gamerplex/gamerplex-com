"use client";

import { useEffect, useState } from "react";

import { claimDailyStreak } from "../lib/identity/client";

// Brand-colored confetti + a daily-streak chip. Self-contained (no dependency):
// fireConfetti() paints a throwaway full-screen canvas and removes it when done.
// The streak is a client-side engagement signal (localStorage) — purely visual;
// any Credits/$GAME reward tied to it is a separate, economics-gated feature.

const COLORS = ["#9945FF", "#14F195", "#ff4da6", "#35e0ff", "#ffaa00", "#ffffff"];

export function fireConfetti(count = 140) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.3;
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 9;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 5,
      s: 5 + Math.random() * 7,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[(Math.random() * COLORS.length) | 0],
    };
  });
  let raf = 0;
  const t0 = performance.now();
  const tick = (t: number) => {
    const dt = (t - t0) / 1000;
    const life = Math.max(0, 1 - dt / 2.1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.22;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (life > 0) raf = requestAnimationFrame(tick);
    else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  };
  raf = requestAnimationFrame(tick);
}

// Personal-best effect — DELIBERATELY distinct from the streak confetti: a pair of
// expanding neon shockwave rings + a gold "NEW PERSONAL BEST" banner. Self-contained
// (DOM + Web Animations API), works on web, PWA, and the native WebView alike.
export function firePersonalBest() {
  if (typeof document === "undefined") return;
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;inset:0;z-index:9999;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden";
  document.body.appendChild(root);

  const ring = (color: string, scale: number, delay: number, dur: number) => {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;width:130px;height:130px;border-radius:50%;border:6px solid ${color};box-shadow:0 0 40px ${color},inset 0 0 26px ${color}`;
    root.appendChild(el);
    el.animate(
      [
        { transform: "scale(0.2)", opacity: 0.85 },
        { transform: `scale(${scale})`, opacity: 0 },
      ],
      { duration: dur, delay, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
  };
  ring("#ffd24a", 9, 0, 900);
  ring("#35e0ff", 12, 130, 1100);

  const banner = document.createElement("div");
  banner.textContent = "🏆 NEW PERSONAL BEST";
  banner.style.cssText =
    "position:relative;font-family:system-ui,-apple-system,sans-serif;font-weight:900;font-size:clamp(22px,6vw,42px);letter-spacing:1px;background:linear-gradient(90deg,#ffe08a,#ffb020,#ff7a3c);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 26px rgba(255,160,40,.55));white-space:nowrap";
  root.appendChild(banner);
  banner.animate(
    [
      { transform: "scale(0.6)", opacity: 0 },
      { transform: "scale(1.08)", opacity: 1, offset: 0.32 },
      { transform: "scale(1)", opacity: 1, offset: 0.72 },
      { transform: "scale(1)", opacity: 0 },
    ],
    { duration: 1900, easing: "ease-out" },
  );

  setTimeout(() => root.remove(), 2000);
}

// Fire the personal-best effect only when `score` beats a PRIOR stored best for this
// game (per device). The first-ever score sets the bar silently — no false "best!".
export function maybeCelebrateBest(gameId: string, score: number | null | undefined) {
  if (score == null || typeof document === "undefined") return;
  try {
    const key = "gpx_best_" + gameId;
    const prev = Number(localStorage.getItem(key) || "0");
    if (score > prev) {
      localStorage.setItem(key, String(score));
      if (prev > 0) firePersonalBest();
    }
  } catch {
    /* localStorage blocked */
  }
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Daily-visit streak chip. Increments once per day, resets if a day is skipped,
// and pops a confetti burst on the day it goes up.
export function StreakCelebration() {
  const [streak, setStreak] = useState<number | null>(null);
  const [reward, setReward] = useState<number | null>(null); // Credits paid on today's claim
  const [bumped, setBumped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const celebrate = () => {
      setBumped(true);
      timers.push(setTimeout(() => fireConfetti(), 400));
      timers.push(setTimeout(() => setBumped(false), 3600));
    };
    (async () => {
      // Signed-in: the server is the source of truth and pays Credits (idempotent
      // per UTC day). Anonymous: fall back to a local visual streak (no reward).
      const server = await claimDailyStreak();
      if (cancelled) return;
      if (server) {
        setStreak(server.streak);
        if (server.claimed) {
          setReward(server.amount);
          window.dispatchEvent(new Event("gamerplex:focus")); // refresh the Credits badge
          celebrate();
        }
        return;
      }
      try {
        const raw = localStorage.getItem("gpx_streak");
        const prev = raw ? (JSON.parse(raw) as { last: string; n: number }) : null;
        const td = todayKey();
        let n = 1;
        let incremented = true;
        if (prev) {
          if (prev.last === td) {
            n = prev.n;
            incremented = false;
          } else if (dayDiff(prev.last, td) === 1) {
            n = prev.n + 1;
          }
        }
        localStorage.setItem("gpx_streak", JSON.stringify({ last: td, n }));
        setStreak(n);
        if (incremented) celebrate();
      } catch {
        /* localStorage blocked — skip the chip */
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  if (streak == null) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 800,
        color: "#fff",
        background: "rgba(255,120,40,0.14)",
        border: "1px solid rgba(255,140,60,0.45)",
        boxShadow: bumped ? "0 0 18px rgba(255,140,60,0.6)" : "none",
        transform: bumped ? "scale(1.06)" : "scale(1)",
        transition: "transform .3s, box-shadow .3s",
        whiteSpace: "nowrap",
      }}
    >
      🔥 {streak}-day streak
      {bumped && reward != null && <span style={{ color: "#14F195" }}>+{reward} Credits</span>}
      {bumped && reward == null && <span style={{ color: "#ffce4d" }}>+1!</span>}
    </span>
  );
}
