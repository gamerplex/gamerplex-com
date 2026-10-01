import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import {
  GAME_META,
  buildChallengeUrl,
  buildPlayUrl,
  gameMeta,
  parseScoreRowId,
  type Challenge,
} from "../challenge";

const REPO = path.resolve(__dirname, "../../..");
const PLAY_DIR = path.join(REPO, "app", "play");

function recorded(over: Partial<Challenge> = {}): Challenge {
  return {
    kind: "recorded", gameSlug: "cyber-snake", who: "@johnny", score: 1234,
    at: 1_700_000_000, tx: null, userId: "11111111-2222-3333-4444-555555555555",
    player: null, ...over,
  };
}

describe("parseScoreRowId", () => {
  it("accepts the s-<rowId> form", () => {
    expect(parseScoreRowId("s-1")).toBe("1");
    expect(parseScoreRowId("s-987654")).toBe("987654");
  });

  it("rejects anything else, including tx signatures", () => {
    for (const bad of ["", "s-", "s-0x1", "s--1", "s-12.3", "123", "s-" + "9".repeat(16),
                       "5Hk3mQ1pQ8vYc6vQ9m2nZ1aB3cD4eF5gH6iJ7kL8mN9oP", "s-1;drop table"]) {
      expect(parseScoreRowId(bad), bad).toBeNull();
    }
  });
});

describe("buildChallengeUrl", () => {
  const GAME = "https://gamerplex.com/play/cyber-snake";

  it("points at the challenge page when a score row exists", () => {
    expect(buildChallengeUrl(42, GAME)).toBe("https://gamerplex.com/challenge/s-42");
  });

  it("keeps referral attribution on the challenge link", () => {
    expect(buildChallengeUrl(42, GAME, "user-1")).toBe(
      "https://gamerplex.com/challenge/s-42?ref=user-1",
    );
  });

  // Signed-out / failed-save runs must still produce a working share, else the
  // share button silently does nothing for exactly the people we want to convert.
  it("falls back to the plain game URL with no score row", () => {
    expect(buildChallengeUrl(null, GAME)).toBe(GAME);
    expect(buildChallengeUrl(undefined, GAME, "user-1")).toBe(`${GAME}?ref=user-1`);
  });
});

describe("buildPlayUrl", () => {
  // The regression this locks down: an earlier version of the challenge page
  // dropped ref/referrer/sig from the play link, so a challenge click paid
  // neither side of the two-sided referral.
  it("carries the identity userId as ?ref for a web2 run", () => {
    const u = buildPlayUrl(recorded(), "s-7");
    expect(u).toContain("/play/cyber-snake?");
    expect(u).toContain("ref=11111111-2222-3333-4444-555555555555");
    expect(u).toContain("challenge=s-7");
    expect(u).not.toContain("sig=");
  });

  it("carries the wallet + sig for an on-chain-only run", () => {
    const u = buildPlayUrl(
      recorded({ kind: "onchain", userId: null, player: "Wa11etPubkey", tx: "TxSig123" }),
      "TxSig123",
    );
    expect(u).toContain("referrer=Wa11etPubkey");
    expect(u).toContain("sig=TxSig123");
  });

  it("sends an unknown game to the arcade rather than a dead route", () => {
    expect(buildPlayUrl(recorded({ gameSlug: "nope" }), "s-1")).toContain("/arcade?");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orphan guards. These exist because the challenge page was built, correct, and
// linked by NOTHING for months — a bug no page-level test can see, since the
// page works fine when you navigate straight to it.
// ─────────────────────────────────────────────────────────────────────────────

/** Every .tsx under app/play/<slug>, one level deep plus _arcade/. */
function sourcesFor(slug: string): { slug: string; file: string; src: string }[] {
  const dir = path.join(PLAY_DIR, slug);
  return [path.join(dir, "_arcade"), path.join(dir, "_game"), dir]
    .filter(existsSync)
    .flatMap((d) =>
      readdirSync(d, { withFileTypes: true })
        .filter((f) => f.isFile() && (f.name.endsWith(".tsx") || f.name.endsWith(".ts")))
        .map((f) => path.join(d, f.name)),
    )
    .map((file) => ({ slug, file, src: readFileSync(file, "utf8") }));
}

// A "game" here = a play route that saves a free score, which is exactly the set
// that can produce a shareable record. Derived from the source, not hardcoded, so
// a new game cannot be added without these guards applying to it. Excludes
// redirect stubs (chess, cyber-snake-battle) and arena PvP (magic-chess-live),
// none of which has a score row.
const playableGames = readdirSync(PLAY_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .filter((slug) => sourcesFor(slug).some((s) => s.src.includes("/api/scores/submit")));

describe("every game is reachable from a challenge link", () => {
  it("finds the games to check", () => {
    expect(playableGames.length).toBeGreaterThanOrEqual(8);
  });

  // The OG-image map used to cover 4 of 8 games, so half of all shares rendered
  // a generic logo instead of the score.
  it.each(playableGames)("GAME_META has an entry for %s", (slug) => {
    expect(Object.keys(GAME_META), `add "${slug}" to GAME_META in lib/arcade/challenge.ts`)
      .toContain(slug);
    expect(gameMeta(slug).route).toBe(`/play/${slug}`);
  });
});

describe("every game's share button produces a challenge link", () => {
  const sources = playableGames
    .flatMap(sourcesFor)
    .filter((s) => s.src.includes("<ShareSheet"));

  it("every game renders a ShareSheet somewhere", () => {
    const covered = new Set(sources.map((s) => s.slug));
    for (const slug of playableGames) {
      expect(covered, `${slug} renders no ShareSheet — no share, no loop`).toContain(slug);
    }
  });

  it.each(playableGames)("%s shares a challenge URL, not a bare game URL", (slug) => {
    const files = sources.filter((s) => s.slug === slug);
    for (const f of files) {
      expect(
        f.src,
        `${path.relative(REPO, f.file)} passes a bare game URL to ShareSheet. ` +
          `Use buildChallengeUrl(scoreId, ...) so the share carries the score.`,
      ).toMatch(/url=\{buildChallengeUrl\(/);
      expect(f.src).not.toMatch(/url=\{buildShareUrl\("https:\/\/gamerplex\.com\/play\//);
    }
  });

  it.each(playableGames)("%s captures scoreId from the free save", (slug) => {
    const files = sources.filter((s) => s.slug === slug);
    for (const f of files) {
      expect(
        f.src,
        `${path.relative(REPO, f.file)} never reads b.scoreId, so its challenge link is always null`,
      ).toContain("setScoreId(");
    }
  });
});
