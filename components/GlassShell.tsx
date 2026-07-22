"use client";

// Shared liquid-glass page shell: the Solana purple→green field + frosted glass
// top bar (brand · MAINNET · nav · sign-in/profile chip) + optional community
// footer. Any page renders its content as children and gets the same shell as
// the home. One source of truth for the glass look across the site.

import Link from "next/link";
import { useState } from "react";
import { SiteNav, type NavLink } from "./SiteNav";
import CommunityLinks from "./CommunityLinks";
import EmailLoginModal from "./arcade/EmailLoginModal";
import { useIdentity } from "../lib/identity/useIdentity";
import { GLASS_CSS } from "./glass";

const DEFAULT_LINKS: NavLink[] = [
  { href: "/#featured", label: "Play" },
  { href: "/docs", label: "Docs" },
  { href: "/#leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export default function GlassShell({
  children,
  links = DEFAULT_LINKS,
  activeLabel,
  footer = true,
}: {
  children: React.ReactNode;
  links?: NavLink[];
  /** Mark the matching nav link as the current page. */
  activeLabel?: string;
  footer?: boolean;
}) {
  const { user, isSignedIn, refresh } = useIdentity();
  const [showLogin, setShowLogin] = useState(false);

  const navLinks = activeLabel
    ? links.map((l) => (l.label === activeLabel ? { ...l, active: true } : l))
    : links;

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
            links={navLinks}
            right={
              isSignedIn ? (
                <Link href="/profile" className="gl-user">👤 {user?.handle || user?.email?.split("@")[0] || "you"}</Link>
              ) : (
                <button onClick={() => setShowLogin(true)} className="gl-signin">Sign in</button>
              )
            }
          />
        </header>

        {children}

        {footer && <div style={{ marginTop: 30 }}><CommunityLinks tone="light" /></div>}
      </div>

      <EmailLoginModal
        open={showLogin}
        onClose={() => { setShowLogin(false); void refresh(); }}
        title="Sign in to Gamerplex"
        subtitle="Enter your email — we'll send a one-tap sign-in link. No password, no wallet."
      />
    </div>
  );
}
