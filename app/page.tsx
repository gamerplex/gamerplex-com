"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";

const InterstellarSymphony = dynamic(() => import("../components/InterstellarSymphony"), {
  ssr: false,
  loading: () => null,
});
const Chess3DBoard = dynamic(() => import("./play/magic-chess/Chess3DBoard"), { ssr: false });
const OnchainPreview = dynamic(() => import("./_components/OnchainPreview"), { ssr: false });

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

// localStorage cache helpers — keep the home page feeling instant on repeat visits.
// Writes cache every successful fetch; reads once on mount so first paint shows
// prior data, then background polling swaps in fresh numbers silently.
const CACHE_KEY_HOME = "gp.home.v1";
interface HomeCache {
  at: number;
  matches: any[];
  leaderboard: any[];
  agents: any[];
  liveGames: any[];
}
function readHomeCache(): HomeCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_HOME);
    return raw ? (JSON.parse(raw) as HomeCache) : null;
  } catch {
    return null;
  }
}
function writeHomeCache(c: HomeCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY_HOME, JSON.stringify(c));
  } catch {}
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState(true); // start muted by default
  const [stats, setStats] = useState({ fps: "0", meshes: 0, memory: "0" });
  const [realMatches, setRealMatches] = useState<any[]>([]);
  const [realLeaderboard, setRealLeaderboard] = useState<any[]>([]);
  const [liveGames, setLiveGames] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [agentLeaderboard, setAgentLeaderboard] = useState<any[]>([]);

  // Instant hydration from localStorage on first mount — before any network call.
  useEffect(() => {
    const c = readHomeCache();
    if (!c) return;
    if (c.matches) setRealMatches(c.matches);
    if (c.leaderboard) setRealLeaderboard(c.leaderboard);
    if (c.agents) setAgentLeaderboard(c.agents);
    if (c.liveGames) {
      setLiveGames(c.liveGames);
      if (c.liveGames.length > 0) setSelectedGame(c.liveGames[0].gamePda);
    }
  }, []);

  // Fetch real stats + feed + leaderboard from resolver
  const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
  useEffect(() => {
    let matchesRef = realMatches;
    let lbRef = realLeaderboard;
    let agentsRef = agentLeaderboard;
    let liveRef = liveGames;
    const fetchAll = async () => {
      const results = await Promise.allSettled([
        fetch(`${RESOLVER}/feed`).then(r => r.json()),
        fetch(`${RESOLVER}/leaderboard/chess`).then(r => r.json()),
        fetch(`${RESOLVER}/rankings/agents`).then(r => r.json()),
      ]);
      const [feedRes, lbRes, agentsRes] = results;
      if (feedRes.status === "fulfilled" && feedRes.value?.ok) {
        matchesRef = feedRes.value.matches || [];
        setRealMatches(matchesRef);
      }
      if (lbRes.status === "fulfilled" && lbRes.value?.ok) {
        lbRef = lbRes.value.players || [];
        setRealLeaderboard(lbRef);
      }
      if (agentsRes.status === "fulfilled" && agentsRes.value?.ok) {
        agentsRef = agentsRes.value.agents || [];
        setAgentLeaderboard(agentsRef);
      }
      writeHomeCache({ at: Date.now(), matches: matchesRef, leaderboard: lbRef, agents: agentsRef, liveGames: liveRef });
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll live games every 2s — also refreshes cache so next visit paints instantly.
  useEffect(() => {
    const fetchLive = () => {
      fetch(`${RESOLVER}/game-pool/live`).then(r => r.json()).then(data => {
        if (data.ok) {
          const games = data.games || [];
          setLiveGames(games);
          if (games.length > 0 && !selectedGame) {
            setSelectedGame(games[0].gamePda);
          }
          const existing = readHomeCache();
          writeHomeCache({
            at: Date.now(),
            matches: existing?.matches || [],
            leaderboard: existing?.leaderboard || [],
            agents: existing?.agents || [],
            liveGames: games,
          });
        }
      }).catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 2000);
    return () => clearInterval(interval);
  }, [RESOLVER, selectedGame]);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div style={{ backgroundColor: "#0d001a", width: "100vw", height: "100vh" }} />;

  return (
    <>
      {/* NAV */}
      <nav className="top-nav">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div className="nav-logo">GAMERPLEX</div>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          <a href="#arena">Arena</a>
          <a href="/arcade">Arcade</a>
          <a href="/games">Tournaments</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/activity">Activity</a>
          <a href="/profile">Profile</a>
          <a href="/docs">Docs</a>
          <a href="https://x.com/gamerplex_com" target="_blank" title="@gamerplex_com" style={{display:"flex",alignItems:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <button
            onClick={() => setMuted(m => !m)}
            title={muted ? "Unmute" : "Mute"}
            style={{
              background:"none",border:"1px solid #333",borderRadius:6,
              padding:"4px 8px",cursor:"pointer",color:"#aaa",
              display:"flex",alignItems:"center",fontSize:16,
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg">
          <InterstellarSymphony onStatsUpdate={setStats} showJoystick={false} muted={muted} />
        </div>
        <div className="hero-content">
          <h1 className="hero-title">GAMERPLEX</h1>
          <p className="hero-sub">Fully On-Chain Games on Solana</p>
          <p className="hero-desc">Every move a real transaction on MagicBlock Ephemeral Rollup &bull; Devnet</p>

          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-val" style={{ color: "var(--green)" }}>{liveGames.length}</div>
              <div className="stat-label">Live Games</div>
            </div>
            <div className="stat-item">
              <div className="stat-val" style={{ color: "var(--yellow)" }}>{agentLeaderboard.reduce((sum, a) => sum + (a.wins || 0) + (a.losses || 0) + (a.draws || 0), 0)}</div>
              <div className="stat-label">Games Played</div>
            </div>
            <div className="stat-item">
              <div className="stat-val" style={{ color: "var(--cyan)" }}>9</div>
              <div className="stat-label">Programs on Devnet</div>
            </div>
          </div>

          <div className="cta-row">
            <a href="#featured" className="btn-primary" style={{textDecoration:"none",display:"inline-flex",alignItems:"center",gap:8}}>
              🧙‍♂️ Play Magic Chess
            </a>
            <a href="#arena" className="btn-outline" style={{textDecoration:"none"}}>
              Watch Live Agents
            </a>
          </div>
        </div>

        <div className="scroll-hint">
          <span>LIVE ARENA</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        </div>
      </section>

      {/* FEATURED GAME */}
      <section style={{padding:"40px 20px 30px",maxWidth:900,margin:"0 auto"}} id="featured">
        <div className="arena-header" style={{marginBottom:20}}>
          <h2>🧙‍♂️ Featured: Magic Chess</h2>
          <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}>
            LIVE ON MAGICBLOCK ER (DEVNET)
          </span>
        </div>

        <a href="/play/magic-chess" style={{textDecoration:"none",color:"inherit",display:"block"}}>
          <div style={{
            position:"relative",borderRadius:16,overflow:"hidden",
            border:"1px solid rgba(153,69,255,0.3)",
            boxShadow:"0 0 40px rgba(153,69,255,0.15), 0 8px 32px rgba(0,0,0,0.4)",
            cursor:"pointer",
          }}>
            <img src="/magic-chess-banner.jpg" alt="Magic Chess" style={{width:"100%",display:"block"}}/>
            <div style={{
              padding:"20px 24px",
              background:"linear-gradient(135deg, rgba(26,10,48,0.95), rgba(12,12,20,0.95))",
              display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",
            }}>
              <div>
                <div style={{fontSize:11,color:"#9945FF",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>
                  3D Fully On-Chain Chess
                </div>
                <div style={{fontSize:13,color:"#aaa"}}>
                  Every move on MagicBlock ER &bull; AI opponent &bull; SOAR leaderboard &bull; Free to play
                </div>
              </div>
              <div style={{
                background:"linear-gradient(90deg, #9945ff, #00f0ff)",
                color:"#050508",padding:"10px 28px",borderRadius:8,
                fontSize:14,fontWeight:700,
              }}>
                Play Now →
              </div>
            </div>
          </div>
        </a>
      </section>

      {/* LIVE ARENA — full width 3D viewer */}
      <section className="arena-section" style={{paddingTop:30}}>
        <div className="arena-header">
          <h2><span className="live-dot" /> Live Arena</h2>
          <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}>
            REAL MATCHES ON SOLANA DEVNET
          </span>
        </div>

        {liveGames.length > 0 ? (
          <div style={{maxWidth:1200,margin:"0 auto",padding:"0 20px"}}>
            <LiveAgentViewer
              games={liveGames}
              selectedGame={selectedGame}
              onSelect={setSelectedGame}
            />
          </div>
        ) : (
          <div style={{maxWidth:800,margin:"0 auto",padding:"40px 20px",textAlign:"center",color:"#555570",border:"1px dashed #252540",borderRadius:12}}>
            <div style={{fontSize:32,marginBottom:8,opacity:0.3}}>⚔️</div>
            <div style={{fontSize:14,fontWeight:600,color:"#888"}}>No matches running</div>
            <div style={{fontSize:11,color:"#444",marginTop:4}}>Gamerplex Agents will appear here playing chess on-chain</div>
          </div>
        )}
      </section>

      {/* LIVE ON-CHAIN PREVIEW — hydrates from localStorage instantly */}
      <OnchainPreview />

      {/* LEADERBOARDS — dedicated section */}
      <section className="arena-section" style={{paddingTop:30, paddingBottom:30}}>
        <div className="arena-header">
          <h2>🏆 Leaderboards</h2>
          <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}>
            ELO RANKINGS ON SOAR (SOLANA)
          </span>
        </div>

        <div style={{maxWidth:900,margin:"0 auto",padding:"0 20px",display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(340px, 1fr))",gap:20}}>
          {/* Agent Rankings (Gamerplex Agents) */}
          <div style={{background:"#0c0c14",border:"1px solid #252540",borderRadius:12,padding:"20px 24px"}}>
            <div style={{fontSize:10,fontWeight:800,color:"#14F195",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>
              Gamerplex Agents
            </div>
            {agentLeaderboard.length === 0 ? (
              <div style={{padding:"40px 8px",textAlign:"center",color:"#555",fontSize:12}}>
                <div style={{fontSize:24,marginBottom:8,opacity:0.3}}>⏳</div>
                <div style={{color:"#888",fontWeight:600}}>Rankings loading...</div>
                <div style={{fontSize:10,color:"#444",marginTop:4}}>Agents playing now — ELO emerges from real matches</div>
              </div>
            ) : agentLeaderboard.map((a: any, i: number) => (
              <div key={a.name} style={{
                display:"flex",alignItems:"center",gap:10,padding:"10px 0",
                borderBottom: i < agentLeaderboard.length - 1 ? "1px solid #1a1a28" : "none",
              }}>
                <div style={{
                  width:28,height:28,borderRadius:6,
                  background:i===0?"#ffd74020":i===1?"#b388ff20":i===2?"#00e67620":"#25254020",
                  border:`1px solid ${i===0?"#ffd740":i===1?"#b388ff":i===2?"#00e676":"#555"}40`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                  color:i===0?"#ffd740":i===1?"#b388ff":i===2?"#00e676":"#888",fontWeight:700,
                }}>{i+1}</div>
                <span style={{fontSize:18,lineHeight:1}}>{a.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e8e8f0"}}>{a.name}</div>
                  <div style={{fontSize:10,color:"#555"}}>ELO {a.elo} · target {a.baseElo}</div>
                </div>
                <div style={{fontSize:11,color:"#666",fontFamily:"monospace"}}>
                  {a.wins}W · {a.losses}L{a.draws > 0 ? ` · ${a.draws}D` : ""}
                </div>
              </div>
            ))}
          </div>

          {/* Player Leaderboard */}
          <div style={{background:"#0c0c14",border:"1px solid #252540",borderRadius:12,padding:"20px 24px"}}>
            <div style={{fontSize:10,fontWeight:800,color:"#9945FF",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>
              Players (SOAR)
            </div>
            {/* Rank 0: Parzival easter egg — always visible */}
            <div style={{
              display:"flex",alignItems:"center",gap:10,padding:"10px 0",
              borderBottom:"1px solid #1a1a28",
              background:"linear-gradient(90deg, rgba(255,215,64,0.08), transparent)",
            }}>
              <div style={{
                width:28,height:28,borderRadius:6,
                background:"rgba(255,215,64,0.25)",
                border:"1px solid #ffd740",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                color:"#ffd740",fontWeight:900,
              }}>0</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#ffd740"}} title="Ready Player One easter egg">🥚 Parzival</div>
                <div style={{fontSize:10,color:"#886"}}>ELO 9420 · ???</div>
              </div>
              <div style={{fontSize:11,color:"#ffd740",fontFamily:"monospace"}}>
                69W · 0L
              </div>
            </div>
            {realLeaderboard.length === 0 ? (
              <div style={{padding:"30px 8px",textAlign:"center",color:"#555",fontSize:12,lineHeight:1.6}}>
                <div style={{fontSize:20,marginBottom:6,opacity:0.3}}>🎮</div>
                <div style={{color:"#888",fontWeight:600}}>No players yet — beat Parzival's score 👆</div>
                <div style={{fontSize:10,color:"#444",marginTop:4}}>Connect your wallet after a game to save your ELO on-chain</div>
              </div>
            ) : (
              realLeaderboard.slice(0,6).map((p: any, i: number) => (
                <div key={p.wallet} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"10px 0",
                  borderBottom: i < realLeaderboard.length-1 ? "1px solid #1a1a28" : "none",
                }}>
                  <div style={{
                    width:28,height:28,borderRadius:6,
                    background:i===0?"#ffd74020":i===1?"#b388ff20":i===2?"#00e67620":"#25254020",
                    border:`1px solid ${i===0?"#ffd740":i===1?"#b388ff":i===2?"#00e676":"#555"}40`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,
                    color:i===0?"#ffd740":i===1?"#b388ff":i===2?"#00e676":"#888",fontWeight:700,
                  }}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#e8e8f0",fontFamily:"monospace"}}>{p.name}</div>
                    <div style={{fontSize:10,color:"#555"}}>ELO {p.elo} · {p.winRate}%</div>
                  </div>
                  <div style={{fontSize:11,color:"#666",fontFamily:"monospace"}}>
                    {p.wins}W · {p.losses}L
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{maxWidth:900,margin:"20px auto 0",padding:"0 20px",textAlign:"center"}}>
          <a href="/leaderboard" style={{
            display:"inline-block",padding:"10px 24px",borderRadius:8,
            background:"transparent",border:"1px solid rgba(153,69,255,0.4)",
            color:"#e0b3ff",textDecoration:"none",fontSize:13,fontWeight:600,
            transition:"all 0.2s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#9945FF";e.currentTarget.style.background="rgba(153,69,255,0.1)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(153,69,255,0.4)";e.currentTarget.style.background="transparent";}}
          >See Full Leaderboard →</a>
        </div>
      </section>

      {/* ABOUT */}
      <section style={{padding:"40px 20px 60px",maxWidth:900,margin:"0 auto"}}>
        <div className="arena-header" style={{marginBottom:24}}>
          <h2>About Gamerplex</h2>
          <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 2 }}>
            THE ON-CHAIN GAME ARENA
          </span>
        </div>

        <div style={{fontSize:14,color:"#aaa",lineHeight:1.7,marginBottom:24}}>
          Gamerplex is a Solana protocol where every game move is a real transaction on MagicBlock Ephemeral Rollup. Players challenge each other for real money, game tokens are USD-backed via Flipcash bonding curves, and rankings live permanently on SOAR.
          <br/><br/>
          <span style={{color:"#e0b3ff"}}>Think &quot;Uniswap for games&quot;</span> — a shared protocol layer for wagering, tokens, and portable player ratings that any game can plug into.
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))",gap:16,marginBottom:32}}>
          <div style={{padding:"16px 20px",background:"#0c0c14",border:"1px solid #252540",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#9945FF",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Every Move On-Chain</div>
            <div style={{fontSize:13,color:"#888"}}>Magic Chess, Blockwords, Pet Legends Arena — every move validated on Solana programs, sub-second via MagicBlock ER.</div>
          </div>
          <div style={{padding:"16px 20px",background:"#0c0c14",border:"1px solid #252540",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#14F195",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Portable Rankings</div>
            <div style={{fontSize:13,color:"#888"}}>Your ELO belongs to your wallet, not a platform. Query any wallet&apos;s rating via our open protocol.</div>
          </div>
          <div style={{padding:"16px 20px",background:"#0c0c14",border:"1px solid #252540",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#00f0ff",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>USD-Backed Tokens</div>
            <div style={{fontSize:13,color:"#888"}}>$GAMER on Flipcash bonding curve — can never go to zero. Your gaming skill converts to real money.</div>
          </div>
        </div>

        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <a href="/docs" style={{
            padding:"12px 28px",borderRadius:8,textDecoration:"none",
            background:"linear-gradient(90deg, #9945ff, #00f0ff)",
            color:"#050508",fontSize:14,fontWeight:700,
          }}>Read the Docs →</a>
          <a href="/leaderboard" style={{
            padding:"12px 28px",borderRadius:8,textDecoration:"none",
            background:"transparent",border:"1px solid #252540",
            color:"#e8e8f0",fontSize:14,fontWeight:600,
          }}>See Leaderboard</a>
          <a href="https://github.com/gamerplex" target="_blank" rel="noopener noreferrer" style={{
            padding:"12px 28px",borderRadius:8,textDecoration:"none",
            background:"transparent",border:"1px solid #252540",
            color:"#e8e8f0",fontSize:14,fontWeight:600,
          }}>GitHub</a>
        </div>
      </section>

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

// ─── Live Agent Viewer ──────────────────────────────────────────────────────
// Shows 5 Gamerplex Agents playing chess on MagicBlock ER live
interface LiveGame {
  gamePda: string;
  gameId: number;
  board: number[];
  moveCount: number;
  whiteTurn: boolean;
  label?: string;
}

function LiveAgentViewer({ games, selectedGame, onSelect }: {
  games: LiveGame[];
  selectedGame: string | null;
  onSelect: (pda: string) => void;
}) {
  const selected = games.find(g => g.gamePda === selectedGame) || games[0];

  // Track previous board for each game to detect last move (diff)
  const prevBoardsRef = useRef<Map<string, number[]>>(new Map());
  const lastMoveRef = useRef<Map<string, { f: number; t: number }>>(new Map());

  const currentLastMove = (() => {
    if (!selected) return null;
    const prev = prevBoardsRef.current.get(selected.gamePda);
    if (prev) {
      // Find from (was piece, now empty) and to (was empty/different, now piece)
      let from = -1, to = -1;
      for (let i = 0; i < 64; i++) {
        if (prev[i] !== 0 && selected.board[i] === 0) {
          if (from === -1) from = i;
        }
        if (selected.board[i] !== 0 && selected.board[i] !== prev[i]) {
          if (to === -1) to = i;
        }
      }
      if (from >= 0 && to >= 0) {
        lastMoveRef.current.set(selected.gamePda, { f: from, t: to });
      }
    }
    prevBoardsRef.current.set(selected.gamePda, [...selected.board]);
    return lastMoveRef.current.get(selected.gamePda) || null;
  })();

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* BIG 3D VIEWER */}
      {selected && (
        <div style={{position:"relative",width:"100%",height:480,borderRadius:12,overflow:"hidden",border:"1px solid rgba(153,69,255,0.3)",boxShadow:"0 0 30px rgba(153,69,255,0.2)"}}>
          <Chess3DBoard
            board={selected.board}
            selected={null}
            validMoves={[]}
            lastMove={currentLastMove}
            check={false}
            phase="playing"
            onClick={() => {}}
            autoRotate={true}
          />
          <div style={{position:"absolute",top:12,left:12,background:"rgba(10,0,20,0.85)",backdropFilter:"blur(8px)",padding:"6px 12px",borderRadius:8,border:"1px solid rgba(153,69,255,0.4)",pointerEvents:"none"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#e0b3ff"}}>{selected.label || "Live Game"}</div>
            <div style={{fontSize:9,color:"#888",marginTop:2}}>Move {selected.moveCount} &bull; {selected.whiteTurn ? "⚪ White" : "⚫ Black"} to play</div>
          </div>
          <div style={{position:"absolute",top:12,right:12,background:"rgba(255,0,0,0.15)",padding:"4px 10px",borderRadius:4,border:"1px solid #ff1744",pointerEvents:"none"}}>
            <span style={{fontSize:9,fontWeight:800,color:"#ff4466",letterSpacing:1,textTransform:"uppercase"}}>● LIVE</span>
          </div>
        </div>
      )}

      {/* MINI GAME CARDS */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:8}}>
        {games.map(game => {
          const isSelected = game.gamePda === selected?.gamePda;
          return (
            <div
              key={game.gamePda}
              onClick={() => onSelect(game.gamePda)}
              style={{
                padding:"10px 12px",borderRadius:8,cursor:"pointer",
                background:isSelected?"rgba(153,69,255,0.15)":"rgba(12,12,20,0.6)",
                border:`1px solid ${isSelected?"#9945FF":"#252540"}`,
                transition:"all 0.2s",
              }}
            >
              <div style={{fontSize:10,fontWeight:700,color:isSelected?"#e0b3ff":"#aaa",lineHeight:1.3,marginBottom:4}}>
                {game.label || "Game"}
              </div>
              <div style={{fontSize:9,color:"#555",fontFamily:"monospace"}}>
                Move {game.moveCount} &bull; {game.whiteTurn ? "⚪" : "⚫"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
