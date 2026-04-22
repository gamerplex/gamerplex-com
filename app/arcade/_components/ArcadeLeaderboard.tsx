"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  fetchLeaderboard,
  formatDuration,
  shortAddr,
  type LeaderboardEntry,
} from "../../../lib/arcade/leaderboard";
import { ARCADE_NETWORK } from "../../../lib/arcade/client";

const REFRESH_MS = 30_000;

export function ArcadeLeaderboard({
  gameSlug,
  limit = 10,
  highlightWallet,
}: {
  gameSlug: string;
  limit?: number;
  highlightWallet?: string | null;
}) {
  const { connection } = useConnection();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await fetchLeaderboard(connection, gameSlug, limit);
        if (!cancelled) {
          setEntries(rows);
          setError(null);
          setLastFetchedAt(Date.now());
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load leaderboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connection, gameSlug, limit]);

  const explorerUrl = (sig: string) => {
    const cluster = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;
    return `https://explorer.solana.com/tx/${sig}${cluster}`;
  };

  return (
    <div style={{ background: "#0c0c14", border: "1px solid #252540", borderRadius: 10, padding: 14, color: "#cfcfe0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0", margin: 0 }}>
          On-chain leaderboard
        </h3>
        <span style={{ fontSize: 10, color: "#666" }}>
          {loading && !entries ? "loading…" : lastFetchedAt ? `updated ${Math.floor((Date.now() - lastFetchedAt) / 1000)}s ago` : ""}
        </span>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#ff6b6b" }}>{error}</div>
      )}

      {!error && entries && entries.length === 0 && (
        <div style={{ fontSize: 12, color: "#777", padding: "12px 0" }}>
          No on-chain scores yet. Be the first — finish a game and click <strong>Save on-chain</strong>.
        </div>
      )}

      {!error && entries && entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 60px 40px 40px 40px",
              gap: 8,
              padding: "6px 4px",
              borderBottom: "1px solid #222236",
              color: "#666",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            <div>#</div>
            <div>Player</div>
            <div style={{ textAlign: "right" }}>Score</div>
            <div style={{ textAlign: "right" }}>Cont.</div>
            <div style={{ textAlign: "right" }}>Time</div>
            <div style={{ textAlign: "right" }}>Tx</div>
          </div>
          {entries.map((e, idx) => {
            const isMe = highlightWallet && e.player === highlightWallet;
            return (
              <div
                key={e.tx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr 60px 40px 40px 40px",
                  gap: 8,
                  padding: "6px 4px",
                  alignItems: "center",
                  background: isMe ? "#1a2e1a" : "transparent",
                  borderRadius: 4,
                  color: isMe ? "#c0f5c0" : undefined,
                }}
              >
                <div style={{ color: idx === 0 ? "#ffd740" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "#666" }}>
                  {idx + 1}
                </div>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11 }}>
                  <Link
                    href={`/profile/${e.player}`}
                    style={{ color: isMe ? "#c0f5c0" : "#cfcfe0", textDecoration: "none" }}
                    title="View profile"
                  >
                    {shortAddr(e.player)}
                  </Link>
                  {e.verified && (
                    <span title="VERIFIED — replay saved on-chain" style={{ marginLeft: 6, color: "#ffd740" }}>🏆</span>
                  )}
                </div>
                <div style={{ textAlign: "right", fontWeight: 600, color: isMe ? "#c0f5c0" : "#e8e8f0" }}>
                  {e.score}
                </div>
                <div style={{ textAlign: "right", color: e.continues > 0 ? "#c99aff" : "#555" }}>
                  {e.continues}
                </div>
                <div style={{ textAlign: "right", color: "#888", fontSize: 10 }}>
                  {formatDuration(e.duration)}
                </div>
                <div style={{ textAlign: "right" }}>
                  <a
                    href={explorerUrl(e.tx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#14F195", textDecoration: "none", fontSize: 10 }}
                  >
                    ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#444", marginTop: 10, textAlign: "center" }}>
        Top scores sourced live from Solana {ARCADE_NETWORK}. Ranked by score, then continues (lower = better), then time.
      </div>
    </div>
  );
}
