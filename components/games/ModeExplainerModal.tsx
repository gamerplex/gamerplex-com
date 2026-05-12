"use client";

/**
 * Shared explainer modal for Arcade ↔ Battle. Pops when a user clicks the
 * pending side of the ModeToggle. Frames the two modes in plain language,
 * shows the network status, and points users to whatever's actually live.
 *
 * The legal-separation framing matters here: any reference to wagered Battle
 * must make clear it's operated by a separate backer surface, not the
 * Gamerplex AU entity. See ENGINEERING/CORE_STRATEGY/CROSS_ORG_INTERACTIONS.md.
 */

import { useEffect } from "react";
import Link from "next/link";
import type { ModeStatus } from "./ModeToggle";

const STATUS_COPY: Record<ModeStatus, { dot: string; label: string; tone: string }> = {
  "live-mainnet": { dot: "#14F195", label: "Live on mainnet", tone: "Real USDC. Real leaderboards. Hardware-wallet-custodied." },
  "live-mainnet-soon": { dot: "#ffd24a", label: "Mainnet soon", tone: "Hardened on devnet, mainnet ceremony pending." },
  "live-devnet": { dot: "#4fc3f7", label: "Live on devnet", tone: "Faucet USDC. No economic value. Stress-tested for the real thing." },
  "ui-pending": { dot: "#9945FF", label: "Stack-proven, UI pending", tone: "Program is deployed and registered on-chain — interface not yet shipped." },
  "design-pending": { dot: "#8a8aa0", label: "Design pending", tone: "Architectural pattern is documented; UI design hasn't started." },
};

export type ModeExplainerProps = {
  open: boolean;
  onClose: () => void;
  gameLabel: string;
  /** Which mode the user clicked (the one being explained). */
  mode: "arcade" | "battle";
  status: ModeStatus;
  /** Address of the on-chain program that powers this mode (if any). */
  programId?: string;
  /** Optional cross-link to the actually-live alternative. */
  alternative?: { label: string; href: string };
};

export default function ModeExplainerModal({
  open,
  onClose,
  gameLabel,
  mode,
  status,
  programId,
  alternative,
}: ModeExplainerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const info = STATUS_COPY[status];
  const isArcade = mode === "arcade";
  const headlineColor = isArcade ? "#14F195" : "#9945FF";
  const headline = isArcade
    ? `${gameLabel} — Arcade Mode`
    : `${gameLabel} — Battle Mode`;
  const subline = isArcade
    ? "Solo skill run. Pay-to-save microtxn. Score lives on chain forever."
    : "1v1 head-to-head match. Real-time on MagicBlock ER. Settled trustlessly via Contention Markets v2.1.";

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-explainer-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,4,12,0.78)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0c0c14",
          border: `1px solid ${headlineColor}40`,
          borderRadius: 16,
          padding: "28px 30px",
          maxWidth: 520,
          width: "100%",
          boxShadow: `0 0 60px ${headlineColor}30`,
          color: "#e8e8f0",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: headlineColor, textTransform: "uppercase", marginBottom: 6 }}>
              {isArcade ? "🐍 ARCADE MODE" : "⚡ BATTLE MODE"}
            </div>
            <h2 id="mode-explainer-title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff", lineHeight: 1.2 }}>
              {headline}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "1px solid #252540",
              color: "#8a8aa0",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.6, marginBottom: 20 }}>
          {subline}
        </p>

        {/* Status badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${info.dot}40`,
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: info.dot,
              boxShadow: `0 0 10px ${info.dot}`,
              flexShrink: 0,
              animation: status === "live-devnet" || status === "live-mainnet-soon" ? "modeStatusPulse 1.6s ease-in-out infinite" : "none",
            }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>
              {info.label}
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>
              {info.tone}
            </div>
          </div>
        </div>

        {/* Battle-specific operator-separation note */}
        {!isArcade && (
          <div
            style={{
              fontSize: 11,
              color: "#8a8aa0",
              padding: "10px 12px",
              background: "rgba(153,69,255,0.06)",
              border: "1px solid rgba(153,69,255,0.18)",
              borderRadius: 8,
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Battle Mode and pari-mutuel skill contests are operated by a <strong style={{color:"#c99aff"}}>separate
            offshore entity</strong> (not the AU-based gamerplex.com operator). Mainnet for this surface is gated on
            entity formation and an independent audit. See <Link href="/docs#two-surfaces" style={{ color: "#c99aff" }}>two surfaces, two entities</Link>.
          </div>
        )}

        {/* Program ID */}
        {programId && (
          <div style={{ fontSize: 11, color: "#5a5a70", marginBottom: 16, fontFamily: "monospace" }}>
            Program: <a href={`https://explorer.solana.com/address/${programId}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ color: "#c99aff" }}>{programId}</a>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {alternative && (
            <Link
              href={alternative.href}
              style={{
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 700,
                background: "linear-gradient(135deg, #14F195, #4fc3f7)",
                color: "#020614",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              {alternative.label} →
            </Link>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              color: "#aaa",
              border: "1px solid #252540",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>

        <style>{`
          @keyframes modeStatusPulse {
            0%, 100% { opacity: 1; }
            50%      { opacity: 0.45; }
          }
        `}</style>
      </div>
    </div>
  );
}
