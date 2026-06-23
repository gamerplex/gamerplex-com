// Server-issued proof-of-play token. Minted at game start, redeemed at game end.
// HMAC-signed (PLAY_TOKEN_SECRET), bound to user+game, and only valid after a
// minimum play duration — so the daily engagement credit can't be farmed with a
// bare POST. The daily refId idempotency at identity-service remains the hard
// per-day cap; this gates *that you actually played* before awarding.

import { createHmac, timingSafeEqual } from 'crypto';

const MIN_PLAY_MS = parseInt(process.env.PLAY_TOKEN_MIN_MS || '15000', 10); // 15s floor
const MAX_AGE_MS = parseInt(process.env.PLAY_TOKEN_MAX_MS || '3600000', 10); // 1h

function secret(): string | null {
  return process.env.PLAY_TOKEN_SECRET || null;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payloadB64: string, key: string): string {
  return b64url(createHmac('sha256', key).update(payloadB64).digest());
}

export interface PlayTokenPayload {
  uid: string;
  gid: number;
  iat: number;
  jti: string;
}

// Returns null if PLAY_TOKEN_SECRET is unset (caller should 500).
export function mintPlayToken(uid: string, gid: number, jti: string, now: number): string | null {
  const key = secret();
  if (!key) return null;
  const payload: PlayTokenPayload = { uid, gid, iat: now, jti };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadB64}.${sign(payloadB64, key)}`;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  jti?: string;
}

export function verifyPlayToken(token: unknown, uid: string, gid: number, now: number): VerifyResult {
  const key = secret();
  if (!key) return { ok: false, reason: 'misconfigured' };
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const [payloadB64, sig] = token.split('.', 2);
  const expected = sign(payloadB64, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };

  let payload: PlayTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.uid !== uid || payload.gid !== gid) return { ok: false, reason: 'mismatch' };
  const age = now - payload.iat;
  if (age < MIN_PLAY_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true, jti: payload.jti };
}

// Best-effort single-use guard. On serverless the hard cap is the daily refId
// idempotency; this just stops trivial replay within one warm instance.
const redeemed = new Map<string, number>();
export function redeemOnce(jti: string, now: number): boolean {
  for (const [k, t] of redeemed) if (now - t > MAX_AGE_MS) redeemed.delete(k);
  if (redeemed.has(jti)) return false;
  redeemed.set(jti, now);
  return true;
}
