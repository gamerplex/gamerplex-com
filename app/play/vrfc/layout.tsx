import type { Metadata } from "next";

const TITLE = "VRFC — Gamerplex";
const DESCRIPTION = "Muay Thai fighting in your browser. Free to play.";
const IMAGE = "/games/vrfc/og.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Gamerplex", images: [{ url: IMAGE, width: 1200, height: 630, alt: "VRFC on Gamerplex" }] },
  twitter: { card: "summary_large_image", site: "@gamerplex_com", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
