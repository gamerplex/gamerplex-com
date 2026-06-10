"use client";

import dynamic from "next/dynamic";

const ArcadeMode = dynamic(() => import("./_arcade/ArcadeMode"), { ssr: false });

export default function CyberSnakeRouter() {
  return <ArcadeMode />;
}
