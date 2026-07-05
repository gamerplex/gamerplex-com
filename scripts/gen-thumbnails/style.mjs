// LOCKED art direction — the single source of visual consistency across every
// game thumbnail. Change here to restyle the whole set. Per-game specs (subject,
// accent) live in games.json; this wraps them in the shared style so every card
// belongs to the same family.

export const STYLE = [
  "premium mobile game app-icon art",
  "isometric 3D render, glossy studio finish",
  "single centered hero subject on a dark background with a soft radial glow",
  "vibrant neon rim-lighting, dramatic contrast, subtle volumetric haze",
  "cohesive palette anchored in Solana violet (#9945FF) and mint green (#14F195)",
  "ultra-detailed, clean, high production value, app-store icon quality",
  "no text, no words, no letters, no logos, no watermark, no UI, no border",
].join(", ");

export function buildPrompt(game) {
  return `${game.subject}. Accent lighting in ${game.accent}. ${STYLE}.`;
}
