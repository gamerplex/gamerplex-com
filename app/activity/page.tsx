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

interface OnchainActivity {
  blockTime: number;
  gameSlug: string;
  gameProgram: string;
  market: string;
  p1: string;
  p2: string;
  p1Name: string;
  p2Name: string;
  totalPotRaw: string;
  protocolFeeRaw: string;
  partnerFeeRaw: string;
  poolFeeRaw: string;
  winnerPayoutRaw: string;
  winningOutcome: number; // 0=p1, 1=p2, 255=cancelled/draw
  winnerWallet: string | null;
  winnerName: string | null;
}

interface OnchainTotals {
  matches: number;
  volumeRaw: string;
  treasuryRaw: string;
  poolSponsorRaw: string;
  winnerPayoutRaw: string;
}

function fmtUsdf(raw: string, signed = false): string {
  try {
    const n = Number(BigInt(raw)) / 1e6;
    const sign = signed && n > 0 ? "+" : "";
    return `${sign}$${n.toFixed(2)}`;
  } catch {
    return "$0.00";
  }
}

function timeAgo(blockTime: number): string {
  const secs = Math.floor(Date.now() / 1000 - blockTime);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function ActivityPage() {
  // Legacy ER chess pool stream — retained for visibility of in-progress
  // free-play games (not wagered). Kept alongside the on-chain feed.
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [poolStatus, setPoolStatus] = useState<any>(null);

  // On-chain truth: every resolved CM v2.1 market. Source-of-truth feed.
  const [onchain, setOnchain] = useState<OnchainActivity[]>([]);
  const [onchainTotals, setOnchainTotals] = useState<OnchainTotals | null>(null);

  useEffect(() => {
    const fetchAll = () => {
      // Primary: on-chain resolved markets from CM v2.1
      fetch(`${RESOLVER}/activity/onchain?limit=50`).then(r => r.json()).then(d => {
        if (d.ok) {
          setOnchain(d.activity || []);
          setOnchainTotals(d.totals || null);
        }
      }).catch(() => {});
      // Secondary: ER chess pool live state (resolver cache — not authoritative)
      fetch(`${RESOLVER}/game-pool/live`).then(r => r.json()).then(d => {
        if (d.ok) setLiveGames(d.games || []);
      }).catch(() => {});
      fetch(`${RESOLVER}/game-pool/status`).then(r => r.json()).then(d => {
        if (d.ok) setPoolStatus(d.pool);
      }).catch(() => {});
    };
    fetchAll();
    // On-chain data updates on Solana finality (~400ms) but we poll the
    // resolver's 30s-cached indexer at 15s to avoid hammering.
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const totalVolume = onchainTotals ? fmtUsdf(onchainTotals.volumeRaw) : "$0.00";
  const totalTreasury = onchainTotals ? fmtUsdf(onchainTotals.treasuryRaw) : "$0.00";

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

        {/* Stat strip — all on-chain aggregates */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
          <StatCard label="Resolved Matches" value={onchainTotals?.matches ?? "—"} color="#14F195" />
          <StatCard label="Volume Wagered" value={totalVolume} color="#9945FF" />
          <StatCard label="Treasury Collected" value={totalTreasury} color="#ffd740" />
          <StatCard label="ER Live Games" value={liveGames.length} color="#00f0ff" />
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

        {/* On-chain resolved markets — authoritative feed from CM v2.1 */}
        <SectionHeader title="💰 Wagered Matches (on-chain)" subtitle="Every CM v2.1 MarketResolvedV2 event — newest first, verifiable on Solana" style={{marginTop: 32}} />
        <Table>
          <TableHead cols={["When", "Game", "Match", "Pot", "Result", "Winner gain", "Tx"]} />
          {onchain.length === 0 ? (
            <TableEmpty>No resolved markets indexed yet — play a match to appear.</TableEmpty>
          ) : onchain.map(a => {
            const winnerPayoutRaw = BigInt(a.winnerPayoutRaw);
            const wager = BigInt(a.totalPotRaw) / 2n;
            const winnerGain = winnerPayoutRaw - wager;
            const isDraw = a.winningOutcome === 255 || a.winningOutcome === null;
            return (
              <TableRow key={a.market} cols={[
                <span key="t" style={{fontSize:11,color:"#666"}}>{timeAgo(a.blockTime)}</span>,
                <span key="g" style={{fontSize:11,color:"#c99aff",textTransform:"uppercase",letterSpacing:0.5}}>{a.gameSlug}</span>,
                <span key="m" style={{fontSize:12}}>
                  <span style={{color: a.winningOutcome === 0 ? "#00e676" : a.winningOutcome === 1 ? "#888" : "#888"}}>{a.p1Name}</span>
                  <span style={{color:"#444"}}> vs </span>
                  <span style={{color: a.winningOutcome === 1 ? "#00e676" : a.winningOutcome === 0 ? "#888" : "#888"}}>{a.p2Name}</span>
                </span>,
                <span key="p" style={{fontSize:11,color:"#14F195",fontFamily:"monospace"}}>{fmtUsdf(a.totalPotRaw)}</span>,
                <span key="r" style={{fontSize:10,fontWeight:700,color:isDraw?"#888":"#00e676",textTransform:"uppercase",letterSpacing:1}}>
                  {isDraw ? "DRAW" : `${a.winnerName} ✓`}
                </span>,
                <span key="w" style={{fontSize:11,color:isDraw?"#666":"#00e676",fontFamily:"monospace"}}>
                  {isDraw ? "—" : fmtUsdf(winnerGain.toString(), true)}
                </span>,
                <a key="ex" href={`https://explorer.solana.com/address/${a.market}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{color:"#448aff",fontSize:11,textDecoration:"none"}}>Market ↗</a>,
              ]} />
            );
          })}
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
          <strong style={{color:"#e0b3ff"}}>Data sources:</strong> The Wagered Matches feed reads <code style={{color:"#c99aff"}}>MarketResolvedV2</code> events
          directly from CM v2.1 on Solana — anyone can reproduce this by scanning the program themselves. The ER Live Games
          section reads our resolver&apos;s cache of active chess-pool slots (UX convenience, not authoritative). If the
          resolver disappears, wagered matches keep resolving; only the free-play chess pool UI goes dark until re-hosted.
          See <Link href="/docs#decentralization" style={{color:"#9945FF",textDecoration:"none"}}>Decentralization</Link> for the trust model.
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
