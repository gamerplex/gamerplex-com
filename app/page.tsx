"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { Shield, Zap, Cpu, Globe, Terminal, ChevronRight, X, ChevronLeft, BarChart3, Activity } from "lucide-react";

const InterstellarSymphony = dynamic(() => import("../components/InterstellarSymphony"), { 
    ssr: false,
    loading: () => null
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
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    
    const runBootSequence = async () => {
        const matrixPhrases = [
            "Wake up, Player...",
            "Gamerplex has you...",
            "Follow the white rabbit."
        ];

        for (const phrase of matrixPhrases) {
            for (let i = 0; i <= phrase.length; i++) {
                const typing = phrase.slice(0, i) + "_";
                setLogs([typing]); // Replace entire log with single typing line
                await new Promise(r => setTimeout(r, 60));
            }
            setLogs([phrase]);
            await new Promise(r => setTimeout(r, 400));
        }

        // Clear Matrix tribute and start technical logs
        setLogs([]);
        await new Promise(r => setTimeout(r, 200));

        const systemLogs = [
            "[SYS] INITIALIZING_QUANTUM_STREAM...",
            "[SYS] CONNECTING_TO_ROLLUP...",
            "[SYS] LOADING_GAMERPLEX_SOVEREIGN_ENGINE...",
            "[SYS] FREQUENCY_STREAM_READY"
        ];
        
        for (const log of systemLogs) {
            setLogs(prev => [...prev.slice(-3), log]);
            await new Promise(r => setTimeout(r, 600));
        }
    };

    runBootSequence();
  }, []);

  const triggerAudioInit = () => {
    setIsAudioInitialized(true);
    setLogs(prev => [...prev.slice(-3), "[SISAO] AUDIO_STREAM_STARTED", "[SISAO] RESONANCE_LOCKED"]);
  };

  if (!mounted) return <div style={{ backgroundColor: '#0d001a', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />;

  return (
    <div style={{ 
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      backgroundColor: '#0d001a', overflow: 'hidden', fontFamily: 'monospace',
      margin: 0, padding: 0, userSelect: 'none', WebkitUserSelect: 'none'
    }}>
      {/* Background Interstellar Symphony */}
      <div 
        onClick={() => {
            const canvas = document.querySelector('canvas');
            if (canvas) canvas.focus();
        }}
        style={{ 
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: 0, opacity: 0.5, transform: 'scale(1.1)',
          pointerEvents: 'auto'
        }}
      >
        <InterstellarSymphony onStatsUpdate={setStats} showJoystick={!showMainUI} />
      </div>

      {/* UI TOGGLE ARROW */}
      <button 
        onClick={() => setShowMainUI(!showMainUI)}
        style={{
          position: 'absolute', bottom: '40px', right: '40px', zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.85)', border: '2px solid rgba(20,241,149,0.5)',
          color: '#14F195', cursor: 'pointer', padding: '10px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
          transition: 'transform 0.3s ease'
        }}
      >
        {showMainUI ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
      </button>

      {/* TOP LEFT HUD */}
      <div style={{ 
        position: 'absolute', top: '20px', left: '20px', zIndex: 90, 
        display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'auto'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: 'rgba(0,0,0,0.85)', 
          border: '1px solid rgba(20,241,149,0.3)', color: '#14F195', fontSize: '10px', 
          padding: '8px 15px', borderRadius: '4px', backdropFilter: 'blur(10px)'
        }}>
          <button onClick={() => setShowTelemetry(!showTelemetry)} style={{ background: 'none', border: 'none', color: '#14F195', cursor: 'pointer', display: 'flex' }}>
            {showTelemetry ? <ChevronLeft size={14} /> : <Activity size={14} />}
          </button>
          {showTelemetry && (
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <span>FPS: <span style={{ color: 'white' }}>{stats.fps}</span></span>
              <span>MESH: <span style={{ color: 'white' }}>{stats.meshes}</span></span>
              <span>MEM: <span style={{ color: 'white' }}>{stats.memory}MB</span></span>
              <span>SYNC: <span style={{ color: 'white' }}>MB_EPHEMERAL_ROLLUP</span></span>
              <span>CTRL: <span style={{ color: 'white' }}>WASD+MOUSE</span></span>
              {!isAudioInitialized && (
                <button onClick={triggerAudioInit} style={{ backgroundColor: '#14F195', color: 'black', border: 'none', padding: '2px 8px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                  INITIALIZE_AUDIO
                </button>
              )}
            </div>
          )}
        </div>
        {showTelemetry && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 15px', opacity: 0.5, fontSize: '9px', color: '#aaa' }}>
            {logs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        )}
      </div>

      {/* MAIN UI */}
      {showMainUI && (
        <>
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: '16px', border: '1px solid rgba(153,50,204,0.1)' }} />
          </div>

          <div style={{ 
            position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            padding: '24px', transition: 'all 1s ease', opacity: showWhitepaper ? 0 : 1, pointerEvents: showWhitepaper ? 'none' : 'auto'
          }}>
            <div style={{ maxWidth: '1200px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: '40px', display: 'flex', gap: '16px', background: 'rgba(0,255,153,0.1)', padding: '8px 32px', border: '1px solid rgba(0,255,153,0.3)' }}>
                <Zap style={{ width: '16px', height: '16px', color: '#00ff99' }} />
                <span style={{ color: '#00ff99', fontSize: '12px', letterSpacing: '6px', fontWeight: '900' }}>[ SYSTEM_SYNC // ORIGIN_LINK_ESTABLISHED ]</span>
              </div>
              <h1 style={{ background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '12vw', fontWeight: '900', letterSpacing: '-0.02em', lineHeight: '0.7', marginBottom: '40px', fontStyle: 'italic' }}>GAMERPLEX</h1>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '80px' }}>
                <p style={{ color: '#fff', fontSize: '28px', fontWeight: '900', letterSpacing: '20px', fontStyle: 'italic' }}>The Sovereign Infinite</p>
                <p style={{ color: '#9945FF', fontSize: '18px', letterSpacing: '12px', opacity: 0.6 }}>Synthetic Autonomous Origin</p>
              </div>
              <div style={{ display: 'flex', gap: '40px', width: '100%', maxWidth: '900px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => setShowMainUI(false)} style={{ background: 'linear-gradient(90deg, #9945FF, #14F195)', color: 'black', padding: '32px 56px', border: 'none', fontSize: '28px', fontWeight: '900', fontStyle: 'italic', cursor: 'pointer' }}>Enter_The_Origin</button>
                <button onClick={() => setShowWhitepaper(true)} style={{ backgroundColor: 'transparent', color: '#14F195', padding: '32px 56px', border: '4px solid #14F195', fontSize: '28px', fontWeight: '900', fontStyle: 'italic', cursor: 'pointer' }}>Read_Manifesto</button>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', top: '60px', right: '60px', zIndex: 55, display: 'flex', gap: '40px', pointerEvents: 'auto' }}>
            <a href="https://x.com/gamerplex_com" target="_blank" style={{ color: '#14F195', opacity: 0.7, display: 'flex', alignItems: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
          </div>
        </>
      )}

      {/* WHITEPAPER */}
      {showWhitepaper && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.99)', padding: '80px', overflowY: 'auto', color: '#14F195', pointerEvents: 'auto' }}>
            <button onClick={() => setShowWhitepaper(false)} style={{ position: 'fixed', top: '48px', right: '48px', backgroundColor: '#14F195', color: 'black', padding: '16px 40px', border: 'none', fontWeight: '900', cursor: 'pointer' }}>CLOSE_X</button>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '100px', fontWeight: '900', marginBottom: '100px', background: 'linear-gradient(90deg, #9945FF, #14F195)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Gamerplex Manifesto</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '120px' }}>
                  {WHITEPAPER_SECTIONS.map((section, idx) => (
                    <div key={idx} style={{ borderLeft: '4px solid rgba(20,241,149,0.3)', paddingLeft: '60px' }}>
                      <h3 style={{ fontSize: '40px', fontWeight: '900', marginBottom: '40px' }}>{section.title}</h3>
                      <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>{section.content}</p>
                    </div>
                  ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
