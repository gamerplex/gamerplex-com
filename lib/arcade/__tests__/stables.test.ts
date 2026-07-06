import { describe, it, expect } from "vitest";
import {
  SUPPORTED_STABLES,
  STABLES_DEVNET,
  STABLES_MAINNET,
  defaultStable,
} from "../stables";
import { ARCADE_NETWORK, USDC_MINT } from "../client";

describe("stables", () => {
  it("every stable is USDC-parity: 6 decimals, non-empty symbol/label", () => {
    for (const s of [...STABLES_DEVNET, ...STABLES_MAINNET]) {
      expect(s.decimals).toBe(6);
      expect(s.symbol.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("devnet ships USDC-only; mainnet ships USDC+USDT+USDF", () => {
    expect(STABLES_DEVNET.map((s) => s.symbol)).toEqual(["USDC"]);
    expect(STABLES_MAINNET.map((s) => s.symbol)).toEqual(["USDC", "USDT", "USDF"]);
  });

  it("SUPPORTED_STABLES matches the active network", () => {
    const expected = ARCADE_NETWORK === "mainnet" ? STABLES_MAINNET : STABLES_DEVNET;
    expect(SUPPORTED_STABLES).toBe(expected);
  });

  it("defaultStable returns the first supported stable (USDC) for the active network mint", () => {
    const d = defaultStable();
    expect(d.symbol).toBe("USDC");
    expect(d.mint.equals(USDC_MINT)).toBe(true);
  });
});
