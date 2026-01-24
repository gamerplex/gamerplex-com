"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { Shield, Zap, Cpu, Globe, Terminal, ChevronRight, X, ChevronLeft, BarChart3, Activity } from "lucide-react";

const InterstellarSymphony = dynamic(() => import("../components/InterstellarSymphony"), { 
    ssr: false,
    loading: () => null // Managed in our status bar
});

const WHITEPAPER_SECTIONS = [
  {
    title: "1. VISION: BEYOND THE GHOST TOWN",
    content: "Gamerplex is a self-assembling digital reality where humans provide the Architectural Intent (Vibe) and AI Agents provide the Labor (Bricks). It is an infinite, agent-driven economy deployed on the Sonic SVM (Solana L2)."
  },
  {
    title: "2. THE SOVEREIGN ENGINE: GAMERPLEX",
    content: "Gamerplex bridges the visual, physical, and economic layers. Utilizing Web-Nanite (Auto-LOD) and GreasedLine geometry, it ensures 60 FPS performance regardless of complexity."
  },
  {
    title: "3. AGENTIC FINANCE: X402",
    content: "Machine-to-machine micro-payments via HTTP 402 allow world-building to pay for itself. Architects hire specialized local models like C3D-v0 to synthesize reality in real-time."
  },
  {
    title: "4. MOBILE SOVEREIGNTY: SOLANA APP KIT",
    content: "Gamerplex runs natively on Solana Mobile hardware via the Solana App Kit (React Native), utilizing the Seed Vault for secure identity and SendAI for conversational construction."
  }
];

export default function Home() {
  const [showWhitepaper, setShowWhitepaper] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [showMainUI, setShowMainUI] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ fps: '0', meshes: 0, memory: '0' });
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [logs, setLogs] = useState<string[]>(["[SYS] INITIALIZING_QUANTUM_STREAM..."]);

  useEffect(() => {
    setMounted(true);
    const bootLogs = [
        "[SYS] CONNECTING_TO_ROLLUP...",
        "[SYS] LOADING_GAMERPLEX_SOVEREIGN_ENGINE...",
        "[SYS] FREQUENCY_STREAM_READY"
    ];
    bootLogs.forEach((log, i) => {
        setTimeout(() => setLogs(prev => [...prev.slice(-4), log]), (i + 1) * 800);
    });
  }, []);

  const triggerAudioInit = () => {
    setIsAudioInitialized(true);
    setLogs(prev => [...prev.slice(-4), "[SISAO] AUDIO_STREAM_STARTED", "[SISAO] RESONANCE_LOCKED"]);
  };

  if (!mounted) return <div style={{ backgroundColor: 'black', width: '100vw', height: '100vh' }} />;

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, left: 0, 
      width: '100vw', height: '100vh', 
      backgroundColor: 'black', 
      overflow: 'hidden', 
      fontFamily: 'monospace',
      margin: 0, padding: 0,
      userSelect: 'none',
      WebkitUserSelect: 'none'
    }}>
      {/* Background Interstellar Symphony */}
      <div style={{ 
        position: 'absolute', 
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 0, 
        opacity: 0.5, 
        transform: 'scale(1.1)',
        pointerEvents: 'none'
      }}>
        <InterstellarSymphony onStatsUpdate={setStats} showJoystick={!showMainUI} />
      </div>

      {/* UI TOGGLE ARROW (Bottom Right) */}
      <button 
        onClick={() => setShowMainUI(!showMainUI)}
        style={{
          position: 'absolute',
          bottom: '40px',
          right: '40px',
          zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.85)',
          border: '2px solid rgba(20,241,149,0.5)',
          color: '#14F195',
          cursor: 'pointer',
          padding: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          transition: 'transform 0.3s ease'
        }}
      >
        {showMainUI ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
      </button>

      {/* COMPACT HUD & LOGS (Top Left) */}
      <div style={{ 
        position: 'absolute', 
        top: '20px', 
        left: '20px',
        zIndex: 90, 
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'auto'
      }}>
        {/* Status Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          backgroundColor: 'rgba(0,0,0,0.85)', 
          border: '1px solid rgba(20,241,149,0.3)',
          color: '#14F195', 
          fontSize: '10px', 
          padding: '8px 15px',
          borderRadius: '4px',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.5s ease'
        }}>
          <button 
            onClick={() => setShowTelemetry(!showTelemetry)}
            style={{
              background: 'none',
              border: 'none',
              color: '#14F195',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {showTelemetry ? <ChevronLeft size={14} /> : <Activity size={14} />}
          </button>

          {showTelemetry && (
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <span style={{ display: 'flex', gap: '8px' }}><span style={{ opacity: 0.6 }}>FPS:</span> <span style={{ color: 'white' }}>{stats.fps}</span></span>
              <span style={{ display: 'flex', gap: '8px' }}><span style={{ opacity: 0.6 }}>MESH:</span> <span style={{ color: 'white' }}>{stats.meshes}</span></span>
              <span style={{ display: 'flex', gap: '8px' }}><span style={{ opacity: 0.6 }}>MEM:</span> <span style={{ color: 'white' }}>{stats.memory}MB</span></span>
              <span style={{ display: 'flex', gap: '8px' }}><span style={{ opacity: 0.6 }}>SYNC:</span> <span style={{ color: 'white' }}>MB_EPHEMERAL_ROLLUP</span></span>
              <span style={{ display: 'flex', gap: '8px' }}><span style={{ opacity: 0.6 }}>CTRL:</span> <span style={{ color: 'white' }}>WASD+MOUSE</span></span>
              {!isAudioInitialized && (
                <button 
                  onClick={triggerAudioInit}
                  style={{ 
                    backgroundColor: '#14F195', 
                    color: 'black', 
                    border: 'none', 
                    padding: '2px 8px', 
                    fontSize: '9px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    borderRadius: '2px'
                  }}
                >
                  INITIALIZE_AUDIO
                </button>
              )}
            </div>
          )}
        </div>

        {/* Gray Logs Stream */}
        {showTelemetry && (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '0 15px',
                opacity: 0.5,
                fontSize: '9px',
                color: '#aaa',
                textTransform: 'uppercase',
                letterSpacing: '1px'
            }}>
                {logs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
            </div>
        )}
      </div>

      {/* REZ UI OVERLAY */}
      {showMainUI && (
        <>
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: '16px', border: '1px solid rgba(153,50,204,0.1)' }} />
            <div style={{ position: 'absolute', inset: '32px', border: '1px solid rgba(0,255,153,0.05)' }} />
          </div>

          {/* MAIN HERO */}
          <div style={{ 
            position: 'absolute', 
            inset: 0, 
            zIndex: 50, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '24px',
            transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: showWhitepaper ? 0 : 1,
            pointerEvents: showWhitepaper ? 'none' : 'auto',
            transform: showWhitepaper ? 'scale(0.9) translateY(50px)' : 'scale(1)',
            filter: showWhitepaper ? 'blur(30px)' : 'none'
          }}>
            <div style={{ maxWidth: '1200px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              
              <div style={{ marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '16px', background: 'linear-gradient(90deg, rgba(153,50,204,0.1), rgba(0,255,153,0.1))', padding: '8px 32px', border: '1px solid rgba(0,255,153,0.3)', borderRadius: '2px' }}>
                <Zap style={{ width: '16px', height: '16px', color: '#00ff99' }} />
                <span style={{ color: '#00ff99', fontSize: '12px', letterSpacing: '6px', fontWeight: '900' }}>[ SYSTEM_SYNC // ORIGIN_LINK_ESTABLISHED ]</span>
              </div>

              <h1 style={{ background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '12vw', fontWeight: '900', letterSpacing: '-0.02em', lineHeight: '0.7', marginBottom: '40px', textTransform: 'uppercase', fontStyle: 'italic', filter: 'drop-shadow(0 0 40px rgba(20,241,149,0.3))' }}>GAMERPLEX</h1>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '80px' }}>
                <p style={{ color: '#fff', fontSize: '28px', fontWeight: '900', letterSpacing: '20px', opacity: 0.9, textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px', fontStyle: 'italic' }}>The Sovereign Infinite</p>
                <p style={{ color: '#9945FF', fontSize: '18px', letterSpacing: '12px', opacity: 0.6, textTransform: 'uppercase', textAlign: 'center' }}>Synthetic Autonomous Origin</p>
              </div>
              
              <div style={{ display: 'flex', gap: '40px', width: '100%', maxWidth: '900px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button style={{ background: 'linear-gradient(90deg, #9945FF, #14F195)', color: 'black', padding: '32px 56px', border: 'none', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer', fontStyle: 'italic', boxShadow: '0 0 60px rgba(20,241,149,0.4)', transition: 'all 0.3s' }}>Enter_The_Origin</button>
                <button onClick={() => setShowWhitepaper(true)} style={{ backgroundColor: 'transparent', color: '#14F195', padding: '32px 56px', border: '4px solid #14F195', fontSize: '28px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer', fontStyle: 'italic', transition: 'all 0.3s' }}>Read_Manifesto</button>
              </div>

              <div style={{ marginTop: '100px', display: 'flex', gap: '60px', opacity: 0.5 }}>
                <Shield style={{ width: '24px', height: '24px', color: '#14F195' }} />
                <Cpu style={{ width: '24px', height: '24px', color: '#14F195' }} />
                <Globe style={{ width: '24px', height: '24px', color: '#14F195' }} />
              </div>
            </div>
          </div>

          {/* TOP RIGHT NAV */}
          <div style={{ position: 'absolute', top: '60px', right: '60px', zIndex: 55, display: 'flex', gap: '40px', fontSize: '12px', letterSpacing: '6px', fontWeight: '900', textTransform: 'uppercase', fontStyle: 'italic' }}>
            <a href="https://x.com/gamerplex_com" target="_blank" style={{ color: '#14F195', textDecoration: 'none', opacity: 0.7, pointerEvents: 'auto', display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
          </div>
        </>
      )}

      {/* WHITEPAPER OVERLAY */}
      {showWhitepaper && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.99)', backdropFilter: 'blur(60px)', padding: '80px', overflowY: 'auto', color: '#14F195', userSelect: 'auto', WebkitUserSelect: 'auto' }}>
            <button onClick={() => setShowWhitepaper(false)} style={{ position: 'fixed', top: '48px', right: '48px', zIndex: 110, backgroundColor: '#14F195', color: 'black', padding: '16px 40px', border: 'none', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 0 40px #14F195', fontStyle: 'italic' }}>CLOSE_X</button>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', opacity: 0.4, fontSize: '12px', letterSpacing: '6px' }}><Terminal style={{ width: '16px', height: '16px' }} /><span>DECODING_GAMERPLEX_MANIFESTO_V.Origin</span></div>
                <h2 style={{ fontSize: '100px', fontWeight: '900', letterSpacing: '-4px', marginBottom: '100px', lineHeight: '0.8', textTransform: 'uppercase', fontStyle: 'italic', borderBottom: '8px solid #14F195', paddingBottom: '60px', background: 'linear-gradient(90deg, #9945FF, #14F195)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Gamerplex<br/>Manifesto</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '120px' }}>
                  {WHITEPAPER_SECTIONS.map((section, idx) => (
                    <div key={idx} style={{ borderLeft: '4px solid rgba(20,241,149,0.3)', paddingLeft: '60px' }}><h3 style={{ fontSize: '40px', fontWeight: '900', marginBottom: '40px', letterSpacing: '-1px', textTransform: 'uppercase', fontStyle: 'italic' }}>{section.title}</h3><p style={{ fontSize: '24px', fontWeight: 'bold', opacity: 0.8, lineHeight: '1.8', color: '#fff' }}>{section.content}</p></div>
                  ))}
                </div>
                <div style={{ marginTop: '200px', padding: '80px 0', borderTop: '1px solid rgba(20,241,149,0.1)', textAlign: 'center', opacity: 0.3, fontSize: '12px', letterSpacing: '8px', textTransform: 'uppercase' }}>[ End_of_Stream // Origin_Confirmed ]</div>
            </div>
        </div>
      )}
    </div>
  );
}
