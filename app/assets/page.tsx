import type { Metadata } from "next";

import AssetsView from "./AssetsView";
import { ASSETS, files } from "./_data/assets";

const TITLE = "Free CC0 3D game assets: download GLB, see how each was made";
const DESCRIPTION =
  "Free 3D assets for games, released under CC0: use them in anything, commercial included. Every asset has a 3D preview, a one-click GLB download and a provenance record of the tools and licences behind it.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://gamerplex.com/assets" },
  keywords: ["free 3D assets", "CC0 3D models", "game assets", "GLB download", "cyberpunk 3D models", "provenance", "AI-assisted 3D"],
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://gamerplex.com/assets", siteName: "Gamerplex", type: "website" },
  twitter: { card: "summary_large_image", site: "@gamerplex_com", title: TITLE, description: DESCRIPTION },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Gamerplex CC0 3D assets",
  description: DESCRIPTION,
  url: "https://gamerplex.com/assets",
  hasPart: ASSETS.map((a) => ({
    "@type": "3DModel",
    name: a.title,
    url: `https://gamerplex.com/assets/${a.slug}`,
    image: `https://gamerplex.com${files(a.slug).thumb}`,
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
  })),
};

export default function AssetsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <AssetsView />
    </>
  );
}
