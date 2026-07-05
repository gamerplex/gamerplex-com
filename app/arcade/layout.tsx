"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { PublicKey, Transaction } from "@solana/web3.js";

import { hasAcceptedCurrent } from "../../lib/arcade/tos";
import {
  fetchProfile,
  buildOpenProfileIx,
  makeProgram,
} from "../../lib/arcade/client";
import { assertNetworkMatchesHostname, NetworkMismatchError } from "../../lib/arcade/safety";
import { getStoredReferrer, pickReferrerFromUrl } from "../../lib/arcade/referral";
import { ArcadeIdentityBar } from "../../components/identity/ArcadeIdentityBar";
import ReferralClaimer from "../../components/arcade/ReferralClaimer";
import { track } from "../../lib/analytics";

import "@solana/wallet-adapter-react-ui/styles.css";

// RPC endpoint follows NEXT_PUBLIC_SOLANA_NETWORK. Operators should override
// with a paid endpoint (Helius/Triton/Alchemy) on mainnet via NEXT_PUBLIC_SOLANA_RPC
// to avoid rate-limit hiccups on the public default.
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const DEFAULT_RPC =
  NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || DEFAULT_RPC;

// Fires `wallet_connected` once the first time each wallet address connects
// (the web2→web3 funnel step). Dedupes per-address so re-renders don't re-emit.
function WalletConnectTracker() {
  const { publicKey, connected } = useWallet();
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) return;
    const addr = publicKey.toBase58();
    if (trackedRef.current === addr) return;
    trackedRef.current = addr;
    track("wallet_connected", { address: addr });
  }, [connected, publicKey]);

  return null;
}

function TosGuard({ children }: { children: React.ReactNode }) {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!connected || !publicKey) return;
    if (hasAcceptedCurrent(publicKey)) return;
    const returnTo = encodeURIComponent(pathname || "/arcade");
    router.push(`/terms?return=${returnTo}`);
  }, [connected, publicKey, pathname, router]);

  return <>{children}</>;
}

// Silently creates the PlayerProfile PDA on first wallet connect (one-time
// per wallet, costs ~0.002 SOL in rent — refundable if profile is ever closed).
// Shows a small non-blocking toast while the tx is in flight.
function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const [creating, setCreating] = useState(false);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey || !anchorWallet || !sendTransaction) return;
    if (!hasAcceptedCurrent(publicKey)) return; // TosGuard handles redirect
    const key = publicKey.toBase58();
    if (checkedRef.current === key) return; // already checked this wallet
    checkedRef.current = key;

    (async () => {
      try {
        // Capture any ?referrer= / ?sig= from the landing URL into sessionStorage
        // before reading. Re-validates self-referral against the connected wallet.
        await pickReferrerFromUrl(publicKey);
        const existing = await fetchProfile(connection, publicKey);
        if (existing) return; // already has a profile
        setCreating(true);
        const program = makeProgram(connection, anchorWallet);
        const ix = await buildOpenProfileIx(program, publicKey, getStoredReferrer(publicKey));
        const tx = new Transaction().add(ix);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      } catch {
        // Non-fatal: profile creation can retry on next connect or be bundled
        // with first paid action. Don't surface errors to the user here.
      } finally {
        setCreating(false);
      }
    })();
  }, [connected, publicKey, anchorWallet, sendTransaction, connection]);

  return (
    <>
      {children}
      {creating && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", border: "1px solid #252540", borderRadius: 8,
          padding: "8px 16px", fontSize: 12, color: "#a8a8c0", zIndex: 9999,
          display: "flex", alignItems: "center", gap: 8, pointerEvents: "none",
        }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4fc3f7", animation: "pulse 1s infinite" }} />
          Setting up your arcade profile…
        </div>
      )}
    </>
  );
}

// Shown when the arcade is blocked on this hostname (mainnet host, arcade still
// on devnet). Friendly, on-brand, and points players at the free games that DO work.
function ArcadeComingSoon() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 440 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🎮</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 10px" }}>The on-chain Arcade is coming to mainnet</h1>
        <p style={{ color: "#9c8fb8", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          On-chain scoring launches with mainnet soon. Meanwhile, every game is free to play right now — jump in.
        </p>
        <a href="/#featured" style={{ display: "inline-block", padding: "12px 22px", borderRadius: 11, fontWeight: 800, textDecoration: "none", color: "#04120c", background: "linear-gradient(135deg,#14F195,#0fd47f)" }}>
          ▶ Play the free games
        </a>
      </div>
    </div>
  );
}

export default function ArcadeLayout({ children }: { children: React.ReactNode }) {
  // v1.3 — hostname guard: FAIL CLOSED if e.g. gamerplex.com is on devnet (never
  // mount the arcade on a mismatched network), but degrade to a friendly screen
  // instead of an uncaught crash. Non-mismatch errors still surface.
  let networkBlocked = false;
  if (typeof window !== "undefined") {
    try {
      assertNetworkMatchesHostname();
    } catch (e) {
      if (e instanceof NetworkMismatchError) networkBlocked = true;
      else throw e;
    }
  }

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  if (networkBlocked) return <ArcadeComingSoon />;

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ArcadeIdentityBar />
          <WalletConnectTracker />
          <ReferralClaimer />
          <TosGuard>
            <ProfileGuard>{children}</ProfileGuard>
          </TosGuard>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
