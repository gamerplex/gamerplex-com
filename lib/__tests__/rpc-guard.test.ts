import { describe, it, expect } from 'vitest';
import { originForbidden, methodAllowed } from '../rpc-guard';

describe('originForbidden (G-1 / RA-B)', () => {
  it('fails closed when no Origin/Referer is present', () => {
    expect(originForbidden(null)).toBe(true);
  });
  it('allows gamerplex.com + subdomains + localhost', () => {
    expect(originForbidden('https://gamerplex.com')).toBe(false);
    expect(originForbidden('https://app.gamerplex.com/x')).toBe(false);
    expect(originForbidden('http://localhost:3000')).toBe(false);
  });
  it('rejects lookalike domains (dot-anchored)', () => {
    expect(originForbidden('https://evilgamerplex.com')).toBe(true);
    expect(originForbidden('https://gamerplex.com.evil.com')).toBe(true);
  });
  it('fails closed on a malformed source', () => {
    expect(originForbidden('::::')).toBe(true);
  });
});

describe('methodAllowed (quota-burner guard)', () => {
  const deny = new Set(['getProgramAccounts']);
  it('blocks the denylisted method by default', () => {
    expect(methodAllowed('getProgramAccounts', [], deny)).toBe(false);
    expect(methodAllowed('getBalance', [], deny)).toBe(true);
  });
  it('honours a configured allowlist (deny everything else)', () => {
    expect(methodAllowed('getBalance', ['getBalance'], deny)).toBe(true);
    expect(methodAllowed('sendTransaction', ['getBalance'], deny)).toBe(false);
  });
  it('rejects a non-string method', () => {
    expect(methodAllowed(undefined, [], deny)).toBe(false);
    expect(methodAllowed(42, [], deny)).toBe(false);
  });
});
