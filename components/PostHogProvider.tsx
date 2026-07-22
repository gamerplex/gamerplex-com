"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://ph001.gamerplex.com";

// ── Global ingestion cap (authoritative anti-abuse) ─────────────────────────
// Hard ceiling on EVERY event leaving the browser — named track() calls AND
// PostHog autocapture/pageviews — so a bot looping "play" (or clicking wildly)
// can't blow up our self-hosted, free-tier PostHog. At most MAX_EVENTS per
// WINDOW_MS per page session; excess is dropped. The first drop each window is
// rewritten into ONE `client_rate_limited` breadcrumb so abuse stays visible.
const CAP_WINDOW_MS = 10_000;
const CAP_MAX_EVENTS = 60; // 6/s sustained — generous for humans, lethal to loops
let capWindowStart = 0;
let capCount = 0;
let capNotified = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ingestionCap(ev: any): any {
  if (!ev) return ev;
  if (ev.event === "client_rate_limited") return ev; // never drop the breadcrumb
  const now = Date.now();
  if (now - capWindowStart > CAP_WINDOW_MS) {
    capWindowStart = now;
    capCount = 0;
    capNotified = false;
  }
  capCount++;
  if (capCount > CAP_MAX_EVENTS) {
    if (!capNotified) {
      capNotified = true;
      // Rewrite the first over-cap event into a single visible breadcrumb.
      return { ...ev, event: "client_rate_limited", properties: { ...ev.properties, dropped_from: ev.event, cap: CAP_MAX_EVENTS, window_ms: CAP_WINDOW_MS } };
    }
    return null; // drop the rest this window
  }
  return ev;
}

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
      before_send: ingestionCap,
    });
    posthog.register({
      product: "arcade",
      surface: "gamerplex-com",
      // Segment devnet test noise from mainnet metrics (one PostHog project).
      network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet",
      // Tag automated/E2E traffic (Playwright sets navigator.webdriver) so it's filterable.
      ...(typeof navigator !== "undefined" && navigator.webdriver ? { test_traffic: true } : {}),
    });
    (window as any).__posthog_initialized = true;
  }, []);
  return <>{children}</>;
}
