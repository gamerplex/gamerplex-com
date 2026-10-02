import { describe, expect, it } from "vitest";

import { linkedMethods, type IdentityUser } from "../client";

const base: IdentityUser = {
  id: "u1",
  email: null,
  emailVerified: false,
  handle: null,
  bio: null,
  walletAddress: null,
  handleOnChain: false,
  createdAt: "2026-10-02T00:00:00Z",
};

describe("linkedMethods", () => {
  it("uses the server's answer when it gives one", () => {
    expect(
      linkedMethods({ ...base, linked: { email: true, wallet: false, flipcash: true } }),
    ).toEqual({ email: true, wallet: false, flipcash: true });
  });

  // The deploy-order case. identity-service in production does not return `linked`
  // yet, and a panel that showed a real account as "0 of 3" would look broken and
  // push people to re-link things they already have.
  it("falls back to the columns when the field is absent", () => {
    const u = { ...base, email: "a@b.c", emailVerified: true, walletAddress: "WaLLeT" };
    expect(linkedMethods(u)).toEqual({ email: true, wallet: true, flipcash: false });
  });

  it("does not count an unverified email as a sign-in method", () => {
    expect(linkedMethods({ ...base, email: "a@b.c", emailVerified: false }).email).toBe(false);
  });

  // Not derivable from any other column. Claiming "linked" without knowing would
  // hide the one action that actually attaches it.
  it("reports flipcash as not linked when the server cannot say", () => {
    expect(linkedMethods({ ...base, email: "a@b.c", emailVerified: true }).flipcash).toBe(false);
  });

  it("trusts an explicit false over a populated column", () => {
    const u: IdentityUser = {
      ...base,
      walletAddress: "WaLLeT",
      linked: { email: false, wallet: false, flipcash: false },
    };
    expect(linkedMethods(u).wallet).toBe(false);
  });
});
