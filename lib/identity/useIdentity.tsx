'use client';

// React hook for unified identity (Sign In With Solana). Drives the full SIWS
// handshake against auth.gamerplex.com using the connected wallet's signMessage,
// and tracks the current session user. Network-agnostic.

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

import {
  requestSiwsChallenge,
  submitSiws,
  buildSiwsMessage,
  fetchIdentity,
  type IdentityUser,
} from './client';
import { track } from '../analytics';

// Last known session, for showing the right thing during an outage.
//
// NOT a credential: it carries no token and grants nothing. Storage can throw
// (private windows, blocked site data), so every access is guarded and the app
// renders correctly when it comes back empty.
const LAST_IDENTITY_KEY = 'gpx_last_identity';

function readLastIdentity(): IdentityUser | null {
  try {
    const raw = localStorage.getItem(LAST_IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as IdentityUser) : null;
  } catch {
    return null;
  }
}

function writeLastIdentity(u: IdentityUser | null): void {
  try {
    // Cleared on a genuine signed-out answer, so a shared device does not keep
    // showing the previous person.
    if (u) localStorage.setItem(LAST_IDENTITY_KEY, JSON.stringify(u));
    else localStorage.removeItem(LAST_IDENTITY_KEY);
  } catch {
    /* storage unavailable — the app must still work */
  }
}

export function useIdentity() {
  const { publicKey, signMessage, connected } = useWallet();
  const [user, setUser] = useState<IdentityUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The backend being unreachable is NOT a logout. Keeping the last known user
  // through an outage is the whole point: otherwise the UI offers "Sign in" and
  // hides what someone has already paid for, and they try to buy it again.
  const [backendOffline, setBackendOffline] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetchIdentity();
    if (s.status === 'offline') {
      setBackendOffline(true);
      // COLD START is the case that actually bit us. Keeping in-memory state is
      // useless when the outage is already underway as the page loads — there is
      // nothing in memory yet — so fall back to the last session we saw. This is
      // a DISPLAY hint only: the cookie is the real credential and every
      // privileged call still goes to the server, which will refuse it.
      setUser((prev) => prev ?? readLastIdentity());
      return;
    }
    setBackendOffline(false);
    const next = s.status === 'in' ? s.user : null;
    writeLastIdentity(next);
    setUser(next);
  }, []);

  // Load existing session on mount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      throw new Error('Connect a wallet that supports message signing first.');
    }
    setLoading(true);
    setError(null);
    track('signin_started', { method: 'wallet' });
    try {
      const challenge = await requestSiwsChallenge();
      const message = buildSiwsMessage({
        domain: challenge.domain,
        pubkey: publicKey.toBase58(),
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
      });
      const signature = await signMessage(new TextEncoder().encode(message));
      const result = await submitSiws(publicKey.toBase58(), bs58.encode(signature));
      await refresh();
      track('signin_success', { method: 'wallet' });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'sign-in failed';
      setError(msg);
      track('signin_failed', { method: 'wallet', reason: msg });
      throw e;
    } finally {
      setLoading(false);
    }
  }, [publicKey, signMessage, refresh]);

  return {
    user,
    isSignedIn: !!user,
    /** True when we could not reach identity at all. Session state is unknown,
        not absent — show a "try again" affordance, never a sign-in prompt. */
    backendOffline,
    walletConnected: connected,
    loading,
    error,
    signIn,
    refresh,
  };
}
