"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

import "@solana/wallet-adapter-react-ui/styles.css";

// Same network selection as the arcade layout — /profile must query the same
// chain the user played on.
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const DEFAULT_RPC =
  NETWORK === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC;

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
