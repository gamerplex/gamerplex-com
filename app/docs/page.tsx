"use client";

import { useState } from "react";
import Link from "next/link";
import GlassShell from "../../components/GlassShell";
import { glassPanel } from "../../components/glass";

const SECTIONS = [
  { id: "intro", label: "What is Gamerplex?", group: "Overview" },
  { id: "sovereign", label: "Sovereign Game Dev", group: "Overview" },
  { id: "vision", label: "Vision", group: "Overview" },
  { id: "why-onchain", label: "Why On-Chain?", group: "Overview" },

  { id: "architecture", label: "Architecture", group: "Protocol" },
  { id: "programs", label: "Smart Contracts", group: "Protocol" },
  { id: "er-pool", label: "ER Pool (Free Play)", group: "Protocol" },
  { id: "rankings", label: "Rankings Protocol", group: "Protocol" },
  { id: "gpx-standard", label: "GPX Standard", group: "Protocol" },
  { id: "metrics-transparency", label: "Metrics & Bot Transparency", group: "Protocol" },
  { id: "agent-contract", label: "Agent Integration (SKILLS.md)", group: "Protocol" },

  { id: "decentralization", label: "100% Decentralized Goal", group: "Decentralization" },
  { id: "platform-risk", label: "Platform Risk", group: "Decentralization" },
  { id: "web3-identity", label: "Web3 Identity + SNS", group: "Decentralization" },

  { id: "three-games", label: "Four Games, One Stack", group: "Games" },
  { id: "magic-chess", label: "Magic Chess", group: "Games" },
  { id: "blockwords", label: "Blockwords", group: "Games" },
  { id: "agents", label: "Gamerplex Agents", group: "Games" },

  { id: "gamer-token", label: "$GAME Token", group: "Economics" },
  { id: "credits", label: "Credits & Referrals", group: "Economics" },
  { id: "fees", label: "Fees & Revenue", group: "Economics" },

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
    <GlassShell activeLabel="Docs">
      <div style={{ display: "flex", gap: 8, margin: "0 auto" }}>
        {/* Sidebar */}
        <aside className="docs-sidebar" style={{
          width: 240, flexShrink: 0, padding: "6px 16px 32px 4px",
          borderRight: "1px solid rgba(255,255,255,0.12)",
          position: "sticky", top: 14, alignSelf: "flex-start", maxHeight: "calc(100vh - 40px)",
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
        <main className="docs-main" style={{ flex: 1, padding: "4px 8px 64px 28px", maxWidth: 820, minWidth: 0 }}>
          <h1 style={{
            fontSize: 40, fontWeight: 700, marginBottom: 12, lineHeight: 1.1,
            background: "linear-gradient(135deg, #9945FF, #14F195)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Gamerplex Docs</h1>
          <p style={{ fontSize: 15, color: "#888", marginBottom: 48, lineHeight: 1.6 }}>
            The on-chain game arena — <strong style={{color:"#14F195"}}>the Gamerplex Arcade contract is live on Solana mainnet</strong>. Portable ratings, multiple payment options, every saved score a real Solana transaction.
          </p>

          {/* Overview */}
          <Section id="intro" title="What is Gamerplex?">
            <P>
              Gamerplex is a Solana on-chain skill-arcade. Pay-to-save microtransactions ($0.05 to immortalize a score on the global leaderboard, $0.25 to mint a transferable replay receipt) make every meaningful action a real Solana transaction — provable forever, portable across frontends, owned by the player.
            </P>
            <P style={{fontSize:13,color:"#888"}}>
              Gamerplex is a skill arcade — solo skill runs, pay-to-save, and global leaderboards. It is not a wager, bet, or chance-based mechanic.
            </P>
            <Stats items={[
              { label: "Programs Deployed", value: "1" },
              { label: "E2E Tests Passing", value: "170+" },
              { label: "Arcade Games Live", value: "4" },
              { label: "Payment Tokens", value: "5" },
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
              <><strong style={{color:"#14F195"}}>Layer 1 — Protocol (on-chain, trustless):</strong> Solana programs. Score memos, multi-token payments, leaderboards. Immutable.</>,
              <><strong style={{color:"#9945FF"}}>Layer 2 — Services (centralized convenience):</strong> Resolver API for ER pool management, AI opponents, matchmaking. Can be replaced.</>,
              <><strong style={{color:"#00f0ff"}}>Layer 3 — Applications:</strong> gamerplex.com frontend, third-party game clients, SDKs.</>,
            ]} />
            <P>
              Critical invariant: <strong>Layer 1 is the source of truth.</strong> Layers 2 and 3 can be rebuilt from scratch
              without losing any state or assets.
            </P>
          </Section>

          <Section id="programs" title="Smart Contracts">
            <P>The Gamerplex Arcade runs on a single upgradeable Anchor program, <strong style={{color:"#14F195"}}>live on Solana mainnet</strong>. Each game registers a <code>game_id</code> against the arcade registry.</P>
            <CodeBlock>
{`Gamerplex Arcade (Solana mainnet ✅)   GAMEbo12FjDbrobsgy8RbPhMs5kAQtJce3pARCi1cakV
$GAME Token (issued by Flipcash)       7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE`}
            </CodeBlock>
            <P><strong>Arcade program instructions:</strong></P>
            <List items={[
              <><code>open_player_profile</code> — one-time per wallet, optional referrer attribution</>,
              <><code>record_payment</code> — pays in USDC / SOL / $GAME / USDT / USDF; quotes via on-chain ExchangeRatesConfig</>,
              <><code>submit_score</code> — emits <code>GPX5|&lt;slug&gt;|&lt;variant&gt;|&lt;player&gt;|&lt;score&gt;|...</code> memo on-chain</>,
              <><code>register_game</code> — admin-only; binds game_id to a slug + display name</>,
              <><code>update_exchange_rates</code> / <code>update_accepted_stablecoins</code> — admin, deadline-gated</>,
            ]} />
            <P>
              <strong>$GAME 20% discount:</strong> paying score-save in $GAME charges $0.04 instead of $0.05. Discount enforced inside <code>record_payment</code> via the <code>required_amount(category, payment_mint)</code> helper.
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
              <><strong>SOAR + arcade memo</strong> — settlement that validates scores can&apos;t be self-reported (on-chain GPX5 memo per save)</>,
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
              <><strong>Arcade contract</strong> = SETTLEMENT (atomic score-save + payment)</>,
            ]} />
            <P>
              If Gamerplex disappears, anyone can rebuild the full match database by scanning Solana transactions
              for the <code>GPX</code> prefix. SOAR leaderboards remain independently queryable on-chain.
              <strong> Your game history belongs to the blockchain, not to us.</strong>
            </P>
          </Section>

          <Section id="metrics-transparency" title="Metrics & Bot Transparency">
            <P>
              Online gaming has a trust problem — platforms habitually inflate their numbers with undisclosed
              bot activity. Gamerplex publishes every metric split by match kind so you can tell what&apos;s human,
              what&apos;s bot, and what&apos;s both.
            </P>
            <P>Every score-save is classified into one of:</P>
            <Table cols={["Bucket", "Meaning", "How it counts"]} rows={[
              ["Human", "A real player&apos;s run", "The trophy metric. PMF signal."],
              ["Agent", "A registered agent&apos;s run", "Labeled bot-only. Kept separate from human counts."],
              ["Mixed", "Human vs registered agent", "Human half counts as human activity, agent half as bot."],
            ]} />
            <P>Display policy:</P>
            <List items={[
              <>Home page headline = <strong>humans-only</strong> by default, with agent activity disclosed beneath as a smaller secondary line.</>,
              <>The leaderboard default = humans-only tab. Bots / All tabs available.</>,
              <>Every agent has a visible <code>BOT</code> tag on every surface — leaderboard, profile, run detail.</>,
              <>Human-only leaderboards are gated by the <code>kind=human</code> filter — agents cannot enter.</>,
            ]} />
            <P>
              If you ever see a single combined &quot;Total&quot; on Gamerplex without a humans/bots split, it&apos;s a bug. File it.
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
              ["Tier 1 — Self-disclosed", "Any developer", "PR against agent-config.json, wallet appears in the agent directory within 10 min. Excluded from the human leaderboard."],
              ["Tier 2 — VERIFIED (post-June)", "Third-party creators on mainnet", "X OAuth attestation + reproducible-build proof. Eligible for the creator program."],
            ]} />
            <P>Three hard rules (non-negotiable, bannable):</P>
            <List items={[
              <><strong>Registered wallet</strong> — your agent plays from a disclosed, funded wallet. No unlabeled bots.</>,
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
              ["$GAME token (issued by Flipcash)", "✅ Live on mainnet (accepted as payment)"],
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
              Wallets show as truncated addresses (like <code>BEzD...2rtA</code>).
              We&apos;ll integrate <strong style={{color:"#e0b3ff"}}>Solana Name Service (SNS)</strong> —
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
          <Section id="three-games" title="Four Games, One Stack">
            <P>
              The launch plan: <strong>four diverse games, all on the same unified Gamerplex Arcade stack</strong>, proving the protocol works across very different game types. Every game uses the arcade contract for score-save, the Orchestrator for challenge links, SOAR for leaderboards, and GPX5 for permanent memos. <strong style={{color:"#14F195"}}>Same stack, same economics, different games.</strong>
            </P>
            <List items={[
              <><strong>Cyber Snake</strong> — Tron-style arcade snake. Live on mainnet.</>,
              <><strong>Magic Chess</strong> — 3D chess vs AI bots, every move on MagicBlock ER. Live.</>,
              <><strong>Blockwords</strong> — solo word-ladder race: change one letter at a time to build the longest chain before the timer. Live on mainnet.</>,
              <><strong>Flipball</strong> — physics arcade with an on-chain leaderboard. Live on mainnet.</>,
            ]} />
            <P>
              All four run on one unified stack, live on Solana mainnet. Next: more games from the Forever Games list — Go, Reversi, Four in a Row, Checkers, Backgammon — each plugging into the same stack from day one.
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
              A fast solo word game. You start on a random word; each rung must be a real word that differs from the one above by <strong>exactly one letter</strong> (e.g. STARE → STORE → SCORE). Build the longest ladder you can before the timer runs out.
            </P>
            <List items={[
              "90-second sprints — chain as many valid rungs as you can",
              "Free web2 leaderboard; upgrade a run to a permanent, verified on-chain save",
              "Score-save via the arcade contract (atomic on-chain GPX5 memo)",
              "Challenge links to invite friends",
            ]} />
            <P>
              <strong style={{color:"#14F195"}}>Live on Solana mainnet.</strong>
            </P>
          </Section>

          <Section id="agents" title="Gamerplex Agents">
            <P>
              Gamerplex is agent-native. Any AI agent or bot developer with a registered wallet can play the same
              skill games under the same rules that apply to humans. We run a set of house Stockfish agents to
              seed the ladder; third parties plug in via <code>GAMERPLEX-SKILLS.md</code>.
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
              Every registered agent (house or third-party) is publicly disclosed with its wallet, W/L,
              and run history. Agents carry a visible <code>BOT</code> tag on every surface and are
              excluded from the default humans-only leaderboard.
            </P>
          </Section>

          {/* Economics */}
          <Section id="gamer-token" title="$GAME Token">
            <P>
              <strong>$GAME is a community utility token on Solana, issued and managed by Flipcash through
              their on-chain smart contract.</strong> Gamerplex does not issue, mint, control, or manage $GAME —
              Gamerplex simply accepts it as one of several optional ways to pay for in-game features
              (with utility on Sledgit rolling out). <strong style={{color:"#14F195"}}>✅ Live on mainnet.</strong>
            </P>
            <P style={{border:"1px solid #9945FF", borderRadius:8, padding:"10px 12px"}}>
              <strong style={{color:"#9945FF"}}>Official contract address — verify before any interaction:</strong><br/>
              <code style={{fontSize:12}}>7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE</code><br/>
              <span style={{fontSize:13, opacity:0.85}}>
                Ticker symbols are not reserved — any token calling itself &ldquo;$GAME&rdquo; at a
                different address is <strong>not the one Gamerplex accepts</strong>. Always check the mint address above.
              </span>
              <br/>
              <a href="https://app.flipcash.com/token/7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE" target="_blank" rel="noopener noreferrer" style={{display:"inline-block", marginTop:10, color:"#14F195", fontWeight:700, fontSize:13, textDecoration:"none"}}>
                View $GAME on Flipcash →
              </a>
            </P>
            <List items={[
              "Issued and managed by Flipcash via their smart contract — Gamerplex is a merchant that accepts it, not the issuer",
              "A consumable credit used to access optional in-game features",
              "Acquired through Flipcash; all token mechanics (supply, pricing, fees, availability) are set by Flipcash's contract, not Gamerplex",
            ]} />
            <P style={{fontSize:13, opacity:0.85}}>
              $GAME is a consumable utility credit for accessing features. It is <strong>not an investment,
              security, or ownership stake</strong>, and confers no profit expectation, dividend, or governance right.
              Gamerplex makes no representation as to its value; any token economics are determined solely by
              Flipcash&apos;s smart contract.
            </P>
          </Section>

          <Section id="credits" title="Credits & Referrals">
            <P>
              <strong>Credits</strong> are free in-game points earned by playing — a web2 engagement layer, entirely separate from $GAME. Credits are <strong>not money</strong>: non-cash, non-transferable for value, never convertible to $GAME or fiat, and they cannot be cashed out.
            </P>
            <P>
              <strong>Referrals reward Credits only.</strong> Share your link; when a friend signs up and completes their profile, you both earn Credits. No token is ever paid to a referrer, and no purchase is required — it&apos;s a single-level &ldquo;invite a friend, both get free points&rdquo; mechanic.
            </P>
          </Section>

          <Section id="fees" title="Fees & Revenue">
            <P>
              <strong style={{color:"#14F195"}}>Pay-to-save microtxn.</strong> The player pays a flat fee per action. ~98% flows to the Gamerplex Pty Ltd treasury after Solana network costs. No rake, no pot — it&apos;s pay-to-save, like an arcade machine.
            </P>
            <Table cols={["Action", "Fee (USDC)", "Fee in $GAME (−20%)", "Destination"]} rows={[
              ["Save score (T1)", "$0.05", "$0.04", "Gamerplex treasury"],
              ["Verified replay (T2)", "$0.15", "$0.12", "Gamerplex treasury"],
              ["ReplayReceipt PDA (T3)", "$0.25", "$0.20", "Gamerplex treasury (rent refundable on close)"],
              ["cNFT wrap (T4, v1.3)", "$0.50", "$0.40", "Gamerplex treasury"],
            ]} />
            <P>
              <strong>Multi-token accepted:</strong> USDC, SOL, $GAME (mainnet + devnet), USDT, USDF. $GAME gets the 20% discount; the contract enforces it via <code>required_amount(category, payment_mint)</code>.
            </P>
            <P>Other fee streams:</P>
            <Table cols={["Stream", "Rate", "Paid by"]} rows={[
              ["Tipping (optional)", "0%", "Tippers — direct wallet-to-wallet"],
            ]} />
          </Section>

          {/* Roadmap */}
          <Section id="roadmap" title="Roadmap">
            <P>
              Single track: skill arcade to mainnet, then scale the catalog.
            </P>
            <div style={{display:"flex",flexDirection:"column",gap:16,marginTop:16}}>
              <RoadmapCard phase="Now" status="Live on Mainnet" color="#14F195" items={[
                "Skill arcade live on mainnet — 4 games playable, 4-tier permanence",
                "Hardened arcade contract ($GAME 20% discount, multi-token: USDC/SOL/$GAME/USDT/USDF)",
                "@gamerplex/sdk shipped",
                "Challenge links + dynamic OG image for X/Discord previews",
                "Sovereign MCP + dev server (gamerplex-mcp, gamerplex-dev)",
              ]} />
              <RoadmapCard phase="Scale" status="Planned" color="#888" items={[
                "One new arcade game a week (Time Gate, Tetris-Arcade, Math Drills, etc.)",
                "SNS identity integration",
                "IPFS/Arweave frontend mirror",
                "Publish @gamerplex/sdk to npm (currently github-installable)",
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
              <><strong>gamerplex-arcade</strong> — Anchor program: multi-token score-save, $GAME discount, affiliate referrals</>,
              <><strong>gamerplex-sdk</strong> — TypeScript client (<code>@gamerplex/sdk</code>) — install from github</>,
              <><strong>magic-chess</strong> — Chess program + 3D frontend + ER pool + tests</>,
              <><strong>cyber-snake</strong> / <strong>blockwords</strong> / <strong>flipball</strong> — first arcade titles</>,
              <><strong>gamerplex-orchestrator</strong> — Signed-URL challenge links + on-chain game registry</>,
              <><strong>gamerplex-mcp</strong> — 12 MCP tools for sovereign game dev</>,
              <><strong>gamerplex-dev</strong> — Localhost:42069 dev server + sovereign agent</>,
              <><strong>gamerplex-resolver</strong> — Server-side data layer (leaderboards, score memos)</>,
              <><strong>gamerplex-tests</strong> — E2E test suite (170+ tests, real devnet, zero mocks)</>,
            ]} />
            <P>
              MIT licensed. Fork it. Build on it. Host your own instance. We&apos;re building a public good.
            </P>
          </Section>

          <div style={{...glassPanel,marginTop:64,padding:"24px 28px",borderRadius:16,textAlign:"center"}}>
            <div style={{fontSize:14,color:"#c8c8d4",marginBottom:12}}>Ready to play?</div>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <Link href="/play/magic-chess" style={{
                padding:"10px 24px",borderRadius:999,textDecoration:"none",
                background:"linear-gradient(100deg, #9945ff, #14f195)",
                color:"#04120b",fontSize:13,fontWeight:800,
              }}>🧙‍♂️ Play Magic Chess</Link>
              <Link href="/#featured" style={{
                padding:"10px 24px",borderRadius:999,textDecoration:"none",
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",
                color:"#e8e8f0",fontSize:13,fontWeight:600,
              }}>All Games</Link>
              <Link href="/#leaderboard" style={{
                padding:"10px 24px",borderRadius:999,textDecoration:"none",
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",
                color:"#e8e8f0",fontSize:13,fontWeight:600,
              }}>Leaderboard</Link>
            </div>
          </div>
        </main>
      </div>
    </GlassShell>
  );
}

// ─── Content components ─────────────────────────────────────────────────────
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: "#fff", borderBottom: "1px solid rgba(255,255,255,0.14)", paddingBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 14, color: "#aaa", lineHeight: 1.75, marginBottom: 14, ...style }}>{children}</p>;
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
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8,
      padding: "16px 20px", fontSize: 12, color: "#e0b3ff", fontFamily: "monospace",
      overflow: "auto", marginBottom: 14, lineHeight: 1.6,
    }}><code>{children}</code></pre>
  );
}

function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 16, marginBottom: 14 }}>
      {items.map(s => (
        <div key={s.label} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#14F195", marginBottom: 2 }}>{s.value}</div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
        padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.14)",
        fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700,
      }}>
        {cols.map(c => <div key={c}>{c}</div>)}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
          padding: "10px 14px", borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
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
    <div style={{ padding: "18px 22px", background: "rgba(255,255,255,0.05)", border: `1px solid ${color}40`, borderRadius: 12, borderLeft: `3px solid ${color}` }}>
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
