import type { Metadata } from "next";

import BuildView from "./BuildView";

const TITLE = "Build with Gamerplex: one sentence to your AI, one playable world";
const DESCRIPTION =
  "Tell Claude, ChatGPT, Codex or a local model to build a world with Gamerplex. Openly licensed parts, a provenance record for every build, playable in the browser in about a minute. Open source.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://gamerplex.com/build" },
  keywords: ["AI game builder", "agent-built games", "Claude Code plugin", "CC0 3D assets", "provenance", "Solana", "Sovereign World Kit", "gamerplex-dev"],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://gamerplex.com/build",
    siteName: "Gamerplex",
    type: "website",
    images: [{ url: "/build/og.png", width: 1200, height: 630, alt: "One sentence to your AI. One playable world. Gamerplex Sovereign World Kit" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@gamerplex_com",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/build/og.png"],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Sovereign World Kit",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  description: DESCRIPTION,
  url: "https://gamerplex.com/build",
  downloadUrl: "https://github.com/gamerplex/sovereign-world-kit",
  softwareVersion: "0.1.1",
  license: "https://opensource.org/licenses/MIT",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Gamerplex", url: "https://gamerplex.com" },
};

export default function BuildPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <BuildView />
    </>
  );
}
