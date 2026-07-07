import { describe, it, expect, afterEach, vi } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// ── Mocks ────────────────────────────────────────────────────────────────
// Bonfida SNS: mock the single lookup fn so no RPC is issued.
vi.mock("@bonfida/spl-name-service", () => ({
  getFavoriteDomain: vi.fn(),
}));
// client.makeProgram: return a fake Anchor program whose account.replayReceipt.all
// yields controllable rows. Everything else in client stays real.
vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return { ...actual, makeProgram: vi.fn() };
});

import { getFavoriteDomain } from "@bonfida/spl-name-service";
import { makeProgram } from "../client";
import {
  lookupSns,
  fetchReceiptsOwned,
  fetchReceiptsOriginal,
  fetchPlayerStats,
} from "../profile";

const wallet = Keypair.generate().publicKey;
const owner = Keypair.generate().publicKey;

afterEach(() => vi.clearAllMocks());

describe("profile: lookupSns", () => {
  it("returns a normalized .sol domain when it is ascii-safe", async () => {
    (getFavoriteDomain as any).mockResolvedValue({ reverse: "neo" });
    expect(await lookupSns({} as any, wallet)).toBe("neo.sol");
  });

  it("returns null when no favorite domain is set", async () => {
    (getFavoriteDomain as any).mockResolvedValue({ reverse: null });
    expect(await lookupSns({} as any, wallet)).toBeNull();
  });

  it("rejects non-ascii / homograph domains", async () => {
    (getFavoriteDomain as any).mockResolvedValue({ reverse: "nе0" }); // cyrillic е
    expect(await lookupSns({} as any, wallet)).toBeNull();
  });

  it("returns null (swallows) when the SNS lookup throws", async () => {
    (getFavoriteDomain as any).mockRejectedValue(new Error("no reverse"));
    expect(await lookupSns({} as any, wallet)).toBeNull();
  });
});

describe("profile: fetchReceiptsOwned / fetchReceiptsOriginal", () => {
  const rawRow = (over: Partial<any> = {}) => ({
    originalPlayer: wallet,
    owner,
    gameId: 3,
    score: new BN(1234),
    continuesUsed: 1,
    powerupsUsed: 2,
    durationSec: 45,
    mintedAt: new BN(1_700_000_000),
    season: 2,
    nonce: new BN("9007199254740993"), // > Number.MAX_SAFE_INTEGER, must survive as string
    cnftWrapped: 0,
    ...over,
  });

  function fakeProgram(rows: any[]) {
    const all = vi.fn(async () => rows);
    (makeProgram as any).mockReturnValue({ account: { replayReceipt: { all } } });
    return all;
  }

  it("summarizes owned receipts, memcmp on the OWNER offset (201)", async () => {
    const all = fakeProgram([{ publicKey: wallet, account: rawRow() }]);
    const res = await fetchReceiptsOwned({} as any, {} as any, owner);
    expect(all).toHaveBeenCalledWith([
      { memcmp: { offset: 201, bytes: owner.toBase58() } },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].originalPlayer).toBe(wallet.toBase58());
    expect(res[0].owner).toBe(owner.toBase58());
    expect(res[0].score).toBe(1234);
    expect(res[0].nonce).toBe("9007199254740993"); // BN string, no precision loss
    expect(res[0].cnftWrapped).toBe(false);
  });

  it("summarizes original-player receipts, memcmp on the ORIGINAL offset (8)", async () => {
    const all = fakeProgram([{ publicKey: wallet, account: rawRow({ cnftWrapped: 1 }) }]);
    const res = await fetchReceiptsOriginal({} as any, {} as any, wallet);
    expect(all).toHaveBeenCalledWith([
      { memcmp: { offset: 8, bytes: wallet.toBase58() } },
    ]);
    expect(res[0].cnftWrapped).toBe(true);
  });

  it("handles numeric (non-BN) score/mintedAt fields", async () => {
    fakeProgram([
      { publicKey: wallet, account: rawRow({ score: 77, mintedAt: 1_600_000_000 }) },
    ]);
    const res = await fetchReceiptsOwned({} as any, {} as any, owner);
    expect(res[0].score).toBe(77);
    expect(res[0].mintedAt).toBe(1_600_000_000);
  });
});

describe("profile: fetchPlayerStats", () => {
  const player = wallet.toBase58();
  const gpx5 = (slug: string, score: number, cont = 0, dur = 30) =>
    `GPX5|${slug}|classic|${player}|${score}|${cont}|0|SEED|${dur}`;
  const gpx5r = `GPX5R|${player}|1|SEED|LOG`;

  function fakeConnection(sigs: any[]) {
    return { getSignaturesForAddress: vi.fn(async () => sigs) } as any;
  }

  it("aggregates games played, best-per-game, verified runs and approx spend", async () => {
    const conn = fakeConnection([
      { signature: "s1", blockTime: 10, memo: gpx5("cyber-snake", 100), err: null },
      { signature: "s2", blockTime: 20, memo: gpx5("cyber-snake", 900), err: null },
      { signature: "s3", blockTime: 30, memo: gpx5("blockwords", 400), err: null },
      { signature: "s4", blockTime: 40, memo: gpx5r, err: null }, // verified
      { signature: "s5", blockTime: 50, memo: null, err: null }, // no memo -> skipped
      { signature: "s6", blockTime: 60, memo: gpx5("cyber-snake", 5), err: { x: 1 } }, // errored -> skipped
    ]);
    const stats = await fetchPlayerStats(conn, wallet);
    expect(stats.gamesPlayed).toBe(3); // s1,s2,s3
    expect(stats.verifiedRuns).toBe(1); // s4
    expect(stats.bestByGame["cyber-snake"].score).toBe(900); // best, not 100
    expect(stats.bestByGame["blockwords"].score).toBe(400);
    expect(stats.recentPlays).toHaveLength(3);
    // 3 × $0.05 saves + 1 × $0.15 replay = 0.30
    expect(stats.approxSpendUsd).toBeCloseTo(0.3, 5);
  });

  it("keeps the earlier higher score when a lower one arrives later, and defaults missing blockTime to null", async () => {
    const conn = fakeConnection([
      // higher score first, then a lower one -> false branch keeps the 900
      { signature: "hi", memo: gpx5("cyber-snake", 900), err: null }, // blockTime absent
      { signature: "lo", memo: gpx5("cyber-snake", 100), err: null },
    ]);
    const stats = await fetchPlayerStats(conn, wallet);
    expect(stats.bestByGame["cyber-snake"].score).toBe(900);
    expect(stats.bestByGame["cyber-snake"].blockTime).toBeNull();
    expect(stats.recentPlays[0].blockTime).toBeNull();
  });

  it("caps recentPlays at 10 and ignores non-GPX memos", async () => {
    const sigs = Array.from({ length: 12 }, (_, i) => ({
      signature: `x${i}`,
      blockTime: i,
      memo: gpx5("cyber-snake", 100 + i),
      err: null,
    }));
    sigs.push({ signature: "junk", blockTime: 99, memo: "hello world" as any, err: null });
    const stats = await fetchPlayerStats(fakeConnection(sigs), wallet);
    expect(stats.gamesPlayed).toBe(12);
    expect(stats.recentPlays).toHaveLength(10); // capped
  });

  it("ignores a GPX5R memo belonging to a different player", async () => {
    const otherPlayer = Keypair.generate().publicKey.toBase58();
    const stats = await fetchPlayerStats(
      fakeConnection([
        { signature: "o1", blockTime: 1, memo: `GPX5R|${otherPlayer}|1|S|L`, err: null },
      ]),
      wallet,
    );
    expect(stats.verifiedRuns).toBe(0);
  });

  it("rejects malformed GPX5 memos (too few fields)", async () => {
    const stats = await fetchPlayerStats(
      fakeConnection([
        { signature: "m", blockTime: 1, memo: `GPX5|cyber-snake|classic|${player}`, err: null },
      ]),
      wallet,
    );
    expect(stats.gamesPlayed).toBe(0);
  });
});
