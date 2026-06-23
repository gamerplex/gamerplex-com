'use client';

// Compact, fixed top-right bar: unified Credits balance + Sign-in-with-Solana.
// Mounted inside the arcade wallet-adapter provider tree. Non-blocking
// (pointer-events only on its own controls) so it never covers gameplay.

import { CreditsBadge } from './CreditsBadge';
import { SignInWithSolana } from './SignInWithSolana';

export function ArcadeIdentityBar() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 10,
        right: 12,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 12,
      }}
    >
      <CreditsBadge />
      <SignInWithSolana />
    </div>
  );
}
