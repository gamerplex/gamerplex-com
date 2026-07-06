"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";

const Chess3DBoard = dynamic(() => import("./play/magic-chess/_shared/Chess3DBoard"), { ssr: false });
const OnchainPreview = dynamic(() => import("./_components/ArcadeOnchainPreview"), { ssr: false });
const HomeIdentity = dynamic(() => import("../components/identity/HomeIdentity"), { ssr: false });

// Defer heavy children (e.g. the THREE.js 3D board) until scrolled near the viewport,
// so first paint stays fast on mobile. Renders `placeholder` until in view, then children once.
function InView({ children, placeholder, rootMargin = "300px" }: {
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);
  return <div ref={ref}>{shown ? children : placeholder ?? null}</div>;
}

// localStorage cache helpers — keep the home page feeling instant on repeat visits.
const CACHE_KEY_HOME = "gp.home.v1";
interface HomeCache {
  at: number;
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


// Image with emoji fallback. Drop a real PNG at the src path to upgrade.
function GameArt({ src, emoji, alt, big }: { src: string; emoji: string; alt: string; big?: boolean }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="cf-art-fallback">
        <span className="cf-emoji" style={{ fontSize: big ? 110 : 88 }}>{emoji}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

// Partner-card art with inline emoji fallback (cf-art-fallback is
// coverflow-specific, so we inline our own fallback here).
function PartnerArt({ src, emoji, alt }: { src: string; emoji: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span style={{fontSize:72,lineHeight:1,filter:"drop-shadow(0 0 12px rgba(255,215,64,0.4))"}}>
        {emoji}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

// ─── Partner Games (Sledgit) ────────────────────────────────────────────────
// Manifest-shape data so this can swap to a fetch from
// https://www.sledgit.com/api/v1/games-manifest with minimal change. Hardcoded
// today because the Sledgit endpoint isn't shipped yet. New partner games drop
// in by editing this array.
type PartnerGame = {
  slug: string;
  title: string;
  blurb: string;
  emoji: string;
  cover_url: string;
  play_url: string;
  tags: string[];
};
const PARTNER_GAMES: PartnerGame[] = [
  {
    slug: "pika-set-quiz",
    title: "Pika-Set Quiz",
    blurb: "Which set is this Pikachu from? 115 EN sets, 10 random rounds.",
    emoji: "⚡",
    cover_url: "/games/sledgit/pika-set-quiz.png",
    play_url: "https://www.sledgit.com/prototype/puzzle.html",
    tags: ["puzzle", "pokemon"],
  },
  {
    slug: "shinji-quiz",
    title: "Shinji Kanda Quiz",
    blurb: "26 source-linked questions about Pokémon's secret art-history MVP.",
    emoji: "🎨",
    cover_url: "/games/sledgit/shinji-quiz.png",
    play_url: "https://www.sledgit.com/prototype/shinji-quiz.html",
    tags: ["trivia", "art", "pokemon"],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [realLeaderboard, setRealLeaderboard] = useState<any[]>([]);
  const [lbLoaded, setLbLoaded] = useState(false);
  const [liveGames, setLiveGames] = useState<any[]>([]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [agentLeaderboard, setAgentLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    const c = readHomeCache();
    if (!c) return;
    if (c.leaderboard) setRealLeaderboard(c.leaderboard);
    if (c.agents) setAgentLeaderboard(c.agents);
    if (c.liveGames) {
      setLiveGames(c.liveGames);
      if (c.liveGames.length > 0) setSelectedGame(c.liveGames[0].gamePda);
    }
  }, []);

  const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
  useEffect(() => {
    let lbRef = realLeaderboard;
    let agentsRef = agentLeaderboard;
    let liveRef = liveGames;
    const fetchAll = async () => {
      const results = await Promise.allSettled([
        fetch(`${RESOLVER}/leaderboard/chess`).then(r => r.json()),
        fetch(`${RESOLVER}/rankings/agents`).then(r => r.json()),
      ]);
      const [lbRes, agentsRes] = results;
      if (lbRes.status === "fulfilled" && lbRes.value?.ok) {
        lbRef = lbRes.value.players || [];
        setRealLeaderboard(lbRef);
      }
      setLbLoaded(true);
      if (agentsRes.status === "fulfilled" && agentsRes.value?.ok) {
        agentsRef = agentsRes.value.agents || [];
        setAgentLeaderboard(agentsRef);
      }
      writeHomeCache({ at: Date.now(), leaderboard: lbRef, agents: agentsRef, liveGames: liveRef });
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchLive = () => {
      fetch(`${RESOLVER}/game-pool/live`).then(r => r.json()).then(data => {
        if (data.ok) {
          const games = data.games || [];
          setLiveLoaded(true);
          // Keep the last live match on a transient empty poll — never unmount the
          // 3D board mid-stream (that caused the flicker + tile-layout shift).
          setLiveGames(prev => (games.length ? games : prev));
          if (games.length > 0) setSelectedGame(cur => cur || games[0].gamePda);
          const existing = readHomeCache();
          writeHomeCache({
            at: Date.now(),
            leaderboard: existing?.leaderboard || [],
            agents: existing?.agents || [],
            liveGames: games.length ? games : (existing?.liveGames || []),
          });
        }
      }).catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 2000);
    return () => clearInterval(interval);
  }, [RESOLVER]);

  useEffect(() => { setMounted(true); }, []);

  // 2026: sticky FAB appears when user scrolls past hero
  const [fabVisible, setFabVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setFabVisible(window.scrollY > window.innerHeight * 0.6);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!mounted) return <div style={{ backgroundColor: "#0d001a", width: "100vw", height: "100vh" }} />;

  const topPlayer = agentLeaderboard[0];
  const liveCount = liveGames.length;

  return (
    <>
      {/* NAV — Play / Build / Leaderboard / Profile */}
      <nav className="top-nav">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <a href="/" className="nav-logo" style={{textDecoration:"none"}}>GAMERPLEX</a>
        </div>
        <div className="nav-links">
          <a href="#featured">Play</a>
          <a href="/docs">Build</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/profile">Profile</a>
          <a href="https://x.com/gamerplex_com" target="_blank" title="@gamerplex_com" style={{display:"flex",alignItems:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
        </div>
      </nav>

      {/* HERO — wormhole bg + logo + one tagline + one CTA + one ticker line */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-content">
          <h1 className="hero-title">GAMERPLEX</h1>
          <p className="hero-sub">Build · Play · Own · Compete</p>

          <div className="cta-row" style={{marginBottom:14,marginTop:18}}>
            <a href="#featured" className="btn-primary" style={{textDecoration:"none",display:"inline-flex",alignItems:"center",gap:8}}>
              ▶ Play Now — free
            </a>
          </div>
          {/* web2-FIRST login: email → Credits, wallet/$GAME optional after (was missing entirely) */}
          <div className="hero-login"><HomeIdentity /></div>

          {/* single minimal ticker line — top score + live count */}
          <div className="hero-ticker">
            {topPlayer && (
              <span>
                Top score: <b style={{color:"var(--green)"}}>{(topPlayer.elo ?? topPlayer.score ?? 0).toLocaleString()}</b> by <span style={{color:"var(--dim)"}}>{topPlayer.name || "anon"}</span>
              </span>
            )}
            {liveCount > 0 && (
              <span style={{marginLeft:14}}>
                <span style={{color:"var(--green)"}}>●</span> <b>{liveCount}</b> live now
              </span>
            )}
          </div>
        </div>
      </section>

      {/* GAMES GRID — 3 cards */}
      <section className="coverflow-section" id="featured">
        <div className="coverflow">
          {/* LEFT — Cyber Snake */}
          <a href="/play/cyber-snake?mode=arcade" className="cf-card cf-left" aria-label="Play Cyber Snake">
            <div className="cf-art cf-snake-art">
              <GameArt src="/games/cyber-snake/banner.png" emoji="🐍" alt="Cyber Snake" />
              <div className="cf-art-overlay"></div>
            </div>
            <div className="cf-meta">
              <div className="cf-name">Cyber Snake</div>
              <div className="cf-cta">PLAY FREE →</div>
            </div>
          </a>

          {/* Magic Chess */}
          <a href="/play/magic-chess?mode=arcade" className="cf-card cf-right" aria-label="Play Magic Chess">
            <div className="cf-art cf-chess-art">
              <GameArt src="/games/magic-chess/banner.png" emoji="♟" alt="Magic Chess" />
              <div className="cf-art-overlay"></div>
            </div>
            <div className="cf-meta">
              <div className="cf-name">Magic Chess</div>
              <div className="cf-cta">PLAY FREE →</div>
            </div>
          </a>

          {/* RIGHT — Blockwords */}
          <a href="/play/blockwords?mode=arcade" className="cf-card cf-right" aria-label="Play Blockwords">
            <div className="cf-art cf-words-art">
              <GameArt src="/games/blockwords/banner.png" emoji="🔮" alt="Blockwords" />
              <div className="cf-art-overlay"></div>
            </div>
            <div className="cf-meta">
              <div className="cf-name">Blockwords</div>
              <div className="cf-cta">PLAY FREE →</div>
            </div>
          </a>

          {/* Flipball */}
          <a href="/play/flipball?mode=arcade" className="cf-card cf-right" aria-label="Play Flipball">
            <div className="cf-art cf-words-art">
              <GameArt src="/games/flipball/banner.png" emoji="🪩" alt="Flipball" />
              <div className="cf-art-overlay"></div>
            </div>
            <div className="cf-meta">
              <div className="cf-name">Flipball</div>
              <div className="cf-cta">PLAY FREE →</div>
            </div>
          </a>
        </div>
      </section>

      {/* PORTAL ACTIVITY CENTER — live game + stats side-by-side (dense, no dead space) */}
      <div className="portal-activity">
        {/* pa-live ALWAYS renders with a fixed-height frame → no layout shift when the
            live match loads / flaps. Skeleton while loading, board when live, gentle
            empty state otherwise. */}
        <section className="arena-section pa-live">
          <div className="arena-header">
            <h2><span className="live-dot" /> Live Now</h2>
          </div>
          <div style={{padding:"0 20px"}}>
            <div className="live-board-frame">
              {!liveLoaded ? (
                <div className="live-skeleton" aria-busy="true">
                  <div className="spinner" aria-hidden="true" />
                  <span>Loading live match…</span>
                </div>
              ) : liveGames.length > 0 ? (
                <InView placeholder={<div className="live-skeleton"><div className="spinner" aria-hidden="true" /><span>Rendering board…</span></div>}>
                  <LiveAgentViewer
                    games={liveGames}
                    selectedGame={selectedGame}
                    onSelect={setSelectedGame}
                  />
                </InView>
              ) : (
                <div className="live-empty">
                  <span className="live-empty-emoji" aria-hidden="true">♟️</span>
                  <p>No live match right now.</p>
                  <a href="/play/magic-chess?mode=arcade" className="live-empty-cta">▶ Start one — free</a>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="pa-rail">
          {/* LEADERBOARD — real on-chain data only. Falls back to live agent ELO if no humans yet. */}
          <LeaderboardSection
            humans={realLeaderboard}
            agents={agentLeaderboard}
            loaded={lbLoaded}
          />
          {/* ON-CHAIN PREVIEW (existing component) */}
          <OnchainPreview />
        </div>
      </div>

      {/* PARTNER GAMES — Sledgit puzzle + trivia. Loose-coupled (own content,
          partner brand). Click → opens on sledgit.com. Same data shape as the
          future /api/v1/games-manifest fetch on sledgit. */}
      <section style={{padding:"40px 20px 24px",maxWidth:1080,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,marginBottom:18,flexWrap:"wrap"}}>
          <h2 style={{fontSize:18,fontWeight:800,letterSpacing:1,margin:0,color:"#fff",textTransform:"uppercase"}}>
            Partner Games
          </h2>
          <a
            href="https://www.sledgit.com/play"
            target="_blank"
            rel="noopener noreferrer"
            style={{fontSize:11,color:"#ffd740",fontWeight:600,letterSpacing:0.6,textDecoration:"none",textTransform:"uppercase"}}
          >
            Made by Sledgit · Runs on Gamerplex →
          </a>
        </div>
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",
          gap:14,
        }}>
          {PARTNER_GAMES.map((game) => (
            <a
              key={game.slug}
              href={game.play_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Play ${game.title} on Sledgit`}
              style={{
                display:"flex",
                flexDirection:"column",
                gap:10,
                padding:14,
                textDecoration:"none",
                color:"inherit",
                borderRadius:12,
                border:"1px solid rgba(255,255,255,0.08)",
                background:"linear-gradient(135deg, rgba(255,215,64,0.04), rgba(60,30,100,0.18))",
                transition:"border-color 0.2s, transform 0.2s",
              }}
            >
              <div style={{
                aspectRatio:"16 / 9",
                borderRadius:8,
                overflow:"hidden",
                background:"radial-gradient(circle at center, rgba(255,215,64,0.08), rgba(0,0,0,0.4))",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                position:"relative",
              }}>
                <PartnerArt src={game.cover_url} emoji={game.emoji} alt={game.title} />
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:4}}>
                  <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{game.title}</div>
                  <div style={{fontSize:10,color:"#ffd740",fontWeight:700,letterSpacing:0.4,whiteSpace:"nowrap"}}>PLAY →</div>
                </div>
                <div style={{fontSize:12,color:"var(--dim)",lineHeight:1.45,marginBottom:8}}>{game.blurb}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {game.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize:9,
                        fontWeight:700,
                        letterSpacing:0.6,
                        padding:"2px 8px",
                        borderRadius:999,
                        background:"rgba(255,215,64,0.08)",
                        border:"1px solid rgba(255,215,64,0.2)",
                        color:"#ffd740",
                        textTransform:"uppercase",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </a>
          ))}
        </div>
        <p style={{fontSize:11,color:"var(--dim)",marginTop:14,textAlign:"center",opacity:0.7}}>
          Sledgit games run as standalone HTML on www.sledgit.com. On-chain scoring via Gamerplex Arcade
          ships in a follow-up.
        </p>
      </section>

      {/* PET LEGENDS — slim strip, not a hero */}
      <section style={{padding:"24px 20px 40px",maxWidth:920,margin:"0 auto"}}>
        <a
          href="https://x.com/gamerplex_com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:"flex",
            alignItems:"center",
            gap:14,
            padding:"12px 18px",
            textDecoration:"none",
            borderRadius:10,
            border:"1px solid rgba(255,215,64,0.3)",
            backgroundImage:"repeating-linear-gradient(45deg, transparent 0, transparent 8px, rgba(255,215,64,0.03) 8px, rgba(255,215,64,0.03) 10px), linear-gradient(90deg, rgba(60,30,100,0.4), rgba(20,5,46,0.6))",
            transition:"border-color 0.2s, transform 0.2s",
          }}
        >
          <div style={{width:36,height:36,borderRadius:8,background:"rgba(255,215,64,0.12)",border:"1px solid rgba(255,215,64,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🔒</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:9,fontWeight:800,letterSpacing:2,color:"#ffd740",textTransform:"uppercase"}}>Game #4 · In stealth</div>
            <div style={{fontSize:14,fontWeight:700,color:"#fff",marginTop:2}}>Pet Legends Arena <span style={{color:"var(--dim)",fontWeight:400,fontSize:12}}>· pet RPG · on-chain combat</span></div>
          </div>
          <div style={{fontSize:11,color:"#ffd740",fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap"}}>Follow →</div>
        </a>
      </section>

      {/* Sticky Play FAB — appears after user scrolls past hero */}
      <a
        href="#featured"
        className={`fab-play ${fabVisible ? "visible" : ""}`}
        aria-label="Play Now"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>
        Play Now
      </a>

      {/* Mobile bottom nav — thumb-zone primary nav, hidden on desktop via CSS */}
      <nav className="bottom-nav-m" aria-label="Primary mobile navigation">
        <a href="#featured" className="active" aria-label="Play">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          Play
        </a>
        <a href="/docs" aria-label="Build">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          Build
        </a>
        <a href="#featured" className="fab-center" aria-label="Play Now">
          <svg viewBox="0 0 24 24" fill="#000" stroke="#000"><polygon points="6 4 20 12 6 20"/></svg>
        </a>
        <a href="/leaderboard" aria-label="Leaderboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          Rank
        </a>
        <a href="/profile" aria-label="Profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          You
        </a>
      </nav>
    </>
  );
}

// ─── Leaderboard section ─────────────────────────────────────────────────────
// Three honest states:
//   1. Initial fetch in flight  → 3 skeleton rows (real "loading" signal)
//   2. Loaded, humans present   → top-5 humans
//   3. Loaded, no humans yet    → real agent ELO from on-chain matches (no fake rows)
function LeaderboardSection({ humans, agents, loaded }: {
  humans: any[];
  agents: any[];
  loaded: boolean;
}) {
  const usingAgents = loaded && humans.length === 0 && agents.length > 0;
  const rows = humans.length > 0 ? humans.slice(0, 5) : agents.slice(0, 5);

  return (
    <section className="arena-section" style={{paddingTop:40, paddingBottom:30}}>
      <div className="arena-header" style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <h2>Leaderboard</h2>
        {usingAgents && (
          <span style={{fontSize:10,letterSpacing:2,color:"var(--cyan)",textTransform:"uppercase",fontWeight:700}}>
            Live agent ELO · real on-chain matches
          </span>
        )}
      </div>
      <div style={{maxWidth:"100%",margin:"0 auto",padding:"0 20px"}}>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 20px"}}>
          {/* Parzival easter egg — always rank 0, always visible */}
          <div style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 0",
            borderBottom:"1px solid #1a1a28",
          }}>
            <div style={{
              width:24,height:24,borderRadius:6,
              background:"rgba(255,215,64,0.2)",
              border:"1px solid #ffd740",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,
              color:"#ffd740",fontWeight:900,
            }}>0</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:"#ffd740"}} title="Ready Player One easter egg">🥚 Parzival</div>
            </div>
            <div style={{fontSize:12,color:"#ffd740",fontFamily:"monospace",fontWeight:700}}>9420</div>
          </div>

          {/* State 1: actually loading — show 3 skeleton rows briefly */}
          {!loaded && (
            <>
              <div className="skeleton-row"><div className="skeleton-box skel-rank"/><div className="skeleton-box skel-name"/><div className="skeleton-box skel-score"/></div>
              <div className="skeleton-row"><div className="skeleton-box skel-rank"/><div className="skeleton-box skel-name"/><div className="skeleton-box skel-score"/></div>
              <div className="skeleton-row"><div className="skeleton-box skel-rank"/><div className="skeleton-box skel-name"/><div className="skeleton-box skel-score"/></div>
            </>
          )}

          {/* State 2 & 3: real rows (humans, or agents if no humans yet) */}
          {loaded && rows.length > 0 && rows.map((p: any, i: number) => (
            <div key={p.wallet || p.name} style={{
              display:"flex",alignItems:"center",gap:12,padding:"10px 0",
              borderBottom: i < rows.length - 1 ? "1px solid #1a1a28" : "none",
            }}>
              <div style={{
                width:24,height:24,borderRadius:6,
                background:i===0?"#ffd74020":i===1?"#b388ff20":i===2?"#00e67620":"#25254020",
                border:`1px solid ${i===0?"#ffd740":i===1?"#b388ff":i===2?"#00e676":"#555"}40`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,
                color:i===0?"#ffd740":i===1?"#b388ff":i===2?"#00e676":"#888",fontWeight:700,
              }}>{i+1}</div>
              {p.emoji && <span style={{fontSize:16,lineHeight:1}}>{p.emoji}</span>}
              <div style={{flex:1,minWidth:0,fontSize:13,color:"#e8e8f0",fontFamily:p.emoji?undefined:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:p.emoji?600:400}}>
                {p.name}
                {p.emoji && <span style={{fontSize:10,color:"#666",marginLeft:6}}>· {p.wins ?? 0}W</span>}
              </div>
              <div style={{fontSize:12,color:"#e8e8f0",fontFamily:"monospace",fontWeight:700}}>{p.elo ?? p.score ?? 0}</div>
            </div>
          ))}

          {/* State 3 footer: when no humans yet, invite to be first */}
          {loaded && humans.length === 0 && (
            <div style={{padding:"12px 0 2px",textAlign:"center",color:"#666",fontSize:11,lineHeight:1.5}}>
              No human saves yet · Play → beat Parzival → connect wallet to save
            </div>
          )}
        </div>
        <div style={{textAlign:"center",marginTop:14}}>
          <a href="/leaderboard" style={{
            fontSize:12,color:"#9c8fb8",textDecoration:"none",letterSpacing:1,
          }}>See full leaderboard →</a>
        </div>
      </div>
    </section>
  );
}

// ─── Live Agent Viewer ──────────────────────────────────────────────────────
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

  const prevBoardsRef = useRef<Map<string, number[]>>(new Map());
  const lastMoveRef = useRef<Map<string, { f: number; t: number }>>(new Map());

  const currentLastMove = (() => {
    if (!selected) return null;
    const prev = prevBoardsRef.current.get(selected.gamePda);
    if (prev) {
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
      {selected && (
        <div className="la-board" style={{position:"relative",width:"100%",borderRadius:12,overflow:"hidden",border:"1px solid rgba(153,69,255,0.3)",boxShadow:"0 0 30px rgba(153,69,255,0.2)"}}>
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

      {games.length > 1 && (
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
      )}
    </div>
  );
}
