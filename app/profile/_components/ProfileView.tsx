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
import { getIdentity, getCredits, type IdentityUser } from "../../../lib/identity/client";
import EmailLoginModal from "../../../components/arcade/EmailLoginModal";
import ClaimHandleModal from "../../../components/arcade/ClaimHandleModal";
import ReferrersBoard from "../../../components/arcade/ReferrersBoard";
import LinkWalletButton from "../../../components/identity/LinkWalletButton";
import OnboardingMeter from "../../../components/arcade/OnboardingMeter";
import { glassPanel, glassInset } from "../../../components/glass";
import { buildShareUrl } from "../../../lib/arcade/referral";
import { lockHandleOnChain, HANDLE_ONCHAIN_ENABLED } from "../../../lib/arcade/lockHandle";

// Web2 leaderboard game set (matches app/leaderboard). Used to pull the signed-in
// player's best-per-game from the free web2 board — no wallet required.
const WEB2_GAMES = [
  { id: "cyber-snake", label: "Cyber Snake", emoji: "🐍" },
  { id: "magic-chess", label: "Magic Chess", emoji: "♟️" },
  { id: "blockwords", label: "Blockwords", emoji: "📝" },
  { id: "flipball", label: "Flipball", emoji: "🎯" },
];
type Web2Best = { id: string; label: string; emoji: string; score: number; verified: boolean };
type Activity = { gameId: string; score: number; verified: boolean; txSig: string | null; at: string };

const gameMeta = (gameId: string) => WEB2_GAMES.find((g) => g.id === gameId) ?? { emoji: "🎮", label: gameId };
const relTime = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const EXPLORER_SUFFIX = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;
const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${EXPLORER_SUFFIX}`;
const explorerAddr = (addr: string) => `https://explorer.solana.com/address/${addr}${EXPLORER_SUFFIX}`;

/** Shared profile view. Accepts a wallet-like state: connected wallet for /profile,
 *  or a read-only pubkey for /profile/[wallet]. */
export function ProfileView({
  walletPubkey,
  isOwnProfile,
  appMode = false,
}: {
  walletPubkey: PublicKey | null;
  isOwnProfile: boolean;
  appMode?: boolean;
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
  const [showLogin, setShowLogin] = useState(false);
  const [modalReceipt, setModalReceipt] = useState<(ReceiptSummary & { isOwner: boolean; isOriginal: boolean }) | null>(null);
  const [modalMode, setModalMode] = useState<"transfer" | "close">("transfer");
  const [toast, setToast] = useState<{ sig: string; kind: "transfer" | "close" } | null>(null);

  // Web2-first layer — email identity + Credits + free-board best scores. No
  // wallet required; loads for your own profile regardless of wallet state.
  const [identity, setIdentity] = useState<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [web2Bests, setWeb2Bests] = useState<Web2Best[] | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [web2Loading, setWeb2Loading] = useState(isOwnProfile);
  const [showClaim, setShowClaim] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState<string | null>(null);

  const doLockOnChain = async () => {
    if (!anchorWallet) return;
    setLockBusy(true);
    setLockErr(null);
    const res = await lockHandleOnChain(connection, anchorWallet);
    setLockBusy(false);
    if (res.ok) await refreshIdentity();
    else setLockErr(res.error === "promotion_unverified" ? "That name is already claimed on-chain — pick another." : "Couldn’t lock on-chain — try again.");
  };

  const refreshIdentity = async () => {
    setShowClaim(false);
    const id = await getIdentity();
    setIdentity(id);
  };

  useEffect(() => {
    if (!isOwnProfile) return;
    let cancelled = false;
    (async () => {
      const id = await getIdentity();
      if (cancelled) return;
      setIdentity(id);
      if (id) {
        getCredits().then((c) => {
          if (!cancelled) setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0);
        });
        const bests = await Promise.all(
          WEB2_GAMES.map(async (g) => {
            try {
              const r = await fetch(`/api/scores/leaderboard?gameId=${g.id}&limit=100`);
              if (!r.ok) return null;
              const { leaderboard } = await r.json();
              const mine = (leaderboard as { userId: string; score: number; verified?: boolean }[]).find((row) => row.userId === id.id);
              return mine ? { id: g.id, label: g.label, emoji: g.emoji, score: mine.score, verified: !!mine.verified } : null;
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) setWeb2Bests(bests.filter((b): b is Web2Best => b !== null));
        fetch(`/api/scores/recent?userId=${id.id}&limit=15`)
          .then((r) => (r.ok ? r.json() : { activity: [] }))
          .then((d: { activity?: Activity[] }) => { if (!cancelled) setActivity(d.activity ?? []); })
          .catch(() => { if (!cancelled) setActivity([]); });
      }
      if (!cancelled) setWeb2Loading(false);
    })();
    return () => { cancelled = true; };
  }, [isOwnProfile, reloadKey]);

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

  // No wallet connected. Web2-first: your profile is your email identity —
  // handle, Credits, and free-board scores — with wallet offered as an OPTIONAL
  // upgrade. Only /profile/[wallet] (public, on-chain) still needs a pubkey.
  if (!walletPubkey) {
    if (!isOwnProfile) {
      return (
        <div style={{ maxWidth: 640, margin: "80px auto", padding: 24, textAlign: "center", color: "#8a8aa0" }}>
          This profile is unavailable.
        </div>
      );
    }
    if (web2Loading) {
      // Needs its own h1: every other branch has one, so while this renders the page
      // has no heading at all — which is what the UX matrix caught on /profile.
      // #666 was also 3.39:1 on this ground; #7a7a7a is 4.54:1.
      return (
        <div style={{ maxWidth: 640, margin: "80px auto", padding: 24, textAlign: "center", color: "#7a7a7a" }}>
          <h1 style={{ fontSize: 22, margin: 0, color: "#e8e8f0", fontWeight: 700 }}>Your profile</h1>
          <p style={{ marginTop: 8 }}>Loading your profile…</p>
        </div>
      );
    }
    if (!identity) {
      return (
        <div style={{ maxWidth: 520, margin: "72px auto", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👤</div>
          <h1 style={{ fontSize: 22, marginBottom: 8, color: "#e8e8f0" }}>Sign in to start your profile</h1>
          <p style={{ color: "#8a8aa0", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            Just your email — keep your scores, rank, and Credits across every game. No wallet needed.
          </p>
          <button onClick={() => setShowLogin(true)} style={{ display: "inline-block", padding: "12px 22px", borderRadius: 10, background: "linear-gradient(90deg,#9945FF,#14F195)", color: "#00110a", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer" }}>
            Sign in with email
          </button>
          {/* Ecosystem standard: email is the primary (walletless) entry point;
              wallet is the optional web3 upgrade — never framed as an equal alternative. */}
          <div className="gx-web-only" style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", color: "#6a6385", fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ color: "#8a8aa0", fontWeight: 700 }}>🔒 Optional · add a wallet later</div>
            <div>Keep your best runs <span style={{ color: "#8a8aa0" }}>on-chain forever</span> · pay with $GAME and <span style={{ color: "#14F195", fontWeight: 700 }}>save 20%</span></div>
          </div>
          <div className="gx-web-only" style={{ marginTop: 10, opacity: 0.8 }}><WalletMultiButton /></div>
          <EmailLoginModal open={showLogin} onClose={() => { setShowLogin(false); setReloadKey((k) => k + 1); }} />
        </div>
      );
    }

    const name = identity.handle ?? identity.email?.split("@")[0] ?? "Player";
    const hasScore = (web2Bests?.length ?? 0) > 0;
    // Referral eligibility = proof-of-life (verified email + a saved score). A
    // handle is NOT required — it's vanity/onboarding, and the link uses the
    // stable userId anyway (handles are mutable, so a handle link would break).
    const canInvite = identity.emailVerified && hasScore;
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 0 24px", color: "#cfcfe0" }}>
        {/* ── Web2 identity header ─────────────────────────────────────── */}
        <div style={{ ...glassPanel, borderRadius: 20, padding: "24px 28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #14F195, #9945FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: "#0c0c14", flexShrink: 0 }}>
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 24, margin: 0, color: "#e8e8f0", fontWeight: 700 }}>
                {identity.handle ? `@${identity.handle}` : name}
              </h1>
              {identity.email && (
                <div title="Your sign-in email (can't be changed here)" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, maxWidth: 340, padding: "7px 11px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "#8a8aa0", fontSize: 12.5, cursor: "not-allowed" }}>
                  <span aria-hidden>✉️</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{identity.email}</span>
                  <span aria-hidden style={{ fontSize: 11, opacity: 0.7 }}>🔒</span>
                </div>
              )}
              <div style={{ fontSize: 12, color: "#8a8aa0", marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {identity.emailVerified && <span style={{ color: "#14F195" }}>✓ email verified</span>}
                {credits != null && <span style={{ color: "#ffd740", fontWeight: 700 }}>⚡ {credits.toLocaleString()} Credits</span>}
                {/* Rename: free once/24h, else Credits. Hidden once on-chain (rename via wallet then). */}
                {identity.handle && !identity.handleOnChain && (
                  <button onClick={() => setShowClaim(true)} style={{ background: "none", border: "none", color: "#b388ff", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    change name
                  </button>
                )}
                {identity.handleOnChain && <span style={{ color: "#9945FF", fontWeight: 700 }}>🔒 on-chain</span>}
              </div>
              {!identity.handle && (
                <button
                  onClick={() => setShowClaim(true)}
                  style={{ marginTop: 10, padding: "9px 16px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#14F195,#22d3ee)", color: "#00110a", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                >
                  🟡 Claim your username
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Onboarding meter (self-retires to a badge at 100%) ───────── */}
        <div style={{ marginBottom: 20 }}>
          <OnboardingMeter
            emailVerified={identity.emailVerified}
            hasHandle={!!identity.handle}
            hasScore={hasScore}
            onClaimName={() => setShowClaim(true)}
          />
        </div>

        {/* ── Web2 best scores ─────────────────────────────────────────── */}
        <Section title="Your best scores">
          {web2Bests && web2Bests.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {web2Bests.map((b) => (
                <div key={b.id} style={{ ...glassInset, display: "grid", gridTemplateColumns: "1fr 90px 70px", gap: 10, padding: "10px 12px", borderRadius: 10, alignItems: "center", fontSize: 13 }}>
                  <div style={{ color: "#e8e8f0", fontWeight: 600 }}>{b.emoji} {b.label}</div>
                  <div style={{ textAlign: "right", color: "#14F195", fontWeight: 700, fontFamily: "monospace" }}>{b.score.toLocaleString()}</div>
                  <div style={{ textAlign: "right", fontSize: 11, color: b.verified ? "#ffd740" : "#666" }}>{b.verified ? "✓ verified" : "web2"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#c8c8d4", padding: "16px 12px", background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🎮</div>
              No scores yet.{" "}
              {appMode ? (
                "Play a game to set your first best."
              ) : (
                <>
                  <Link href="/#featured" style={{ color: "#14F195" }}>Pick a game</Link> and set your first best.
                </>
              )}
            </div>
          )}
        </Section>

        {/* ── Recent activity (every run, newest first) ────────────────── */}
        {activity && activity.length > 0 && (
          <Section title="Recent activity">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activity.map((a, i) => {
                const m = gameMeta(a.gameId);
                return (
                  <div key={`${a.at}-${i}`} style={{ ...glassInset, display: "grid", gridTemplateColumns: "1fr 80px 74px", gap: 10, padding: "9px 12px", borderRadius: 10, alignItems: "center", fontSize: 12.5 }}>
                    <div style={{ color: "#e8e8f0", fontWeight: 600 }}>{m.emoji} {m.label} <span style={{ color: "#8a80b0", fontWeight: 500 }}>· {relTime(a.at)}</span></div>
                    <div style={{ textAlign: "right", color: "#14F195", fontWeight: 700, fontFamily: "monospace" }}>{a.score.toLocaleString()}</div>
                    <div style={{ textAlign: "right", fontSize: 11, color: a.verified ? "#ffd740" : "#666" }}>{a.verified ? "✓ on-chain" : "web2"}</div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Invite friends (Credits referral) ───────────────────────── */}
        <Section title="Invite friends · earn Credits">
          <div style={{ ...glassPanel, padding: 16, borderRadius: 16 }}>
            <div style={{ fontSize: 13, color: "#c8c8d4", lineHeight: 1.55, marginBottom: 12 }}>
              Share your link. When a friend signs up, <b style={{ color: "#14F195" }}>you both get 50 Credits</b> — free in-game points. No wallet, no catch, one bonus per friend.
            </div>
            {canInvite ? (() => {
              const link = buildShareUrl("https://gamerplex.com/", identity.id);
              return (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "10px 12px", color: "#cfcfe0", fontSize: 12, fontFamily: "monospace" }} />
                  <button
                    onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "linear-gradient(90deg,#14F195,#22d3ee)", color: "#00110a", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              );
            })() : (
              <div style={{ fontSize: 12.5, color: "#b388ff", fontWeight: 700 }}>
                🔒 Verify your email and save one score to unlock your invite link.
              </div>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <ReferrersBoard highlightUserId={identity.id} limit={10} />
          </div>
        </Section>

        {/* ── Optional web3 upgrade ────────────────────────────────────── */}
        <Section title="Go on-chain (optional)">
          <div className="gx-web-only" style={{ ...glassPanel, padding: "18px 16px", borderRadius: 16 }}>
            <div style={{ fontSize: 14, color: "#e8e8f0", fontWeight: 700, marginBottom: 6 }}>Connect a wallet to unlock:</div>
            <ul style={{ margin: "0 0 14px", paddingLeft: 18, color: "#a8a8c0", fontSize: 13, lineHeight: 1.7 }}>
              <li>🔒 <strong>Verified</strong> scores — provable, permanent on Solana</li>
              <li>🎟️ Transferable <strong>replay receipts</strong> you own</li>
              <li>💠 Pay with SOL / USDC / $GAME</li>
            </ul>
            <WalletMultiButton />
            <div style={{ marginTop: 12 }}><LinkWalletButton /></div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 10 }}>Your email scores stay yours either way — connecting just adds the on-chain layer.</div>
          </div>
        </Section>

        <ClaimHandleModal open={showClaim} onClose={() => setShowClaim(false)} onClaimed={refreshIdentity} />
      </div>
    );
  }

  const walletAddr = walletPubkey.toBase58();
  const displayName = sns ?? shortAddr(walletAddr);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 0 24px", color: "#cfcfe0" }}>
      {/* ── Identity header ───────────────────────────────────────────── */}
      <div
        style={{
          ...glassPanel,
          borderRadius: 20,
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
            {isOwnProfile && credits != null && (
              <div style={{ fontSize: 12, color: "#ffd740", fontWeight: 700, marginTop: 6 }}>⚡ {credits.toLocaleString()} Credits</div>
            )}
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

      {/* ── Lock name on-chain (flag-gated until the promote endpoints deploy) ── */}
      {HANDLE_ONCHAIN_ENABLED && isOwnProfile && anchorWallet && identity?.handle && !identity.handleOnChain && (
        <div style={{ ...glassPanel, borderRadius: 16, padding: "16px 18px", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#e8e8f0" }}>🔒 Lock @{identity.handle} on-chain</div>
          <div style={{ fontSize: 12.5, color: "#c8c8d4", marginTop: 4, lineHeight: 1.5 }}>
            Save your name permanently to your on-chain profile — provably yours, and it can’t be reassigned. One signature + a small rent.
          </div>
          {lockErr && <div style={{ fontSize: 12, color: "#ff6b6b", marginTop: 8 }}>{lockErr}</div>}
          <button
            onClick={doLockOnChain}
            disabled={lockBusy}
            style={{ marginTop: 12, padding: "10px 18px", borderRadius: 999, border: "none", background: "linear-gradient(100deg,#9945ff,#14f195)", color: "#04120b", fontWeight: 900, fontSize: 13, cursor: lockBusy ? "default" : "pointer", opacity: lockBusy ? 0.7 : 1 }}
          >
            {lockBusy ? "Locking…" : "Lock on-chain"}
          </button>
        </div>
      )}

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
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10,
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
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 10,
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
                background: "rgba(255,255,255,0.04)",
                border: "1px dashed rgba(255,255,255,0.2)",
                borderRadius: 12,
                color: "#c8c8d4",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>No on-chain activity yet</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                Play{" "}
                <Link href="/play/cyber-snake?mode=arcade" style={{ color: "#14F195" }}>
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
        ...glassInset,
        borderRadius: 12,
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
          color: "rgba(255,255,255,0.6)",
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
