// Hostname-based network safety guard.
//
// Production hostnames MUST be mainnet. Localhost / Vercel previews MUST be
// devnet. Prevents accidental cross-net payments when an env var is
// misconfigured. Throws at boot so the UI fails loud instead of charging the
// wrong network.

import { ARCADE_NETWORK } from "./client";

const PROD_HOSTS = new Set([
  "gamerplex.com",
  "www.gamerplex.com",
  "flipball.gamerplex.com",
]);

export class NetworkMismatchError extends Error {
  constructor(public host: string, public network: string) {
    super(`Network mismatch: hostname ${host} requires mainnet but ARCADE_NETWORK=${network}`);
    this.name = "NetworkMismatchError";
  }
}

export function assertNetworkMatchesHostname(): void {
  if (typeof window === "undefined") return;
  const host = window.location.hostname.toLowerCase();
  if (PROD_HOSTS.has(host) && ARCADE_NETWORK !== "mainnet") {
    throw new NetworkMismatchError(host, ARCADE_NETWORK);
  }
}
