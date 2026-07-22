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
  { name: "PLG", sub: "Pet Legends Global", slug: "pet-legends", tag: "Raise & battle AI pets, globally.", path: "https://play.petlegends.com", accent: PURPLE },
];

export const LB_GAMES = [
  { id: "blockwords", label: "Blockwords", emoji: "📝" },
  { id: "cyber-snake", label: "Cyber Snake", emoji: "🐍" },
  { id: "magic-chess", label: "Magic Chess", emoji: "♟️" },
  { id: "flipball", label: "Flipball", emoji: "🎯" },
  { id: "vrfc", label: "VRFC", emoji: "🥊" },
  { id: "netherlevel", label: "Netherlevel", emoji: "🔥" },
  { id: "tcg-quiz", label: "TCG Quiz", emoji: "🃏" },
];
