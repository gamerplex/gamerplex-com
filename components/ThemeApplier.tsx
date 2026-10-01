"use client";

// Applies a purchased site theme to <html data-theme="...">.
//
// Ownership is the gate and it is checked against the server (/api/inventory),
// never trusted from localStorage — localStorage only remembers WHICH owned
// theme the viewer picked. A stored theme the account does not own is cleared,
// so copying a localStorage value into another browser buys nothing.
//
// Renders nothing. Mount once in the root layout.

import { useEffect } from "react";

import { SITE_THEMES, THEME_STORAGE_KEY, themeForId } from "../lib/arcade/themes";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null; // private window / blocked storage — default theme is correct
  }
}

function clearStored(): void {
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch { /* nothing to do */ }
}

export default function ThemeApplier() {
  useEffect(() => {
    const wanted = readStored();
    if (!wanted || !themeForId(wanted)) {
      // Nothing picked, or a theme id we no longer ship.
      if (wanted) clearStored();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inventory", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { items?: { itemId?: string }[] };
        if (cancelled) return;

        const ownedIds = new Set((body.items ?? []).map((i) => i.itemId).filter(Boolean) as string[]);
        const theme = themeForId(wanted);
        if (theme && ownedIds.has(theme.id)) {
          document.documentElement.setAttribute("data-theme", theme.attr);
        } else {
          // Signed out, or no longer owned: fall back and forget the choice.
          document.documentElement.removeAttribute("data-theme");
          clearStored();
        }
      } catch {
        /* offline — default theme stands */
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}

/** Apply a theme the viewer owns. Caller is responsible for the ownership check. */
export function applyTheme(themeId: string | null): void {
  const theme = themeId ? themeForId(themeId) : undefined;
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme.attr);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme.id); } catch { /* ignore */ }
  } else {
    document.documentElement.removeAttribute("data-theme");
    clearStored();
  }
}

export { SITE_THEMES };
