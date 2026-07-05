'use client';

// Ecosystem-standard sign-in: web2 EMAIL (magic-link) + web3 WALLET (SIWS), both via the shared
// identity-service. Shows the signed-in handle/wallet when a session exists, else offers an email
// magic-link form (the mainstream on-ramp — no wallet needed) plus the SIWS button. Place anywhere
// inside the wallet-adapter provider tree. On email submit the service mails a sign-in link →
// /verify-email issues the shared `.gamerplex.com` session.

import { useState } from 'react';
import { useIdentity } from '../../lib/identity/useIdentity';
import { emailSignup } from '../../lib/identity/client';
import { track } from '../../lib/analytics';

const EMAIL_ERRORS: Record<string, string> = {
  bad_email: "That email doesn't look right.",
  rate_limited: 'Too many attempts. Try again later.',
  network: 'Network error. Try again.',
};

export function SignInWithSolana() {
  const { user, isSignedIn, loading, error, signIn, walletConnected } = useIdentity();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');
  const [sentTo, setSentTo] = useState('');

  // Email-first: a wallet can only be linked onto an already-verified session (the
  // identity-service enforces this too). So step 2 (wallet) stays locked until step 1 (email).
  const canWallet = !!user?.emailVerified;

  // Fully done — a session WITH a linked wallet. (An email-only session falls through so the
  // user can still complete step 2 and link a wallet.)
  if (isSignedIn && user?.walletAddress) {
    const label = user.handle ? `@${user.handle}` : `${user.walletAddress.slice(0, 4)}…${user.walletAddress.slice(-4)}`;
    return <span data-testid="identity-status">Signed in as {label}</span>;
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const t = email.trim().toLowerCase();
    if (!t.includes('@')) return;
    setStep('submitting');
    setEmailError('');
    track('signin_started', { method: 'email' });
    const r = await emailSignup(t);
    if (!r.ok) {
      setEmailError(EMAIL_ERRORS[r.error] ?? 'Something went wrong. Try again.');
      setStep('error');
      return;
    }
    setSentTo(t);
    setStep('sent');
    track('email_link_sent');
  }

  return (
    <div className="siws">
      {/* Step 1 — email (the walletless on-ramp; required first) */}
      <p className="siws-step"><span className="siws-badge" data-done={canWallet ? 'true' : 'false'}>{canWallet ? '✓' : '1'}</span> Sign in with email</p>
      {step === 'sent' ? (
        <div className="siws-sent">
          <p>We sent a sign-in link to <b>{sentTo}</b>. Click it to sign in. Check spam if it&apos;s not there.</p>
          <button type="button" className="siws-linkbtn" onClick={() => { setStep('idle'); setEmail(''); }}>
            Use a different email
          </button>
        </div>
      ) : canWallet ? (
        <p className="siws-done" data-testid="identity-status">Signed in{user?.email ? ` as ${user.email}` : ''}</p>
      ) : (
        <form className="siws-form" onSubmit={submitEmail}>
          <input
            className="siws-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={254}
          />
          <button className="siws-primary" type="submit" disabled={step === 'submitting' || !email.includes('@')}>
            {step === 'submitting' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {emailError ? <p className="siws-error" role="alert">{emailError}</p> : null}
        </form>
      )}

      {/* Step 2 — wallet, LOCKED until step 1 (email) is verified */}
      <p className="siws-step"><span className="siws-badge" data-locked={canWallet ? 'false' : 'true'}>{canWallet ? '2' : '🔒'}</span> Connect a wallet <span className="siws-opt">· optional</span></p>
      <button
        type="button"
        className="siws-wallet"
        onClick={() => void signIn()}
        disabled={loading || !canWallet || !walletConnected}
        title={!canWallet ? 'Complete step 1 (email) first' : !walletConnected ? 'Connect a wallet first' : undefined}
      >
        {loading ? 'Signing…' : !canWallet ? 'Connect a wallet — email first' : 'Sign in with Solana'}
      </button>
      {!canWallet ? <p className="siws-hint">Complete step 1 first — then link a wallet to go on-chain.</p> : null}
      {error ? <p className="siws-error" role="alert">{error}</p> : null}
    </div>
  );
}
