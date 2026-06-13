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
    posthog.register({ product: "gamerplex", surface: "gamerplex-com" });
    (window as any).__posthog_initialized = true;
  }, []);
  return <>{children}</>;
}
