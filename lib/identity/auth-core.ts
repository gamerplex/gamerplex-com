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

export interface MeResult {
  signedIn: boolean;
  id?: string;
  email?: string;
  walletAddress?: string;
  handle?: string;
}

/** What the Expo shell reports back after a native wallet round-trip. */
export interface NativeWalletResult {
  pubkey?: string;
  /** 'created' | 'login' | 'linked' when the shell completed SIWS; absent on older shells. */
  status?: string | null;
  error?: string;
}

type RNBridge = { postMessage: (m: string) => void };

/**
 * The Expo shell's message channel. A WebView cannot reach a wallet — there is no
 * injected provider and Mobile Wallet Adapter is a native protocol — so the page asks
 * the shell to run the signature and the shell injects the result back.
 */
export function nativeWalletBridge(): RNBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as { ReactNativeWebView?: RNBridge }).ReactNativeWebView ?? null;
}

/**
 * Ask the Expo shell to show its Profile tab. Returns true if the shell took it.
 *
 * **INVARIANT: only ever call this from a SIGNED-IN account chip.**
 *
 * A signed-OUT "Sign in" control must open the auth panel where the user already is, on
 * every surface including inside the app. Posting this from a signed-out chip throws the
 * user out of the thing they were doing into a different tab, and it is how sledgit ended up
 * with no reachable sign-in inside the app at all: the chip navigated away and the property's
 * own doors were never shown. gamerplex-com's AccountChip is the reference — signed out opens
 * the panel, signed in calls this.
 *
 * Fails soft: the bridge has been observed present but unusable ("postMessage is not a
 * function"), and a dead bridge must never take the page down.
 */
export function openNativeProfile(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const rn = (window as { ReactNativeWebView?: { postMessage?: (m: string) => void } }).ReactNativeWebView;
    if (typeof rn?.postMessage === 'function') {
      rn.postMessage(JSON.stringify({ type: 'gpx-open-profile' }));
      return true;
    }
  } catch { /* fall through to the caller's web route */ }
  return false;
}

export function hasNativeWalletBridge(): boolean {
  return nativeWalletBridge() !== null;
}

/**
 * What the installed shell build can do. Absent on builds that predate the flag, which
 * is the case that matters: a page must never post a message the app has never heard of
 * and then wait out its timeout.
 */
function nativeCaps(): string[] {
  if (typeof window === 'undefined') return [];
  const c = (window as { __GAMERPLEX_CAPS__?: unknown }).__GAMERPLEX_CAPS__;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Ask the shell to connect a wallet and sign in, and resolve with what it reports.
 *
 * The result is a HINT, never proof: an injected event is page-level script and the
 * session lives in an HttpOnly cookie the server sets. Always confirm with `me()`
 * afterwards — that is what makes a stale or spoofed event harmless.
 *
 * The timeout is generous on purpose: the user is thrown out to their wallet app,
 * approves there, and comes back. A short timeout would report failure on a flow that
 * is about to succeed. It exists only so the button can never spin for ever, which is
 * exactly what "I click connect wallet and nothing happens" looked like.
 */
export function requestNativeWallet(opts?: { timeoutMs?: number }): Promise<NativeWalletResult> {
  const b = nativeWalletBridge();
  if (!b) return Promise.resolve({ error: 'no_bridge' });
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: NativeWalletResult) => {
      if (done) return;
      done = true;
      window.removeEventListener('gamerplex:wallet-linked', onLinked);
      clearTimeout(timer);
      resolve(r);
    };
    const onLinked = (e: Event) => finish(((e as CustomEvent).detail ?? {}) as NativeWalletResult);
    const timer = setTimeout(() => finish({ error: 'timeout' }), opts?.timeoutMs ?? 120_000);
    window.addEventListener('gamerplex:wallet-linked', onLinked);
    // 'gpx-wallet-signin' performs the SIWS on every screen. The legacy
    // 'gpx-connect-wallet' means sign-in only on the external-game screen; in a tab it
    // authorizes a wallet and stops, which is correct for the arcade save flow and
    // useless for signing in. So ask for the new message when the shell declares it, and
    // fall back to the legacy one otherwise — where it works, it works, and where it
    // does not, `me()` comes back signed out and the caller says so plainly.
    const type = nativeCaps().includes('wallet-signin') ? 'gpx-wallet-signin' : 'gpx-connect-wallet';
    try {
      b.postMessage(JSON.stringify({ type }));
    } catch {
      finish({ error: 'bridge_post_failed' });
    }
  });
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
     * Who the session cookie says you are. The ONLY trustworthy answer to "am I signed
     * in" — every other signal in this file is a hint. Never throws.
     */
    async me(): Promise<MeResult> {
      try {
        const r = await fetch(`${base}/api/auth/me`, { credentials: 'include' });
        if (!r.ok) return { signedIn: false };
        const j = (await r.json().catch(() => ({}))) as { user?: MeResult | null };
        const u = j.user;
        return u ? { ...u, signedIn: true } : { signedIn: false };
      } catch {
        return { signedIn: false };
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
