"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://ph001.gamerplex.com";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!PH_KEY || typeof window === "undefined") return;
    if ((window as any).__posthog_initialized) return;
    posthog.init(PH_KEY, {
      api_host: PH_HOST,
      defaults: "2026-05-30",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
    });
    posthog.register({
      product: "arcade",
      surface: "gamerplex-com",
      // Segment devnet test noise from mainnet metrics (one PostHog project).
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet",
      // Tag automated/E2E traffic (Playwright sets navigator.webdriver) so it's filterable.
      ...(typeof navigator !== "undefined" && navigator.webdriver ? { test_traffic: true } : {}),
    });
    (window as any).__posthog_initialized = true;
  }, []);
  return <>{children}</>;
}
