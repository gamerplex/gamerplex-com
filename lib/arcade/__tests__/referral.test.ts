import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
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
});
