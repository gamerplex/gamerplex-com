// Game-thumbnail pipeline — one locked style, consistent set, via the Gemini API
// (Imagen). Reads GEMINI_API_KEY from env (or scripts/gen-thumbnails/.key).
//
//   node scripts/gen-thumbnails/generate.mjs              # all games
//   node scripts/gen-thumbnails/generate.mjs cyber-snake  # one game by id
//   MODEL=imagen-4.0-generate-preview node ...            # override model
//
// Output: public/games/<out> resized to 1280x720 PNG (matches the <GameArt> refs).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const PUBLIC_GAMES = path.join(REPO, "public", "games");

const { buildPrompt } = await import("./style.mjs");

const MODEL = process.env.MODEL || "imagen-4.0-generate-001";
const ASPECT = "16:9";
const OUT_W = 1280;
const OUT_H = 720;

function apiKey() {
  const fromEnv = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (fromEnv) return fromEnv.trim();
  const keyFile = path.join(HERE, ".key");
  if (existsSync(keyFile)) return readFileSync(keyFile, "utf8").trim();
  console.error("Missing GEMINI_API_KEY (env) or scripts/gen-thumbnails/.key file.");
  process.exit(1);
}

async function generateOne(game, key) {
  const prompt = buildPrompt(game);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${key}`;
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: ASPECT, personGeneration: "dont_allow" },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error(`no image in response: ${JSON.stringify(json).slice(0, 300)}`);

  const raw = Buffer.from(b64, "base64");
  const outPath = path.join(PUBLIC_GAMES, game.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(raw).resize(OUT_W, OUT_H, { fit: "cover" }).png({ quality: 90 }).toFile(outPath);
  return path.relative(REPO, outPath);
}

async function main() {
  const key = apiKey();
  const { games } = JSON.parse(await readFile(path.join(HERE, "games.json"), "utf8"));
  const only = process.argv[2];
  const list = only ? games.filter((g) => g.id === only) : games;
  if (!list.length) {
    console.error(only ? `no game with id "${only}"` : "no games in manifest");
    process.exit(1);
  }
  console.log(`Model: ${MODEL} · ${list.length} thumbnail(s)\n`);
  for (const game of list) {
    process.stdout.write(`  ${game.id.padEnd(16)} … `);
    try {
      const rel = await generateOne(game, key);
      console.log(`ok → ${rel}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
}

main();
