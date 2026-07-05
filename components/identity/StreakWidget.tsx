'use client';

// Daily-streak retention loop for the homepage. Come back each day, claim +5
// Credits, keep the flame alive. CREDITS ONLY (R2) — never $GAME.
//
// Integrity: the streak COUNT is a localStorage motivator (cosmetic). The actual
// Credits are awarded SERVER-side and deduped by a date refId (earnCredits →
// /api/credits/earn), so clearing localStorage can reset your flame but can never
// double-claim Credits — max +5/day is enforced on the server.

import { useEffect, useState } from 'react';

import { useIdentity } from '../../lib/identity/useIdentity';
import { earnCredits } from '../../lib/identity/client';
import { track } from '../../lib/analytics';

const STREAK_KEY = 'gpx.home.streak.v1';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayYmd(): string {
  return ymd(new Date());
}
function yesterdayYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

type StreakState = { lastClaimYmd: string | null; streak: number };

function load(): StreakState {
  if (typeof window === 'undefined') return { lastClaimYmd: null, streak: 0 };
  try {
    const raw = window.localStorage.getItem(STREAK_KEY);
    if (!raw) return { lastClaimYmd: null, streak: 0 };
    const p = JSON.parse(raw) as StreakState;
    return { lastClaimYmd: p.lastClaimYmd ?? null, streak: p.streak ?? 0 };
  } catch {
    return { lastClaimYmd: null, streak: 0 };
  }
}
function save(s: StreakState) {
  try {
    window.localStorage.setItem(STREAK_KEY, JSON.stringify(s));
  } catch {}
}

export function StreakWidget() {
  const { isSignedIn } = useIdentity();
  const [state, setState] = useState<StreakState>({ lastClaimYmd: null, streak: 0 });
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

  useEffect(() => {
    setState(load());
  }, []);

  if (!isSignedIn) return null;

  const today = todayYmd();
  // A streak is only "alive" if the last claim was today or yesterday; older = broken.
  const alive = state.lastClaimYmd === today || state.lastClaimYmd === yesterdayYmd();
  const shownStreak = alive ? state.streak : 0;
  const claimedToday = state.lastClaimYmd === today;

  async function claim() {
    if (claiming || claimedToday) return;
    setClaiming(true);
    const bal = await earnCredits('daily_streak', today); // server dedups by date
    setClaiming(false);
    if (bal === null) return; // network/failed — leave state, they can retry
    const nextStreak = state.lastClaimYmd === yesterdayYmd() ? state.streak + 1 : 1;
    const next = { lastClaimYmd: today, streak: nextStreak };
    save(next);
    setState(next);
    setJustClaimed(true);
    track('streak_claimed', { streak: nextStreak });
  }

  return (
    <div className="streak-widget" data-claimed={claimedToday ? 'true' : 'false'}>
      <div className="streak-flame">
        <span className="streak-fire" aria-hidden="true">🔥</span>
        <span className="streak-count">{shownStreak}</span>
        <span className="streak-label">day{shownStreak === 1 ? '' : 's'}</span>
      </div>
      {claimedToday ? (
        <div className="streak-done">
          <b>{justClaimed ? '+5 ⚡ claimed!' : '✓ Claimed today'}</b>
          <span>Come back tomorrow for day {shownStreak + 1}</span>
        </div>
      ) : (
        <button type="button" className="streak-claim" onClick={claim} disabled={claiming}>
          {claiming ? 'Claiming…' : 'Claim +5 ⚡ Credits'}
        </button>
      )}
    </div>
  );
}
