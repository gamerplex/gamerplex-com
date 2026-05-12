# gamerplex.com

Player surface for the Gamerplex skill-games protocol on Solana.

[Live site](https://gamerplex.com) · [Backend](https://resolver.gamerplex.com) · [Builder docs](https://github.com/gamerplex/gamerplex-dev)

## What this is

The web client players use to discover, launch, and compete in Gamerplex skill games. Every game ships in two modes: Arcade (solo skill run, $0.05 to save a score onchain) and Battle (1v1 head-to-head match, settled via Contention Markets v2.1). The frontend talks to a server-side resolver for indexed data and to onchain programs for state changes.

## Stack

- Next.js 16 (Turbopack), React 19, TypeScript, Tailwind
- Babylon.js for the hero wormhole and 3D chess board
- @solana/wallet-adapter (Phantom, Solflare, Backpack, Glow)
- @magicblock-labs/ephemeral-rollups-sdk for Battle-mode real-time tx
- Server-side resolver (separate repo) holds RPC keys; the client never sees them

## Run locally

```bash
git clone https://github.com/gamerplex/gamerplex-com
cd gamerplex-com
npm install
npm run dev
# open http://localhost:3001
```

Environment vars (all optional, defaults point at production resolver):

- `NEXT_PUBLIC_RESOLVER_URL` (default: `https://resolver.gamerplex.com`)
- `NEXT_PUBLIC_SOLANA_NETWORK` (default: `devnet`)

## Architecture (short)

- `/app` — Next.js App Router routes, one per surface: `/play/{game}`, `/leaderboard`, `/profile`, `/docs`, `/challenge/[id]`, `/replay/[pda]`, `/unavailable`
- `/components` — shared UI (SiteNav, InterstellarSymphony wormhole, per-game widgets)
- `/lib` — onchain and service clients (CM v2.1, arcade contract, resolver)
- `/public/games/{game}/banner.png` — drop a PNG, the home page picks it up; emoji fallback in code

Builders integrate in four steps via the CM v2.1 adapter pattern. See the builder docs link above.

## Sister repos (open source)

- [gamerplex/gamerplex-arcade](https://github.com/gamerplex/gamerplex-arcade) — arcade contract (Anchor)
- [gamerplex/cyber-snake](https://github.com/gamerplex/cyber-snake) — Cyber Snake game program
- [gamerplex/magic-chess](https://github.com/gamerplex/magic-chess) — Magic Chess game program
- [gamerplex/blockwords](https://github.com/gamerplex/blockwords) — Blockwords game program
- [gamerplex/gamerplex-dev](https://github.com/gamerplex/gamerplex-dev) — sovereign dev harness and SKILL.md (4-step game template)
- [contention-markets/cm-contract](https://github.com/contention-markets/cm-contract) — CM v2.1 settlement program

## Status

Devnet — live and playable. Mainnet ceremony when funded.

## License

MIT
