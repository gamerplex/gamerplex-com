// Client-side read of the geo signal the middleware stamps on free routes.
// `gp_web3block=1` means the visitor is in an OFAC-sanctioned region, so any
// inline web3 affordance (on-chain save, wallet-connect-to-pay) must hide —
// no token may move. Free play itself is never gated. See middleware.ts +
// ENGINEERING/OPERATIONS/GEOFENCE.md.

export function web3Blocked(): boolean {
  if (typeof document === "undefined") return false; // SSR: don't hide (client re-checks)
  return /(?:^|;\s*)gp_web3block=1(?:;|$)/.test(document.cookie);
}
