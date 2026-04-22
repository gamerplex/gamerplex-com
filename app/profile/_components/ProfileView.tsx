"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import {
  fetchPlayerStats,
  fetchReceiptsOriginal,
  fetchReceiptsOwned,
  gameDisplayName,
  lookupSns,
  shortAddr,
  type PlayerStats,
  type ReceiptSummary,
} from "../../../lib/arcade/profile";
import { ARCADE_NETWORK } from "../../../lib/arcade/client";
import { formatDuration } from "../../../lib/arcade/leaderboard";
import { ReceiptActionModal } from "./ReceiptActionModal";

const EXPLORER_SUFFIX = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;
const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${EXPLORER_SUFFIX}`;
const explorerAddr = (addr: string) => `https://explorer.solana.com/address/${addr}${EXPLORER_SUFFIX}`;

/** Shared profile view. Accepts a wallet-like state: connected wallet for /profile,
 *  or a read-only pubkey for /profile/[wallet]. */
export function ProfileView({
  walletPubkey,
  isOwnProfile,
}: {
  walletPubkey: PublicKey | null;
  isOwnProfile: boolean;
}) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected } = useWallet();

  const [sns, setSns] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [receiptsOwned, setReceiptsOwned] = useState<ReceiptSummary[] | null>(null);
  const [receiptsOriginal, setReceiptsOriginal] = useState<ReceiptSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalReceipt, setModalReceipt] = useState<(ReceiptSummary & { isOwner: boolean; isOriginal: boolean }) | null>(null);
  const [modalMode, setModalMode] = useState<"transfer" | "close">("transfer");
  const [toast, setToast] = useState<{ sig: string; kind: "transfer" | "close" } | null>(null);

  useEffect(() => {
    if (!walletPubkey) {
      setSns(null);
      setStats(null);
      setReceiptsOwned(null);
      setReceiptsOriginal(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Receipts require an AnchorWallet (for provider). If the caller doesn't
    // have one connected (read-only view of someone else), we skip the
    // receipt fetches and fall back to null. Stats + SNS work without.
    const loadAll = async () => {
      try {
        const [snsRes, statsRes] = await Promise.all([
          lookupSns(connection, walletPubkey),
          fetchPlayerStats(connection, walletPubkey),
        ]);
        if (cancelled) return;
        setSns(snsRes);
        setStats(statsRes);

        if (anchorWallet) {
          const [owned, original] = await Promise.all([
            fetchReceiptsOwned(connection, anchorWallet, walletPubkey),
            fetchReceiptsOriginal(connection, anchorWallet, walletPubkey),
          ]);
          if (cancelled) return;
          setReceiptsOwned(owned);
          setReceiptsOriginal(original);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [connection, anchorWallet, walletPubkey, reloadKey]);

  // Merge owned + original receipts into a single annotated list for display.
  // A receipt may appear in both sets (you minted it AND still own it), in
  // which case we show it once with both flags. "Transferred in" = you own
  // a receipt but you weren't the original player. "Transferred out" = you
  // were the original player but no longer own it.
  const mergedReceipts = useMemo(() => {
    if (!receiptsOwned && !receiptsOriginal) return null;
    const byPda = new Map<string, ReceiptSummary & { isOwner: boolean; isOriginal: boolean }>();
    for (const r of receiptsOwned ?? []) {
      byPda.set(r.pda, { ...r, isOwner: true, isOriginal: false });
    }
    for (const r of receiptsOriginal ?? []) {
      const existing = byPda.get(r.pda);
      if (existing) {
        existing.isOriginal = true;
      } else {
        byPda.set(r.pda, { ...r, isOwner: false, isOriginal: true });
      }
    }
    return Array.from(byPda.values()).sort((a, b) => b.mintedAt - a.mintedAt);
  }, [receiptsOwned, receiptsOriginal]);

  if (!walletPubkey) {
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>👤</div>
        <h1 style={{ fontSize: 22, marginBottom: 8, color: "#e8e8f0" }}>Connect your wallet</h1>
        <p style={{ color: "#8a8aa0", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          Your profile lives on-chain. Connect the wallet you play with to see your stats, receipts, and activity.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  const walletAddr = walletPubkey.toBase58();
  const displayName = sns ?? shortAddr(walletAddr);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px", color: "#cfcfe0" }}>
      {/* ── Identity header ───────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f1020, #1a1a3e)",
          border: "1px solid #252540",
          borderRadius: 14,
          padding: "24px 28px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #14F195, #9945FF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 800,
              color: "#0c0c14",
              flexShrink: 0,
            }}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, margin: 0, color: "#e8e8f0", fontWeight: 700 }}>
              {sns ? (
                <span>
                  {sns}
                  <span style={{ color: "#14F195", marginLeft: 6, fontSize: 14 }} title="Solana Name Service">
                    ✓
                  </span>
                </span>
              ) : (
                shortAddr(walletAddr)
              )}
            </h1>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6a6a80", marginTop: 2 }}>
              <a href={explorerAddr(walletAddr)} target="_blank" rel="noopener noreferrer" style={{ color: "#6a6a80", textDecoration: "none" }}>
                {walletAddr} ↗
              </a>
            </div>
            {!sns && isOwnProfile && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                Tip: set a{" "}
                <a href="https://sns.id" target="_blank" rel="noopener noreferrer" style={{ color: "#14F195" }}>
                  .sol domain
                </a>{" "}
                as your favorite on{" "}
                <a href="https://sns.id" target="_blank" rel="noopener noreferrer" style={{ color: "#14F195" }}>
                  sns.id
                </a>{" "}
                and it will show here automatically.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats strip ───────────────────────────────────────────────── */}
      {loading && !stats ? (
        <div style={{ padding: 20, textAlign: "center", color: "#666" }}>Loading on-chain history…</div>
      ) : error ? (
        <div style={{ padding: 16, color: "#ff6b6b", fontSize: 13 }}>{error}</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            <StatCard label="Games" value={stats?.gamesPlayed ?? 0} />
            <StatCard label="Verified" value={stats?.verifiedRuns ?? 0} accent="#ffd740" />
            <StatCard label="Receipts" value={mergedReceipts?.length ?? "—"} accent="#c99aff" />
            <StatCard label="Spent" value={stats ? `$${stats.approxSpendUsd.toFixed(2)}` : "—"} accent="#14F195" />
          </div>

          {/* ── Best scores per game ───────────────────────────────────── */}
          {stats && Object.keys(stats.bestByGame).length > 0 && (
            <Section title="Best scores">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(stats.bestByGame).map(([slug, best]) => (
                  <div
                    key={slug}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 60px 60px 30px",
                      gap: 10,
                      padding: "10px 12px",
                      background: "#0c0c14",
                      border: "1px solid #1a1a28",
                      borderRadius: 8,
                      alignItems: "center",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ color: "#e8e8f0", fontWeight: 600 }}>{gameDisplayName(slug)}</div>
                    <div style={{ textAlign: "right", color: "#14F195", fontWeight: 700, fontFamily: "monospace" }}>
                      {best.score.toLocaleString()}
                    </div>
                    <div style={{ textAlign: "right", color: best.continues === 0 ? "#ffd740" : "#888", fontSize: 11 }}>
                      {best.continues === 0 ? "1CC" : `${best.continues}×cont`}
                    </div>
                    <div style={{ textAlign: "right", color: "#888", fontSize: 11 }}>
                      {formatDuration(best.duration)}
                    </div>
                    <a
                      href={explorerTx(best.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#14F195", textDecoration: "none", textAlign: "right", fontSize: 11 }}
                    >
                      ↗
                    </a>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Receipts ────────────────────────────────────────────────── */}
          {isOwnProfile && anchorWallet ? (
            mergedReceipts && mergedReceipts.length > 0 ? (
              <Section title="Replay Receipts">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {mergedReceipts.map((r) => (
                    <div
                      key={r.pda}
                      style={{
                        padding: "10px 12px",
                        background: "#0c0c14",
                        border: "1px solid #1a1a28",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <div style={{ color: "#e8e8f0", fontWeight: 600 }}>
                          {gameDisplayName(`game-${r.gameId}`).replace("Game ", "Game #")} ·{" "}
                          <span style={{ color: "#14F195", fontFamily: "monospace" }}>{r.score.toLocaleString()}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {r.isOwner && r.isOriginal && <Badge color="#14F195">Original</Badge>}
                          {r.isOwner && !r.isOriginal && <Badge color="#4fc3f7">Collected</Badge>}
                          {!r.isOwner && r.isOriginal && <Badge color="#ff9a40">Transferred</Badge>}
                          {r.cnftWrapped && <Badge color="#9945FF">cNFT</Badge>}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <div style={{ fontSize: 10, color: "#6a6a80", fontFamily: "monospace" }}>
                          {shortAddr(r.pda)} · {r.continues > 0 ? `${r.continues} continues` : "1CC"} · {formatDuration(r.duration)}
                        </div>
                        {r.isOwner && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => {
                                setModalReceipt(r);
                                setModalMode("transfer");
                              }}
                              style={{
                                fontSize: 10,
                                padding: "3px 10px",
                                borderRadius: 4,
                                border: "1px solid #14F19540",
                                background: "#14F19515",
                                color: "#14F195",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                              title="Send this receipt to another wallet or .sol domain"
                            >
                              Transfer
                            </button>
                            <button
                              onClick={() => {
                                setModalReceipt(r);
                                setModalMode("close");
                              }}
                              disabled={r.cnftWrapped}
                              style={{
                                fontSize: 10,
                                padding: "3px 10px",
                                borderRadius: 4,
                                border: "1px solid #ff9a4040",
                                background: r.cnftWrapped ? "#252540" : "#ff9a4015",
                                color: r.cnftWrapped ? "#555" : "#ff9a40",
                                fontWeight: 700,
                                cursor: r.cnftWrapped ? "not-allowed" : "pointer",
                              }}
                              title={r.cnftWrapped ? "Wrapped as cNFT — unwrap first" : "Delete receipt and refund ~$0.33 rent"}
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            ) : mergedReceipts && mergedReceipts.length === 0 ? (
              <Section title="Replay Receipts">
                <div style={{ fontSize: 12, color: "#666", padding: "16px 12px" }}>
                  No receipts yet. Finish a game and click <strong>Claim ownership</strong> to mint your first transferable certificate.
                </div>
              </Section>
            ) : null
          ) : null}

          {/* ── Recent plays ─────────────────────────────────────────────── */}
          {stats && stats.recentPlays.length > 0 && (
            <Section title="Recent plays">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {stats.recentPlays.map((p) => (
                  <div
                    key={p.tx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 60px 60px 20px",
                      gap: 10,
                      padding: "6px 12px",
                      fontSize: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ color: "#a8a8c0" }}>{gameDisplayName(p.gameSlug)}</div>
                    <div style={{ textAlign: "right", color: "#e8e8f0", fontFamily: "monospace" }}>
                      {p.score.toLocaleString()}
                    </div>
                    <div style={{ textAlign: "right", color: "#666", fontSize: 11 }}>
                      {p.blockTime ? new Date(p.blockTime * 1000).toLocaleDateString() : ""}
                    </div>
                    <a
                      href={explorerTx(p.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#14F195", textDecoration: "none", textAlign: "right", fontSize: 11 }}
                    >
                      ↗
                    </a>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Receipt action modal */}
          {modalReceipt && (
            <ReceiptActionModal
              receipt={modalReceipt}
              mode={modalMode}
              onClose={() => setModalReceipt(null)}
              onComplete={(sig) => {
                setToast({ sig, kind: modalMode });
                setModalReceipt(null);
                setReloadKey((k) => k + 1);
              }}
            />
          )}

          {/* Success toast */}
          {toast && (
            <div
              style={{
                position: "fixed",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#0c1a12",
                border: "1px solid #14F19540",
                borderRadius: 8,
                padding: "10px 16px",
                color: "#14F195",
                fontSize: 12,
                display: "flex",
                gap: 10,
                alignItems: "center",
                zIndex: 1100,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <span>
                ✓ Receipt {toast.kind === "transfer" ? "transferred" : "closed & rent refunded"}
              </span>
              <a
                href={`https://explorer.solana.com/tx/${toast.sig}${ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#14F195", textDecoration: "underline" }}
              >
                view tx ↗
              </a>
              <button
                onClick={() => setToast(null)}
                style={{ background: "none", border: "none", color: "#14F195", cursor: "pointer", fontSize: 14 }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Empty state */}
          {stats && stats.gamesPlayed === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                background: "#0c0c14",
                border: "1px dashed #252540",
                borderRadius: 10,
                color: "#8a8aa0",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>No on-chain activity yet</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                Play{" "}
                <Link href="/arcade/cyber-snake" style={{ color: "#14F195" }}>
                  Cyber Snake
                </Link>{" "}
                and save a score to start your profile.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent = "#e8e8f0" }: { label: string; value: string | number; accent?: string }) {
  return (
    <div
      style={{
        background: "#0c0c14",
        border: "1px solid #1a1a28",
        borderRadius: 8,
        padding: "14px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#6a6a80",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginBottom: 8,
          marginTop: 0,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color,
        border: `1px solid ${color}40`,
        background: `${color}15`,
        padding: "2px 6px",
        borderRadius: 4,
        textTransform: "uppercase",
        letterSpacing: 0.8,
      }}
    >
      {children}
    </span>
  );
}
