import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  pickReferrerFromUrl,
  getStoredReferrer,
  getStoredReferrerInfo,
  clearReferrer,
} from "../referral";

const SS_KEY = "gamerplex:referrer:v2";
const TTL_MS = 30 * 60 * 1000;

const referrer = Keypair.generate().publicKey;
const other = Keypair.generate().publicKey;

function installWindow() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { search: "" },
  };
  return store;
}

function storeRaw(payload: unknown) {
  (globalThis as any).window.sessionStorage.setItem(SS_KEY, JSON.stringify(payload));
}

describe("referral: getStoredReferrer / getStoredReferrerInfo", () => {
  beforeEach(() => installWindow());
  afterEach(() => delete (globalThis as any).window);

  it("returns PublicKey.default when nothing is stored", () => {
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
    expect(getStoredReferrerInfo()).toBeNull();
  });

  it("returns the stored, fresh referrer", () => {
    storeRaw({ pubkey: referrer.toBase58(), source: "url-hint", storedAt: Date.now() });
    expect(getStoredReferrer().equals(referrer)).toBe(true);
    const info = getStoredReferrerInfo();
    expect(info?.pubkey.equals(referrer)).toBe(true);
    expect(info?.source).toBe("url-hint");
  });

  it("expires an entry older than the 30-minute TTL and clears it", () => {
    storeRaw({ pubkey: referrer.toBase58(), source: "url-hint", storedAt: Date.now() - TTL_MS - 1 });
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
    // getStoredReferrer removes the expired key.
    expect((globalThis as any).window.sessionStorage.getItem(SS_KEY)).toBeNull();
  });

  it("getStoredReferrerInfo also treats an expired entry as absent", () => {
    storeRaw({ pubkey: referrer.toBase58(), source: "url-hint", storedAt: Date.now() - TTL_MS - 1 });
    expect(getStoredReferrerInfo()).toBeNull();
  });

  it("rejects self-referral when the stored pubkey equals the connected wallet", () => {
    storeRaw({ pubkey: referrer.toBase58(), source: "url-hint", storedAt: Date.now() });
    expect(getStoredReferrer(referrer).equals(PublicKey.default)).toBe(true);
    expect(getStoredReferrerInfo(referrer)).toBeNull();
    // A different connected wallet is fine.
    expect(getStoredReferrer(other).equals(referrer)).toBe(true);
  });

  it("returns default on malformed stored JSON without throwing", () => {
    (globalThis as any).window.sessionStorage.setItem(SS_KEY, "{broken");
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
    expect(getStoredReferrerInfo()).toBeNull();
  });

  it("returns default when the stored payload is missing required fields", () => {
    storeRaw({ pubkey: referrer.toBase58() }); // no storedAt
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
    expect(getStoredReferrerInfo()).toBeNull();
  });

  it("returns default when the stored pubkey is invalid / off-curve", () => {
    storeRaw({ pubkey: "not-a-valid-pubkey", source: "url-hint", storedAt: Date.now() });
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
    expect(getStoredReferrerInfo()).toBeNull();
  });

  it("clearReferrer removes the stored entry", () => {
    storeRaw({ pubkey: referrer.toBase58(), source: "url-hint", storedAt: Date.now() });
    clearReferrer();
    expect((globalThis as any).window.sessionStorage.getItem(SS_KEY)).toBeNull();
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
  });
});

describe("referral: SSR safety (no window)", () => {
  it("all readers return safe defaults when window is undefined", () => {
    delete (globalThis as any).window;
    expect(getStoredReferrer().equals(PublicKey.default)).toBe(true);
    expect(getStoredReferrerInfo()).toBeNull();
    expect(() => clearReferrer()).not.toThrow();
  });

  it("pickReferrerFromUrl is a no-op under SSR (no window)", async () => {
    delete (globalThis as any).window;
    await expect(pickReferrerFromUrl()).resolves.toBeUndefined();
  });
});

describe("referral: pickReferrerFromUrl", () => {
  function installWindowWithSearch(search: string) {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      sessionStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { search },
    };
    return store;
  }

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).fetch;
    vi.restoreAllMocks();
  });

  it("does nothing when no referrer/ref param is present", async () => {
    const store = installWindowWithSearch("?foo=bar");
    await pickReferrerFromUrl();
    expect(store.get(SS_KEY)).toBeUndefined();
  });

  it("rejects an invalid pubkey hint (no store write)", async () => {
    const store = installWindowWithSearch("?ref=not-a-pubkey");
    await pickReferrerFromUrl();
    expect(store.get(SS_KEY)).toBeUndefined();
  });

  it("rejects a self-referral when hint === connected wallet", async () => {
    const store = installWindowWithSearch(`?ref=${referrer.toBase58()}`);
    await pickReferrerFromUrl(referrer);
    expect(store.get(SS_KEY)).toBeUndefined();
  });

  it("stores a bare url-hint referrer when no sig is present", async () => {
    const store = installWindowWithSearch(`?referrer=${referrer.toBase58()}`);
    await pickReferrerFromUrl(other);
    const saved = JSON.parse(store.get(SS_KEY)!);
    expect(saved.pubkey).toBe(referrer.toBase58());
    expect(saved.source).toBe("url-hint");
  });

  it("upgrades to on-chain-verified when sig resolves to the same pubkey", async () => {
    const store = installWindowWithSearch(
      `?ref=${referrer.toBase58()}&sig=${"s".repeat(64)}`,
    );
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, player: referrer.toBase58() }),
    });
    await pickReferrerFromUrl();
    const saved = JSON.parse(store.get(SS_KEY)!);
    expect(saved.pubkey).toBe(referrer.toBase58());
    expect(saved.source).toBe("url-hint-verified-onchain");
  });

  it("on-chain truth wins when the resolved pubkey mismatches the hint", async () => {
    const store = installWindowWithSearch(
      `?ref=${referrer.toBase58()}&sig=${"s".repeat(64)}`,
    );
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, player: other.toBase58() }),
    });
    await pickReferrerFromUrl();
    const saved = JSON.parse(store.get(SS_KEY)!);
    expect(saved.pubkey).toBe(other.toBase58()); // resolved, not the hint
    expect(saved.source).toBe("url-hint-verified-onchain");
  });

  it("falls back to the hint when the sig is present but does not resolve", async () => {
    const store = installWindowWithSearch(
      `?ref=${referrer.toBase58()}&sig=${"s".repeat(64)}`,
    );
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false });
    await pickReferrerFromUrl();
    const saved = JSON.parse(store.get(SS_KEY)!);
    expect(saved.pubkey).toBe(referrer.toBase58());
    expect(saved.source).toBe("url-hint"); // unverified fallback
  });

  it("skips resolution for a too-short sig (guard) and stores the hint", async () => {
    const store = installWindowWithSearch(`?ref=${referrer.toBase58()}&sig=short`);
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    await pickReferrerFromUrl();
    expect(fetchMock).not.toHaveBeenCalled(); // length<32 short-circuits before fetch
    expect(JSON.parse(store.get(SS_KEY)!).source).toBe("url-hint");
  });

  it("treats a resolver fetch exception as unresolved (fallback to hint)", async () => {
    const store = installWindowWithSearch(
      `?ref=${referrer.toBase58()}&sig=${"s".repeat(64)}`,
    );
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    await pickReferrerFromUrl();
    expect(JSON.parse(store.get(SS_KEY)!).source).toBe("url-hint");
  });

  it("treats a resolver payload with ok:false as unresolved", async () => {
    const store = installWindowWithSearch(
      `?ref=${referrer.toBase58()}&sig=${"s".repeat(64)}`,
    );
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    });
    await pickReferrerFromUrl();
    expect(JSON.parse(store.get(SS_KEY)!).source).toBe("url-hint");
  });

  it("swallows exceptions thrown mid-flow (e.g. sessionStorage.setItem throws)", async () => {
    (globalThis as any).window = {
      sessionStorage: {
        getItem: () => null,
        setItem: () => { throw new Error("quota"); },
        removeItem: () => {},
      },
      location: { search: `?ref=${referrer.toBase58()}` },
    };
    await expect(pickReferrerFromUrl(other)).resolves.toBeUndefined();
  });
});
