"use client";

// Standalone Leaderboards page — the Ranks tab in the mobile app (and a real
// /leaderboard on web). Full board with a game switcher, not the homepage's
// 8-row teaser. Uses the shared glass shell so it matches every other surface.

import Link from "next/link";
import { useState } from "react";
import { SiteNav } from "../../components/SiteNav";
import EmailLoginModal from "../../components/arcade/EmailLoginModal";
import ShellLeaderboard from "../../components/arcade/ShellLeaderboard";
import { useIdentity } from "../../lib/identity/useIdentity";
import { GLASS_CSS } from "../../components/glass";
import { LB_GAMES_FULL } from "../_data/games";
import OmegaCityBoard from "../../components/arcade/OmegaCityBoard";

// Shared list — see app/_data/games.ts for why there is only one.

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
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: "6px 0 0" }}>
          Sign in with Flipcash and your scores land here. The <strong style={{ color: "rgba(255,255,255,0.75)" }}>Verified</strong> badge
          means a score was also saved on-chain — that step needs a Solana wallet.
        </p>

        <div className="gl-lb glass">
          <ShellLeaderboard gameId="blockwords" games={LB_GAMES_FULL} highlightUserId={user?.id} limit={50} defaultWindow="all" />
        </div>

        {/* Omega City ranks by conquest, not score, so it gets its own board rather
            than an empty row in the switcher above. */}
        <div className="gl-lb glass" style={{ marginTop: 16 }}>
          <OmegaCityBoard highlightHandle={user?.handle ?? null} limit={20} />
        </div>
      </div>

      <EmailLoginModal
        open={showLogin}
        onClose={() => { setShowLogin(false); void refresh(); }}
        title="Sign in to save your rank"
        subtitle="Flipcash is the fastest way in — no password, nothing to install."
      />
    </div>
  );
}
