// Analytics. PostHog (ph001) was deleted 2026-09-15; events now go to
// identity-service's analytics_events table via POST /api/v1/analytics/event.
// The historical PostHog data (14,196 events) was imported there, so counts are
// continuous across the migration.
//
// Deliberately minimal — this exists to answer "how many plays per game", not to
// be a general analytics product. 96% of PostHog's 357k events were
// `arcade_leaderboard_prewarmed` cron spam, which is what justified dropping it.
// Do NOT start emitting high-volume machine events through here.

const IDENTITY_URL =
  process.env.NEXT_PUBLIC_IDENTITY_URL || "https://auth.gamerplex.com";

// ── Client-side spam guard (per-event dedup) ────────────────────────────────
// Swallow the SAME event name fired again within DEDUP_MS — kills tight loops and
// accidental double-fires (e.g. a racing game_over).
const DEDUP_MS = 350;
const lastByEvent = new Map<string, number>();

// Only these reach the server. Everything else is a no-op: the table answers one
// question, and an open funnel is how the old instance filled with 343k junk rows.
const ALLOWED = new Set(["play_started", "game_started"]);

/**
 * Durable per-browser id, so "how many people played" and "did they come back" are
 * answerable at all. Without it every event is anonymous and DAU/retention cannot be
 * computed — which is the state gamerplex events were in: the client sent no
 * distinct_id, so 246 historical events had one (from the PostHog import) and every
 * NEW event had none.
 *
 * Deliberately a random UUID, not a fingerprint: no PII, no cross-site value, and a
 * user clearing site data simply becomes a new anonymous id. Never send a wallet or
 * email here — the identity service already knows those, and this table is meant to
 * answer product questions, not build profiles.
 */
const ANON_KEY = "gpx_anon_id";

function anonId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `a-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    // Private mode / blocked storage — stay anonymous rather than break the event.
    return undefined;
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const last = lastByEvent.get(event) ?? 0;
  if (now - last < DEDUP_MS) return; // deduped — a loop firing the same event
  lastByEvent.set(event, now);

  if (!ALLOWED.has(event)) return;

  const props = properties ?? {};
  const game = typeof props.game === "string" ? props.game : undefined;

  try {
    // keepalive so a navigation (game start → route change) can't drop it.
    void fetch(`${IDENTITY_URL}/api/v1/analytics/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event,
        game,
        app: "gamerplex",
        surface: "gamerplex-web",
        distinctId: anonId(),
        props,
      }),
    }).catch(() => {});
  } catch {
    // Analytics must never break gameplay.
  }
}

// Kept as a no-op: call sites still reference it, and wallet-level identity is
// deliberately NOT collected by the replacement (no per-user analytics profile).
export function identifyWallet(_walletAddress: string | null | undefined) {}
