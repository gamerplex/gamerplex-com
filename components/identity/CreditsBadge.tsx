'use client';

// Shows the signed-in user's UNIFIED Credits balance (the off-chain engagement
// economy — NOT scores, NOT $GAME). Renders nothing when anonymous.

import { useEffect, useState } from 'react';

import { useIdentity } from '../../lib/identity/useIdentity';
import { getCredits } from '../../lib/identity/client';

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
    let alive = true;
    void getCredits().then((c) => {
      if (alive) {
        const here = c?.perApp.find((p) => p.app === app)?.balance ?? 0;
        setTotal(here);
      }
    });
    return () => {
      alive = false;
    };
  }, [isSignedIn, app]);

  if (!isSignedIn || total === null) return null;

  return (
    <span
      data-testid="credits-badge"
      title="Your unified Credits — engagement points across Gamerplex apps"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        fontWeight: 700,
        color: '#ffd25a',
        background: '#1a1a2e',
        border: '1px solid #252540',
        borderRadius: 999,
        padding: '4px 10px',
      }}
    >
      ⚡ {total.toLocaleString()}
    </span>
  );
}
