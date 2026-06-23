'use client';

// Drop-in "Sign in with Solana" control. Shows the signed-in handle/wallet when
// a session exists, else a button that runs the SIWS handshake. Place anywhere
// inside the wallet-adapter provider tree.

import { useIdentity } from '../../lib/identity/useIdentity';

export function SignInWithSolana() {
  const { user, isSignedIn, loading, error, signIn, walletConnected } = useIdentity();

  if (isSignedIn) {
    const label = user?.handle
      ? `@${user.handle}`
      : user?.walletAddress
        ? `${user.walletAddress.slice(0, 4)}…${user.walletAddress.slice(-4)}`
        : 'signed in';
    return <span data-testid="identity-status">Signed in as {label}</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={loading || !walletConnected}
        title={!walletConnected ? 'Connect a wallet first' : undefined}
      >
        {loading ? 'Signing…' : 'Sign in with Solana'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
