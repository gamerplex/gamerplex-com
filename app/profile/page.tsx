"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ProfileView } from "./_components/ProfileView";
import GlassShell from "../../components/GlassShell";

export default function ProfilePage() {
  const { publicKey } = useWallet();
  // Gate wallet-dependent render until after mount so SSR (wallet-less) and the
  // first client render (wallet auto-connecting) match — avoids a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <GlassShell activeLabel="Profile">
      {mounted ? (
        <ProfileView walletPubkey={publicKey ?? null} isOwnProfile={true} />
      ) : (
        <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Loading…</div>
      )}
    </GlassShell>
  );
}
