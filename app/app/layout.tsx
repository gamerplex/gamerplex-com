import { GLASS_CSS } from "../../components/glass";
import { AccountChip } from "../../components/identity/AccountChip";

// App-shell routes — purpose-built for the native tabs: no site nav, hero, or
// footer, so tabs can't leak into cross-section pages. Browser site is unaffected.
// The AccountChip is the ONE standardized login affordance (top-right, every tab).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#0d001a", color: "#ece7ff" }}>
      <style>{GLASS_CSS}</style>
      <AccountChip />
      {/* A plain div, NOT a second <main>: the root layout already provides the
          one landmark, and nesting another made every /app/* route ship two.
          What these routes genuinely lacked was an <h1>, which each page now has.
          Reserves space for the fixed chip so it never overlaps content. */}
      <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 54px)" }}>{children}</div>
    </div>
  );
}
