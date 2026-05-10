"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const ArcadeMode = dynamic(() => import("./_arcade/ArcadeMode"), { ssr: false });
const BattleMode = dynamic(() => import("./_battle/BattleMode"), { ssr: false });

function ModeRouter() {
  const params = useSearchParams();
  const mode = params.get("mode") === "battle" ? "battle" : "arcade";
  return mode === "battle" ? <BattleMode /> : <ArcadeMode />;
}

export default function CyberSnakeRouter() {
  return <Suspense fallback={null}><ModeRouter /></Suspense>;
}
