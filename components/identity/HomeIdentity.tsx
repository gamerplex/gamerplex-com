"use client";

// Self-contained login + Credits bar for the HOMEPAGE. The homepage isn't inside
// the arcade layout's wallet-adapter tree, so we give it its own minimal provider
// bubble here (no global change, no double-wrap). Renders the email-FIRST sign-in
// (SignInWithSolana) + the unified Credits badge — the web2-login-before-web3 funnel
// that was missing from the landing page.

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

import { CreditsBadge } from "./CreditsBadge";
import { SignInWithSolana } from "./SignInWithSolana";

import "@solana/wallet-adapter-react-ui/styles.css";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");

export default function HomeIdentity() {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    [],
  );
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="home-identity">
            <CreditsBadge />
            <SignInWithSolana />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
