import posthog from "posthog-js";

// ── Client-side spam guard (layer 1: per-event dedup) ───────────────────────
// First line of defence against a stuck loop or a bot hammering the same event:
// swallow the SAME event name fired again within DEDUP_MS (kills tight loops and
// accidental double-fires like a racing game_over). The AUTHORITATIVE global cap
// across ALL events — including PostHog autocapture/pageviews, which never pass
// through track() — lives in PostHogProvider's `before_send` hook.
const DEDUP_MS = 350;
const lastByEvent = new Map<string, number>();

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const last = lastByEvent.get(event) ?? 0;
  if (now - last < DEDUP_MS) return; // deduped — a loop firing the same event
  lastByEvent.set(event, now);
  try {
    posthog.capture(event, properties);
  } catch {}
}

export function identifyWallet(walletAddress: string | null | undefined) {
  if (typeof window === "undefined" || !walletAddress) return;
  try {
    posthog.identify(walletAddress);
  } catch {}
}
