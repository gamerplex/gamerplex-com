import type { Metadata, Viewport } from "next";
import "./globals.css";
import ReferralCapture from "../components/arcade/ReferralCapture";
import PostHogProvider from "../components/PostHogProvider";

export const metadata: Metadata = {
  title: "GAMERPLEX | The Gaming Protocol",
  description: "Skill-based gaming on Solana. Every move on-chain. Compete for real prizes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gamerplex",
  },
  openGraph: {
    title: "GAMERPLEX",
    description: "Skill-based gaming on Solana. Every move on-chain.",
    type: "website",
    siteName: "Gamerplex",
    images: [{ url: "/icons/og-image.png", width: 1200, height: 630, alt: "Gamerplex — Every Move On-Chain" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@gamerplex_com",
    title: "GAMERPLEX",
    description: "Skill-based gaming on Solana. Every move on-chain.",
    images: ["/icons/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom (was maximumScale:1 / userScalable:false, which snapped
  // the page back and fought users trying to see the whole chess board).
  // Accessibility win too — never trap zoom.
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0d001a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: '#0d001a' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ backgroundColor: '#0d001a', margin: 0, padding: 0 }}>
        <PostHogProvider>
        <ReferralCapture />
        {/* Top banner — hackathon voting */}
        <div style={{
          background: "linear-gradient(90deg, #9945FF, #14F195)",
          color: "#050508", padding: "8px 16px",
          fontSize: 12, fontWeight: 700, textAlign: "center",
          display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span>🚀 Help us get to Mainnet! Vote for Gamerplex at</span>
          <a href="https://colosseum.com/frontier" target="_blank" rel="noopener noreferrer" style={{
            color: "#050508", textDecoration: "underline", fontWeight: 800,
          }}>Frontier →</a>
        </div>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`,
          }}
        />
        </PostHogProvider>
      </body>
    </html>
  );
}
