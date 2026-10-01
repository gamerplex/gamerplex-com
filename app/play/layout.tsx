// Wallet + connection context now live in the root layout (components/WalletBoot),
// so the whole site — not just /play — has wallet context for the shell/useIdentity.
// This layout marks the segment so a purchased theme's decorative layers (scanlines,
// horizon grid) never draw over a running game; see PlaySegmentMarker.
import PlaySegmentMarker from "../../components/PlaySegmentMarker";

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlaySegmentMarker />
      {children}
    </>
  );
}
