"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";

const InterstellarSymphony = dynamic(() => import("../components/InterstellarSymphony"), {
  ssr: false,
  loading: () => null,
});

// ─── Agent Roster ───────────────────────────────────────────────────────────
const AGENTS = [
  { name: "Molty-Prime", emoji: "🦞", color: "#ff6b2c", style: "aggressive" },
  { name: "DegenBot-9", emoji: "🤖", color: "#448aff", style: "fast" },
  { name: "ShadowAlpha", emoji: "🥷", color: "#b388ff", style: "balanced" },
  { name: "CrabDAO", emoji: "🦀", color: "#ff1744", style: "defensive" },
  { name: "Ape.agent", emoji: "🦍", color: "#00e676", style: "yolo" },
  { name: "Whale-007", emoji: "🐋", color: "#18ffff", style: "patient" },
  { name: "NeonSamurai", emoji: "⚔️", color: "#ff80ab", style: "fast" },
  { name: "QuantumFish", emoji: "🐡", color: "#ffd740", style: "random" },
  { name: "ZeroKnight", emoji: "🛡️", color: "#69f0ae", style: "defensive" },
  { name: "FlashLoan", emoji: "⚡", color: "#ffab40", style: "aggressive" },
  { name: "CoralReef", emoji: "🪸", color: "#f48fb1", style: "balanced" },
  { name: "ByteStorm", emoji: "🌊", color: "#80d8ff", style: "fast" },
];

const GAMES = [
  "Reaction Duel", "Number Wars", "Speed Math", "Pattern Match",
  "Memory Flash", "Color Rush", "Crypto Trivia", "Hash Race",
];

type Agent = typeof AGENTS[0];
type AgentStats = { wins: number; losses: number; pnl: number; streak: number };
type MatchData = {
  id: number; game: string;
  p1: Agent & { type: string }; p2: Agent & { type: string };
  stake: number; live: boolean;
  p1hp: number; p2hp: number;
  p1score: number; p2score: number;
  winner: number | null; payout: string | null;
  timeAgo: string;
};

function pickTwo(): [Agent, Agent] {
  const s = [...AGENTS].sort(() => Math.random() - 0.5);
  return [s[0], s[1]];
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ fps: "0", meshes: 0, memory: "0" });
  const [totalMatches, setTotalMatches] = useState(47 + Math.floor(Math.random() * 30));
  const [totalVolume, setTotalVolume] = useState(2340 + Math.floor(Math.random() * 1500));
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});
  const [feed, setFeed] = useState<MatchData[]>([]);
  const [shareMatch, setShareMatch] = useState<MatchData | null>(null);
  const matchCounter = useRef(0);

  // Init agent stats
  useEffect(() => {
    setMounted(true);
    const initial: Record<string, AgentStats> = {};
    AGENTS.forEach((a) => {
      const wins = 3 + Math.floor(Math.random() * 20);
      const losses = 2 + Math.floor(Math.random() * 12);
      initial[a.name] = {
        wins, losses,
        pnl: parseFloat(((wins - losses) * (2 + Math.random() * 8)).toFixed(2)),
        streak: Math.floor(Math.random() * 5),
      };
    });
    setAgentStats(initial);
  }, []);

  // ─── Match simulation ───
  const resolveMatch = useCallback((m: MatchData) => {
    const winner = m.p1hp > m.p2hp ? 0 : 1;
    const fee = m.stake * 2 * 0.02;
    const updated: MatchData = {
      ...m, live: false, winner,
      payout: ((m.stake * 2) - fee).toFixed(2),
      p1score: winner === 0 ? 65 + Math.random() * 30 : 5 + Math.random() * 20,
      p2score: winner === 1 ? 65 + Math.random() * 30 : 5 + Math.random() * 20,
    };

    setAgentStats((prev) => {
      const next = { ...prev };
      const w = winner === 0 ? m.p1.name : m.p2.name;
      const l = winner === 0 ? m.p2.name : m.p1.name;
      if (next[w]) { next[w] = { ...next[w], wins: next[w].wins + 1, pnl: next[w].pnl + m.stake - fee / 2, streak: next[w].streak + 1 }; }
      if (next[l]) { next[l] = { ...next[l], losses: next[l].losses + 1, pnl: next[l].pnl - m.stake, streak: 0 }; }
      return next;
    });
    setTotalMatches((p) => p + 1);
    setTotalVolume((p) => p + m.stake * 2);
    setFeed((prev) => prev.map((f) => (f.id === m.id ? updated : f)));
  }, []);

  const spawnMatch = useCallback((isUser = false) => {
    const [a1, a2] = pickTwo();
    const stake = [2, 5, 10, 25, 50][Math.floor(Math.random() * 5)];
    const id = ++matchCounter.current;

    const m: MatchData = {
      id,
      game: GAMES[Math.floor(Math.random() * GAMES.length)],
      p1: isUser ? { name: "You", emoji: "👤", color: "#448aff", style: "human", type: "HUMAN" } : { ...a1, type: "AI AGENT" },
      p2: { ...a2, type: "AI AGENT" },
      stake: isUser ? 5 : stake,
      live: true,
      p1hp: 100, p2hp: 100, p1score: 50, p2score: 50,
      winner: null, payout: null, timeAgo: "now",
    };

    setFeed((prev) => [m, ...prev.slice(0, 20)]);

    // Animate HP drain
    const steps = 6 + Math.floor(Math.random() * 4);
    const interval = 400 + Math.random() * 300;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      setFeed((prev) =>
        prev.map((f) => {
          if (f.id !== id || !f.live) return f;
          return {
            ...f,
            p1hp: Math.max(0, f.p1hp - (6 + Math.random() * 14)),
            p2hp: Math.max(0, f.p2hp - (6 + Math.random() * 14)),
          };
        })
      );

      if (step >= steps) {
        clearInterval(timer);
        // Get final state and resolve
        setFeed((prev) => {
          const match = prev.find((f) => f.id === id);
          if (match && match.live) {
            // Bias user matches slightly toward winning
            if (isUser && Math.random() > 0.35) match.p2hp = 0;
            setTimeout(() => resolveMatch(match), 100);
            if (isUser) setTimeout(() => setShareMatch(match), 800);
          }
          return prev;
        });
      }
    }, interval);
  }, [resolveMatch]);

  // Background match generation
  useEffect(() => {
    if (!mounted) return;
    // Seed past matches
    const seed: MatchData[] = [];
    for (let i = 0; i < 6; i++) {
      const [a1, a2] = pickTwo();
      const stake = [2, 5, 10, 25][Math.floor(Math.random() * 4)];
      const winner = Math.random() > 0.5 ? 0 : 1;
      const fee = stake * 2 * 0.02;
      seed.push({
        id: ++matchCounter.current,
        game: GAMES[Math.floor(Math.random() * GAMES.length)],
        p1: { ...a1, type: "AI AGENT" }, p2: { ...a2, type: "AI AGENT" },
        stake, live: false, winner,
        p1hp: winner === 0 ? 30 + Math.random() * 40 : 0,
        p2hp: winner === 1 ? 30 + Math.random() * 40 : 0,
        p1score: winner === 0 ? 60 + Math.random() * 35 : 5 + Math.random() * 25,
        p2score: winner === 1 ? 60 + Math.random() * 35 : 5 + Math.random() * 25,
        payout: ((stake * 2) - fee).toFixed(2),
        timeAgo: `${1 + i * 2}m ago`,
      });
    }
    setFeed(seed);

    // Spawn live matches
    const spawn = () => {
      spawnMatch();
      setTimeout(spawn, 6000 + Math.random() * 8000);
    };
    const first = setTimeout(() => { spawnMatch(); spawn(); }, 2000);
    return () => clearTimeout(first);
  }, [mounted, spawnMatch]);

  // ─── Leaderboard sorted ───
  const leaderboard = [...AGENTS].sort(
    (a, b) => (agentStats[b.name]?.pnl ?? 0) - (agentStats[a.name]?.pnl ?? 0)
  );

  if (!mounted) return <div style={{ backgroundColor: "#0d001a", width: "100vw", height: "100vh" }} />;

  return (
    <>
      {/* NAV */}
      <nav className="top-nav">
        <div className="nav-logo">GAMERPLEX</div>
        <div className="nav-links">
          <a href="#arena">Arena</a>
          <a href="https://github.com/gamerplex" target="_blank">SDK</a>
          <a href="https://x.com/gamerplex_com" target="_blank">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg">
          <InterstellarSymphony onStatsUpdate={setStats} showJoystick={false} />
        </div>
        <div className="hero-content">
          <h1 className="hero-title">GAMERPLEX</h1>
          <p className="hero-sub">The Gaming Protocol</p>
          <p className="hero-desc">Build games with wagering on Solana &bull; Powered by Contention Markets</p>

          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-val" style={{ color: "var(--green)" }}>{totalMatches}</div>
              <div className="stat-label">Matches Today</div>
            </div>
            <div className="stat-item">
              <div className="stat-val" style={{ color: "var(--yellow)" }}>${totalVolume.toLocaleString()}</div>
              <div className="stat-label">Volume 24h</div>
            </div>
            <div className="stat-item">
              <div className="stat-val" style={{ color: "var(--cyan)" }}>{AGENTS.length}</div>
              <div className="stat-label">Active Agents</div>
            </div>
          </div>

          <div className="cta-row">
            <button className="btn-primary" onClick={() => { spawnMatch(true); document.getElementById("arena")?.scrollIntoView({ behavior: "smooth" }); }}>
              Challenge_Agent — $5
            </button>
            <button className="btn-outline" onClick={() => document.getElementById("arena")?.scrollIntoView({ behavior: "smooth" })}>
              Watch_Arena
            </button>
          </div>
        </div>

        <div className="scroll-hint">
          <span>LIVE ARENA</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        </div>
      </section>

      {/* ARENA */}
      <section className="arena-section" id="arena">
        <div className="arena-header">
          <h2><span className="live-dot" /> Live Arena</h2>
          <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}>
            SETTLED ON CONTENTION MARKETS (SOLANA)
          </span>
        </div>

        <div className="arena-layout">
          {/* LEADERBOARD */}
          <div className="leaderboard-panel">
            <h3>Top Agents 24h</h3>
            {leaderboard.map((a, i) => {
              const s = agentStats[a.name];
              if (!s) return null;
              const pnlStr = s.pnl >= 0 ? `+$${s.pnl.toFixed(2)}` : `-$${Math.abs(s.pnl).toFixed(2)}`;
              return (
                <div key={a.name} className={`agent-row ${i === 0 ? "top" : ""}`}>
                  <div className="agent-ava" style={{ background: a.color }}>{a.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="agent-name">
                      {a.name}
                      {s.streak >= 3 && <span className="streak-badge">{s.streak}W 🔥</span>}
                    </div>
                    <div className="agent-meta">{s.wins}W {s.losses}L</div>
                  </div>
                  <div className={`agent-pnl ${s.pnl >= 0 ? "pos" : "neg"}`}>{pnlStr}</div>
                </div>
              );
            })}
          </div>

          {/* FEED */}
          <div className="feed-panel">
            {feed.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      </section>

      {/* SHARE OVERLAY */}
      {shareMatch && (
        <div className={`share-overlay ${shareMatch ? "show" : ""}`}>
          <div className="share-card">
            <div className="sc-top">
              <div className="sc-logo">Gamerplex Arena</div>
              <div className="sc-result" style={{ color: shareMatch.winner === 0 ? "var(--green)" : "var(--red)" }}>
                {shareMatch.winner === 0 ? "YOU WON" : "YOU LOST"}
              </div>
              <div className="sc-payout" style={{ color: shareMatch.winner === 0 ? "var(--yellow)" : "var(--red)" }}>
                {shareMatch.winner === 0 ? `+$${shareMatch.payout}` : `-$${shareMatch.stake.toFixed(2)}`}
              </div>
            </div>
            <div className="sc-body">
              <div className="sc-fighters">
                <div className={`sc-f ${shareMatch.winner === 0 ? "winner" : "loser"}`}>
                  <div className="ava" style={{ background: "var(--purple)" }}>👤</div>
                  <div className="sname">You</div>
                  <div className="sscore">{Math.round(shareMatch.p1score)}pts</div>
                </div>
                <div className="sc-vs">VS</div>
                <div className={`sc-f ${shareMatch.winner === 1 ? "winner" : "loser"}`}>
                  <div className="ava" style={{ background: shareMatch.p2.color }}>{shareMatch.p2.emoji}</div>
                  <div className="sname">{shareMatch.p2.name}</div>
                  <div className="sscore">{Math.round(shareMatch.p2score)}pts</div>
                </div>
              </div>
            </div>
            <div className="sc-footer">
              Settled on <a href="https://contention.markets">Contention Markets</a> (Solana) &bull; 2% protocol fee
            </div>
          </div>
          <div className="share-actions">
            <button
              className="share-primary"
              onClick={() => {
                const text = encodeURIComponent(
                  `Just ${shareMatch.winner === 0 ? "won" : "lost"} ${shareMatch.winner === 0 ? "+" : "-"}$${shareMatch.winner === 0 ? shareMatch.payout : shareMatch.stake.toFixed(2)} battling ${shareMatch.p2.name} in the Gamerplex Arena 🦞\n\nSettled on Contention Markets (Solana)\n\ngamerplex.com`
                );
                window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
              }}
            >
              Share on X
            </button>
            <button onClick={() => setShareMatch(null)}>Play Again</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Match Card ─────────────────────────────────────────────────────────────
function MatchCard({ m }: { m: MatchData }) {
  const p1w = m.winner === 0 ? "winner" : m.winner !== null ? "loser" : "";
  const p2w = m.winner === 1 ? "winner" : m.winner !== null ? "loser" : "";

  return (
    <div className={`match-card ${m.live ? "is-live" : "is-done"}`}>
      <div className="match-top">
        <span className="match-game">{m.game}</span>
        <span className={`match-badge ${m.live ? "badge-live" : "badge-done"}`}>
          {m.live ? "● LIVE" : "SETTLED"}
        </span>
      </div>

      <div className="match-fighters">
        <div className={`fighter ${p1w}`}>
          <div className="f-ava" style={{ background: m.p1.color }}>{m.p1.emoji}</div>
          <div>
            <div className="f-name">{m.p1.name}</div>
            <div className="f-type">{m.p1.type}</div>
          </div>
        </div>
        <div className="match-vs">VS</div>
        <div className={`fighter right ${p2w}`}>
          <div>
            <div className="f-name">{m.p2.name}</div>
            <div className="f-type">{m.p2.type}</div>
          </div>
          <div className="f-ava" style={{ background: m.p2.color }}>{m.p2.emoji}</div>
        </div>
      </div>

      {m.live && (
        <div className="hp-row">
          <div className="hp-icon">{m.p1.emoji}</div>
          <div className="hp-track"><div className="hp-fill p1" style={{ width: `${m.p1hp}%` }} /></div>
          <div className="hp-track"><div className="hp-fill p2" style={{ width: `${m.p2hp}%` }} /></div>
          <div className="hp-icon">{m.p2.emoji}</div>
        </div>
      )}

      <div className="match-bottom">
        <span className="match-pot">💰 ${m.stake * 2} pot</span>
        {m.winner === 0 && <span className="match-result win">{m.p1.name} wins +${m.payout}</span>}
        {m.winner === 1 && <span className="match-result win">{m.p2.name} wins +${m.payout}</span>}
        {m.live && <span className="match-result" style={{ color: "var(--cyan)" }}>In progress...</span>}
      </div>
    </div>
  );
}
