"use client";

import dynamic from "next/dynamic";

const ArcadeMode = dynamic(() => import("./_arcade/ArcadeMode"), { ssr: false });

export default function BlockwordsPage() {
  return (
    <>
      <h1 className="sr-only">Blockwords</h1>
      <ArcadeMode />
    </>
  );
}
