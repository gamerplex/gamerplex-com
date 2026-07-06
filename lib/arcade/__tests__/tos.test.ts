import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LATEST_TOS_VERSION,
  tosMessage,
  getStored,
  hasAcceptedCurrent,
  signAndStore,
  clearTos,
  type TosAcceptance,
} from "../tos";

const WALLET = "4Nd1mYkqF7hV2bJcE9pR8sTuVwXyZ1234567890abcd";

// Minimal in-memory localStorage + window shim (node env has no DOM).
function installWindow() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

describe("tos: tosMessage (pure, no DOM)", () => {
  it("embeds version, timestamp and wallet verbatim", () => {
    const msg = tosMessage("1.2", "2026-07-06T00:00:00.000Z", WALLET);
    expect(msg).toContain("Version:   1.2");
    expect(msg).toContain("Timestamp: 2026-07-06T00:00:00.000Z");
    expect(msg).toContain(`Wallet:    ${WALLET}`);
    expect(msg).toContain("at least 18 years of age");
    expect(msg).toContain("prohibited jurisdiction");
  });

  it("is deterministic for identical inputs", () => {
    const a = tosMessage("1.2", "t", WALLET);
    const b = tosMessage("1.2", "t", WALLET);
    expect(a).toBe(b);
  });
});

describe("tos: localStorage-backed helpers", () => {
  beforeEach(() => {
    installWindow();
  });
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it("getStored returns null when nothing is stored", () => {
    expect(getStored(WALLET)).toBeNull();
  });

  it("getStored returns null on corrupt JSON without throwing", () => {
    (globalThis as any).window.localStorage.setItem(`gpx:tos:${WALLET}`, "{not-json");
    expect(getStored(WALLET)).toBeNull();
  });

  it("hasAcceptedCurrent is false with no record, true after storing current version", () => {
    expect(hasAcceptedCurrent(WALLET)).toBe(false);
    const rec: TosAcceptance = {
      version: LATEST_TOS_VERSION,
      timestamp: "t",
      wallet: WALLET,
      message: "m",
      signature: "s",
    };
    (globalThis as any).window.localStorage.setItem(
      `gpx:tos:${WALLET}`,
      JSON.stringify(rec),
    );
    expect(hasAcceptedCurrent(WALLET)).toBe(true);
  });

  it("hasAcceptedCurrent is false for a stale (older) version", () => {
    const rec: TosAcceptance = {
      version: "0.9",
      timestamp: "t",
      wallet: WALLET,
      message: "m",
      signature: "s",
    };
    (globalThis as any).window.localStorage.setItem(
      `gpx:tos:${WALLET}`,
      JSON.stringify(rec),
    );
    expect(hasAcceptedCurrent(WALLET)).toBe(false);
  });

  it("signAndStore persists the signed acceptance and posts a fire-and-forget audit log", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true } as any);
    (globalThis as any).fetch = fetchMock;

    const walletPk = {
      toBase58: () => WALLET,
    } as any;
    // signMessage returns a fixed 4-byte signature.
    const signMessage = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));

    const acc = await signAndStore(walletPk, signMessage);

    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(acc.version).toBe(LATEST_TOS_VERSION);
    expect(acc.wallet).toBe(WALLET);
    expect(acc.signature.length).toBeGreaterThan(0); // bs58-encoded
    // Persisted and readable back.
    expect(hasAcceptedCurrent(WALLET)).toBe(true);
    expect(getStored(WALLET)?.signature).toBe(acc.signature);
    // Audit log POSTed.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tos-accept",
      expect.objectContaining({ method: "POST" }),
    );

    delete (globalThis as any).fetch;
  });

  it("signAndStore succeeds even if the audit-log POST rejects", async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("network"));
    const walletPk = { toBase58: () => WALLET } as any;
    const acc = await signAndStore(walletPk, async () => new Uint8Array([9]));
    expect(acc.wallet).toBe(WALLET);
    expect(hasAcceptedCurrent(WALLET)).toBe(true);
    delete (globalThis as any).fetch;
  });

  it("clearTos removes the stored acceptance", () => {
    const rec: TosAcceptance = {
      version: LATEST_TOS_VERSION,
      timestamp: "t",
      wallet: WALLET,
      message: "m",
      signature: "s",
    };
    (globalThis as any).window.localStorage.setItem(
      `gpx:tos:${WALLET}`,
      JSON.stringify(rec),
    );
    expect(hasAcceptedCurrent(WALLET)).toBe(true);
    clearTos(WALLET);
    expect(getStored(WALLET)).toBeNull();
    expect(hasAcceptedCurrent(WALLET)).toBe(false);
  });
});
