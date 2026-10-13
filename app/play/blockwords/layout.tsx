import type { Metadata } from "next";

const TITLE = "Blockwords — Gamerplex";
const DESCRIPTION = "A daily five-letter word puzzle. Same puzzle for everyone, pure skill. Free to play.";
const IMAGE = "/games/blockwords/og.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Gamerplex", images: [{ url: IMAGE, width: 1200, height: 630, alt: "Blockwords on Gamerplex" }] },
  twitter: { card: "summary_large_image", site: "@gamerplex_com", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
