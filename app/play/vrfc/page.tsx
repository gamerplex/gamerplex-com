"use client";

import dynamic from "next/dynamic";

const VrfcMode = dynamic(() => import("./_arcade/VrfcMode"), { ssr: false });

export default function VrfcPage() {
  return <VrfcMode />;
}
