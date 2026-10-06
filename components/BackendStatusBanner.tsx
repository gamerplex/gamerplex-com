"use client";

// "We can't reach Gamerplex right now" — shown when the backend is unreachable.
//
// WHY. Before this, an outage was indistinguishable from being signed out: the
// UI offered Sign in, owned items vanished, and the owner went to re-buy a pack
// he already had (2026-10-06). The session fix stops the false logout; this tells
// people what is actually happening, so "my stuff is gone" becomes "it's them,
// not me, and it's coming back".
//
// Deliberately quiet: one slim bar, no modal, nothing blocking. Most of the site
// is playable from cache during a backend outage, so it must not feel broken.

import { useCallback, useEffect, useRef, useState } from "react";

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || "https://auth.gamerplex.com";

export default function BackendStatusBanner() {
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tries = useRef(0);

  const check = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(`${IDENTITY_URL}/api/auth/me`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      // 5xx is the backend being broken; 4xx is a perfectly healthy "no session".
      return r.status < 500;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let live = true;
    const schedule = () => {
      // Back off while it stays down: 5s, 10s, 20s, capped. Retrying hard against
      // a dead backend helps nobody and hides the recovery in noise.
      const wait = Math.min(5000 * 2 ** Math.min(tries.current, 4), 60_000);
      timer.current = setTimeout(run, wait);
    };
    const run = async () => {
      const ok = await check();
      if (!live) return;
      setOffline(!ok);
      tries.current = ok ? 0 : tries.current + 1;
      if (!ok) schedule();
    };
    void run();

    // Coming back to the tab, or regaining network, is the most likely moment for
    // it to be fixed — check immediately rather than waiting out the backoff.
    const wake = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("gamerplex:focus", wake);
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("gamerplex:focus", wake);
    };
  }, [check]);

  if (!offline) return null;

  return (
    <div role="status" aria-live="polite" style={bar}>
      <span>
        Can&rsquo;t reach Gamerplex right now — <b>you&rsquo;re still signed in</b>. Scores and
        purchases will sync when it&rsquo;s back.
      </span>
      <button
        onClick={() => {
          tries.current = 0;
          void (async () => setOffline(!(await check())))();
        }}
        style={retry}
      >
        Try again
      </button>
    </div>
  );
}

const bar: React.CSSProperties = {
  // FIXED, not in normal flow, for two reasons found by tests:
  //  - `.gl-bg` is a decorative fixed layer at z-index 0 with no
  //    pointer-events:none, and it swallowed clicks on the Try again button.
  //  - several games guarantee a fixed fold with no page scroll; a bar in flow
  //    changed the document height and broke that guarantee outright.
  // Overlaying costs a few px of content during an outage and changes no layout.
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: "calc(9px + env(safe-area-inset-top, 0px)) 14px 9px",
  background: "rgba(255,210,63,.12)",
  borderBottom: "1px solid rgba(255,210,63,.35)",
  color: "#ffd23f",
  fontSize: 12.5,
  lineHeight: 1.45,
  textAlign: "center",
};

const retry: React.CSSProperties = {
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,210,63,.5)",
  background: "transparent",
  color: "#ffd23f",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
