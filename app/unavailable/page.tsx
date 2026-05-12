import Link from "next/link";

const US_STATE_NAMES: Record<string, string> = {
  "US-AZ": "Arizona",
  "US-AR": "Arkansas",
  "US-CT": "Connecticut",
  "US-DE": "Delaware",
  "US-LA": "Louisiana",
  "US-MT": "Montana",
  "US-SC": "South Carolina",
  "US-SD": "South Dakota",
  "US-TN": "Tennessee",
  "US-VI": "the US Virgin Islands",
};

const COUNTRY_NAMES: Record<string, string> = {
  CU: "Cuba",
  IR: "Iran",
  KP: "North Korea",
  SY: "Syria",
  SG: "Singapore",
};

function regionLabel(code: string | undefined): string {
  if (!code) return "your region";
  if (US_STATE_NAMES[code]) return US_STATE_NAMES[code];
  if (COUNTRY_NAMES[code]) return COUNTRY_NAMES[code];
  return "your region";
}

export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const label = regionLabel(region);

  return (
    <>
      {/* Minimalist top nav — matches home */}
      <nav className="top-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>GAMERPLEX</Link>
          <span className="devnet-badge">Devnet</span>
        </div>
        <div className="nav-links">
          <Link href="/#featured">Play</Link>
          <Link href="/docs">Build</Link>
          <Link href="/leaderboard">Leaderboard</Link>
        </div>
      </nav>

      <section style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        position: "relative",
        background: "radial-gradient(ellipse at 30% 10%, rgba(255,82,48,0.10), transparent 60%), radial-gradient(ellipse at 70% 90%, rgba(153,69,255,0.10), transparent 55%)",
      }}>
        {/* Tron grid mesh, dimmed for blocked-state */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,82,48,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,82,48,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }} />

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 96, lineHeight: 1, marginBottom: 16, filter: "drop-shadow(0 0 32px rgba(255,82,48,0.4))" }}>
            🌏
          </div>

          <div style={{
            fontSize: 11,
            letterSpacing: 3,
            color: "var(--orange, #ff6b2c)",
            fontWeight: 800,
            textTransform: "uppercase",
            marginBottom: 10,
          }}>
            ● Region restricted
          </div>

          <h1 style={{
            fontSize: "clamp(32px, 6vw, 48px)",
            fontWeight: 900,
            fontStyle: "italic",
            lineHeight: 1.05,
            letterSpacing: -1,
            background: "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 14,
          }}>
            Not available in {label}
          </h1>

          <p style={{
            color: "var(--text)",
            fontSize: 15,
            lineHeight: 1.6,
            marginBottom: 8,
            maxWidth: 440,
            margin: "0 auto 8px",
          }}>
            Gamerplex Arcade isn&rsquo;t available to players in {label} due to local rules about paid skill-contest entry.
          </p>
          <p style={{
            color: "var(--dim)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 28,
            maxWidth: 440,
            margin: "0 auto 28px",
          }}>
            We&rsquo;re expanding availability — keep an eye on{" "}
            <a href="https://x.com/gamerplex_com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cyan)", textDecoration: "none" }}>@gamerplex_com</a> for region updates.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
            <Link href="/" style={{
              padding: "12px 24px",
              borderRadius: 10,
              background: "linear-gradient(90deg, #9945FF, #14F195)",
              color: "#000",
              fontSize: 13,
              fontWeight: 900,
              fontStyle: "italic",
              textDecoration: "none",
              boxShadow: "0 0 24px rgba(20,241,149,0.4)",
            }}>About Gamerplex</Link>
            <Link href="/docs" style={{
              padding: "12px 24px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid rgba(153,69,255,0.4)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}>Read the docs</Link>
            <Link href="/terms" style={{
              padding: "12px 24px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid rgba(153,69,255,0.2)",
              color: "var(--dim)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}>Terms</Link>
          </div>

          <div style={{
            fontSize: 11,
            color: "var(--dim2, #5a4080)",
            maxWidth: 380,
            margin: "0 auto",
            lineHeight: 1.5,
          }}>
            Region detected via IP geolocation. If you believe this is an error, email{" "}
            <a href="mailto:support@gamerplex.com" style={{ color: "var(--cyan)", textDecoration: "none" }}>support@gamerplex.com</a>.
          </div>
        </div>
      </section>
    </>
  );
}
