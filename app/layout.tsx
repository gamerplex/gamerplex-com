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
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="antialiased bg-black overflow-hidden w-screen h-screen">
        {children}
      </body>
    </html>
  );
}
