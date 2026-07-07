import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { fetchLeaderboard, fetchArcadeScore } from "../leaderboard";

const SLUG = "cyber-snake";
const PLAYER_A = "AaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const PLAYER_B = "BbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";

// Build a `Program log: Memo (len N): "<memo>"` line the way the SPL memo
// program CPI writes it — this is the only shape the regex accepts.
const memoLog = (memo: string) =>
  `Program log: Memo (len ${memo.length}): "${memo}"`;
const gpx5 = (
  slug: string,
  player: string,
  score: number,
  continues = 0,
  powerups = 0,
  duration = 42,
) => `GPX5|${slug}|classic|${player}|${score}|${continues}|${powerups}|SEED|${duration}`;
const gpx5r = (player: string) => `GPX5R|${player}|1|SEED|MOVELOG`;

// Minimal Connection stand-in: only the two methods fetchLeaderboard calls.
function fakeConnection(
  sigs: any[],
  txBySig: Record<string, { logMessages: string[] } | null>,
) {
  return {
    getSignaturesForAddress: vi.fn(async () => sigs),
    getTransaction: vi.fn(async (sig: string) => {
      const meta = txBySig[sig];
      return meta === undefined ? null : { meta };
    }),
  } as any;
}

describe("leaderboard: fetchLeaderboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    delete (globalThis as any).window;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("parses GPX5 memos, keeps best-per-player, sorts, and marks verified", async () => {
    const slug = `verify-${Math.random()}`;
    const sigs = [
      { signature: "sigA", blockTime: 100, err: null },
      { signature: "sigB", blockTime: 200, err: null },
    ];
    const conn = fakeConnection(sigs, {
      // one tx carries A's low score + A's high score + A's GPX5R (verified)
      sigA: {
        logMessages: [
          memoLog(gpx5(slug, PLAYER_A, 100)),
          memoLog(gpx5(slug, PLAYER_A, 900)),
          memoLog(gpx5r(PLAYER_A)),
        ],
      },
      // B's score, unverified
      sigB: { logMessages: [memoLog(gpx5(slug, PLAYER_B, 500))] },
    });

    const result = await fetchLeaderboardFlushed(conn, slug);

    expect(result.map((e) => e.player)).toEqual([PLAYER_A, PLAYER_B]); // 900 > 500
    expect(result[0].score).toBe(900); // best-per-player, not the 100 entry
    expect(result[0].verified).toBe(true); // GPX5R present
    expect(result[1].verified).toBe(false);
  });

  it("respects the limit argument", async () => {
    const slug = `lim-${Math.random()}`;
    const conn = fakeConnection([{ signature: "s1", blockTime: 1, err: null }], {
      s1: {
        logMessages: [
          memoLog(gpx5(slug, PLAYER_A, 900)),
          memoLog(gpx5(slug, PLAYER_B, 800)),
        ],
      },
    });
    const result = await fetchLeaderboardFlushed(conn, slug, 1);
    expect(result).toHaveLength(1);
    expect(result[0].player).toBe(PLAYER_A);
  });

  it("skips errored signatures and txs with no memos", async () => {
    const slug = `skip-${Math.random()}`;
    const conn = fakeConnection(
      [
        { signature: "err", blockTime: 1, err: { some: "err" } },
        { signature: "nomemo", blockTime: 2, err: null },
        { signature: "good", blockTime: 3, err: null },
      ],
      {
        nomemo: { logMessages: ["Program log: something else"] },
        good: { logMessages: [memoLog(gpx5(slug, PLAYER_A, 700))] },
      },
    );
    const result = await fetchLeaderboardFlushed(conn, slug);
    expect(result).toHaveLength(1);
    expect(result[0].player).toBe(PLAYER_A);
  });

  it("returns [] when getSignaturesForAddress throws", async () => {
    const conn = {
      getSignaturesForAddress: vi.fn(async () => {
        throw new Error("rpc down");
      }),
      getTransaction: vi.fn(),
    } as any;
    const result = await fetchLeaderboard(conn, `throws-${Math.random()}`);
    expect(result).toEqual([]);
  });

  it("continues past a per-tx getTransaction error", async () => {
    const slug = `perr-${Math.random()}`;
    const conn = {
      getSignaturesForAddress: vi.fn(async () => [
        { signature: "boom", blockTime: 1, err: null },
        { signature: "ok", blockTime: 2, err: null },
      ]),
      getTransaction: vi.fn(async (sig: string) => {
        if (sig === "boom") throw new Error("429");
        return { meta: { logMessages: [memoLog(gpx5(slug, PLAYER_A, 300))] } };
      }),
    } as any;
    const result = await fetchLeaderboardFlushed(conn, slug);
    expect(result[0].player).toBe(PLAYER_A);
  });

  it("ignores malformed GPX5 memos (too few fields / negative score)", async () => {
    const slug = `bad-${Math.random()}`;
    const conn = fakeConnection([{ signature: "m", blockTime: 1, err: null }], {
      m: {
        logMessages: [
          memoLog(`GPX5|${slug}|classic|${PLAYER_A}`), // too few parts
          memoLog(gpx5(slug, PLAYER_B, -5)), // negative score rejected
        ],
      },
    });
    const result = await fetchLeaderboardFlushed(conn, slug);
    expect(result).toEqual([]);
  });

  it("serves subsequent calls from the in-memory cache (no re-fetch)", async () => {
    const slug = `cache-${Math.random()}`;
    const conn = fakeConnection([{ signature: "c2", blockTime: 1, err: null }], {
      c2: { logMessages: [memoLog(gpx5(slug, PLAYER_A, 400))] },
    });
    const first = await fetchLeaderboardFlushed(conn, slug);
    expect(first).toHaveLength(1);
    expect(conn.getSignaturesForAddress).toHaveBeenCalledTimes(1);
    const second = await fetchLeaderboard(conn, slug);
    expect(second).toHaveLength(1);
    // cache hit — no second RPC round-trip
    expect(conn.getSignaturesForAddress).toHaveBeenCalledTimes(1);
  });

  it("reads a warm sessionStorage cache when the in-memory cache is cold", async () => {
    const slug = `ss-${Math.random()}`;
    const store = new Map<string, string>();
    (globalThis as any).window = {
      sessionStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    const entry = {
      player: PLAYER_A,
      score: 999,
      continues: 0,
      powerups: 0,
      duration: 10,
      tx: "x",
      blockTime: 1,
      verified: true,
    };
    store.set(
      "gp.arcade.leaderboard.v2." + slug,
      JSON.stringify({ at: Date.now(), entries: [entry] }),
    );
    const conn = fakeConnection([], {});
    const result = await fetchLeaderboard(conn, slug);
    expect(result[0].score).toBe(999);
    // sessionStorage hit means no RPC call at all
    expect(conn.getSignaturesForAddress).not.toHaveBeenCalled();
  });
});

// Helper: run fetchLeaderboard with fake timers, auto-advancing through the
// inter-tx sleeps until it resolves.
async function fetchLeaderboardFlushed(conn: any, slug: string, limit?: number) {
  const p =
    limit === undefined ? fetchLeaderboard(conn, slug) : fetchLeaderboard(conn, slug, limit);
  // Flush any pending 150ms sleeps between sequential tx fetches.
  for (let i = 0; i < 30; i++) {
    await vi.advanceTimersByTimeAsync(150);
  }
  return p;
}

describe("leaderboard: fetchArcadeScore", () => {
  afterEach(() => {
    delete (globalThis as any).fetch;
    vi.restoreAllMocks();
  });

  it("returns null for an out-of-range sig length (no fetch)", async () => {
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    expect(await fetchArcadeScore("")).toBeNull();
    expect(await fetchArcadeScore("x".repeat(200))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a successful resolver payload into an ArcadeScoreDetail", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        tx: "TX",
        blockTime: 123,
        gameSlug: SLUG,
        variant: "classic",
        player: PLAYER_A,
        score: 500,
        continues: 1,
        powerups: 2,
        duration: 30,
        seedB58: "SEED",
      }),
    });
    const detail = await fetchArcadeScore("s".repeat(64));
    expect(detail).toMatchObject({ tx: "TX", player: PLAYER_A, score: 500, blockTime: 123 });
  });

  it("defaults blockTime to null when absent", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, tx: "TX", player: PLAYER_A, score: 1 }),
    });
    const detail = await fetchArcadeScore("s".repeat(64));
    expect(detail?.blockTime).toBeNull();
  });

  it("returns null on a non-ok HTTP response", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await fetchArcadeScore("s".repeat(64))).toBeNull();
  });

  it("returns null when the resolver payload is ok:false", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    });
    expect(await fetchArcadeScore("s".repeat(64))).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("net"));
    expect(await fetchArcadeScore("s".repeat(64))).toBeNull();
  });
});
