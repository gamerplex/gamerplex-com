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

// True when the page runs inside the Gamerplex native (Expo) WebView, which sets
// this flag before the page loads. Used to show the email-OTP flow there (magic
// links don't return to the app), while normal browsers keep the magic link.
export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && (window as { __GAMERPLEX_NATIVE__?: boolean }).__GAMERPLEX_NATIVE__ === true;
}

// Email OTP — the native-app sign-in. Request a 6-digit code, then verify it.
// verify is credentialed so the service sets the shared `.gamerplex.com` session
// cookie directly into this (WebView) origin — no cookie copying.
export async function requestEmailOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/email/otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!r.ok) return { ok: false, error: r.status === 429 ? 'rate_limited' : `otp_${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function verifyEmailOtp(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/email/otp/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
    });
    if (!r.ok) return { ok: false, error: r.status === 429 ? 'rate_limited' : r.status === 401 ? 'invalid_code' : `otp_${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface SetHandleResult {
  ok: boolean;
  error?: string;         // handle_taken | verify_required | insufficient_credits | validation string | ...
  requiresCredits?: boolean; // rename is in-cooldown — resubmit with payWithCredits to confirm
  cost?: number;             // Credits the rename will cost
  cooldownEndsAt?: number;   // epoch ms when the free rename unlocks
}

// Set/rename the FREE web2 handle. Credentialed cross-origin, mirrors the
// on-chain set_handle validation. A rename within the 24h cooldown returns
// { requiresCredits, cost, cooldownEndsAt } (no charge) — call again with
// payWithCredits:true to confirm the Credits spend.
export async function setHandle(handle: string, payWithCredits = false): Promise<SetHandleResult> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/set-handle`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: handle.trim().toLowerCase(), payWithCredits }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, error: j.error || `handle_${r.status}`, requiresCredits: j.requiresCredits, cost: j.cost, cooldownEndsAt: j.cooldownEndsAt };
    }
    track('handle_set', { paid: payWithCredits });
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// Step 1 of "Lock on-chain": the server sets the promotion lock + returns the
// handle to claim on-chain. The caller then builds/signs the arcade set_handle
// ix and calls confirmPromoteHandle with the txSig.
export async function promoteHandle(): Promise<{ ok: boolean; handle?: string; wallet?: string; alreadyOnChain?: boolean; error?: string }> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/promote-handle`, { method: 'POST', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `promote_${r.status}` };
    return { ok: true, handle: j.handle, wallet: j.wallet, alreadyOnChain: j.alreadyOnChain };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// Step 2 of "Lock on-chain": confirm the submitted set_handle tx so the server
// flips handleOnChain (idempotent/replay-safe).
export async function confirmPromoteHandle(txSig: string): Promise<{ ok: boolean; onChain?: boolean; error?: string }> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/promote-handle/confirm`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txSig }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `confirm_${r.status}` };
    track('handle_promoted', {});
    return { ok: true, onChain: j.onChain };
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

export type DailyStreak =
  | { claimed: true; amount: number; streak: number }
  | { claimed: false; reason: 'already_claimed_today' | 'capped'; streak: number };

// Claim today's daily-streak Credits reward. Idempotent per UTC day (server-side),
// so it's safe to call on every load. Returns null when anonymous / failed.
export async function claimDailyStreak(): Promise<DailyStreak | null> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/auth/claim-daily`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!r.ok) return null;
    return (await r.json()) as DailyStreak;
  } catch {
    return null;
  }
}

// Call at game START: mint a proof-of-play token bound to this user+game. Hold
// the returned token until game end and pass it to awardPlay. Returns null if
// not signed in / failed (caller should just skip the credit).
export async function startPlaySession(gameId: number): Promise<string | null> {
  try {
    const r = await fetch('/api/credits/play-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.token === 'string' ? j.token : null;
  } catch {
    return null;
  }
}

// Grant the daily "you played" engagement credit at game END. SAME-ORIGIN call
// to our own server route (which holds the IDENTITY_API_KEY) — never hits
// identity-service directly from the browser. Requires the play token from
// startPlaySession (proof of play). Idempotent server-side (one credit per
// game/day). Returns the new gamerplex balance, or null if not awarded.
export async function awardPlay(gameId: number, playToken: string): Promise<number | null> {
  try {
    const r = await fetch('/api/credits/award-play', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId, playToken }),
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

// Server-authoritative streak. Call on daily activity → increments (or silently
// consumes a freeze on a 1-day gap; resets on a bigger gap). Returns the truth to show.
export type StreakPing = { streak: number; best: number; freezes: number; milestone: number | null; froze: boolean };
export async function pingStreak(): Promise<StreakPing | null> {
  try {
    const r = await fetch('/api/streak/ping', { method: 'POST', credentials: 'include' });
    if (!r.ok) return null;
    return (await r.json()) as StreakPing;
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

// Claim the referral reward after the referred user signs up. SAME-ORIGIN to our own
// route (which holds the key + the server-fixed amounts + the by-wallet lookup, so a
// client can never mint or name an amount). CREDITS ONLY (R2) — welcome grant to the new
// user + referral grant to the referrer. Idempotent per (referrer, referred) server-side:
// safe to call on every sign-in; a repeat is a no-op. Fire-and-forget; returns true on 2xx.
export async function claimReferral(referrer: string): Promise<boolean> {
  try {
    const r = await fetch('/api/credits/referral', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referrer }),
    });
    if (!r.ok) {
      track('referral_result', { outcome: 'error', status: r.status });
      return false;
    }
    const j = await r.json().catch(() => ({}));
    // Emit the outcome for EVERY attempt so referral drop-off is visible — the
    // completion gate silently blocks most referrals (both sides need a full
    // profile), which is exactly what we couldn't see before.
    const outcome = j?.selfReferral
      ? 'self_referral'
      : j?.referrerFound === false
        ? 'referrer_not_found'
        : j?.referrerIncomplete
          ? 'blocked_referrer_incomplete'
          : j?.pending
            ? 'blocked_referred_incomplete'
            : j?.referrerFound
              ? 'granted'
              : 'unknown';
    track('referral_result', { outcome });
    if (outcome === 'granted') track('referral_claimed', {});
    return true;
  } catch {
    track('referral_result', { outcome: 'network_error' });
    return false;
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

// $GAME balance of a wallet (same-origin API; 0 when no ATA / no wallet).
export async function getGameBalance(wallet: string | null | undefined): Promise<number> {
  if (!wallet) return 0;
  try {
    const r = await fetch(`/api/wallet/game-balance?wallet=${wallet}`);
    if (!r.ok) return 0;
    const { balance } = await r.json();
    return typeof balance === 'number' ? balance : 0;
  } catch {
    return 0;
  }
}
