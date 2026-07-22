"use client";

// Standalone Leaderboards page — the Ranks tab in the mobile app (and a real
// /leaderboard on web). Full board with a game switcher, not the homepage's
// 8-row teaser. Uses the shared glass shell so it matches every other surface.

import Link from "next/link";
import { useState } from "react";
import { SiteNav } from "../../components/SiteNav";
import EmailLoginModal from "../../components/arcade/EmailLoginModal";
import ShellLeaderboard, { type LbGame } from "../../components/arcade/ShellLeaderboard";
import { useIdentity } from "../../lib/identity/useIdentity";
import { GLASS_CSS } from "../../components/glass";

const GAMES: LbGame[] = [
  { id: "blockwords", label: "Blockwords", emoji: "🔮" },
  { id: "cyber-snake", label: "Cyber Snake", emoji: "🐍" },
  { id: "magic-chess", label: "Magic Chess", emoji: "♟️" },
  { id: "flipball", label: "Flipball", emoji: "🎱" },
  { id: "vrfc", label: "VRFC", emoji: "🥊" },
  { id: "time-gate", label: "Time Gate", emoji: "◇" },
  { id: "netherlevel", label: "Netherlevel", emoji: "🔥" },
  { id: "netherlevel-daily", label: "Netherlevel Daily", emoji: "🌒" },
];

export default function LeaderboardPage() {
  const { user, isSignedIn, refresh } = useIdentity();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="gl-root">
      <style>{GLASS_CSS}</style>
      <div className="gl-bg" aria-hidden="true" />

      <div className="gl-wrap">
        <header className="gl-top glass">
          <div className="gl-brand">
            <Link href="/" className="gl-logo">GAMERPLEX</Link>
            <span className="gl-mn">● MAINNET</span>
          </div>
          <SiteNav
            links={[
              { href: "/#featured", label: "Play" },
              { href: "/leaderboard", label: "Leaderboard" },
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

        <h1 className="gl-h2" style={{ fontSize: 26, marginTop: 6 }}>
          Leaderboards <span className="gl-h2-sub">· live, on-chain</span>
        </h1>

        <div className="gl-lb glass">
          <ShellLeaderboard gameId="blockwords" games={GAMES} highlightUserId={user?.id} limit={50} defaultWindow="all" />
        </div>
      </div>

      <EmailLoginModal
        open={showLogin}
        onClose={() => { setShowLogin(false); void refresh(); }}
        title="Sign in to save your rank"
        subtitle="Enter your email — we'll send a one-tap sign-in link. No password, no wallet."
      />
    </div>
  );
}
