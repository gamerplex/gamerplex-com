import type { Metadata, Viewport } from "next";
import "./globals.css";
import ReferralCapture from "../components/arcade/ReferralCapture";
import PostHogProvider from "../components/PostHogProvider";
import WalletBoot from "../components/WalletBoot";
import AppBanner from "../components/AppBanner";

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
        {/* Mark the doc when running inside the Gamerplex native shell (the
            WebView sets __GAMERPLEX_NATIVE__ before load; UA is the fallback).
            Runs in <head> before paint so `html.gx-native` CSS has no flash —
            it strips the marketing chrome/nav that the native tab bar replaces. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var e=document.documentElement;if(window.__GAMERPLEX_NATIVE__||navigator.userAgent.indexOf('GamerplexApp')>-1)e.classList.add('gx-native');var s=window.__GAMERPLEX_STORE__;if(s){e.classList.add('gx-store-'+s);if(s==='ios'||s==='play')e.classList.add('gx-no-transfer')}}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ backgroundColor: '#0d001a', margin: 0, padding: 0 }}>
        <PostHogProvider>
        <WalletBoot>
        <ReferralCapture />
        {children}
        <AppBanner />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`,
          }}
        />
        </WalletBoot>
        </PostHogProvider>
      </body>
    </html>
  );
}
