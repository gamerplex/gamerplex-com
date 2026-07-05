// Best-effort in-memory rate limit (per Cloud Run instance). Defense-in-depth ON TOP OF the
// identity-service's authoritative per-(user, app, category) caps — it raises the bar for casual
// scripted farming; it is NOT a hard cross-instance guarantee. The real cap lives in identity-service.

const hits = new Map<string, number[]>();

/** Returns true if `key` has exceeded `max` requests within `windowMs` (i.e. should be blocked). */
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) { // opportunistic cleanup so the map can't grow unbounded
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return false;
}

/** A stable-ish client id for rate-limiting: prefer a userId, else the forwarded IP. */
export function clientKey(userId: string | undefined, req: { headers: { get(n: string): string | null } }): string {
  if (userId) return `u:${userId}`;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return `ip:${ip}`;
}
