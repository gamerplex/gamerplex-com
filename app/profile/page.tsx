"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ProfileView } from "./_components/ProfileView";

export default function ProfilePage() {
  const { publicKey } = useWallet();

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", color: "#cfcfe0" }}>
      <header
        style={{
          borderBottom: "1px solid #1a1a28",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ color: "#e8e8f0", fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
          Gamerplex
        </Link>
        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <Link href="/arcade" style={{ color: "#a8a8c0", textDecoration: "none" }}>
            Arcade
          </Link>
          <Link href="/leaderboard" style={{ color: "#a8a8c0", textDecoration: "none" }}>
            Leaderboard
          </Link>
        </nav>
      </header>
      <ProfileView walletPubkey={publicKey ?? null} isOwnProfile={true} />
    </div>
  );
}
