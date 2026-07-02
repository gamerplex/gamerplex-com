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
  getIdentity,
  buildSiwsMessage,
  type IdentityUser,
} from './client';
import { track } from '../analytics';

export function useIdentity() {
  const { publicKey, signMessage, connected } = useWallet();
  const [user, setUser] = useState<IdentityUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setUser(await getIdentity());
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
    walletConnected: connected,
    loading,
    error,
    signIn,
    refresh,
  };
}
