"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ProfileView } from "./_components/ProfileView";

export default function ProfilePage() {
  const { publicKey } = useWallet();
  // Gate wallet-dependent render until after mount so SSR (wallet-less) and the
  // first client render (wallet auto-connecting) match — avoids a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* 2026 minimalist top nav — matches home */}
      <nav className="top-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          <Link href="/#featured">Play</Link>
          <Link href="/docs">Build</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/profile">Profile</Link>
        </div>
      </nav>
      {mounted ? (
        <ProfileView walletPubkey={publicKey ?? null} isOwnProfile={true} />
      ) : (
        <div style={{ padding: 24, textAlign: "center", color: "#666" }}>Loading…</div>
      )}
    </div>
  );
}
