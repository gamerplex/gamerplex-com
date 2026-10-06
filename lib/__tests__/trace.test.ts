import { describe, expect, it } from 'vitest';

// Tracing is ON by default during the beta. That is a deliberate trade — a switch
// you have to remember is off the one time it mattered — but it is only safe
// because it cannot outlive the beta or survive a runaway loop. These pin that.

const BETA_TRACE_UNTIL = Date.parse('2026-12-01T00:00:00Z');
const MAX_EVENTS_PER_SESSION = 400;

/** Mirrors isTracing(). */
function tracing(opts: { now: number; off?: boolean; until?: number; count?: number }) {
  if (opts.off) return false;
  if ((opts.count ?? 0) > MAX_EVENTS_PER_SESSION) return false;
  if (opts.until && opts.now <= opts.until) return true;
  return opts.now < BETA_TRACE_UNTIL;
}

const DURING = Date.parse('2026-10-07T00:00:00Z');
const AFTER = Date.parse('2026-12-02T00:00:00Z');

describe('beta default', () => {
  it('is on during the beta with nothing set', () => {
    expect(tracing({ now: DURING })).toBe(true);
  });

  // The point of a date: default-on ends without anyone remembering to end it.
  it('turns itself off after the beta date, with no deploy', () => {
    expect(tracing({ now: AFTER })).toBe(false);
  });

  it('still allows an explicit opt-in after the beta', () => {
    expect(tracing({ now: AFTER, until: AFTER + 1000 })).toBe(true);
  });
});

describe('opting out', () => {
  // ?trace=0 must defeat the default, or there is no way to silence it.
  it('beats the beta default', () => {
    expect(tracing({ now: DURING, off: true })).toBe(false);
  });
  it('beats an explicit opt-in too', () => {
    expect(tracing({ now: DURING, off: true, until: DURING + 1000 })).toBe(false);
  });
});

describe('runaway guard', () => {
  // A person produces tens of events; hundreds means a loop, which is exactly how
  // the previous analytics instance filled with 343k junk rows.
  it('stops once a session exceeds the cap', () => {
    expect(tracing({ now: DURING, count: MAX_EVENTS_PER_SESSION })).toBe(true);
    expect(tracing({ now: DURING, count: MAX_EVENTS_PER_SESSION + 1 })).toBe(false);
  });
  it('applies even to an explicit opt-in', () => {
    expect(tracing({ now: DURING, until: DURING + 1000, count: 10_000 })).toBe(false);
  });
});
