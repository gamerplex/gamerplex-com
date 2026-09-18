"use client";

import dynamic from "next/dynamic";

const NetherlevelMode = dynamic(() => import("./_arcade/NetherlevelMode"), { ssr: false });

export default function NetherlevelPage() {
  return (
    <>
      <h1 className="sr-only">Netherlevel</h1>
      <NetherlevelMode />
    </>
  );
}
