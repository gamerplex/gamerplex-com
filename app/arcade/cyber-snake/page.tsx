"use client";

import dynamic from "next/dynamic";

// 3D scene needs `window`; disable SSR.
const CyberSnakeSolo = dynamic(() => import("./CyberSnakeSolo"), { ssr: false });

export default function CyberSnakeSoloPage() {
  return <CyberSnakeSolo />;
}
