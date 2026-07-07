"use client";

/**
 * Shared Arcade ↔ Battle mode toggle. Every Gamerplex casual game has both
 * modes architecturally; one or both may be UI-pending. This pill exposes
 * BOTH visibly with status badges, and surfaces an explainer modal on click
 * for the inactive/pending side. See ENGINEERING/CORE_STRATEGY/GAME_MODES.md.
 *
 * Usage:
 *   <ModeToggle
 *     gameLabel="Cyber Snake"
 *     active="arcade"
 *     arcade={{ status: "live-devnet", href: "/arcade/cyber-snake" }}
 *     battle={{ status: "ui-pending", programId: "EK8gFE1…PTk3" }}
 *     onModeClick={(mode) => mode === "battle" && setExplainerOpen(true)}
 *   />
 */

import Link from "next/link";

export type ModeStatus =
  | "live-mainnet"
  | "live-mainnet-soon" // arcade ready, mainnet ceremony pending
  | "live-devnet"
  | "ui-pending" // program deployed + registered, UI not yet built
  | "design-pending"; // not yet started

export type ModeInfo = {
  status: ModeStatus;
  href?: string; // where clicking the chip should take the user
  programId?: string; // shown in the explainer for transparency
};

export type ModeToggleProps = {
  gameLabel: string;
  active: "arcade" | "battle";
  arcade: ModeInfo;
  battle: ModeInfo;
  onModeClick?: (mode: "arcade" | "battle") => void;
  size?: "sm" | "md";
};

const ARCADE_GRAD = "linear-gradient(135deg, #14F195, #4fc3f7)"; // green-cyan = skill arcade
const BATTLE_GRAD = "linear-gradient(135deg, #9945FF, #ff4d6d)"; // purple-red = wagered competitive

const STATUS_COPY: Record<ModeStatus, { label: string; color: string }> = {
  "live-mainnet": { label: "MAINNET", color: "#14F195" },
  "live-mainnet-soon": { label: "MAINNET SOON", color: "#ffd24a" },
  // Pre-mainnet we surface no chain jargon — "live-devnet" reads as a neutral LIVE.
  "live-devnet": { label: "LIVE", color: "#14F195" },
  "ui-pending": { label: "UI PENDING", color: "#9945FF" },
  "design-pending": { label: "DESIGN PENDING", color: "#8a8aa0" },
};

export default function ModeToggle({
  gameLabel,
  active,
  arcade,
  battle,
  onModeClick,
  size = "md",
}: ModeToggleProps) {
  const padY = size === "sm" ? 6 : 8;
  const padX = size === "sm" ? 14 : 18;
  const fontSize = size === "sm" ? 11 : 12;

  const renderChip = (
    mode: "arcade" | "battle",
    label: string,
    icon: string,
    info: ModeInfo,
  ) => {
    const isActive = active === mode;
    const grad = mode === "arcade" ? ARCADE_GRAD : BATTLE_GRAD;
    const status = STATUS_COPY[info.status];

    const inner = (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: `${padY}px ${padX}px`,
          borderRadius: 999,
          fontSize,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          background: isActive ? grad : "transparent",
          color: isActive ? "#020614" : "#8a8aa0",
          border: "none",
          cursor: isActive && !info.href ? "default" : "pointer",
          transition: "color 0.2s",
          boxShadow: isActive
            ? mode === "arcade"
              ? "0 0 12px rgba(20,241,149,0.3)"
              : "0 0 12px rgba(153,69,255,0.3)"
            : "none",
        }}
      >
        <span>{icon} {label}</span>
        <span
          aria-label={`status: ${status.label.toLowerCase()}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            borderRadius: 4,
            background: isActive ? "rgba(2,6,20,0.18)" : "rgba(255,255,255,0.04)",
            color: isActive ? "rgba(2,6,20,0.9)" : status.color,
            fontSize: fontSize - 2,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: status.color,
              boxShadow: `0 0 6px ${status.color}`,
              animation: info.status === "live-devnet" || info.status === "live-mainnet-soon" ? "modeStatusPulse 1.6s ease-in-out infinite" : "none",
            }}
          />
          {status.label}
        </span>
      </span>
    );

    if (isActive && !info.href) return <div key={mode}>{inner}</div>;
    if (info.href && (!isActive || info.href !== window?.location?.pathname)) {
      return (
        <Link key={mode} href={info.href} prefetch={false} style={{ textDecoration: "none" }}>
          {inner}
        </Link>
      );
    }
    return (
      <button
        key={mode}
        onClick={() => onModeClick?.(mode)}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        onMouseEnter={(e) => {
          const span = e.currentTarget.querySelector("span > span");
          if (!isActive && span instanceof HTMLElement) {
            span.style.color = mode === "arcade" ? "#4fff9f" : "#c99aff";
          }
        }}
        onMouseLeave={(e) => {
          const span = e.currentTarget.querySelector("span > span");
          if (!isActive && span instanceof HTMLElement) span.style.color = "#8a8aa0";
        }}
      >
        {inner}
      </button>
    );
  };

  // Suppress unused-prop warnings for fields kept on the type so callers
  // don't have to change; battle mode is intentionally not rendered.
  void battle;

  return (
    <div
      role="tablist"
      aria-label={`${gameLabel} — Arcade mode`}
      style={{
        display: "inline-flex",
        gap: 0,
        background: "rgba(2,6,20,0.6)",
        border: "1px solid #252540",
        borderRadius: 999,
        padding: 4,
      }}
    >
      {renderChip("arcade", "Arcade", "🐍", arcade)}
      <style>{`
        @keyframes modeStatusPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
