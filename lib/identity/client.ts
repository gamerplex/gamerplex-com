// Client for the Gamerplex identity service (auth.gamerplex.com) — SIWS wallet
// login + session lookup + the unified Credits balance. Auth is NETWORK-AGNOSTIC
// (verifies an off-chain signature), so this works identically on devnet/mainnet.
//
// All calls are credentialed cross-origin (gamerplex.com → auth.gamerplex.com);
// the service returns the matching CORS + sets a `.gamerplex.com` session cookie.

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
    return typeof j.appBalance === 'number' ? j.appBalance : null;
  } catch {
    return null;
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
