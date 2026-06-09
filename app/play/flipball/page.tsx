import type { Metadata } from "next";
import Link from "next/link";

const FLIPBALL_URL = "https://flipball.gamerplex.com";

export const metadata: Metadata = {
  title: "FLIPBALL — Pinball on Solana | Gamerplex",
  description:
    "Three.js pinball with smooth top rail, slingshots, drop targets, and on-chain high scores. Free to play on Gamerplex Arcade.",
  openGraph: {
    title: "FLIPBALL — Pinball on Solana",
    description: "Free pinball. Save your high score on-chain. Built on Gamerplex.",
    type: "website",
    url: "https://gamerplex.com/play/flipball",
    images: [{ url: "/play/flipball/banner.jpeg", width: 1956, height: 1080, alt: "FLIPBALL — pinball gameplay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLIPBALL — Pinball on Solana",
    description: "Free pinball, on-chain high scores. Built on Gamerplex.",
    images: ["/play/flipball/banner.jpeg"],
  },
};

export default function FlipballLandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg, #0d001a)",
        color: "var(--text, #f5f5fb)",
        padding: "32px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "var(--dim, #9c8fb8)",
            textDecoration: "none",
            fontSize: 13,
            letterSpacing: 0.5,
            marginBottom: 24,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          ← GAMERPLEX
        </Link>

        <div
          style={{
            position: "relative",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid var(--border, #3d1875)",
            boxShadow: "0 0 60px rgba(153, 69, 255, 0.25), 0 0 24px rgba(255, 0, 122, 0.18)",
            aspectRatio: "16 / 9",
            background: "#04000c",
            marginBottom: 28,
          }}
        >
          <img
            src="/play/flipball/banner.jpeg"
            alt="FLIPBALL gameplay preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 35%",
              display: "block",
            }}
          />
          <span
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.8,
              padding: "5px 10px",
              borderRadius: 999,
              background: "rgba(255,170,0,0.18)",
              color: "#ffaa00",
              border: "1px solid rgba(255,170,0,0.45)",
              textTransform: "uppercase",
              fontFamily: "'JetBrains Mono', monospace",
              backdropFilter: "blur(4px)",
            }}
          >
            Devnet · Beta
          </span>
        </div>

        <h1
          style={{
            margin: "0 0 12px",
            fontSize: "clamp(48px, 9vw, 84px)",
            fontWeight: 900,
            letterSpacing: -2,
            lineHeight: 0.95,
            background: "linear-gradient(135deg, #00f2ff 0%, #ff007a 50%, #ffd740 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 30px rgba(255, 0, 122, 0.35))",
          }}
        >
          FLIPBALL
        </h1>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--dim, #9c8fb8)",
            margin: "0 0 32px",
            maxWidth: 580,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Three.js pinball running on Solana. Three balls, smooth top rail,
          slingshots, drop targets, scoop, kickback. Save your high score
          on-chain for the cost of a single SPL transfer.
        </p>

        <a
          href={FLIPBALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 40px",
            background: "var(--green, #14F195)",
            color: "#0d001a",
            fontWeight: 900,
            fontSize: 15,
            letterSpacing: 0.8,
            borderRadius: 999,
            textDecoration: "none",
            boxShadow: "0 0 32px rgba(20, 241, 149, 0.45)",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "transform 100ms ease",
          }}
        >
          PLAY NOW
          <span aria-hidden style={{ fontSize: 18 }}>→</span>
        </a>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginTop: 44,
          }}
        >
          {[
            { label: "Live at", value: "flipball.gamerplex.com" },
            { label: "Network", value: "Devnet (Beta)" },
            { label: "Cost", value: "$0.05 to save score" },
            { label: "Built on", value: "Gamerplex Arcade v1.3" },
          ].map((row) => (
            <div
              key={row.label}
              style={{
                padding: "14px 16px",
                background: "var(--card-bg, rgba(255,255,255,0.05))",
                border: "1px solid var(--border, #3d1875)",
                borderRadius: 12,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  color: "var(--dim, #9c8fb8)",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {row.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text, #f5f5fb)" }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: 48,
            fontSize: 11,
            color: "var(--dim2, #5a4080)",
            letterSpacing: 0.5,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          FLIPBALL is hosted at its own origin so your wallet session stays
          isolated to the game. Connect your wallet there, not here.
        </p>
      </div>
    </main>
  );
}
