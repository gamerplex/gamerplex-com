import { describe, it, expect, afterEach, vi } from "vitest";
import { shortAddr as shortAddrLb, formatDuration } from "../leaderboard";
import {
  shortAddr as shortAddrProfile,
  gameDisplayName,
  formatTimeAgo,
} from "../profile";

describe("leaderboard/profile: shortAddr", () => {
  it("truncates a long base58 address to 4…4", () => {
    const addr = "4Nd1mYkqF7hV2bJcE9pR8sTuVwXyZ12345";
    expect(shortAddrLb(addr)).toBe("4Nd1…2345");
    expect(shortAddrProfile(addr)).toBe(shortAddrLb(addr)); // duplicated impl, same behavior
  });
  it("leaves short strings untouched", () => {
    expect(shortAddrLb("abcd")).toBe("abcd");
    expect(shortAddrLb("12345678")).toBe("12345678"); // boundary: length 8
    // profile.ts has its own copy — exercise its short-string branch too.
    expect(shortAddrProfile("abcd")).toBe("abcd");
    expect(shortAddrProfile("12345678")).toBe("12345678");
  });
});

describe("leaderboard: formatDuration", () => {
  it("renders sub-minute as seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
  });
  it("renders minute+ as 'Xm Ys'", () => {
    expect(formatDuration(60)).toBe("1m 0s");
    expect(formatDuration(125)).toBe("2m 5s");
  });
});

describe("profile: gameDisplayName", () => {
  it("special-cases cyber-snake", () => {
    expect(gameDisplayName("cyber-snake")).toBe("Cyber Snake");
  });
  it("title-cases an arbitrary slug", () => {
    expect(gameDisplayName("magic-chess")).toBe("Magic Chess");
    expect(gameDisplayName("blockwords")).toBe("Blockwords");
  });
});

describe("profile: formatTimeAgo", () => {
  afterEach(() => vi.useRealTimers());

  it("returns empty string for null/0", () => {
    expect(formatTimeAgo(null)).toBe("");
    expect(formatTimeAgo(0)).toBe("");
  });

  it("renders seconds/minutes/hours/days relative to now", () => {
    const now = 1_700_000_000; // fixed unix seconds
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    expect(formatTimeAgo(now - 5)).toBe("5s ago");
    expect(formatTimeAgo(now - 120)).toBe("2m ago");
    expect(formatTimeAgo(now - 3 * 3600)).toBe("3h ago");
    expect(formatTimeAgo(now - 2 * 86400)).toBe("2d ago");
  });
});
