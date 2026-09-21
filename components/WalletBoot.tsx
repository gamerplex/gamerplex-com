"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

import { track } from "../lib/analytics";

import "@solana/wallet-adapter-react-ui/styles.css";

// Network-driven RPC (honors NEXT_PUBLIC_SOLANA_RPC; mainnet default). This
// wraps the WHOLE app so the shell (login/profile chip, useIdentity) has wallet
// context on every page — not just /play. Web2-first pages never open a wallet;
// they just need the context to exist so useWallet() doesn't throw.
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet";
const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

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
    // Onboarding reads this: a browser wallet connect is not an identity link
    // (users.walletAddress stays null until SIWS), so without it the "connect a
    // wallet" step could never tick for someone who did exactly that.
    try { localStorage.setItem("gpx_wallet_ok", "1"); } catch { /* no-op */ }
    track("wallet_connected", { address: addr });
  }, [connected, publicKey]);

  return null;
}

export default function WalletBoot({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletConnectTracker />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
