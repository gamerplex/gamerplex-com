// Wallet + connection context now live in the root layout (components/WalletBoot),
// so the whole site — not just /play — has wallet context for the shell/useIdentity.
// This layout is a passthrough; kept as a segment boundary for future /play-only chrome.
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
