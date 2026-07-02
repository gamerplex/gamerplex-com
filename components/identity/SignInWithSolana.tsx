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

  if (isSignedIn) {
    const label = user?.handle
      ? `@${user.handle}`
      : user?.walletAddress
        ? `${user.walletAddress.slice(0, 4)}…${user.walletAddress.slice(-4)}`
        : 'signed in';
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
    <div>
      {step === 'sent' ? (
        <div>
          <p>We sent a sign-in link to <b>{sentTo}</b>. Click it to sign in. Check spam if it&apos;s not there.</p>
          <button type="button" onClick={() => { setStep('idle'); setEmail(''); }}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submitEmail}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={254}
          />
          <button type="submit" disabled={step === 'submitting' || !email.includes('@')}>
            {step === 'submitting' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {emailError ? <p role="alert">{emailError}</p> : null}
        </form>
      )}

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
