"use client";

// Standard in-game exit — the obvious "get me out" control every game shares.
// history.back() returns the player to the grid they entered from (web /#featured
// or the native /app/play tab) with no context-guessing; home is the fallback.
export default function BackToGames() {
  const go = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };
  return (
    <button
      onClick={go}
      aria-label="Back to games"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)",
        color: "#e8e8f0", fontSize: 13, fontWeight: 800, borderRadius: 999,
        padding: "6px 14px 6px 11px", cursor: "pointer", whiteSpace: "nowrap",
        fontFamily: "inherit", lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 16 }}>←</span> Games
    </button>
  );
}
