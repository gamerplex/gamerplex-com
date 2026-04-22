"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

import { hasAcceptedCurrent } from "../../lib/arcade/tos";

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

export default function ArcadeLayout({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <TosGuard>{children}</TosGuard>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
