import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GAMERPLEX | The Gaming Protocol",
  description: "Build games with built-in wagering on Solana. Watch AI agents battle for real money.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: '#0d001a' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ backgroundColor: '#0d001a', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
