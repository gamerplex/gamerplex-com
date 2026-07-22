'use client';

// Daily Goal ring — Duolingo's daily-XP ring, the same-day "did I do enough today?"
// hook that sits between the Streak (did I show up) and the League (weekly race). Fills
// as you earn Credits in ANY game; completes at the goal. Read-only — the reward is the
// streak + the ring itself, so this never grants Credits (money line untouched). Hidden
// when signed out (the endpoint is session-authed).

import { useEffect, useState } from 'react';

type Daily = { goal: number; earned: number; complete: boolean };

export function DailyGoalWidget() {
  const [d, setD] = useState<Daily | null>(null);

  useEffect(() => {
    fetch('/api/daily', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Daily | null) => setD(j && typeof j.goal === 'number' ? j : null))
      .catch(() => setD(null));
  }, []);

  if (!d) return null;

  const pct = Math.max(0, Math.min(1, d.earned / d.goal));
  const R = 26;
  const C = 2 * Math.PI * R;
  const dash = C * pct;

  return (
    <div style={wrap}>
      <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx="32" cy="32" r={R} fill="none"
            stroke={d.complete ? '#14F195' : '#ffb84d'} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`} transform="rotate(-90 32 32)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div style={ringLabel}>{d.complete ? '✓' : `${Math.round(pct * 100)}%`}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 900, color: '#fff', fontSize: 14 }}>
          {d.complete ? '🔥 Daily goal complete!' : 'Today’s goal'}
        </div>
        <div style={{ fontSize: 12.5, color: '#c9bff0', marginTop: 2 }}>
          {d.complete
            ? 'Nice — you kept your streak alive. Come back tomorrow.'
            : `Earn ${d.goal} Credits today — ${d.earned}/${d.goal} so far.`}
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 460, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14,
  background: 'linear-gradient(180deg,rgba(255,184,77,0.10),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,184,77,0.30)', borderRadius: 16, padding: '12px 16px',
};
const ringLabel: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: 'ui-monospace,monospace',
};
