import { describe, expect, it } from "vitest";

import { capabilitiesForTier, countryFromHeaders, tierForCountry } from "../region";

describe("region jurisdiction tiers", () => {
  it("sanctioned → tier 0, blocked entirely", () => {
    expect(tierForCountry("IR")).toBe(0);
    expect(tierForCountry("kp")).toBe(0); // case-insensitive
    expect(capabilitiesForTier(0, "IR").access).toBe(false);
  });

  it("China → tier 1, web2-only (game + credits, no crypto surfaces)", () => {
    expect(tierForCountry("CN")).toBe(1);
    const c = capabilitiesForTier(1, "CN");
    expect(c.access).toBe(true);
    expect(c.game).toBe(true);
    expect(c.credits).toBe(true);
    expect(c.walletConnect).toBe(false);
    expect(c.gameToken).toBe(false);
    expect(c.flipcashLinks).toBe(false);
  });

  it("US → tier 2, crypto-lite (wallet + external Flipcash, no in-app $GAME)", () => {
    expect(tierForCountry("US")).toBe(2);
    const c = capabilitiesForTier(2, "US");
    expect(c.walletConnect).toBe(true);
    expect(c.flipcashLinks).toBe(true);
    expect(c.gameToken).toBe(false);
  });

  it("AU → tier 3, crypto-full", () => {
    expect(tierForCountry("AU")).toBe(3);
    expect(capabilitiesForTier(3, "AU").gameToken).toBe(true);
  });

  it("unknown country → fail-closed default (tier 2, never full)", () => {
    expect(tierForCountry(null)).toBe(2);
    expect(capabilitiesForTier(tierForCountry(null), null).gameToken).toBe(false);
  });

  it("reads Cloudflare then Vercel geo headers; ignores Tor/unresolved", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "au" }))).toBe("AU");
    expect(countryFromHeaders(new Headers({ "x-vercel-ip-country": "us" }))).toBe("US");
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
  });
});
