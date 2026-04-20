"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChessRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/play/magic-chess");
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", background: "#050510", display: "flex", alignItems: "center", justifyContent: "center", color: "#9945FF", fontFamily: "monospace" }}>
      Redirecting to Magic Chess...
    </div>
  );
}
