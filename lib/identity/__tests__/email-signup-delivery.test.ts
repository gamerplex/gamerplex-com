import { afterEach, describe, expect, it, vi } from 'vitest';

import { emailSignup } from '../client';

// The modal decides between "check your email" and an honest error purely from
// `verificationEmailSent`. The client dropped the field, so the check read
// `undefined !== false` and always concluded the mail had been sent — meaning every
// user hit by the provider's 550 was told to go wait for mail that never left.
// These pin the forwarding so it cannot be dropped again.

const mockJson = (body: unknown, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status, json: async () => body,
  } as unknown as Response));

afterEach(() => vi.unstubAllGlobals());

describe('emailSignup delivery reporting', () => {
  it('forwards verificationEmailSent:false so the UI can be honest', async () => {
    mockJson({ status: 'pending', verificationEmailSent: false });
    const r = await emailSignup('u@example.com');
    expect(r.ok).toBe(true);
    expect(r.verificationEmailSent).toBe(false);
  });

  it('forwards verificationEmailSent:true on a real send', async () => {
    mockJson({ status: 'pending', verificationEmailSent: true });
    expect((await emailSignup('u@example.com')).verificationEmailSent).toBe(true);
  });

  it('leaves it undefined when the service does not report it', async () => {
    // An older identity-service omits the field. Undefined must stay undefined so the
    // modal treats it as sent rather than inventing a failure.
    mockJson({ status: 'pending' });
    expect((await emailSignup('u@example.com')).verificationEmailSent).toBeUndefined();
  });

  it('still reports rate limiting rather than a delivery result', async () => {
    mockJson({ error: 'rate_limited' }, false, 429);
    const r = await emailSignup('u@example.com');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('rate_limited');
  });

  it('survives a network failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await emailSignup('u@example.com')).error).toBe('network');
  });
});
