import type { Metadata } from "next";

const TITLE = "Netherlevel — Gamerplex";
const DESCRIPTION = "A first-person trap gauntlet. Descend through the levels without dying. Pure skill, free to play.";
const IMAGE = "/games/netherlevel/og.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Gamerplex", images: [{ url: IMAGE, width: 1200, height: 630, alt: "Netherlevel on Gamerplex" }] },
  twitter: { card: "summary_large_image", site: "@gamerplex_com", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
