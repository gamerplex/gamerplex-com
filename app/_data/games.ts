import { PURPLE, GREEN, PINK, CYAN } from "../../components/glass";

export type GameDef = { name: string; slug: string; tag: string; path: string; accent: string; sub?: string };

export const GAMES: GameDef[] = [
  { name: "Cyber Snake", slug: "cyber-snake", tag: "Grow, survive, top the board.", path: "/play/cyber-snake?mode=arcade", accent: GREEN },
  { name: "Magic Chess", slug: "magic-chess", tag: "3D chess vs AI bots, on-chain.", path: "/play/magic-chess", accent: PURPLE },
  { name: "Blockwords", slug: "blockwords", tag: "Word-ladder race, beat the clock.", path: "/play/blockwords", accent: PINK },
  { name: "Flipball", slug: "flipball", tag: "Flip, bounce, rack up points.", path: "/play/flipball", accent: GREEN },
  { name: "VRFC", slug: "vrfc", tag: "Muay Thai — the art of eight limbs.", path: "/play/vrfc", accent: PINK },
  { name: "Time Gate", slug: "time-gate", tag: "Fly the sequence, beat the clock.", path: "/play/time-gate", accent: CYAN },
  { name: "Netherlevel", slug: "netherlevel", tag: "Descend the trap halls. Ascend to escape.", path: "/play/netherlevel", accent: PURPLE },
  { name: "TCG Quiz", slug: "tcg-quiz", tag: "Real cards. Name the set, artist, year.", path: "/play/tcg-quiz", accent: CYAN },
  { name: "Omega City", sub: "Humanity's Last Stand", slug: "omega-city", tag: "69 districts. One AI. Pick a side.", path: "https://omega.gamerplex.com", accent: CYAN },
  { name: "PLG", sub: "Pet Legends Global", slug: "pet-legends", tag: "Raise & battle AI pets, globally.", path: "https://play.petlegends.com", accent: PURPLE },
];

/**
 * THE leaderboard game list. One array, because there were four and they disagreed:
 * the homepage switcher omitted `time-gate` (which has scores), /leaderboard omitted
 * `tcg-quiz` (which has scores), and the profile carried a third list of four. Anything
 * that switches boards imports from here.
 *
 * Membership rule: a game belongs here only if it SUBMITS web2 scores. Omega City and
 * PLG do not — Omega City is a persistent war with no per-run score (its board is the
 * war board, see OmegaCityBoard) and PLG is not live — so listing them would render an
 * empty leaderboard rather than a missing one.
 */
export const LB_GAMES = [
  { id: "blockwords", label: "Blockwords", emoji: "📝" },
  { id: "cyber-snake", label: "Cyber Snake", emoji: "🐍" },
  { id: "magic-chess", label: "Magic Chess", emoji: "♟️" },
  { id: "flipball", label: "Flipball", emoji: "🎯" },
  { id: "vrfc", label: "VRFC", emoji: "🥊" },
  { id: "time-gate", label: "Time Gate", emoji: "◇" },
  { id: "netherlevel", label: "Netherlevel", emoji: "🔥" },
  { id: "tcg-quiz", label: "TCG Quiz", emoji: "🃏" },
];

/** The full page also offers Netherlevel's daily variant, which resets and so is often empty. */
export const LB_GAMES_FULL = [...LB_GAMES, { id: "netherlevel-daily", label: "Netherlevel Daily", emoji: "🌒" }];
