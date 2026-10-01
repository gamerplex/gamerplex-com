// Challenge links — the viral loop's shared half.
//
// A challenge id is one of two things:
//   s-<rowId>  → the FREE web2 score row (no wallet needed) — "recorded"
//   <txSig>    → an on-chain arcade memo, read via the resolver — "verified"
//
// Free ids are the default because the on-chain path needs a linked wallet and a
// payment; gating the share behind those meant the loop could never fire for a
// new player. attach-tx writes the signature onto the SAME row, so an s- link
// upgrades itself to verified once the player pays.

const RESOLVER_URL = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
const IDENTITY_URL =
  process.env.IDENTITY_URL || process.env.NEXT_PUBLIC_IDENTITY_URL || "https://auth.gamerplex.com";

export interface GameMeta {
  emoji: string;
  label: string;
  route: string;
  accent: string;
}

// One map for the challenge page AND its OG image (they used to keep separate
// copies that covered only 4 of the games).
export const GAME_META: Record<string, GameMeta> = {
  flipball: { emoji: "🎯", label: "Flipball", route: "/play/flipball", accent: "#00ffd1" },
  "cyber-snake": { emoji: "🐍", label: "Cyber Snake", route: "/play/cyber-snake", accent: "#4fc3f7" },
  "magic-chess": { emoji: "♟", label: "Magic Chess", route: "/play/magic-chess", accent: "#c99aff" },
  // The on-chain memo labels chess runs "chess-puzzles"; the web2 row uses "magic-chess".
  "chess-puzzles": { emoji: "♟", label: "Magic Chess Puzzles", route: "/play/magic-chess", accent: "#c99aff" },
  blockwords: { emoji: "🔮", label: "Blockwords", route: "/play/blockwords", accent: "#ffd24a" },
  netherlevel: { emoji: "🔥", label: "Netherlevel", route: "/play/netherlevel", accent: "#ff6b3d" },
  "tcg-quiz": { emoji: "🃏", label: "TCG Quiz", route: "/play/tcg-quiz", accent: "#5bc0ff" },
  "time-gate": { emoji: "⏳", label: "Time Gate", route: "/play/time-gate", accent: "#9ad6ff" },
  vrfc: { emoji: "🥊", label: "VRFC", route: "/play/vrfc", accent: "#ff4d6d" },
};

export const FALLBACK_META: GameMeta = { emoji: "🎮", label: "Gamerplex Arcade", route: "/arcade", accent: "#9945ff" };

export function gameMeta(gameSlug: string): GameMeta {
  return GAME_META[gameSlug] ?? FALLBACK_META;
}

export interface Challenge {
  /** "recorded" = free web2 row; "onchain" = resolver-verified memo. */
  kind: "recorded" | "onchain";
  gameSlug: string;
  /** Display name for the setter: @handle, or a shortened wallet. */
  who: string;
  score: number;
  /** Unix seconds, or null when unknown. */
  at: number | null;
  /** Present when the run has an on-chain memo (either id form). */
  tx: string | null;
  /** Setter's identity userId — the durable referral attribution (web2 rows). */
  userId: string | null;
  /** Setter's wallet — referral attribution for on-chain-only challenges. */
  player: string | null;
}

export function shortWallet(w: string): string {
  return w.length > 8 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

/** A bare score-row id, or null when this is not an s- challenge. */
export function parseScoreRowId(id: string): string | null {
  const m = /^s-(\d{1,15})$/.exec(id);
  return m ? m[1] : null;
}

async function fetchRecorded(rowId: string): Promise<Challenge | null> {
  try {
    const r = await fetch(`${IDENTITY_URL}/api/v1/scores/one?app=gamerplex&id=${rowId}`, {
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    const at = j.at ? Math.floor(new Date(j.at as string).getTime() / 1000) : null;
    return {
      // The row carries the tx once the player upgrades, so one link covers both states.
      kind: j.verified && j.txSig ? "onchain" : "recorded",
      gameSlug: String(j.gameId || ""),
      who: j.handle ? `@${j.handle}` : "a player",
      score: Number(j.score),
      at: Number.isFinite(at as number) ? at : null,
      tx: (j.txSig as string | null) ?? null,
      userId: (j.userId as string | null) ?? null,
      player: null,
    };
  } catch {
    return null;
  }
}

async function fetchOnchain(sig: string): Promise<Challenge | null> {
  try {
    const r = await fetch(`${RESOLVER_URL}/arcade/score/${encodeURIComponent(sig)}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok) return null;
    return {
      kind: "onchain",
      gameSlug: String(j.gameSlug || ""),
      who: shortWallet(String(j.player || "")),
      score: Number(j.score),
      at: typeof j.blockTime === "number" ? j.blockTime : null,
      tx: String(j.tx || sig),
      userId: null,
      player: String(j.player || "") || null,
    };
  } catch {
    return null;
  }
}

/** Resolve either id form. Never throws; returns null when not found. */
export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const rowId = parseScoreRowId(id);
  if (rowId) return await fetchRecorded(rowId);
  if (!id || id.length < 32 || id.length > 128) return null;
  return await fetchOnchain(id);
}

/**
 * The share target for a finished run: the challenge page when we have an id for
 * it, else the plain game URL. `refId` keeps referral attribution either way.
 */
export function buildChallengeUrl(
  scoreId: number | string | null | undefined,
  gameUrl: string,
  refId?: string | null,
): string {
  const base =
    scoreId === null || scoreId === undefined || scoreId === ""
      ? gameUrl
      : `https://gamerplex.com/challenge/s-${scoreId}`;
  if (!refId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}ref=${encodeURIComponent(refId)}`;
}

/**
 * Where "BEAT this" sends the visitor. Carries referral attribution in the form
 * pickReferrerFromUrl() already accepts (`ref` = identity userId, `referrer`/`sig`
 * = the on-chain wallet path), so a challenge click still pays both sides.
 */
export function buildPlayUrl(c: Challenge, challengeId: string): string {
  const game = gameMeta(c.gameSlug);
  const qs = new URLSearchParams();
  if (c.userId) qs.set("ref", c.userId);
  else if (c.player) qs.set("referrer", c.player);
  if (c.tx) qs.set("sig", c.tx);
  qs.set("challenge", challengeId);
  return `${game.route}${game.route.includes("?") ? "&" : "?"}${qs.toString()}`;
}
