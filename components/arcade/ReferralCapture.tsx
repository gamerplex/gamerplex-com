"use client";

import { useEffect } from "react";
import { pickReferrerFromUrl } from "../../lib/arcade/referral";

export default function ReferralCapture() {
  useEffect(() => {
    pickReferrerFromUrl(null).catch(() => {});
  }, []);
  return null;
}
