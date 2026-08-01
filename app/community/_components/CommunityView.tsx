"use client";

import { useEffect, useState } from "react";
import { getIdentity, getCredits, type IdentityUser } from "../../../lib/identity/client";
import { buildShareUrl } from "../../../lib/arcade/referral";
import ReferrersBoard from "../../../components/arcade/ReferrersBoard";
import { glassPanel } from "../../../components/glass";

// Community & Referral — the Credits growth surface (R2: rewards = Credits, never
// $GAME). Referral link, Credits earned, referral leaderboard, social share, and a
// Sledgit-communities cross-link. Deliberately NO $GAME holder/price/growth metric.
const SHARE_TEXT = "Play Gamerplex — free arcade games, keep your scores, earn Credits. Join with my link:";
const SLEDGIT_URL = "https://www.sledgit.com";

export function CommunityView() {
  const [identity, setIdentity] = useState<IdentityUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [referrals, setReferrals] = useState<number | null>(null);
  const [hasScore, setHasScore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      const id = await getIdentity();
      if (off) return;
      setIdentity(id);
      if (id) {
        getCredits().then((c) => { if (!off) setCredits(c?.perApp.find((a) => a.app === "gamerplex")?.balance ?? c?.total ?? 0); });
        fetch(`/api/referrals/leaderboard?limit=100`)
          .then((r) => (r.ok ? r.json() : { leaderboard: [] }))
          .then((d: { leaderboard?: { userId: string; referrals: number }[] }) => {
            if (!off) setReferrals(d.leaderboard?.find((row) => row.userId === id.id)?.referrals ?? 0);
          })
          .catch(() => { if (!off) setReferrals(0); });
        fetch(`/api/scores/recent?userId=${id.id}&limit=1`)
          .then((r) => (r.ok ? r.json() : { activity: [] }))
          .then((d: { activity?: unknown[] }) => { if (!off) setHasScore((d.activity?.length ?? 0) > 0); })
          .catch(() => {});
      }
      if (!off) setLoading(false);
    })();
    return () => { off = true; };
  }, []);

  if (loading) return <Center><div style={{ textAlign: "center", color: "#8a8aa0" }}>Loading…</div></Center>;

  if (!identity) {
    return (
      <Center>
        <div style={{ ...glassPanel, borderRadius: 18, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#e8e8f0" }}>Invite friends, earn Credits</h1>
          <p style={{ color: "#a8a8c0", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
            Sign in to get your referral link. When a friend joins, <b style={{ color: "#14F195" }}>you both get 50 Credits</b>.
          </p>
          <a href="/app/profile" style={{ display: "inline-block", padding: "11px 20px", borderRadius: 10, background: "linear-gradient(90deg,#9945FF,#14F195)", color: "#00110a", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>Sign in</a>
        </div>
      </Center>
    );
  }

  const canInvite = identity.emailVerified && hasScore;
  const link = buildShareUrl("https://gamerplex.com/", identity.id);
  const enc = encodeURIComponent(`${SHARE_TEXT} ${link}`);

  return (
    <Wrap>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#e8e8f0", margin: "0 0 4px" }}>Community &amp; Referrals</h1>
      <p style={{ color: "#8a8aa0", fontSize: 13, margin: "0 0 18px" }}>Grow the player base — everyone earns Credits.</p>

      {/* Your Credits + referrals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <Stat label="Your Credits" value={credits == null ? "—" : credits.toLocaleString()} accent="#ffd740" glyph="⚡" />
        <Stat label="Friends referred" value={referrals == null ? "—" : referrals.toLocaleString()} accent="#14F195" glyph="🤝" />
      </div>

      {/* Referral link + social share */}
      <Section title="Your invite link">
        <div style={{ ...glassPanel, padding: 16, borderRadius: 16 }}>
          <p style={{ fontSize: 13, color: "#c8c8d4", lineHeight: 1.55, margin: "0 0 12px" }}>
            Share your link. When a friend signs up, <b style={{ color: "#14F195" }}>you both get 50 Credits</b> — free in-game points. No wallet, one bonus per friend.
          </p>
          {canInvite ? (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "10px 12px", color: "#cfcfe0", fontSize: 12, fontFamily: "monospace" }} />
                <button onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "linear-gradient(90deg,#14F195,#22d3ee)", color: "#00110a", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{copied ? "Copied ✓" : "Copy"}</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Share label="Share on X" color="#1d9bf0" href={`https://twitter.com/intent/tweet?text=${enc}`} />
                <Share label="Telegram" color="#2aabee" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(SHARE_TEXT)}`} />
                <Share label="WhatsApp" color="#25d366" href={`https://wa.me/?text=${enc}`} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: "#b388ff", fontWeight: 700 }}>🔒 Verify your email and save one score to unlock your invite link.</div>
          )}
        </div>
      </Section>

      {/* Referral leaderboard */}
      <Section title="Top referrers">
        <ReferrersBoard highlightUserId={identity.id} limit={15} />
      </Section>

      {/* Sledgit communities cross-link */}
      <Section title="More communities">
        <a href={SLEDGIT_URL} target="_blank" rel="noopener noreferrer" style={{ ...glassPanel, display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, textDecoration: "none" }}>
          <span style={{ fontSize: 26 }}>🃏</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", color: "#e8e8f0", fontWeight: 800, fontSize: 14 }}>Sledgit communities</span>
            <span style={{ display: "block", color: "#8a8aa0", fontSize: 12.5 }}>Collectors&apos; communities across every franchise.</span>
          </span>
          <span style={{ color: "#35e0ff", fontSize: 18 }}>↗</span>
        </a>
      </Section>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: "0 auto", padding: "8px 14px 44px", color: "#cfcfe0" }}>{children}</div>;
}
// Sparse / signed-out states: fill the fold + center so mobile doesn't show a void.
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 14px", minHeight: "72dvh", display: "flex", flexDirection: "column", justifyContent: "center", color: "#cfcfe0" }}>{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, textTransform: "uppercase", margin: "0 0 8px" }}>{title}</h2>
      {children}
    </div>
  );
}
function Stat({ label, value, accent, glyph }: { label: string; value: string; accent: string; glyph: string }) {
  return (
    <div style={{ ...glassPanel, borderRadius: 14, padding: "14px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent, fontFamily: "ui-monospace,monospace" }}>{glyph} {value}</div>
      <div style={{ fontSize: 10, color: "#8a8aa0", textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{label}</div>
    </div>
  );
}
function Share({ label, color, href }: { label: string; color: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ flex: "1 1 auto", textAlign: "center", padding: "9px 12px", borderRadius: 10, border: `1px solid ${color}55`, background: `${color}18`, color, fontSize: 12.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>{label}</a>
  );
}
