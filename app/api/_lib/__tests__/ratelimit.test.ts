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
