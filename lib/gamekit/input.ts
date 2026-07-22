// Minimal input helpers. Deliberately small: per-game DOM buttons and bespoke
// touch clusters stay in each game (they're legitimately game-specific). This
// covers only the two things every game re-implements: a keyboard key-set tracker
// and (re-exported) coarse-pointer detection. A shared analog-joystick helper is a
// candidate for a later version — not v0.

/** A live Set of currently-held lowercase keys, with e.repeat and default-prevention handled. */
export interface KeySet {
  keys: Set<string>;
  has: (k: string) => boolean;
  dispose: () => void;
}

/**
 * Track held keys on `window`. `prevent` lists keys whose default is suppressed
 * (e.g. arrows/space to stop the page scrolling). Call dispose() on teardown.
 */
export function makeKeySet(prevent: readonly string[] = [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"]): KeySet {
  const keys = new Set<string>();
  const preventSet = new Set(prevent.map((k) => k.toLowerCase()));

  const onDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (preventSet.has(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
  };
  const onUp = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  return {
    keys,
    has: (k: string) => keys.has(k.toLowerCase()),
    dispose: () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      keys.clear();
    },
  };
}

export { isTouch } from "./bootstrap";
