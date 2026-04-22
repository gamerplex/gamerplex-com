"use client";

import { useEffect, useState } from "react";

type Stats = { sessions: number; verified: number; treasuryUsdc: number };

export default function ArcadeStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/arcade/stats")
      .then(r => r.json())
      .then(setStats)
      .catch(() => {}); // silently skip on error
  }, []);

  if (!stats || (stats.sessions === 0 && stats.verified === 0 && stats.treasuryUsdc === 0)) {
    return null; // hide until we have real data
  }

  const usd = (stats.treasuryUsdc / 100).toFixed(2);

  return (
    <div style={{
      display: "flex", gap: 20, fontSize: 11, color: "#555570",
      marginBottom: 10, flexWrap: "wrap",
    }}>
      <span>
        <span style={{ color: "#4fc3f7", fontWeight: 700 }}>
          {stats.sessions.toLocaleString()}
        </span>{" "}
        sessions on-chain
      </span>
      <span>·</span>
      <span>
        <span style={{ color: "#14F195", fontWeight: 700 }}>
          {stats.verified}
        </span>{" "}
        VERIFIED
      </span>
      <span>·</span>
      <span>
        <span style={{ color: "#9945FF", fontWeight: 700 }}>
          ${usd}
        </span>{" "}
        treasury
      </span>
    </div>
  );
}
