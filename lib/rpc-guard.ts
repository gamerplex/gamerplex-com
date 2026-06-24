// Pure guards for the JSON-RPC proxy (app/api/rpc/route.ts). Unit-tested.

// Fail CLOSED: a request with no Origin/Referer source is treated as foreign.
// Otherwise allow only localhost + gamerplex.com (dot-anchored, no lookalikes).
export function originForbidden(src: string | null): boolean {
  if (!src) return true;
  try {
    const h = new URL(src).hostname;
    return !(
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === 'gamerplex.com' ||
      h.endsWith('.gamerplex.com')
    );
  } catch {
    return true;
  }
}

// With a configured allowlist, only those methods pass; otherwise everything
// except the denylisted (quota-burner) methods.
export function methodAllowed(method: unknown, allowlist: string[], denylist: Set<string>): boolean {
  if (typeof method !== 'string') return false;
  if (allowlist.length > 0) return allowlist.includes(method);
  return !denylist.has(method);
}
