import { describe, it, expect, beforeEach } from 'vitest';
import { mintPlayToken, verifyPlayToken, redeemOnce } from '../play-token';

const UID = 'user-1';
const GID = 3;
const T0 = 1_000_000_000_000;

beforeEach(() => {
  process.env.PLAY_TOKEN_SECRET = 'test-secret';
  process.env.PLAY_TOKEN_MIN_MS = '15000';
  process.env.PLAY_TOKEN_MAX_MS = '3600000';
});

describe('play-token (RA-I / award-play proof-of-play)', () => {
  it('verifies a token after the minimum play duration', () => {
    const tok = mintPlayToken(UID, GID, 'jti-1', T0)!;
    expect(verifyPlayToken(tok, UID, GID, T0 + 16_000).ok).toBe(true);
  });

  it('rejects before the minimum play duration (too_fast)', () => {
    const tok = mintPlayToken(UID, GID, 'jti-1', T0)!;
    expect(verifyPlayToken(tok, UID, GID, T0 + 1_000).reason).toBe('too_fast');
  });

  it('rejects an expired token', () => {
    const tok = mintPlayToken(UID, GID, 'jti-1', T0)!;
    expect(verifyPlayToken(tok, UID, GID, T0 + 7_200_000).reason).toBe('expired');
  });

  it('rejects cross-game and cross-user reuse', () => {
    const tok = mintPlayToken(UID, GID, 'jti-1', T0)!;
    expect(verifyPlayToken(tok, UID, 4, T0 + 16_000).reason).toBe('mismatch');
    expect(verifyPlayToken(tok, 'user-2', GID, T0 + 16_000).reason).toBe('mismatch');
  });

  it('rejects a tampered signature', () => {
    const tok = mintPlayToken(UID, GID, 'jti-1', T0)!;
    expect(verifyPlayToken(tok.slice(0, -2) + 'xx', UID, GID, T0 + 16_000).reason).toBe('bad_signature');
  });

  it('rejects a forged token (no secret knowledge)', () => {
    const payload = Buffer.from(JSON.stringify({ uid: UID, gid: GID, iat: T0, jti: 'x' })).toString('base64url');
    expect(verifyPlayToken(`${payload}.AAAA`, UID, GID, T0 + 16_000).ok).toBe(false);
  });

  it('fails closed when the secret is unset', () => {
    const tok = mintPlayToken(UID, GID, 'jti-1', T0)!;
    delete process.env.PLAY_TOKEN_SECRET;
    expect(mintPlayToken(UID, GID, 'jti-2', T0)).toBeNull();
    expect(verifyPlayToken(tok, UID, GID, T0 + 16_000).reason).toBe('misconfigured');
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyPlayToken('not-a-token', UID, GID, T0).reason).toBe('malformed');
    expect(verifyPlayToken(undefined, UID, GID, T0).reason).toBe('malformed');
  });

  it('single-use: redeemOnce blocks replay of the same jti', () => {
    expect(redeemOnce('jti-replay', T0)).toBe(true);
    expect(redeemOnce('jti-replay', T0 + 100)).toBe(false);
  });
});
