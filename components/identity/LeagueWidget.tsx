'use client';

// This Week's League — the cross-game weekly competition (Duolingo's #1 DAU driver).
// Ranked by CREDITS EARNED this week (comparable across every game). Resets weekly.
// Top of the board promotes; competition drives the daily return. Credits only (R2).

import { useEffect, useRef, useState } from 'react';

import { track } from '../../lib/analytics';
import { useIdentity } from '../../lib/identity/useIdentity';

type Row = { rank: number; userId: string; handle: string | null; xp: number };

// Days until the current week (Mon-anchored, like date_trunc('week')) rolls over.
function daysToReset(): number {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  return 7 - dow;
}

export function LeagueWidget() {
  const { user } = useIdentity();
  const [rows, setRows] = useState<Row[] | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    fetch('/api/league/standings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { league: [] }))
      .then((d: { league?: Row[] }) => setRows(d.league ?? []))
      .catch(() => setRows([]));
  }, []);

  // measure league engagement: that it rendered + the viewer's own rank (once).
  useEffect(() => {
    if (tracked.current || !rows || rows.length === 0) return;
    tracked.current = true;
    const myRank = user ? rows.find((r) => r.userId === user.id)?.rank ?? null : null;
    track('league_viewed', { players: rows.length, rank: myRank });
  }, [rows, user]);

  if (!rows || rows.length === 0) return null;

  const mine = user ? rows.find((r) => r.userId === user.id) : undefined;
  const top = rows.slice(0, 8);

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={{ fontWeight: 900, color: '#fff', fontSize: 14 }}>🏆 This Week&apos;s League</span>
        <span style={{ fontSize: 11.5, color: '#b6a8e0' }}>resets in {daysToReset()}d</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {top.map((r) => {
          const me = mine && r.userId === mine.userId;
          return (
            <div key={r.userId} style={{ ...row, ...(me ? meRow : {}), ...(r.rank <= 3 ? {} : {}) }}>
              <span style={{ width: 26, textAlign: 'center', fontWeight: 800, color: medal(r.rank) }}>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: me ? 800 : 600 }}>
                {r.handle ? `@${r.handle}` : 'player'}{me ? ' · you' : ''}
              </span>
              <span style={{ color: '#14F195', fontWeight: 800, fontFamily: 'ui-monospace,monospace' }}>{r.xp.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      {mine && mine.rank > 8 && (
        <div style={{ ...row, ...meRow, marginTop: 6 }}>
          <span style={{ width: 26, textAlign: 'center', fontWeight: 800 }}>{mine.rank}</span>
          <span style={{ flex: 1, fontWeight: 800 }}>{mine.handle ? `@${mine.handle}` : 'you'} · you</span>
          <span style={{ color: '#14F195', fontWeight: 800, fontFamily: 'ui-monospace,monospace' }}>{mine.xp.toLocaleString()}</span>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#8a80b0', marginTop: 8, textAlign: 'center' }}>Earn Credits in any game to climb — top players promote next week.</div>
    </div>
  );
}

const medal = (rank: number) => (rank === 1 ? '#ffd740' : rank === 2 ? '#cfd8dc' : rank === 3 ? '#e0a86a' : '#8a80b0');

const wrap: React.CSSProperties = {
  maxWidth: 460, margin: '0 auto', background: 'linear-gradient(180deg,rgba(153,69,255,0.12),rgba(255,255,255,0.02))',
  border: '1px solid rgba(153,69,255,0.34)', borderRadius: 16, padding: '14px 16px',
};
const head: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e8e2ff', padding: '5px 8px', borderRadius: 8 };
const meRow: React.CSSProperties = { background: 'rgba(20,241,149,0.12)', border: '1px solid rgba(20,241,149,0.3)' };
