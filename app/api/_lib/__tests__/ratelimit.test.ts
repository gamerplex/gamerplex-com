import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimited, clientKey } from "../ratelimit";

let key = 0;
function freshKey() {
  return `k${key++}`;
}

describe("ratelimit: rateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("allows requests up to max, blocks the one that exceeds it", () => {
    const k = freshKey();
    expect(rateLimited(k, 3, 10_000)).toBe(false); // 1
    expect(rateLimited(k, 3, 10_000)).toBe(false); // 2
    expect(rateLimited(k, 3, 10_000)).toBe(false); // 3
    expect(rateLimited(k, 3, 10_000)).toBe(true); // 4 -> blocked
  });

  it("keeps blocking while still inside the window", () => {
    const k = freshKey();
    rateLimited(k, 1, 10_000); // 1 (allowed)
    vi.advanceTimersByTime(5_000);
    expect(rateLimited(k, 1, 10_000)).toBe(true); // still within window
  });

  it("recovers once the window slides past old hits", () => {
    const k = freshKey();
    expect(rateLimited(k, 1, 10_000)).toBe(false);
    expect(rateLimited(k, 1, 10_000)).toBe(true);
    vi.advanceTimersByTime(10_001); // old hit falls out of window
    expect(rateLimited(k, 1, 10_000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = freshKey();
    const b = freshKey();
    expect(rateLimited(a, 1, 10_000)).toBe(false);
    expect(rateLimited(a, 1, 10_000)).toBe(true);
    expect(rateLimited(b, 1, 10_000)).toBe(false); // b unaffected
  });

  it("opportunistically evicts fully-stale keys once the map exceeds 5000 entries", () => {
    const WINDOW = 10_000;
    // Seed >5000 distinct keys with a single hit each at t=1_000_000.
    for (let i = 0; i < 5001; i++) rateLimited(`bulk-${i}`, 100, WINDOW);
    // Advance well past the window so every seeded hit is now stale.
    vi.advanceTimersByTime(WINDOW + 1);
    // The next call sees hits.size > 5000 and runs the cleanup loop, which
    // deletes keys whose hits have all aged out of the window.
    const survivor = freshKey();
    expect(rateLimited(survivor, 1, WINDOW)).toBe(false);
    // A previously-seeded (now-evicted) key behaves as brand new: still allowed.
    expect(rateLimited("bulk-0", 1, WINDOW)).toBe(false);
  });
});

describe("ratelimit: clientKey", () => {
  const reqWith = (h: Record<string, string>) => ({
    headers: { get: (n: string) => h[n.toLowerCase()] ?? h[n] ?? null },
  });

  it("prefers the userId when present", () => {
    expect(clientKey("user-1", reqWith({}))).toBe("u:user-1");
  });

  it("falls back to the first forwarded IP", () => {
    expect(clientKey(undefined, reqWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe(
      "ip:1.2.3.4",
    );
  });

  it("falls back to 'unknown' when no userId and no IP header", () => {
    expect(clientKey(undefined, reqWith({}))).toBe("ip:unknown");
  });
});
