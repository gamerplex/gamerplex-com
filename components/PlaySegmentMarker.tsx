"use client";

// Marks <body> while a /play route is mounted, so a purchased theme's decorative
// layers can be suppressed over the game itself.
//
// The scanline overlay is body::after at z-index 9998 — above the game canvas.
// A texture across the play area is a gameplay change, not a cosmetic one, and
// nothing bought in the shop should alter what a player sees while running.
// The token retint stays: the shell around the game (results, leaderboard) is
// chrome, and that is what the theme is for.
//
// An attribute set on mount rather than a :has() selector, so it behaves the
// same in the app's WebView as in a desktop browser.

import { useEffect } from "react";

export default function PlaySegmentMarker() {
  useEffect(() => {
    document.body.setAttribute("data-ingame", "");
    return () => document.body.removeAttribute("data-ingame");
  }, []);
  return null;
}
