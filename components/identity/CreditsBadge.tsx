'use client';

// Shows the signed-in user's UNIFIED Credits balance (the off-chain engagement
// economy — NOT scores, NOT $GAME). Renders the reserved Credits glyph (green
// hexagon). Renders nothing when anonymous.

import { useEffect, useState } from 'react';

import { useIdentity } from '../../lib/identity/useIdentity';
import { getCredits } from '../../lib/identity/client';
import { CurrencyPill } from './CurrencyPill';

const cacheKey = (app: string) => `gpx.credits.${app}`;

// Credits are PER-APP (Flipball ≠ Gamerplex). This badge shows THIS app's
// spendable balance. Cross-play earns a small daily boost into it.
export function CreditsBadge({ app = 'gamerplex' }: { app?: string }) {
  const { isSignedIn } = useIdentity();
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setTotal(null);
      return;
    }
    // Instant: last-known cached balance (kills the "—"/blank flash), then the
    // network revalidates. Also re-syncs when the native shell reports the tab
    // regained focus (e.g. after earning Credits in another tab).
    try {
      const v = window.localStorage.getItem(cacheKey(app));
      if (v != null) setTotal(Number(v));
    } catch {
      /* storage blocked */
    }
    let alive = true;
    const load = () =>
      void getCredits().then((c) => {
        if (!alive) return;
        const here = c?.perApp.find((p) => p.app === app)?.balance ?? 0;
        setTotal(here);
        try {
          window.localStorage.setItem(cacheKey(app), String(here));
        } catch {
          /* storage blocked */
        }
      });
    load();
    const onFocus = () => load();
    window.addEventListener('gamerplex:focus', onFocus);
    return () => {
      alive = false;
      window.removeEventListener('gamerplex:focus', onFocus);
    };
  }, [isSignedIn, app]);

  if (!isSignedIn || total === null) return null;

  return <CurrencyPill kind="credits" value={total} style={{ fontSize: 12 }} />;
}
