'use client';

// The ONE account affordance — a fixed top-right chip on every app-shell page
// (Play / Shop / Ranks / Profile). Shows login state at a glance: signed-out → "Sign
// in"; signed-in → avatar + handle + Credits (+ a ◆ dot when a wallet is linked).
// Tapping always opens the Profile tab — in the native app via a bridge message
// (the native Profile tab owns wallet/$GAME via MWA); on web it routes to /app/profile.
// Standardized so the same chip is dropped into Sledgit + PLG headers too.

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from 'react';

import { useIdentity } from '../../lib/identity/useIdentity';
import { getCredits, getGameBalance } from '../../lib/identity/client';

function isNative(): boolean {
  return typeof window !== 'undefined' && (window as { __GAMERPLEX_NATIVE__?: boolean }).__GAMERPLEX_NATIVE__ === true;
}

function openProfile() {
  if (isNative()) {
    const rn = (window as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView;
    rn?.postMessage(JSON.stringify({ type: 'gpx-open-profile' }));
    return;
  }
  window.location.href = '/app/profile';
}

function initials(user: { handle: string | null; email: string | null }): string {
  const s = user.handle || user.email || 'you';
  return s.replace(/^@/, '').slice(0, 2).toUpperCase();
}

export function AccountChip() {
  const { user, isSignedIn } = useIdentity();
  const { publicKey } = useWallet();
  const [credits, setCredits] = useState<number | null>(null);
  const [game, setGame] = useState<number | null>(null);

  useEffect(() => {
    if (!isSignedIn) { setCredits(null); return; }
    void getCredits().then((c) =>
      setCredits(c?.perApp.find((a) => a.app === 'gamerplex')?.balance ?? c?.total ?? 0),
    );
  }, [isSignedIn]);

  useEffect(() => {
    // Same two-wallets problem as the Shop: fall back to the connected wallet so a
    // player who connected Phantom without a SIWS link still sees their $GAME.
    const addr = user?.walletAddress ?? publicKey?.toBase58() ?? null;
    if (!addr) { setGame(null); return; }
    void getGameBalance(addr).then(setGame);
  }, [user?.walletAddress, publicKey]);

  if (!isSignedIn || !user) {
    return (
      <button onClick={openProfile} style={signedOut} aria-label="Sign in">
        Sign in
      </button>
    );
  }

  return (
    <button onClick={openProfile} style={wrap} aria-label="Open your profile">
      <span style={avatar}>{initials(user)}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
        <span style={{ fontWeight: 800, fontSize: 12.5, color: '#fff', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.handle ? `@${user.handle}` : (user.email?.split('@')[0] ?? 'you')}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: 'ui-monospace,monospace' }}>
          <span style={{ color: '#14F195' }}>⬡ {credits == null ? '—' : credits.toLocaleString()}</span>
          {user.walletAddress ? (
            <span style={{ color: '#b388ff' }}> · ◆ {game == null ? '—' : game.toLocaleString()}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

const base: React.CSSProperties = {
  position: 'fixed', top: 'max(10px, env(safe-area-inset-top))', right: 12, zIndex: 900,
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  border: '1px solid rgba(153,69,255,0.4)', borderRadius: 999,
  background: 'rgba(20,6,40,0.86)', backdropFilter: 'blur(8px)',
  padding: '6px 12px 6px 6px', WebkitTapHighlightColor: 'transparent',
};
const wrap: React.CSSProperties = { ...base };
const signedOut: React.CSSProperties = {
  ...base, padding: '8px 16px', fontWeight: 800, fontSize: 13, color: '#fff',
  background: 'linear-gradient(100deg,#9945ff,#7a2bff)', border: '1px solid transparent',
};
const avatar: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
  background: 'linear-gradient(135deg,#14F195,#35d0ff)', color: '#07121a',
  display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 12,
};
