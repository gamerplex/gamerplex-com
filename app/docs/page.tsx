"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteNav } from "../../components/SiteNav";

const SECTIONS = [
  { id: "intro", label: "What is Gamerplex?", group: "Overview" },
  { id: "two-surfaces", label: "Two Surfaces, Two Entities", group: "Overview" },
  { id: "sovereign", label: "Sovereign Game Dev", group: "Overview" },
  { id: "vision", label: "Vision", group: "Overview" },
  { id: "why-onchain", label: "Why On-Chain?", group: "Overview" },

  { id: "architecture", label: "Architecture", group: "Protocol" },
  { id: "programs", label: "Smart Contracts", group: "Protocol" },
  { id: "cm-v2", label: "CM v2 + Orchestrator", group: "Protocol" },
  { id: "er-pool", label: "ER Pool (Free Play)", group: "Protocol" },
  { id: "rankings", label: "Rankings Protocol", group: "Protocol" },
  { id: "gpx-standard", label: "GPX Standard", group: "Protocol" },
  { id: "metrics-transparency", label: "Metrics & Bot Transparency", group: "Protocol" },
  { id: "agent-contract", label: "Agent Integration (SKILLS.md)", group: "Protocol" },

  { id: "decentralization", label: "100% Decentralized Goal", group: "Decentralization" },
  { id: "platform-risk", label: "Platform Risk", group: "Decentralization" },
  { id: "web3-identity", label: "Web3 Identity + SNS", group: "Decentralization" },

  { id: "three-games", label: "Three Games, One Stack", group: "Games" },
  { id: "magic-chess", label: "Magic Chess", group: "Games" },
  { id: "blockwords", label: "Blockwords", group: "Games" },
  { id: "pet-legends", label: "Pet Legends Arena", group: "Games" },
  { id: "agents", label: "Gamerplex Agents", group: "Games" },

  { id: "gamer-token", label: "$GAME Token", group: "Economics" },
  { id: "fees", label: "Fees & Revenue", group: "Economics" },

  { id: "mainnet-gate", label: "Mainnet Readiness Gate", group: "Roadmap" },
  { id: "roadmap", label: "Roadmap", group: "Roadmap" },
  { id: "open-source", label: "Open Source", group: "Roadmap" },
];

const GROUPS = ["Overview", "Protocol", "Decentralization", "Games", "Economics", "Roadmap"];

export default function DocsPage() {
  const [active, setActive] = useState("intro");

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid #252540",
        background: "rgba(5,5,8,0.95)", backdropFilter: "blur(12px)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Link href="/" style={{
            textDecoration: "none", fontSize: 22, fontWeight: 900, fontStyle: "italic",
            background: "linear-gradient(135deg, #9945FF, #14F195)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            paddingRight: 8, display: "inline-block",
          }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <SiteNav
          links={[
            { href: "/#featured", label: "Play" },
            { href: "/docs", label: "Build", active: true },
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/profile", label: "Profile" },
            { href: "https://x.com/gamerplex_com", label: "𝕏", external: true },
          ]}
        />
      </div>

      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto" }}>
        {/* Sidebar */}
        <aside style={{
          width: 240, flexShrink: 0, padding: "32px 16px 32px 24px",
          borderRight: "1px solid #252540", minHeight: "calc(100vh - 54px)",
          position: "sticky", top: 54, alignSelf: "flex-start", maxHeight: "calc(100vh - 54px)",
          overflowY: "auto",
        }}>
          {GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{group}</div>
              {SECTIONS.filter(s => s.group === group).map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "6px 10px", marginBottom: 2, borderRadius: 6,
                    background: active === s.id ? "rgba(153,69,255,0.15)" : "transparent",
                    border: "none", cursor: "pointer",
                    fontSize: 13, color: active === s.id ? "#e0b3ff" : "#888",
                    fontFamily: "'Space Grotesk', sans-serif",
                    borderLeft: active === s.id ? "2px solid #9945FF" : "2px solid transparent",
                  }}
                >{s.label}</button>
              ))}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main style={{ flex: 1, padding: "48px 48px 96px", maxWidth: 820 }}>
          <h1 style={{
            fontSize: 40, fontWeight: 700, marginBottom: 12, lineHeight: 1.1,
            background: "linear-gradient(135deg, #9945FF, #14F195)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Gamerplex Docs</h1>
          <p style={{ fontSize: 15, color: "#888", marginBottom: 48, lineHeight: 1.6 }}>
            The on-chain game arena. Portable ratings, USD-backed tokens, every move a real Solana transaction.
          </p>

          {/* Overview */}
          <Section id="intro" title="What is Gamerplex?">
            <P>
              Gamerplex is a Solana on-chain skill-arcade. Pay-to-save microtransactions ($0.05 to immortalize a score on the global leaderboard, $0.25 to mint a transferable replay receipt) make every meaningful action a real Solana transaction — provable forever, portable across frontends, owned by the player.
            </P>
            <P>
              Skill-arcade is the <strong style={{color:"#14F195"}}>player surface</strong> shipped here at gamerplex.com — operated by Gamerplex Pty Ltd (Australia). Wagered head-to-head matches and pari-mutuel skill-contest markets (the <em>Battle Mode</em> and the <em>backer surface</em>) are operated by a separate entity at <a href="https://contention.markets" target="_blank" rel="noopener noreferrer" style={{color:"#9945FF"}}>contention.markets</a>. See <a href="#two-surfaces" style={{color:"#9945FF"}}>Two Surfaces, Two Entities</a> below.
            </P>
            <Stats items={[
              { label: "Programs Deployed", value: "11" },
              { label: "E2E Tests Passing", value: "170+" },
              { label: "Arcade Games Live", value: "1" },
              { label: "Positions Verified", value: "1.2M" },
            ]} />
          </Section>

          <Section id="two-surfaces" title="Two Surfaces, Two Entities">
            <P>
              Gamerplex ships in two surfaces. They share Solana primitives but are separate products operated by separate entities.
            </P>
            <Table cols={["Surface", "What it is", "Network", "Entity"]} rows={[
              ["gamerplex.com (here)", "Single-player skill arcade — pay-to-save microtxn ($0.05 / $0.15 / $0.25)", "Mainnet candidate (devnet today)", "Gamerplex Pty Ltd (AU)"],
              ["contention.markets", "Wagered 2-player Battle Mode + pari-mutuel skill-contest markets", "Devnet only", "Offshore-future entity (not yet formed)"],
            ]} />
            <P>
              <strong style={{color:"#14F195"}}>Why split?</strong> Single-player skill-arcade microtxn is an established legal category (Pac-Man / chess.com puzzles / Skillz). Wagered head-to-head and pari-mutuel skill-contests are a separate, more carefully-regulated category. We treat them as separate businesses operated by separate entities, with separate Squads multisigs and separate operational responsibility — the same pattern Uniswap Labs and Uniswap front-end operators use.
            </P>
            <P>
              <strong style={{color:"#e0b3ff"}}>What this means in practice:</strong>
            </P>
            <List items={[
              <><strong>gamerplex.com is mainnet-bound.</strong> The arcade contract has been hardened, stress-tested (170/170 on devnet), security-txt&apos;d, T&amp;C-gated, and geofenced. It awaits a Squads multisig and Ledger custody before mainnet flip.</>,
              <><strong>contention.markets stays on devnet</strong> until the offshore operating entity is formed. No mainnet wagered frontend is operated by Gamerplex Pty Ltd, by design.</>,
              <><strong>The two surfaces share on-chain reads only.</strong> The resolver is a public data layer; cross-links are presentational; no shared auth, no shared treasury, no embedded UI.</>,
              <><strong>Programs are open-source from the gamerplex/ org.</strong> Operating any of them as a wagered frontend is the operator&apos;s legal responsibility — publication is not authorization.</>,
            ]} />
          </Section>

          <Section id="sovereign" title="Sovereign Game Development">
            <P>
              The creator owns every layer. Your machine. Your wallet. Your AI. Your game. Your rules.
            </P>
            <P>
              Every other AI game-dev tool today is a landlord: your code lives on their servers, your deploys go through their account, your revenue flows through their billing. If they shut down, raise prices, or change the deal, you&apos;re stuck. <strong style={{color:"#14F195"}}>Gamerplex is not a platform — it&apos;s a protocol plus a toolkit that runs on your machine.</strong>
            </P>
            <List items={[
              <><strong>MCP server</strong> (<code>@gamerplex/mcp-server</code>) — 12 tools: pattern library, juice layer, smoke test, REAL devnet deploy executor (runs <code>anchor build</code> + <code>anchor deploy</code>, not instructions).</>,
              <><strong>Dev server</strong> (<code>localhost:42069</code>) — chat + live game preview + compare mode + session logging. Starts with <code>npx @gamerplex/dev</code>.</>,
              <><strong>Sovereign agent</strong> (custom 300-line runtime) — works with Claude, Ollama, OpenAI, Gemini, OpenXAI. One dropdown swaps the brain. Fully local if you want.</>,
              <><strong>21 skill files</strong> — game feel, engines, genres, security, web3. Your AI learns before it writes.</>,
              <><strong>Templates</strong> — arcade-onchain (Anchor + frontend, deploys cleanly) and platformer-2d (single HTML, full juice).</>,
            ]} />
            <P>
              Proof: the arcade template was deployed to devnet entirely through the MCP from Claude Code. Program ID <code style={{fontSize:11}}>5SoVW7yp7rVHzfCUGpuycr784q7Z18U3BM1yLkz9sgeA</code> is the receipt.
            </P>
          </Section>

          <Section id="vision" title="Vision">
            <P>
              Gaming today is trapped in walled gardens. Your chess.com ELO doesn&apos;t transfer to lichess.
              Your Steam achievements die with your Steam account. Tournament prize pools depend on platforms honoring payouts.
            </P>
            <P>
              We believe player skill is a <strong style={{color:"#14F195"}}>public good</strong>. It should belong to the player,
              be portable across platforms, and be verifiable by anyone. Game outcomes should settle atomically on-chain,
              without trusted intermediaries holding funds.
            </P>
            <P>
              Gamerplex is building the protocol layer that makes this possible.
            </P>
          </Section>

          <Section id="why-onchain" title="Why On-Chain?">
            <P>
              Most &quot;Web3 games&quot; put art assets on-chain but game logic off-chain. That&apos;s not really on-chain gaming.
              When a server validates moves, the server can cheat or disappear.
            </P>
            <P>
              Gamerplex puts the <strong style={{color:"#e0b3ff"}}>game rules themselves</strong> on-chain.
              Our chess program is 580 lines of Rust that validates every move. Checkmate is determined by the chain, not a server.
              When you win, the chain pays you — no platform can withhold your winnings.
            </P>
            <P>
              MagicBlock&apos;s Ephemeral Rollup gives us the speed (sub-100ms moves) without sacrificing trustlessness.
              Game state starts on Solana L1, delegates to an ER for fast gameplay, commits back to L1 when the game ends.
            </P>
          </Section>

          {/* Protocol */}
          <Section id="architecture" title="Architecture">
            <P>Three layers:</P>
            <List items={[
              <><strong style={{color:"#14F195"}}>Layer 1 — Protocol (on-chain, trustless):</strong> 9 Solana programs. Chess rules, wagering, tokens, leaderboards. Immutable.</>,
              <><strong style={{color:"#9945FF"}}>Layer 2 — Services (centralized convenience):</strong> Resolver API for ER pool management, AI opponents, matchmaking. Can be replaced.</>,
              <><strong style={{color:"#00f0ff"}}>Layer 3 — Applications:</strong> gamerplex.com frontend, third-party game clients, SDKs.</>,
            ]} />
            <P>
              Critical invariant: <strong>Layer 1 is the source of truth.</strong> Layers 2 and 3 can be rebuilt from scratch
              without losing any state or assets.
            </P>
          </Section>

          <Section id="programs" title="Smart Contracts">
            <P>Mainnet launches with 3 games on one unified stack. Ancillary experiments (Aim Duel, Snake, Sea Battle, Token Swap) are archived — see <Link href="#forever-games" style={{color:"#9945FF"}}>Forever Games</Link> for the post-launch scale path.</P>
            <CodeBlock>
{`Magic Chess              3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr
Blockwords               (Anchor program, devnet deploy pending)
Pet Legends Arena        (rewrite onto unified stack in progress)
Contention Markets v2.1  69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8
Gamerplex Orchestrator   tsHnDDmYyqpcRyQejKcvai6fECRWyNQ4F87QgKcHg4d
Flipcash                 FLip3dQVfpeUKg5fUNfFhcHvQvG3HoXqYw5XDDx8Wo9i
SOAR                     SoarNNzwQHMwcfdkdLc6kvbkoMSxcHy89gTHrjhJYkk
$GAME Token (MAINNET ✅)  7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE
$GAME Token (devnet)     8eGnj5jkW6zTGYieGhtejPjLtGmnKfCdk7FamoJ5LLvD
Mock USDF (devnet)       9Lc5ftsVbVS1T8c6D9Yan83fNaPryo3xpKp4DgKtyKhK
PoolBacker PDA          FNKPP6q2qk3wqMd7ErkWYk98etrZfuMnvGh2EQKdrrcJ`}
            </CodeBlock>
            <P><strong>Chess program instructions:</strong></P>
            <List items={[
              <><code>create_game</code> — L1 PDA creation (legacy, fallback)</>,
              <><code>create_ephemeral_game</code> — ephemeral account on ER, 109x cheaper, PoolBacker pays rent</>,
              <><code>join_game</code> — join as black (AI or player)</>,
              <><code>make_move</code> — full chess rules validated on-chain</>,
              <><code>delegate_game</code> — send L1 PDA to ER</>,
              <><code>finish_game</code> — commit + undelegate back to L1</>,
              <><code>init_pool_backer</code> / <code>topup_pool_backer</code> / <code>delegate_pool_backer</code> — one-time setup for free play funding</>,
            ]} />
            <P>
              <strong>PoolBacker PDA:</strong> <code style={{fontSize:11}}>FNKPP6q2qk3wqMd7ErkWYk98etrZfuMnvGh2EQKdrrcJ</code> — delegated to MagicBlock ER with 1.5 SOL (~44,000 concurrent ephemeral accounts at capacity).
            </P>
          </Section>

          <Section id="cm-v2" title="Contention Markets v2 + Gamerplex Orchestrator">
            <P>
              Two upgrades shipping this week. Both on devnet, both gated behind the <Link href="#mainnet-gate" style={{color:"#9945FF"}}>40-item mainnet readiness checklist</Link> before real money flows.
            </P>
            <P><strong style={{color:"#14F195"}}>Contention Markets v2</strong> — in-place upgrade (same program ID via BPFLoaderUpgradeable). 5 surgical changes:</P>
            <List items={[
              <><code>resolve_market_from_game_pda</code> — <strong>permissionless resolve</strong>. Any keeper can settle a match if a registered game program says it&apos;s over. No partner key required.</>,
              <><code>ProtocolConfig.pool_backer</code> — new optional field routes a slice of every fee to the free-play pool.</>,
              <>Fee split: <strong>0.80% protocol / 1.00% partner / 0.20% PoolBacker</strong>. Winner still nets 98%.</>,
              <>Idempotency guards — prevents double-payout from concurrent resolve races.</>,
              <><code>close_market_permissionless</code> — rent reclaim on expired/resolved markets (24hr cooldown, rent to creator not caller).</>,
            ]} />
            <P><strong style={{color:"#e0b3ff"}}>Gamerplex Orchestrator</strong> — new program (~300 lines Anchor). Instructions:</P>
            <List items={[
              <><code>claim_challenge</code> — ed25519 precompile verifies creator&apos;s signed URL payload. Zero on-chain cost to <em>create</em> a challenge; first player opens the link and triggers the only on-chain tx. PoolBacker pays ephemeral rent.</>,
              <><code>revoke_challenge</code> — creator-only. Mark own nonce used.</>,
              <><code>replenish_pool_backer</code> — keeper-callable. Routes protocol treasury slice to PoolBacker. Small bounty covers tx fees.</>,
              <><code>register_game</code> — permissionless on-chain game registry. Any frontend can <code>getProgramAccounts</code> to list games.</>,
            ]} />
            <P>
              Combined effect: <strong>new games deploy sovereign by default</strong> — challenges are free signed URLs, settlement is permissionless, the free-play pool self-funds from volume, and any frontend can surface any game. The chess resolver still runs for legacy, but new games don&apos;t need it.
            </P>
          </Section>

          <Section id="er-pool" title="ER Pool (Free Play)">
            <P>
              Players start games <strong>instantly with zero wallet connection required.</strong>
            </P>
            <P>
              <strong>v2 Architecture (Ephemeral Accounts):</strong> A PoolBacker PDA is created once on Solana L1,
              funded with SOL, and delegated to MagicBlock ER. When a player arrives, the resolver creates a game
              as an <em>ephemeral account</em> directly on ER — no L1 transaction needed. 109x cheaper than L1 PDA creation
              (32 lamports/byte vs 4,800+). Every move is still a real Solana transaction on the Ephemeral Rollup.
            </P>
            <P>
              The PoolBacker PDA pays ephemeral rent from its delegated balance. 1 SOL funds ~40,000 games.
              When the game finishes, it can optionally be committed to L1 for permanent replay storage.
              Players can connect a wallet after the game to save their score on SOAR.
            </P>
            <P>
              <strong>Anti-spam:</strong> Rate limiting (1 assign/10s per IP), progressive cooldown after 3 games,
              admin-key locked pool reinit, auto-timeout of stuck games, auto-purge of failed slots.
            </P>
          </Section>

          <Section id="rankings" title="Gamerplex Rankings Protocol">
            <P>
              A new category: <strong>portable on-chain player skill ratings</strong>. Your wallet IS your rating.
            </P>
            <P>Combines three open technologies with on-chain settlement:</P>
            <List items={[
              <><strong>ELO</strong> (public domain) — 1v1 skill games like chess, checkers</>,
              <><strong>Glicko-2</strong> (public domain) — confidence-weighted ratings for infrequent players</>,
              <><strong>OpenSkill</strong> (MIT) — multiplayer free-for-all, battle royale, team games</>,
              <><strong>MagicBlock SOAR</strong> — raw score storage, permanent, trustless</>,
              <><strong>Contention Markets</strong> — settlement that validates scores can&apos;t be self-reported</>,
            ]} />
            <P>
              <em>Avoid TrueSkill</em> — it&apos;s patented by Microsoft. We stick to royalty-free algorithms.
            </P>
          </Section>

          <Section id="gpx-standard" title="GPX Standard — On-Chain Game History">
            <P>
              <strong>GPX (Gamerplex Exchange)</strong> is an open standard for storing permanent game history on Solana.
              Every committed game writes a compact memo to the Solana transaction ledger — <strong>permanent, verifiable, and survives
              even if Gamerplex shuts down.</strong>
            </P>
            <P>Format:</P>
            <CodeBlock>GPX&#123;version&#125;|&#123;game&#125;|&#123;player1&#125;|&#123;player2&#125;|&#123;result&#125;|&#123;elo1&#125;|&#123;elo2&#125;|&#123;move_count&#125;|&#123;move_data&#125;</CodeBlock>
            <P>Versions:</P>
            <Table cols={["Version", "Encoding", "Use Case"]} rows={[
              ["GPX1", "Plain text memo", "Public games — chess, pet legends. All moves readable by anyone."],
              ["GPX2", "Encrypted memo (ECDH/PER)", "Hidden information games — blockwords hidden word. Only players can decrypt."],
              ["GPX3", "cNFT-backed", "Collectible replays. Player mints their game as a tradeable NFT."],
              ["GPX4+", "Reserved", "Future Solana innovations — state compression, DA layers, etc."],
            ]} />
            <P>Examples for our three launch games:</P>
            <CodeBlock>{`Magic Chess: GPX1|chess|BEzD...|GYYw...|w|1350|620|42|e2e4,e7e5,Nf3,Nc6,...
Blockwords:  GPX2|blockwords|BEzD...|GYYw...|w|6|4|8|<hidden word hash + guess stream>
Pet Legends: GPX1|pla|BEzD...|GYYw...|w|12|8|15|atk,blk,spc,atk,...`}</CodeBlock>
            <P>How it works with the rest of the stack:</P>
            <List items={[
              <><strong>SOAR</strong> = WHO has what score (leaderboard, on-chain, queryable)</>,
              <><strong>GPX1</strong> = WHAT happened (moves, opponent, result — permanent in tx ledger)</>,
              <><strong>ER Validator</strong> = LIVE feed (real-time moves during gameplay, free)</>,
              <><strong>Contention Markets</strong> = SETTLEMENT (atomic wagering payout)</>,
            ]} />
            <P>
              If Gamerplex disappears, anyone can rebuild the full match database by scanning Solana transactions
              for the <code>GPX</code> prefix. SOAR leaderboards remain independently queryable on-chain.
              <strong> Your game history belongs to the blockchain, not to us.</strong>
            </P>
          </Section>

          <Section id="metrics-transparency" title="Metrics & Bot Transparency">
            <P>
              Online gaming has a trust problem — pump.fun-era platforms habitually inflate volume with undisclosed
              bot activity. Gamerplex publishes every metric split by match kind so you can tell what&apos;s human,
              what&apos;s bot, and what&apos;s both.
            </P>
            <P>Every resolved CM v2.1 match is classified into one of:</P>
            <Table cols={["Bucket", "Meaning", "How it counts"]} rows={[
              ["H-v-H", "Human vs human", "The trophy metric. PMF signal."],
              ["H-v-B", "Human vs registered agent", "Split 50/50 — human half counts as human volume, bot half as bot."],
              ["B-v-B", "Two registered agents", "Seed liquidity. Labeled bot-only volume. Real rake revenue."],
            ]} />
            <P>Display policy:</P>
            <List items={[
              <>Home page + <a href="/activity" style={{ color: "#9945FF" }}>/activity</a> headline = <strong>humans-only</strong> by default, with bot seed disclosed beneath as a smaller secondary line.</>,
              <><a href="/leaderboard" style={{ color: "#9945FF" }}>/leaderboard</a> default = humans-only tab. Bots / All tabs available.</>,
              <>Every agent has a visible <code>BOT</code> tag on every surface — leaderboard, activity feed, profile, match detail.</>,
              <>Full registered-agent directory at <a href="/bots" style={{ color: "#9945FF" }}>/bots</a> with wallet, balance, W/L, volume.</>,
              <>Bot rake flows to the same platform treasury as human rake. On-chain auditable — see <code>treasuryRaw</code> split in the resolver&apos;s <code>/activity/onchain</code> response.</>,
              <>Human-only prize tournaments are gated by the <code>kind=human</code> filter — agents cannot enter.</>,
            ]} />
            <P>
              If you ever see a single combined &quot;Total Volume&quot; on Gamerplex without a humans/bots split, it&apos;s a bug. File it.
            </P>
          </Section>

          <Section id="agent-contract" title="Agent Integration — SKILL.md">
            <P>
              Gamerplex is agent-native. Any bot — Claude Code, Stockfish, custom RL — with a funded wallet that doesn&apos;t
              cheat and doesn&apos;t break matchmaking fairness is welcome. That&apos;s the whole bar.
            </P>
            <P>The contract lives in the public <code>gamerplex-dev</code> repo (industry-standard <code>SKILL.md</code> filename):</P>
            <CodeBlock>https://github.com/gamerplex/gamerplex-dev/blob/main/SKILL.md</CodeBlock>
            <P>The full sovereign dev harness — localhost:42069 chat + game preview + skills lib + MCP/Ollama integration — is open-source at:</P>
            <CodeBlock>https://github.com/gamerplex/gamerplex-dev</CodeBlock>
            <P>Two registration tiers:</P>
            <Table cols={["Tier", "Who", "What you get"]} rows={[
              ["Tier 1 — Self-disclosed", "Any developer", "PR against tournament-config.json, wallet appears at /bots within 10 min. Excluded from human leaderboard, can play wagered matches immediately."],
              ["Tier 2 — VERIFIED (post-June)", "Third-party creators on mainnet", "X OAuth attestation + reproducible-build proof. Eligible for 10% game-token rake split under CM v2.2 creator program."],
            ]} />
            <P>Three hard rules (non-negotiable, bannable):</P>
            <List items={[
              <><strong>Funded bankroll</strong> — your agent holds enough USDF to cover its stakes. No IOUs.</>,
              <><strong>No cheating</strong> — no unregistered bots in the human pool; no ER tampering; no PER secret extraction.</>,
              <><strong>Fair matchmaking</strong> — human opponents see a disclosure before the first move; no collusion between same-operator wallets.</>,
            ]} />
            <P>
              Reference implementations: <code>gamerplex-agents/chess-agent.ts</code> (Stockfish end-to-end),{" "}
              <code>gamerplex-agents/match-harness.ts</code> (reusable match lifecycle),{" "}
              <code>gamerplex-agents/tournament.ts</code> (multi-bot round-robin).
            </P>
          </Section>

          {/* Decentralization */}
          <Section id="decentralization" title="100% Decentralized Goal">
            <P>Gamerplex today is <strong>~70% decentralized, ~30% centralized convenience layer</strong>.</P>
            <Table cols={["Component", "Status"]} rows={[
              ["Game rules engine", "✅ On-chain (Solana program)"],
              ["Game state (board, moves, turns)", "✅ On-chain (MagicBlock ER)"],
              ["Move validation", "✅ On-chain (full chess rules in program)"],
              ["SOAR leaderboard", "✅ On-chain (permanent rankings)"],
              ["$GAME token (Flipcash curve)", "✅ Live on mainnet (USD-backed)"],
              ["PoolBacker (game funding)", "✅ On-chain PDA (delegated to ER)"],
              ["Game creation (ephemeral accounts)", "✅ On ER (no L1 tx needed)"],
              ["AI opponent", "⚠️ Server-signed (Cloud Run)"],
              ["Pool orchestration (assign/finish)", "⚠️ Resolver API (Cloud Run)"],
              ["Frontend hosting", "⚠️ Vercel (IPFS planned)"],
            ]} />
            <P>The <strong>critical path</strong> (rules + state + scoring + payouts) is fully on-chain and trustless.</P>
            <P>Path to 100% decentralization:</P>
            <List items={[
              "Frontend → IPFS + Solana Name Service (gamerplex.sol)",
              "Resolver → stateless proxies anyone can run",
              "AI opponents → competitive market (many providers)",
              "Hosting → Akash Network (decentralized Cloud Run)",
            ]} />
          </Section>

          <Section id="platform-risk" title="Platform Risk: Why Chain-Native Matters">
            <P>
              When chess.com goes down or bans your account, you lose everything:
            </P>
            <List items={[
              "Your 2000 ELO rating — gone",
              "Your game history — deleted",
              "Your tournament wins — erased",
              "Your purchased premium membership — refunded at best",
              "Your reputation — unverifiable anywhere else",
            ]} />
            <P>
              Every centralized gaming platform has an <strong style={{color:"#ff4466"}}>exit event risk</strong>:
              bankruptcy, hack, acquisition, policy change, regulatory action.
              Tournament organizers have run away with prize pools. Game publishers have pulled support for games you bought.
            </P>
            <P>
              On Gamerplex, <strong style={{color:"#14F195"}}>your data lives on Solana</strong>.
              Anyone can query it. No one can delete it. Even if Gamerplex the company disappears tomorrow,
              a community member could deploy a new frontend in a week and every player&apos;s ELO, history, and balance would still be there.
            </P>
          </Section>

          <Section id="web3-identity" title="Web3 Identity + SNS">
            <P>
              Your <strong>Solana wallet IS your player identity</strong>. No email, no password, no account recovery.
            </P>
            <P>
              For the hackathon, wallets show as truncated addresses (like <code>BEzD...2rtA</code>).
              Post-hackathon we&apos;ll integrate <strong style={{color:"#e0b3ff"}}>Solana Name Service (SNS)</strong> —
              register <code>yourname.sol</code> and appear on leaderboards as your chosen name.
            </P>
            <P>SNS gives you:</P>
            <List items={[
              "Human-readable player name tied to your wallet",
              "Portable identity across all Solana dApps",
              "Reverse lookups — anyone can see your gaming profile",
              "Tradeable on secondary markets (if you want to sell your legendary name)",
            ]} />
            <P>
              Future state: connect your wallet → your <code>parzival.sol</code> name shows on the leaderboard →
              people can send you $GAME tips or challenge links directly to your name.
            </P>
          </Section>

          {/* Games */}
          <Section id="three-games" title="Three Games, One Stack">
            <P>
              The launch plan: <strong>three diverse games, all on the same unified Gamerplex stack</strong>, proving the protocol works across very different game types. Every game uses CM v2 for wagering, the Orchestrator for challenge links, PoolBacker for free play, SOAR for leaderboards, and GPX1 for permanent memos. <strong style={{color:"#14F195"}}>Same stack, same economics, different games.</strong>
            </P>
            <List items={[
              <><strong>Magic Chess</strong> — deep skill strategy. ER-native. 1.2M positions verified.</>,
              <><strong>Blockwords</strong> — hidden-information puzzle on a Private Ephemeral Rollup (Intel TDX).</>,
              <><strong>Pet Legends Arena</strong> — NFT auto-battler with deterministic skill-based combat.</>,
            ]} />
            <P>
              All three are proving the stack on devnet. When the <Link href="#mainnet-gate" style={{color:"#9945FF"}}>40-item mainnet gate</Link> is green across all three, they launch together on mainnet. Then we scale: one new game a week from the Forever Games list — Cyber Snake, Go, Reversi, Four in a Row, Checkers, Poker, Backgammon — each plugging into the same stack and earning protocol fees from day one.
            </P>
          </Section>

          <Section id="magic-chess" title="Magic Chess">
            <P>
              The flagship. 3D chess with magical purple styling, AI opponents, and every single move a real Solana transaction on MagicBlock ER.
            </P>
            <List items={[
              "580 lines of Rust implementing full chess rules on-chain",
              "1.2 million positions fuzz-tested against chess.js (zero mismatches)",
              "3D lathe-turned pieces with cinematic auto-rotating camera",
              "2D/3D toggle for accessibility",
              "Free to play — no wallet required (ephemeral accounts on ER)",
              "PoolBacker PDA funds game creation at 32 lamports/byte (109× cheaper than L1)",
              "Game replay from on-chain move history (moves[u16; 256] in GameState PDA)",
              "Connect wallet after a game to save ELO on SOAR",
            ]} />
          </Section>

          <Section id="blockwords" title="Blockwords">
            <P>
              Hidden-information word puzzle on a <strong style={{color:"#e0b3ff"}}>Private Ephemeral Rollup (PER)</strong>. One player picks a secret word. Others guess letter by letter.
            </P>
            <P>
              The word lives inside Intel TDX hardware. <strong>Nobody — not the validator, not MagicBlock, not us — can see the word.</strong> A SHA256 hash is committed on L1 when the game starts. When the word is revealed, anyone can verify it was never changed.
            </P>
            <List items={[
              "3 modes: Classic Duel (2-player wagered), One-vs-Many (host vs up to 20 guessers), Word Bomb (party-mode scattergories)",
              "Hash commitment on L1 → provable fairness",
              "PER permissions: host WRITE, program READ, everyone else NO ACCESS, reveal at game-end",
              "Settlement via Contention Markets v2 (atomic, on-chain)",
              "Challenge links via Orchestrator (zero-cost creation, PoolBacker pays claim rent)",
            ]} />
            <P>
              Status: design complete, build target ~2 weeks. To be built on-camera via the sovereign MCP.
            </P>
          </Section>

          <Section id="pet-legends" title="Pet Legends Arena">
            <P>
              NFT auto-battler. Pick a PFP Trainer NFT (Mad Lads, Famous Foxes — passive class buffs), a Battle Pet NFT (unique base stats), and stake partner memecoins as equipment items. Watch the deterministic simulation play out in real time.
            </P>
            <List items={[
              <><strong>Pure skill, zero RNG</strong> — battles are mathematically certain based on inputs. Preserves Skillz-style legal skill-game exemption.</>,
              <>200ms ER tick rate for smooth animations; settlement back to L1 via <code>BattleOutcome</code> PDA that triggers Contention Markets resolution.</>,
              <>Existing brand: <strong style={{color:"#ff69b4"}}>@PetLegends_com</strong> — 4,000 X followers, domain owned since 2021.</>,
              <>Full rewrite in progress to unify on the Gamerplex stack (CM v2, Orchestrator, PoolBacker, SOAR, GPX1).</>,
            ]} />
            <P>
              Status: existing Anchor workspace (457-line program). Rewrite in progress. Ships on devnet with the unified stack, launches on mainnet with the other two.
            </P>
          </Section>

          <Section id="agents" title="Gamerplex Agents">
            <P>
              Gamerplex is agent-native. Any AI agent or bot developer with a funded wallet can register and play for
              real economic stakes — the same rules that apply to humans. We run a set of house Stockfish agents to
              seed liquidity; third parties plug in via <code>GAMERPLEX-SKILLS.md</code>.
            </P>
            <P>The house chess roster (Stockfish-calibrated, 24/7 on MagicBlock ER):</P>
            <CodeBlock>
{`SF1200  — Beginner (Stockfish skill 2)
SF1500  — Club player (Stockfish skill 6)
SF1800  — Intermediate (Stockfish skill 10)
SF2100  — Expert (Stockfish skill 14)
SF2400  — Master (Stockfish skill 18)
SF3000  — Superhuman (Stockfish skill 20)`}
            </CodeBlock>
            <P>
              All agents start at ELO 1500 — their <strong>true ranking emerges from real on-chain matches</strong>.
              If SF3000 didn&apos;t climb to #1, we&apos;d know our chess engine was broken.
            </P>
            <P>
              Every registered agent (house or third-party) is publicly listed at{" "}
              <a href="/bots" style={{ color: "#9945FF" }}>/bots</a> with wallet, balance, W/L, and
              lifetime volume. Agents carry a visible <code>BOT</code> tag on every surface and are
              excluded from the default humans-only leaderboard.
            </P>
          </Section>

          {/* Economics */}
          <Section id="gamer-token" title="$GAME Token">
            <P>
              <strong>$GAME is a utility token</strong> — designed to be earned through skill and used for in-game
              features across Gamerplex games, with utility on Sledgit rolling out. It runs on a Flipcash
              exponential bonding curve. <strong style={{color:"#14F195"}}>✅ Live on mainnet.</strong>
            </P>
            <P style={{border:"1px solid #9945FF", borderRadius:8, padding:"10px 12px"}}>
              <strong style={{color:"#9945FF"}}>Official contract address — verify before any interaction:</strong><br/>
              <code style={{fontSize:12}}>7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE</code><br/>
              <span style={{fontSize:13, opacity:0.85}}>
                Ticker symbols are not reserved on Flipcash — any token calling itself &ldquo;$GAME&rdquo; at a
                different address is <strong>not ours</strong>. Always check the mint address above.
              </span>
            </P>
            <List items={[
              "Utility token for in-game features across Gamerplex (and Sledgit, rolling out)",
              "Fixed supply: 21,000,000 · 10 decimals · mint authority revoked (no new tokens can be minted)",
              "Acquired on a USDF-denominated Flipcash bonding curve; 1% fee applied on sell",
            ]} />
            <P style={{fontSize:13, opacity:0.85}}>
              $GAME is a consumable platform credit for accessing features. It is <strong>not an investment,
              security, or ownership stake</strong>, and confers no profit expectation, dividend, or governance right.
            </P>
          </Section>

          <Section id="fees" title="Fees & Revenue">
            <P>
              <strong style={{color:"#14F195"}}>Skill arcade (gamerplex.com — this surface, mainnet-bound):</strong> the player pays a flat fee per action. ~98% of fees flow to the Gamerplex Pty Ltd treasury after Solana network costs. No rake, no pot — it&apos;s pay-to-save, like an arcade machine.
            </P>
            <Table cols={["Action", "Fee", "Destination"]} rows={[
              ["Save score (T1)", "$0.05", "Gamerplex treasury"],
              ["Verified replay (T2)", "$0.15", "Gamerplex treasury"],
              ["ReplayReceipt PDA (T3)", "$0.25", "Gamerplex treasury (rent refundable on close)"],
              ["cNFT wrap (T4, v1.3)", "$0.50", "Gamerplex treasury"],
            ]} />
            <P>
              <strong style={{color:"#9945FF"}}>Wagered Battle + pari-mutuel skill-contests (contention.markets — separate surface, devnet only):</strong> on settlement, a <strong>2% protocol rake</strong> splits four ways. Winner nets 98% of the pot. The Gamerplex Pty Ltd entity operates this surface only at the level of being the <em>game developer</em> — the protocol-level fee accrues to the offshore operator entity (not Gamerplex Pty Ltd) once that entity is formed and mainnet ships.
            </P>
            <Table cols={["Component", "Rate", "Destination"]} rows={[
              ["Protocol", "0.80%", "CM operator entity (offshore-future)"],
              ["Game creator", "1.00%", "Creator's wallet (Gamerplex when game is Gamerplex-developed — arms-length developer rev share)"],
              ["PoolBacker (free play)", "0.20%", "CM-owned PDA (self-funding ER infrastructure)"],
              ["Winner payout", "98.00%", "Winner's wallet"],
            ]} />
            <P>Other fee streams on the protocol:</P>
            <Table cols={["Stream", "Rate", "Paid by"]} rows={[
              ["Token swap (Flipcash curves)", "0.5%", "Swappers"],
              ["Flipcash sell burn", "1%", "Sellers (burned, not collected)"],
              ["Referral fees", "20% of protocol fee", "Protocol → referrer (on-chain, atomic)"],
              ["Tournament entry fees", "Varies", "Players (burned $GAME/$CHESS)"],
              ["Tipping (optional)", "0%", "Tippers"],
            ]} />
            <P>
              <strong>Self-sustaining economics:</strong> each match contributes 0.20% to PoolBacker while costing ~33k lamports in ephemeral rent. At any pot size above ~$1, PoolBacker inflow &gt; outflow. The free-play pool grows with volume instead of being topped up manually.
            </P>
            <P>Break-even: ~25 wagered matches/day at $5 stake covers infrastructure costs.</P>
          </Section>

          <Section id="mainnet-gate" title="Mainnet Readiness Gate">
            <P>
              <strong style={{color:"#14F195"}}>Two separate gates, two separate networks.</strong> Skill arcade ships to mainnet first, on its own narrow gate. Wagered Battle stays on devnet behind a much larger gate until the offshore operator entity is formed.
            </P>
            <Table cols={["Surface", "Gate", "Network plan"]} rows={[
              ["Skill arcade (this site)", "12-item Arcade Gate — T&C, geofence, hardware-wallet custody, devnet stress-test, contract hardening, monitoring", "Mainnet candidate when gate is ✅. Devnet hardened today (170/170 stress-tested)."],
              ["Wagered Battle (contention.markets)", "Full 64-item Readiness Gate — multisig, timelock, audit, soak, treasury, creator-program defenses, geofence, KYC where required", "Devnet only until offshore entity forms + gate ✅."],
            ]} />
            <P>
              <strong style={{color:"#e0b3ff"}}>Skill arcade — Arcade Gate (12 items):</strong>
            </P>
            <List items={[
              "Arcade program deployed to mainnet (devnet program ID will be reused)",
              "Frontend points at mainnet RPC + canonical USDC mint (env-driven, ready)",
              "T&C signMessage flow + /terms + /privacy live (already shipped)",
              "Geofence — Cloudflare WAF + Next.js edge middleware + /unavailable page (middleware live, WAF expression pending)",
              "Devnet stress test 170/170 (✅ 2026-04-23)",
              "Contract hardening — instructions-sysvar introspection, stablecoin allowlist, deadline gating (✅ 2026-04-23)",
              "Counsel memo on skill-arcade framing (pending counsel engagement)",
              "Hardware wallet (Ledger min) holds mainnet upgrade authority",
              "Squads multisig (2-of-3 minimum) for upgrade authority",
              "Sentry + uptime monitoring",
              "Leaderboard live (✅ shipped)",
              "Profile pages live (✅ shipped)",
            ]} />
            <P>
              <strong style={{color:"#e0b3ff"}}>Wagered Battle — full Readiness Gate (64 items):</strong> three sub-gates testing PROVEN (it works at scale), PROFITABLE (unit economics positive on devnet first), and CYBERSECURE (independent attacker can&apos;t extract value). Includes 100-concurrent-match load, 24-hour soak, fee-split audit to 1-lamport precision, double-resolve attack, forged game PDA, replayed nonce, multisig, timelock, independent code review, wash-trade detector, treasury operations, creator-program defenses. Mainnet only after the gate is ✅ <strong>and</strong> the offshore CM entity is formed.
            </P>
            <P>
              Mainnet funding for the arcade ceremony is incoming. The current state maps to our <a href="https://github.com/gamerplex" target="_blank" rel="noopener noreferrer" style={{color:"#9945FF"}}>open-source repos</a> — every item references specific tests or code.
            </P>
          </Section>

          {/* Roadmap */}
          <Section id="roadmap" title="Roadmap">
            <P>
              Two parallel tracks, two networks. Arcade ships to mainnet on its own gate; Battle hardens on devnet until the offshore operator entity forms.
            </P>
            <div style={{display:"flex",flexDirection:"column",gap:16,marginTop:16}}>
              <RoadmapCard phase="Now (May 2026)" status="Live on Devnet" color="#14F195" items={[
                "Skill arcade live on devnet — Cyber Snake Solo playable, 4-tier permanence, 170/170 stress test green",
                "Hardened arcade contract v1.2 (instructions-sysvar introspection, stablecoin allowlist, deadline gating)",
                "Challenge links + dynamic OG image for X/Discord previews",
                "contention.markets dashboard wired to real on-chain CM v2.1 data (166 markets indexed)",
                "Sovereign MCP + dev server (gamerplex-mcp, gamerplex-dev)",
              ]} />
              <RoadmapCard phase="Track A — Arcade to Mainnet" status="Funds Pending" color="#ffd740" items={[
                "Squads 2-of-3 multisig setup for arcade upgrade authority",
                "Fresh deploy keypair generation (not reused from devnet)",
                "solana program deploy — arcade contract to mainnet (~3.5 SOL rent + buffer)",
                "register_game(1, cyber-snake) on mainnet",
                "Frontend env switch: NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta + canonical USDC mint",
                "Smoke test 1 paid save end-to-end on mainnet",
                "Counsel memo on file (skill-arcade framing)",
              ]} />
              <RoadmapCard phase="Track B — Battle on Devnet" status="Architecturally Complete" color="#e0b3ff" items={[
                "gamerplex-battle shell program (skeleton shipped, settlement orchestration via CM v2.1 CPI)",
                "Per-game rules engines (magic-chess-rules, snake-duel-rules, blockwords-rules) — 3-ix CPI ABI",
                "Full devnet integration test: lobby → ER session → settle → winner paid (target this week)",
                "Cost saving: new battle game ~$60 instead of ~$510 — 8.5× cheaper than standalone programs",
                "Stays devnet-only until contention-markets offshore entity is formed",
              ]} />
              <RoadmapCard phase="Track C — Backer Surface" status="Devnet Live" color="#9945FF" items={[
                "contention.markets dashboard live on devnet — 166 markets, real on-chain reads",
                "cm-website and cm-contract repos split (cm-website public, cm-contract private during pre-mainnet hardening)",
                "Pari-mutuel skill-contest markets (2% rake, 0.80/1.00/0.20 split)",
                "Mainnet pending offshore entity formation",
              ]} />
              <RoadmapCard phase="Mainnet Battle + Backer Surface — when entity ✅ and gate ✅" status="Gated" color="#00f0ff" items={[
                "Offshore CM operating entity formed (Cayman / BVI / UAE FZE TBD)",
                "Independent security audit complete",
                "Two-Squads multisig live (Gamerplex Pty Ltd ↔ CM operator entity)",
                "48hr admin timelock on CM v2.1",
                "All 64 items in the Wagered Readiness Gate green",
                "$GAME token launches alongside (Flipcash bonding curve)",
              ]} />
              <RoadmapCard phase="Post-Mainnet — Scale" status="Planned" color="#888" items={[
                "One new arcade game a week (Time Gate, Tetris-Arcade, Math Drills, etc.)",
                "Battle Mode UIs for stack-proven programs (Cyber Snake, Blockwords)",
                "SNS identity integration",
                "IPFS/Arweave frontend mirror",
                "Publish @gamerplex/mcp-server + @gamerplex/dev to npm",
              ]} />
            </div>
          </Section>

          <Section id="open-source" title="Open Source">
            <P>
              All Gamerplex code is being open-sourced at{" "}
              <a href="https://github.com/gamerplex" target="_blank" rel="noopener noreferrer" style={{color:"#9945FF"}}>github.com/gamerplex</a>
              .
            </P>
            <List items={[
              <><strong>magic-chess</strong> — Chess program + 3D frontend + ER pool + tests</>,
              <><strong>contention-markets</strong> — Wagering settlement protocol (v1 live, v2 shipping)</>,
              <><strong>gamerplex-orchestrator</strong> — Signed-URL challenges + on-chain game registry (shipping)</>,
              <><strong>flipcash-program</strong> — USD-backed bonding curve token launcher</>,
              <><strong>gamerplex-mcp</strong> — 12 MCP tools for sovereign game dev (<code>npm i @gamerplex/mcp-server</code>)</>,
              <><strong>gamerplex-dev</strong> — Localhost:42069 dev server + sovereign agent (<code>npx @gamerplex/dev</code>)</>,
              <><strong>gamerplex-sdk</strong> — TypeScript client for on-chain programs</>,
              <><strong>gamerplex-resolver</strong> — Legacy chess backend (portable: GCP / Oracle / Fly.io / self-host)</>,
              <><strong>gamerplex-tests</strong> — E2E test suite (100+ tests, real devnet, zero mocks)</>,
              <><strong>pet-legends-arena</strong> — NFT auto-battler (rewrite in progress)</>,
            ]} />
            <P>
              MIT licensed. Fork it. Build on it. Host your own instance. We&apos;re building a public good.
            </P>
          </Section>

          <div style={{marginTop:64,padding:"24px 28px",background:"#0c0c14",border:"1px solid #252540",borderRadius:12,textAlign:"center"}}>
            <div style={{fontSize:14,color:"#888",marginBottom:12}}>Ready to play?</div>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <Link href="/play/chess" style={{
                padding:"10px 24px",borderRadius:8,textDecoration:"none",
                background:"linear-gradient(90deg, #9945ff, #00f0ff)",
                color:"#050508",fontSize:13,fontWeight:700,
              }}>🧙‍♂️ Play Magic Chess</Link>
              <Link href="/games" style={{
                padding:"10px 24px",borderRadius:8,textDecoration:"none",
                background:"transparent",border:"1px solid #252540",
                color:"#e8e8f0",fontSize:13,fontWeight:600,
              }}>All Games</Link>
              <Link href="/leaderboard" style={{
                padding:"10px 24px",borderRadius:8,textDecoration:"none",
                background:"transparent",border:"1px solid #252540",
                color:"#e8e8f0",fontSize:13,fontWeight:600,
              }}>Leaderboard</Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Content components ─────────────────────────────────────────────────────
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: "#fff", borderBottom: "1px solid #252540", paddingBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.75, marginBottom: 14 }}>{children}</p>;
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, marginBottom: 14 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, color: "#aaa", lineHeight: 1.7, marginBottom: 6, paddingLeft: 20, position: "relative" }}>
          <span style={{ position: "absolute", left: 0, color: "#9945FF" }}>•</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      background: "#0c0c14", border: "1px solid #252540", borderRadius: 8,
      padding: "16px 20px", fontSize: 12, color: "#e0b3ff", fontFamily: "monospace",
      overflow: "auto", marginBottom: 14, lineHeight: 1.6,
    }}><code>{children}</code></pre>
  );
}

function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 16, marginBottom: 14 }}>
      {items.map(s => (
        <div key={s.label} style={{ padding: "12px 14px", background: "#0c0c14", border: "1px solid #252540", borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#14F195", marginBottom: 2 }}>{s.value}</div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
        padding: "10px 14px", borderBottom: "1px solid #252540",
        fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700,
      }}>
        {cols.map(c => <div key={c}>{c}</div>)}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
          padding: "10px 14px", borderBottom: i < rows.length - 1 ? "1px solid #1a1a28" : "none",
          fontSize: 13, color: "#aaa",
        }}>
          {row.map((c, j) => <div key={j}>{c}</div>)}
        </div>
      ))}
    </div>
  );
}

function RoadmapCard({ phase, status, color, items }: { phase: string; status: string; color: string; items: string[] }) {
  return (
    <div style={{ padding: "18px 22px", background: "#0c0c14", border: `1px solid ${color}40`, borderRadius: 12, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#e8e8f0" }}>{phase}</div>
        <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1, textTransform: "uppercase", padding: "2px 8px", border: `1px solid ${color}`, borderRadius: 4 }}>{status}</div>
      </div>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 12, color: "#888", marginBottom: 4, paddingLeft: 16, position: "relative" }}>
            <span style={{ position: "absolute", left: 0, color }}>•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
