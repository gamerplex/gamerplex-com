"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

import { track } from "../../lib/analytics";

import "@solana/wallet-adapter-react-ui/styles.css";

const DEVNET_RPC = "https://api.devnet.solana.com";

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

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletConnectTracker />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
