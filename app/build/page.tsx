import type { Metadata } from "next";

import BuildView from "./BuildView";

export const metadata: Metadata = {
  title: "Build with Gamerplex — one sentence to your AI, one playable world",
  description:
    "Tell Claude, ChatGPT or Codex to build a world with Gamerplex. Open-licence parts, full provenance, playable in the browser in about a minute.",
};

export default function BuildPage() {
  return <BuildView />;
}
