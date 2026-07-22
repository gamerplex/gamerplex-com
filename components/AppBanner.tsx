"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Dismissible mobile-web install prompt → /download. Hidden inside the native app
// (already installed), on desktop, on /download and /app/*, and once dismissed.
export default function AppBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      const nativeApp = (window as unknown as { __GAMERPLEX_NATIVE__?: boolean }).__GAMERPLEX_NATIVE__ || ua.includes("GamerplexApp");
      const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
      const dismissed = localStorage.getItem("gpx_app_banner") === "1";
      if (!nativeApp && mobile && !dismissed) setShow(true);
    } catch {
      /* no-op */
    }
  }, []);

  if (!show || pathname?.startsWith("/download") || pathname?.startsWith("/app")) return null;

  const dismiss = () => {
    try {
      localStorage.setItem("gpx_app_banner", "1");
    } catch {
      /* no-op */
    }
    setShow(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
        background: "rgba(13,0,26,0.94)",
        borderTop: "1px solid rgba(153,69,255,0.4)",
        backdropFilter: "blur(10px)",
        fontFamily: "system-ui,-apple-system,sans-serif",
      }}
    >
      <span style={{ flex: 1, color: "#fff", fontSize: 13, fontWeight: 700 }}>▶ Get the Gamerplex app</span>
      <a
        href="/download"
        style={{ background: "linear-gradient(100deg,#9945ff,#7a2bff)", color: "#fff", fontWeight: 800, fontSize: 13, padding: "8px 15px", borderRadius: 10, textDecoration: "none" }}
      >
        Install
      </a>
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "#9a8fc4", fontSize: 18, padding: "4px 6px", cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}
