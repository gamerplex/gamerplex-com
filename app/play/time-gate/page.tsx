"use client";

import dynamic from "next/dynamic";

const TimeGateMode = dynamic(() => import("./_arcade/TimeGateMode"), { ssr: false });

export default function TimeGatePage() {
  return <TimeGateMode />;
}
