// THE auth client. One brain, three skins.
//
// gamerplex-com, sledgit and omega-city each hand-wrote this surface, and the same bug
// appeared in all three in three different ways: gamerplex dropped
// `verificationEmailSent` from its result, omega dropped it AND never checked it, sledgit
// forwarded it, typed it, and ignored it. Every user who tried email was told "check your
// email" for mail the provider had refused with 550.
//
// So this file is the source of truth and the others vendor it verbatim.
// `npm run sync:auth` copies it; `npm run check:auth` fails on drift, and each app runs
// that in its test suite. Same pattern omega-city already uses for the game core.
//
// Deliberately dependency-free and framework-free: it must build under nix (sledgit),
// without wallet-adapter (omega-city), and in the Next app router (all three). Anything
// app-specific — credits, streaks, handles, referrals, play pings — stays in the app.
//
// EDIT THIS FILE ONLY IN gamerplex-com. Changing a vendored copy will fail check:auth.

export interface AuthCoreConfig {
  /** e.g. https://auth.gamerplex.com or https://auth.sledgit.com */
  identityUrl: string;
}

export interface EmailSignupResult {
  ok: boolean;
  error?: string;
  status?: string;
  throttled?: boolean;
  /**
   * Whether the mail actually LEFT our server. The API has always returned this.
   * Undefined means an older service that does not report it — treat as sent, so a
   * failure is never invented. Explicit false is a real delivery failure and the UI
   * must say so rather than showing "check your email".
   */
  verificationEmailSent?: boolean;
}

export interface OtpResult {
  ok: boolean;
  error?: string;
  /** Same contract as verificationEmailSent, for the native 6-digit path. */
  sent?: boolean;
}

export interface SiwsChallenge {
  domain: string;
  nonce: string;
  issuedAt: string;
  mac?: string;
}

/** True inside the Expo shell, which injects this before paint. */
export function isNativeApp(): boolean {
  return typeof window !== 'undefined'
    && (window as { __GAMERPLEX_NATIVE__?: boolean }).__GAMERPLEX_NATIVE__ === true;
}

const post = (url: string, body: unknown): Promise<Response> =>
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export function makeAuthClient({ identityUrl }: AuthCoreConfig) {
  const base = identityUrl.replace(/\/$/, '');

  return {
    /** Web magic-link signup. */
    async emailSignup(email: string): Promise<EmailSignupResult> {
      try {
        const r = await post(`${base}/api/auth/email-signup`, { email: email.trim().toLowerCase() });
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) {
          return { ok: false, error: r.status === 429 ? 'rate_limited' : (j.error as string) || `email_${r.status}` };
        }
        // Forwarding this is the whole point of the file.
        return {
          ok: true,
          status: j.status as string | undefined,
          throttled: j.throttled === true,
          verificationEmailSent: j.verificationEmailSent as boolean | undefined,
        };
      } catch {
        return { ok: false, error: 'network' };
      }
    },

    /** Native 6-digit code request (magic links cannot return into the app). */
    async requestEmailOtp(email: string): Promise<OtpResult> {
      try {
        const r = await post(`${base}/api/auth/email/otp`, { email: email.trim().toLowerCase() });
        if (!r.ok) return { ok: false, error: r.status === 429 ? 'rate_limited' : `otp_${r.status}` };
        const j = (await r.json().catch(() => ({}))) as { sent?: boolean };
        return { ok: true, sent: j.sent };
      } catch {
        return { ok: false, error: 'network' };
      }
    },

    async verifyEmailOtp(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
      try {
        const r = await post(`${base}/api/auth/email/otp/verify`, {
          email: email.trim().toLowerCase(),
          code: code.trim(),
        });
        if (r.ok) return { ok: true };
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: r.status === 429 ? 'rate_limited' : j.error || `verify_${r.status}` };
      } catch {
        return { ok: false, error: 'network' };
      }
    },

    /**
     * MUST match the server's canonical message byte-for-byte (identity lib/siws.ts).
     * The domain is part of what gets signed: that is what stops a signature captured on
     * one site being replayed against another.
     */
    buildSiwsMessage(p: { domain: string; pubkey: string; nonce: string; issuedAt: string }): string {
      return (
        `${p.domain} wants you to sign in with your Solana account:\n` +
        `${p.pubkey}\n\n` +
        `Nonce: ${p.nonce}\n` +
        `Issued At: ${p.issuedAt}`
      );
    },

    async requestSiwsChallenge(): Promise<SiwsChallenge> {
      const r = await fetch(`${base}/api/auth/wallet/siws`, { credentials: 'include' });
      if (!r.ok) throw new Error(`siws_challenge_${r.status}`);
      return r.json();
    },

    /** Anonymous → creates or logs in a wallet-only user. Signed in → links the wallet. */
    async submitSiws(pubkey: string, signatureB58: string): Promise<{ status: string; walletAddress?: string }> {
      const r = await post(`${base}/api/auth/wallet/siws`, { pubkey, signature: signatureB58 });
      const j = (await r.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!r.ok) throw new Error(j.error || `siws_${r.status}`);
      return j as { status: string; walletAddress?: string };
    },
  };
}

export type AuthClient = ReturnType<typeof makeAuthClient>;
