// PostHog was DELETED with ph001 on 2026-09-15. This component is now a
// pass-through and deliberately initialises nothing.
//
// It is kept (rather than removed from app/layout.tsx) so the layout stays stable
// and so this note sits where anyone looking for analytics will find it.
//
// Analytics now = `track()` in lib/analytics.ts, which POSTs play_started /
// game_started to identity-service (`/api/v1/analytics/event`). The historical
// PostHog data was imported, so counts are continuous.
//
// ⚠️ Do NOT re-add posthog-js pointing at ph001.gamerplex.com. That DNS record was
// deleted after it caused a real outage: the record outlived the VM, so the browser
// opened a TCP connection that never answered and the page `load` event NEVER FIRED
// on gamerplex.com and sledgit.com (measured 25s timeouts, 811ms after the fix).
//
// Automated traffic: lib/analytics.ts does not tag test_traffic from the client.
// The server column exists and the trending query excludes it — set it server-side
// if a synthetic source ever needs filtering.

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
