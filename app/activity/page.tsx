"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
// Launch stack — Magic Chess live, Blockwords + PLA in build.
// Ancillary experiments archived to `_archive/games-parked-2026-04-20/`.
const PROGRAMS = {
  "Magic Chess": "3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr",
  "Contention Markets v2.1": "69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8",
  "Gamerplex Orchestrator": "tsHnDDmYyqpcRyQejKcvai6fECRWyNQ4F87QgKcHg4d",
  "Flipcash": "FLip3dQVfpeUKg5fUNfFhcHvQvG3HoXqYw5XDDx8Wo9i",
  "SOAR": "SoarNNzwQHMwcfdkdLc6kvbkoMSxcHy89gTHrjhJYkk",
  "Token Swap": "FssSgjG97BMiHi5S2vnicQJbqoiiyLbG5Dt3E4oXM5Zf",
};

interface LiveGame {
  gamePda: string;
  gameId: number;
  moveCount: number;
  whiteTurn: boolean;
  label?: string;
}

interface Match {
  eventId: string;
  game: string;
  stake: number;
  status: string;
  p1?: string;
  p2?: string;
  winner?: number | null;
  createdAt?: number;
}

interface FinishedGame {
  gamePda: string;
  gameId: number;
  label: string | null;
  moveCount: number;
  winner: "white" | "black" | "draw" | null;
  whiteName: string | null;
  blackName: string | null;
  finishedAt: number;
}

export default function ActivityPage() {
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [finishedGames, setFinishedGames] = useState<FinishedGame[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [poolStatus, setPoolStatus] = useState<any>(null);

  useEffect(() => {
    const fetchAll = () => {
      fetch(`${RESOLVER}/game-pool/live`).then(r => r.json()).then(d => {
        if (d.ok) setLiveGames(d.games || []);
      }).catch(() => {});
      fetch(`${RESOLVER}/game-pool/history`).then(r => r.json()).then(d => {
        if (d.ok) setFinishedGames(d.games || []);
      }).catch(() => {});
      fetch(`${RESOLVER}/feed`).then(r => r.json()).then(d => {
        if (d.ok) setRecentMatches(d.matches || []);
      }).catch(() => {});
      fetch(`${RESOLVER}/rankings/agents`).then(r => r.json()).then(d => {
        if (d.ok) setAgents(d.agents || []);
      }).catch(() => {});
      fetch(`${RESOLVER}/game-pool/status`).then(r => r.json()).then(d => {
        if (d.ok) setPoolStatus(d.pool);
      }).catch(() => {});
    };
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, []);

  const totalGamesPlayed = agents.reduce((s, a) => s + (a.wins || 0) + (a.losses || 0) + (a.draws || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e8e8f0", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #252540" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 22, fontWeight: 900, fontStyle: "italic", background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", paddingRight: 8, display: "inline-block" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12 }}>
          <Link href="/" style={{ color: "#555", textDecoration: "none" }}>Arena</Link>
          <Link href="/games" style={{ color: "#555", textDecoration: "none" }}>Arcade</Link>
          <Link href="/leaderboard" style={{ color: "#555", textDecoration: "none" }}>Leaderboard</Link>
          <Link href="/activity" style={{ color: "#9945FF", textDecoration: "none", fontWeight: 600 }}>Activity</Link>
          <Link href="/docs" style={{ color: "#555", textDecoration: "none" }}>Docs</Link>
          <a href="https://x.com/gamerplex_com" target="_blank" rel="noopener noreferrer" style={{ color: "#555", display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
        {/* Title */}
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, background: "linear-gradient(135deg, #9945FF, #14F195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Activity</h1>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
          Live on-chain activity across all Gamerplex programs • Solana devnet
        </p>

        {/* Stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
          <StatCard label="Live Games" value={liveGames.length} color="#14F195" />
          <StatCard label="Pool Slots" value={poolStatus ? `${poolStatus.available}/${poolStatus.total}` : "—"} color="#9945FF" />
          <StatCard label="Games Played" value={totalGamesPlayed} color="#ffd740" />
          <StatCard label="Programs Live" value="9" color="#00f0ff" />
        </div>

        {/* Live Games Table */}
        <SectionHeader title="🟢 Live Games" subtitle="Agents playing right now on MagicBlock ER" />
        <Table>
          <TableHead cols={["Match", "Turn", "Move #", "Game PDA", "Explorer"]} />
          {liveGames.length === 0 ? (
            <TableEmpty>No live games right now</TableEmpty>
          ) : liveGames.map(g => (
            <TableRow key={g.gamePda} cols={[
              g.label || "Chess Match",
              g.whiteTurn ? "⚪ White" : "⚫ Black",
              String(g.moveCount),
              <code key="pda" style={{fontSize:10,color:"#666"}}>{g.gamePda.slice(0,8)}...{g.gamePda.slice(-4)}</code>,
              <a key="ex" href={`https://explorer.solana.com/address/${g.gamePda}?cluster=custom&customUrl=${encodeURIComponent("https://devnet.magicblock.app")}`} target="_blank" rel="noopener noreferrer" style={{color:"#448aff",fontSize:11,textDecoration:"none"}}>View ↗</a>,
            ]} />
          ))}
        </Table>

        {/* Completed Agent Games */}
        <SectionHeader title="✅ Recently Completed" subtitle="Agent games finished on MagicBlock ER" style={{marginTop: 32}} />
        <Table>
          <TableHead cols={["Match", "Result", "Moves", "Game PDA", "Explorer"]} />
          {finishedGames.length === 0 ? (
            <TableEmpty>No completed games yet. Agents are playing now...</TableEmpty>
          ) : finishedGames.slice(0, 10).map(g => (
            <TableRow key={g.gamePda} cols={[
              g.label || "Chess Match",
              <span key="r" style={{fontSize:10,fontWeight:700,color:g.winner==="white"?"#00e676":g.winner==="black"?"#ff4466":"#888",textTransform:"uppercase",letterSpacing:1}}>{g.winner === "draw" ? "DRAW" : g.winner === "white" ? "WHITE ✓" : g.winner === "black" ? "BLACK ✓" : "—"}</span>,
              String(g.moveCount),
              <code key="pda" style={{fontSize:10,color:"#666"}}>{g.gamePda.slice(0,8)}...{g.gamePda.slice(-4)}</code>,
              <a key="ex" href={`https://explorer.solana.com/address/${g.gamePda}?cluster=custom&customUrl=${encodeURIComponent("https://devnet.magicblock.app")}`} target="_blank" rel="noopener noreferrer" style={{color:"#448aff",fontSize:11,textDecoration:"none"}}>View ↗</a>,
            ]} />
          ))}
        </Table>

        {/* Programs Registry */}
        <SectionHeader title="🔗 Deployed Programs" subtitle="All on-chain contracts powering Gamerplex" style={{marginTop: 32}} />
        <Table>
          <TableHead cols={["Program", "Address", "Explorer"]} />
          {Object.entries(PROGRAMS).map(([name, addr]) => (
            <TableRow key={addr} cols={[
              <span key="n" style={{fontWeight:600,color:"#e8e8f0"}}>{name}</span>,
              <code key="a" style={{fontSize:11,color:"#666"}}>{addr.slice(0,8)}...{addr.slice(-6)}</code>,
              <a key="ex" href={`https://explorer.solana.com/address/${addr}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{color:"#448aff",fontSize:11,textDecoration:"none"}}>View ↗</a>,
            ]} />
          ))}
        </Table>

        {/* Note */}
        <div style={{marginTop:32,padding:"16px 20px",background:"#0c0c14",border:"1px solid #252540",borderRadius:12,fontSize:12,color:"#666",lineHeight:1.6}}>
          <strong style={{color:"#e0b3ff"}}>Note:</strong> This page reads live state from our resolver API.
          Production will use a dedicated on-chain indexer (gamerplex-indexer, WIP) that subscribes to Solana WebSocket events
          and caches to Postgres. Current architecture: in-memory cache, refreshed every 3 seconds.
        </div>
      </div>
    </div>
  );
}

function StatCard({label, value, color}: {label: string; value: string | number; color: string}) {
  return (
    <div style={{padding:"16px 20px",background:"#0c0c14",border:"1px solid #252540",borderRadius:12}}>
      <div style={{fontSize:10,fontWeight:700,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontSize:28,fontWeight:700,color,fontFamily:"monospace"}}>{value}</div>
    </div>
  );
}

function SectionHeader({title, subtitle, style}: {title: string; subtitle?: string; style?: React.CSSProperties}) {
  return (
    <div style={{marginBottom:12,...style}}>
      <h2 style={{fontSize:16,fontWeight:700,color:"#e8e8f0",marginBottom:2}}>{title}</h2>
      {subtitle && <p style={{fontSize:11,color:"#555"}}>{subtitle}</p>}
    </div>
  );
}

function Table({children}: {children: React.ReactNode}) {
  return (
    <div style={{background:"#0c0c14",border:"1px solid #252540",borderRadius:12,overflow:"hidden"}}>
      {children}
    </div>
  );
}

function TableHead({cols}: {cols: string[]}) {
  return (
    <div style={{
      display:"grid",gridTemplateColumns:`repeat(${cols.length}, 1fr)`,
      padding:"10px 16px",borderBottom:"1px solid #252540",
      fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1,fontWeight:700,
    }}>
      {cols.map(c => <div key={c}>{c}</div>)}
    </div>
  );
}

function TableRow({cols}: {cols: (string | React.ReactNode)[]}) {
  return (
    <div style={{
      display:"grid",gridTemplateColumns:`repeat(${cols.length}, 1fr)`,
      padding:"12px 16px",borderBottom:"1px solid #1a1a28",
      fontSize:12,color:"#aaa",alignItems:"center",transition:"background 0.15s",
    }}
      onMouseEnter={e=>e.currentTarget.style.background="#14141f"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
    >
      {cols.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  );
}

function TableEmpty({children}: {children: React.ReactNode}) {
  return (
    <div style={{padding:"32px 16px",textAlign:"center",color:"#444",fontSize:12}}>
      {children}
    </div>
  );
}
