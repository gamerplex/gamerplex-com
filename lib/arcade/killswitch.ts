// One-toggle kill-switch for every paid / $GAME purchase surface in the arcade.
// Set NEXT_PUBLIC_GAME_PURCHASES_ENABLED="false" in prod env to INSTANTLY hide
// all on-chain "save permanently / verified ($0.05)" upgrade affordances across
// every game — the fast UX stop. It complements (does not replace) the
// authoritative contract-level `payments_paused` hard stop; flip both in an
// incident. Default: enabled (only the literal string "false" disables).
export function purchasesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GAME_PURCHASES_ENABLED !== "false";
}
