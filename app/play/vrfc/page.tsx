"use client";

import dynamic from "next/dynamic";

const VrfcMode = dynamic(() => import("./_arcade/VrfcMode"), { ssr: false });

export default function VrfcPage() {
  return (
    <>
      <h1 className="sr-only">VRFC</h1>
      <VrfcMode />
    </>
  );
}
