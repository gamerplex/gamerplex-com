"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { resolve } from "@bonfida/spl-name-service";

import { ProfileView } from "../_components/ProfileView";

// Resolve the route param to a PublicKey. Accepts:
//   - base58 wallet pubkey (32-44 chars)
//   - .sol domain (resolved via Bonfida)
async function resolveIdentifier(raw: string, connection: Connection): Promise<PublicKey | null> {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.endsWith(".sol")) {
    try {
      const name = trimmed.replace(/\.sol$/, "");
      const pk = await resolve(connection, name);
      return pk;
    } catch {
      return null;
    }
  }
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

// Reuse the arcade RPC env for consistency.
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const DEFAULT_RPC =
  NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC;

export default function PublicProfilePage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet: rawParam } = use(params);
  const { publicKey: myWallet } = useWallet();

  const [resolvedPk, setResolvedPk] = useState<PublicKey | null>(null);
  const [resolving, setResolving] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // One-off connection just for SNS resolution, since the layout's connection
  // is only available inside the WalletProvider tree. This hits the public
  // RPC once per page load — acceptable overhead.
  const conn = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setNotFound(false);
    resolveIdentifier(decodeURIComponent(rawParam), conn).then((pk) => {
      if (cancelled) return;
      if (pk) {
        setResolvedPk(pk);
      } else {
        setNotFound(true);
      }
      setResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conn, rawParam]);

  const isOwnProfile = !!myWallet && !!resolvedPk && myWallet.equals(resolvedPk);

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
          <Link href="/profile" style={{ color: "#a8a8c0", textDecoration: "none" }}>
            My profile
          </Link>
        </nav>
      </header>

      {resolving && (
        <div style={{ textAlign: "center", padding: 60, color: "#6a6a80", fontSize: 13 }}>
          Resolving {rawParam}…
        </div>
      )}

      {notFound && (
        <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔎</div>
          <h1 style={{ fontSize: 20, color: "#e8e8f0", marginBottom: 8 }}>Couldn&rsquo;t find that player</h1>
          <p style={{ color: "#8a8aa0", fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ fontFamily: "monospace" }}>{rawParam}</span> isn&rsquo;t a valid Solana address
            or a registered .sol domain.
          </p>
          <div style={{ marginTop: 20 }}>
            <Link href="/arcade" style={{ color: "#14F195", fontSize: 13 }}>
              ← Back to arcade
            </Link>
          </div>
        </div>
      )}

      {!resolving && resolvedPk && (
        <ProfileView walletPubkey={resolvedPk} isOwnProfile={isOwnProfile} />
      )}
    </div>
  );
}
