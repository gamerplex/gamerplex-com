"use client";

// Home — the play-first liquid-glass landing. Funnel: PLAY (zero friction) → LOGIN
// (email) → RECORD (in-game + live board) → $GAME (last, educational). Solana
// palette (purple/green, pink as a content accent). Merged home + arcade.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiteNav } from "../components/SiteNav";
import CommunityLinks from "../components/CommunityLinks";
import EmailLoginModal from "../components/arcade/EmailLoginModal";
import ShellLeaderboard from "../components/arcade/ShellLeaderboard";
import { StreakCelebration } from "../components/Hype";
import GameGrid from "./_components/GameGrid";
import LiveTicker from "./_components/LiveTicker";
import { GAMES, LB_GAMES } from "./_data/games";
import { useIdentity } from "../lib/identity/useIdentity";
import { GLASS_CSS } from "../components/glass";

export default function Home() {
  const { user, isSignedIn, refresh } = useIdentity();
  const [showLogin, setShowLogin] = useState(false);
  const router = useRouter();
  const playLucky = () => router.push(GAMES[Math.floor(Math.random() * GAMES.length)].path);

  return (
    <div className="gl-root">
      <style>{GLASS_CSS}</style>
      <div className="gl-bg" aria-hidden="true" />

      <div className="gl-wrap">
        <header className="gl-top glass">
          <div className="gl-brand">
            <span className="gl-logo">GAMERPLEX</span>
            <span className="gl-mn">● MAINNET</span>
          </div>
          <SiteNav
            links={[
              { href: "#featured", label: "Play" },
              { href: "/docs", label: "Docs" },
              { href: "#leaderboard", label: "Leaderboard" },
              { href: "/download", label: "Get app" },
              { href: "/profile", label: "Profile" },
            ]}
            right={
              isSignedIn ? (
                <Link href="/profile" className="gl-user">👤 {user?.handle || user?.email?.split("@")[0] || "you"}</Link>
              ) : (
                <button onClick={() => setShowLogin(true)} className="gl-signin">Sign in</button>
              )
            }
          />
        </header>

        <section className="gl-hero-grid">
          <div>
            <h1 className="gl-h1">GAMERPLEX</h1>
            <p className="gl-tag">Build · Play · Own · Compete</p>
            <button onClick={playLucky} className="gl-cta gl-cta-hero">
              <span>🎲 I&apos;m feeling lucky — play now</span>
              <span className="gl-cta-arrow">↗</span>
            </button>
            <LiveTicker />
          </div>

          <aside className="gl-signin-card glass">
            {isSignedIn ? (
              <>
                <div className="gl-sc-title">Welcome back{user?.handle ? `, @${user.handle}` : ""} 👋</div>
                <div className="gl-sc-sub">Your scores are saved. Jump back in and beat your best.</div>
                <button onClick={playLucky} className="gl-cta" style={{ marginTop: 14 }}><span>Play a game</span><span className="gl-cta-arrow">↗</span></button>
                <Link href="/profile" className="gl-sc-link">Your profile →</Link>
              </>
            ) : (
              <>
                <div className="gl-sc-title">Save your scores</div>
                <div className="gl-sc-sub">Play free right now — sign in with <b>email</b> to keep your rank. No password, no wallet.</div>
                <button onClick={() => setShowLogin(true)} className="gl-cta" style={{ marginTop: 14 }}><span>✉️ Sign in with email</span><span className="gl-cta-arrow">↗</span></button>
                <div className="gl-sc-note">You can play without signing in — we only ask when you want to save.</div>
              </>
            )}
          </aside>
        </section>

        {/* streak strip — OUTSIDE .gl-hero-grid so it shows on web, PWA, and the
            native (gx-native) app alike; the hero itself is stripped in-app. */}
        <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 18px" }}><StreakCelebration /></div>

        <h2 id="featured" className="gl-h2">Play free — {GAMES.length} live now</h2>
        <GameGrid />

        <h2 id="leaderboard" className="gl-h2">Leaderboard <span className="gl-h2-sub">· live, on-chain</span></h2>
        <div className="gl-lb glass"><ShellLeaderboard gameId="blockwords" games={LB_GAMES} highlightUserId={user?.id} limit={8} defaultWindow="all" /></div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", flexWrap: "wrap", margin: "18px 0 40px" }}>
          <Link href="/play/blockwords" className="gl-cta" style={{ width: "auto" }}><span>▶ Play Blockwords</span><span className="gl-cta-arrow">↗</span></Link>
          {!isSignedIn && <button onClick={() => setShowLogin(true)} className="gl-signin">Sign in to save your rank</button>}
          <Link href="/leaderboard" className="gl-sc-link" style={{ margin: 0 }}>Full rankings →</Link>
        </div>

        <section className="gl-game glass">
          <div>
            <div className="gl-game-k">The $GAME token</div>
            <div className="gl-game-t">Pay with $GAME and save 20%</div>
            <div className="gl-game-s">$GAME is a community utility token on Solana, issued by Flipcash. Gamerplex simply accepts it as one optional way to pay for on-chain saves — Credits and gameplay are always free.</div>
          </div>
          <a href="https://app.flipcash.com/token/7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE" target="_blank" rel="noopener noreferrer" className="gl-game-btn">View on Flipcash ↗</a>
        </section>

        <div style={{ marginTop: 30 }}><CommunityLinks tone="light" /></div>
        <div style={{ textAlign: "center", marginTop: 12 }}><Link href="/download" style={{ color: "#b388ff", fontWeight: 700, fontSize: 13.5 }}>▶ Get the Gamerplex app →</Link></div>
        <p className="gl-foot">One tap to play · sign in with email to save · no wallet needed · Solana mainnet</p>
      </div>

      <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); void refresh(); }} title="Sign in to Gamerplex" subtitle="Enter your email — we'll send a one-tap sign-in link. No password, no wallet." />
    </div>
  );
}
