"use client";

// Profile-completion meter (LinkedIn "All-Star" pattern): progress bar + a 3-step
// checklist. Completing all three UNLOCKS sending referrals — an ethical
// feature-unlock (not withholding core value). Best-practice psychology:
// endowed progress (email is usually already ✓ so the bar starts filled),
// goal-gradient (one step left reads as "almost there"), Zeigarnik (the open
// loop nags). Celebrates at 100%. Mobile-first, one-thumb actions.

import Link from "next/link";

export default function OnboardingMeter({
  emailVerified,
  hasHandle,
  hasScore,
  onClaimName,
}: {
  emailVerified: boolean;
  hasHandle: boolean;
  hasScore: boolean;
  onClaimName: () => void;
}) {
  const steps = [
    { done: emailVerified, label: "Verify your email", node: emailVerified ? null : <span style={{ fontSize: 11, color: "#777" }}>check your inbox</span> },
    { done: hasHandle, label: "Claim a username", node: hasHandle ? null : <button onClick={onClaimName} style={cta}>Claim</button> },
    { done: hasScore, label: "Play a game & save a score", node: hasScore ? null : <Link href="/arcade" style={{ ...cta, textDecoration: "none" }}>Play</Link> },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const complete = doneCount === steps.length;

  if (complete) {
    return (
      <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(20,241,149,0.10)", border: "1px solid rgba(20,241,149,0.4)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#e8e8f0" }}>Profile complete — referrals unlocked 🔗</span>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, borderRadius: 12, background: "linear-gradient(135deg,#0c0c14,#14102a)", border: "1px solid #2a2350" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#e8e8f0" }}>Complete your profile</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#14F195", fontFamily: "monospace" }}>{pct}%</span>
      </div>

      {/* progress bar */}
      <div style={{ height: 8, borderRadius: 999, background: "#1a1a28", overflow: "hidden", marginBottom: 14 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#14F195,#22d3ee)", transition: "width 400ms ease" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, background: s.done ? "#14F195" : "transparent", color: s.done ? "#00110a" : "#666", border: s.done ? "none" : "1.5px solid #3a3a52" }}>
              {s.done ? "✓" : i + 1}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: s.done ? "#7a8a80" : "#e8e8f0", fontWeight: s.done ? 400 : 700, textDecoration: s.done ? "line-through" : "none" }}>
              {s.label}
            </span>
            {s.node}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "#8a8aa0", marginTop: 12 }}>
        Finish all three to <b style={{ color: "#b388ff" }}>unlock referrals</b> — invite friends, you both earn Credits.
      </div>
    </div>
  );
}

const cta: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, padding: "6px 14px", borderRadius: 8, border: "none",
  background: "linear-gradient(90deg,#14F195,#22d3ee)", color: "#00110a", cursor: "pointer",
  display: "inline-block", whiteSpace: "nowrap",
};
