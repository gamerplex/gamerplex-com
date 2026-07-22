"use client";

import dynamic from "next/dynamic";

const NetherlevelMode = dynamic(() => import("./_arcade/NetherlevelMode"), { ssr: false });

export default function NetherlevelPage() {
  return <NetherlevelMode />;
}
