"use client";

import { useEffect } from "react";
import { pickReferrerFromUrl } from "../../lib/arcade/referral";

// Mount-only client component that captures ?referrer=/?sig= from the
// landing URL into sessionStorage. Self-referral check runs again at
// read-time (when wallet is connected). Safe to include in the root
// layout — runs once per app mount.

export default function ReferralCapture() {
  useEffect(() => {
    pickReferrerFromUrl(null).catch(() => {});
  }, []);
  return null;
}
