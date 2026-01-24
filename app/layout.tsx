import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GAMERPLEX | THE ORIGIN",
  description: "The Sovereign Infinite Synthetic Autonomous Origin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: '#0d001a' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <style>{`
          html, body { background-color: #0d001a !important; }
        `}</style>
      </head>
      <body className="antialiased bg-[#0d001a] overflow-hidden w-screen h-screen" style={{ backgroundColor: '#0d001a' }}>
        {children}
      </body>
    </html>
  );
}
