"use client";

// Fires the Credits referral reward ONCE the referred user is signed in AND a referrer
// was captured from the challenge link (sessionStorage, set by pickReferrerFromUrl).
// SERVER-authoritative + idempotent per (referrer, referred): this only NAMES the referrer;
// the amounts, the by-wallet lookup, and the mint all live in /api/credits/referral. Safe to
// re-fire — the server dedupes. We still guard per-(referrer,user) client-side to avoid spam.

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useIdentity } from "../../lib/identity/useIdentity";
import { getStoredReferrerInfo } from "../../lib/arcade/referral";
import { claimReferral } from "../../lib/identity/client";

export default function ReferralClaimer() {
  const { publicKey } = useWallet();
  const { user, isSignedIn } = useIdentity();
  const claimedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !user) return;
    const info = getStoredReferrerInfo(publicKey ?? null);
    if (!info) return;
    const referrer = info.pubkey.toBase58();
    const guard = `${user.id}:${referrer}`;
    if (claimedRef.current === guard) return;
    claimedRef.current = guard;
    void claimReferral(referrer);
  }, [isSignedIn, user, publicKey]);

  return null;
}
