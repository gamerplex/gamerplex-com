// Client for the Gamerplex identity service (auth.gamerplex.com) — SIWS wallet
// login + session lookup + the unified Credits balance. Auth is NETWORK-AGNOSTIC
// (verifies an off-chain signature), so this works identically on devnet/mainnet.
//
// All calls are credentialed cross-origin (gamerplex.com → auth.gamerplex.com);
// the service returns the matching CORS + sets a `.gamerplex.com` session cookie.

import { track } from '../analytics';

const IDENTITY_URL =
  process.env.NEXT_PUBLIC_IDENTITY_URL || 'https://auth.gamerplex.com';

export interface IdentityUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  handle: string | null;
  bio: string | null;
  walletAddress: string | null;
  handleOnChain: boolean;
  createdAt: string;
}

export interface SiwsChallenge {
  domain: string;
  nonce: string;
  issuedAt: string;
}

// MUST match the server's canonical message byte-for-byte (lib/siws.ts).
export function buildSiwsMessage(p: {
  domain: string;
  pubkey: string;
  nonce: string;
  issuedAt: string;
}): string {
  return (
    `${p.domain} wants you to sign in with your Solana account:\n` +
    `${p.pubkey}\n\n` +
    `Nonce: ${p.nonce}\n` +
    `Issued At: ${p.issuedAt}`
  );
}

export async function requestSiwsChallenge(): Promise<SiwsChallenge> {
  const r = await fetch(`${IDENTITY_URL}/api/auth/wallet/siws`, {
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`siws challenge failed: ${r.status}`);
  return r.json();
}

export async function submitSiws(
  pubkey: string,
  signatureB58: string,
): Promise<{ status: 'created' | 'login' | 'linked'; walletAddress: string }> {
  const r = await fetch(`${IDENTITY_URL}/api/auth/wallet/siws`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pubkey, signature: signatureB58 }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `siws sign-in failed: ${r.status}`);
  }
  return r.json();
}

// Email magic-link sign-in/up — the ecosystem-standard web2 entry point (same identity-service
// the wallet SIWS flow uses). POSTs the email; the service emails a sign-in link, and
// /verify-email issues the shared `.gamerplex.com` session. Origin-scoped server-side.
export interface EmailSignupResult {
  ok: boolean;
  error?: string;
  status?: string;
  throttled?: boolean;
}

export async function emailSignup(email: string): Promise<EmailSignupResult> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/email-signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: r.status === 429 ? 'rate_limited' : j.error || `email_${r.status}` };
    return { ok: true, status: j.status, throttled: j.throttled === true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface CreditsBalance {
  total: number;
  lifetimeEarned: number;
  perApp: { app: string; balance: number; lifetimeEarned: number }[];
}

// The signed-in user's OWN credit balances (cross-app total + per-app). Returns
// null when anonymous. Read-only + session-authed — no API key in the browser.
export async function getCredits(): Promise<CreditsBalance | null> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/credits`, {
      credentials: 'include',
    });
    if (!r.ok) return null;
    const { credits } = await r.json();
    return credits ?? null;
  } catch {
    return null;
  }
}

// Grant the daily "you played" engagement credit. SAME-ORIGIN call to our own
// server route (which holds the IDENTITY_API_KEY) — never hits identity-service
// directly from the browser. Idempotent server-side (one credit per game/day).
// Returns the new gamerplex balance, or null if not signed in / failed.
export async function awardPlay(gameId: number): Promise<number | null> {
  try {
    const r = await fetch('/api/credits/award-play', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const bal = typeof j.appBalance === 'number' ? j.appBalance : null;
    track('credits_earned', { category: 'play_engagement', balance_after: bal });
    return bal;
  } catch {
    return null;
  }
}

// Award Credits (web2) for a lean in-game action ("game_win" | "daily_streak"). CREDITS ONLY —
// never $GAME (R2). SAME-ORIGIN to our own route (which holds the key); capped + idempotent
// server-side. Fire-and-forget; returns the new gamerplex balance or null.
export async function earnCredits(
  action: 'game_win' | 'daily_streak',
  refId?: string,
): Promise<number | null> {
  try {
    const r = await fetch('/api/credits/earn', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, refId }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const bal = typeof j.appBalance === 'number' ? j.appBalance : null;
    track('credits_earned', { category: action, balance_after: bal });
    return bal;
  } catch {
    return null;
  }
}

// Spend Credits (web2) on an above-the-money-line item ("continue" | "retry"). SAME-ORIGIN to
// our own route (which holds the key + the fixed catalog, so a client can't spend an arbitrary
// amount). Returns the new app balance, or { error } — "insufficient" when the balance is too low.
export interface SpendResult {
  ok: boolean;
  appBalance?: number | null;
  error?: string;
}

export async function spendCredits(
  item: 'continue' | 'retry',
  refId?: string,
): Promise<SpendResult> {
  try {
    const r = await fetch('/api/credits/spend', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item, refId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `spend_${r.status}` };
    const bal = typeof j.appBalance === 'number' ? j.appBalance : null;
    track('credits_spent', { item, balance_after: bal });
    return { ok: true, appBalance: bal };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// "Who am I?" — returns null when anonymous (never throws on 401).
export async function getIdentity(): Promise<IdentityUser | null> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/me`, {
      credentials: 'include',
    });
    if (!r.ok) return null;
    const { user } = await r.json();
    return user ?? null;
  } catch {
    return null;
  }
}
