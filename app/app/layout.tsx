import { GLASS_CSS } from "../../components/glass";

// App-shell routes — purpose-built for the native tabs: no site nav, hero, or
// footer, so tabs can't leak into cross-section pages. Browser site is unaffected.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0d001a", color: "#ece7ff" }}>
      <style>{GLASS_CSS}</style>
      {children}
    </div>
  );
}
