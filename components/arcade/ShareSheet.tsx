"use client";

// Multi-channel share menu (the organic growth engine — a spoiler-free challenge
// that carries the game link; no referral-code / MLM mechanics). Native OS share
// sheet when available, plus explicit per-channel intents (X, Facebook, WhatsApp,
// Telegram, Reddit, Email, SMS) + copy, so it works on desktop and mobile alike.

import { useEffect, useState } from "react";

export default function ShareSheet({
  open,
  onClose,
  text,
  url,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  url: string;
  onShared?: (method: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  const tu = encodeURIComponent(`${text} ${url}`);
  const hasNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const go = (href: string, method: string) => {
    onShared?.(method);
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const channels: { label: string; icon: string; onClick: () => void }[] = [
    { label: "X", icon: "𝕏", onClick: () => go(`https://twitter.com/intent/tweet?text=${t}&url=${u}`, "x") },
    { label: "Facebook", icon: "f", onClick: () => go(`https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`, "facebook") },
    { label: "WhatsApp", icon: "🟢", onClick: () => go(`https://wa.me/?text=${tu}`, "whatsapp") },
    { label: "Telegram", icon: "✈️", onClick: () => go(`https://t.me/share/url?url=${u}&text=${t}`, "telegram") },
    { label: "Reddit", icon: "🟠", onClick: () => go(`https://www.reddit.com/submit?url=${u}&title=${t}`, "reddit") },
    { label: "Email", icon: "✉️", onClick: () => go(`mailto:?subject=${encodeURIComponent("Blockwords challenge")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`, "email") },
    { label: "SMS", icon: "💬", onClick: () => go(`sms:?&body=${tu}`, "sms") },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      onShared?.("clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const native = async () => {
    try { await navigator.share({ title: "Blockwords", text, url }); onShared?.("native"); onClose(); }
    catch { /* cancelled */ }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share your challenge"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(6,6,16,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, background: "#15121f", border: "1px solid #2c2740", borderRadius: "18px 18px 0 0", padding: "18px 18px calc(20px + env(safe-area-inset-bottom))", boxShadow: "0 -20px 60px rgba(0,0,0,0.5)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f4f2fb" }}>Challenge a friend 🪜</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #2c2740", background: "transparent", color: "#9a92b5", fontSize: 15, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#9a92b5", marginBottom: 14, lineHeight: 1.4 }}>{text}</div>

        {hasNative && (
          <button onClick={native} style={{ width: "100%", height: 46, marginBottom: 12, border: "none", borderRadius: 12, background: "linear-gradient(90deg,#9945FF,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            📲 Share…
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {channels.map((c) => (
            <button key={c.label} onClick={c.onClick} style={chip}>
              <span style={{ fontSize: 20 }}>{c.icon}</span>
              <span style={{ fontSize: 10, color: "#b8b0d0" }}>{c.label}</span>
            </button>
          ))}
          <button onClick={copy} style={chip}>
            <span style={{ fontSize: 20 }}>{copied ? "✓" : "🔗"}</span>
            <span style={{ fontSize: 10, color: copied ? "#14F195" : "#b8b0d0" }}>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const chip: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "12px 4px",
  borderRadius: 12,
  border: "1px solid #2c2740",
  background: "#0e0b17",
  cursor: "pointer",
};
