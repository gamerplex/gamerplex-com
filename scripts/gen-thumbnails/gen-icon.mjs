// App-icon generator via Imagen — clean "G" logo marks, logo best-practices.
// Multiple prompt directions × N samples, written to a local folder for review.
//
//   node scripts/gen-thumbnails/gen-icon.mjs <outDir> [samplesPerPrompt]
//
// Reuses GEMINI_API_KEY / .key.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.MODEL || "imagen-4.0-generate-001";
const OUT_DIR = process.argv[2] || path.join(HERE, "icon-out");
const N = Math.min(Number(process.argv[3] || 3), 4);
const BG = { r: 8, g: 2, b: 20 };

// Logo best-practice framing shared by every prompt: simple, iconic, centered,
// high-contrast, scalable, ONLY the letter G, and hard negatives against the
// "#" hallucination + stray text we saw before.
const BASE =
  "professional minimalist logo mark, single bold capital letter G, clean geometric sans-serif letterform, perfectly centered and balanced, iconic memorable and instantly readable as the letter G, high contrast, scalable app icon, solid background, no hashtag, no pound sign, no number sign, no second letter, no words, no text, no watermark, no border frame, no hands, no people";

const PROMPTS = [
  {
    tag: "lowpoly",
    text: `Low-poly geometric logo of the capital letter G assembled from many small triangular facets like a faceted crystal or polygon mesh, bold square blocky letterform with angled diagonal cut ends, each triangle a slightly different neon shade transitioning cyan to blue to violet to magenta pink, subtle glowing edges between facets, on a solid dark violet-black background, premium faceted 3D cyberpunk app icon. ${BASE}.`,
  },
  {
    tag: "shard",
    text: `Bold square capital letter G built from sharp triangular glass shards fitted together, angular diagonal beveled ends, iridescent neon gradient cyan blue purple pink across the facets, thin dark seams between the triangles, glossy crystal, on a solid black background, cyberpunk gaming logo app icon. ${BASE}.`,
  },
  {
    tag: "prism",
    text: `Geometric prismatic capital letter G, thick angular blocky form with 45-degree chamfered diagonal corners, faceted into triangular planes with light and dark facets giving a 3D crystalline look, electric neon cyan magenta and violet, dark studio background, premium low-poly cyberpunk app icon. ${BASE}.`,
  },
];

function apiKey() {
  const fromEnv = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (fromEnv) return fromEnv.trim();
  const keyFile = path.join(HERE, ".key");
  if (existsSync(keyFile)) return readFileSync(keyFile, "utf8").trim();
  console.error("Missing GEMINI_API_KEY or .key");
  process.exit(1);
}

async function run(key, p) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${key}`;
  const body = {
    instances: [{ prompt: p.text }],
    parameters: {
      sampleCount: N,
      aspectRatio: "1:1",
      personGeneration: "dont_allow",
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { console.error(`  ${p.tag} API ${res.status}: ${(await res.text()).slice(0, 300)}`); return; }
  const preds = (await res.json())?.predictions || [];
  let i = 0;
  for (const pr of preds) {
    if (!pr?.bytesBase64Encoded) continue;
    const out = path.join(OUT_DIR, `gem-${p.tag}-${i}.png`);
    await sharp(Buffer.from(pr.bytesBase64Encoded, "base64"))
      .resize(1024, 1024, { fit: "cover" }).flatten({ background: BG }).png({ quality: 100 }).toFile(out);
    console.log(`  ok → ${path.basename(out)}`);
    i++;
  }
}

async function main() {
  const key = apiKey();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Model: ${MODEL} · ${PROMPTS.length} directions × ${N} → ${OUT_DIR}\n`);
  for (const p of PROMPTS) { console.log(p.tag); await run(key, p); }
}

main();
