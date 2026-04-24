"use client";

// Minimal wallet wrapper for /terms — the page renders a WalletMultiButton
// and uses useWallet() / signMessage() to record ToS acceptance, but unlike
// /arcade or /play it doesn't need TosGuard or ProfileGuard. Without this
// layout the page throws 8 "WalletContext without provider" errors on every
// render in dev tools.

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

import "@solana/wallet-adapter-react-ui/styles.css";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const DEFAULT_RPC =
  NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || DEFAULT_RPC;

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
