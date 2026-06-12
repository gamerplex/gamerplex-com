import posthog from "posthog-js";

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, properties);
  } catch {}
}

export function identifyWallet(walletAddress: string | null | undefined) {
  if (typeof window === "undefined" || !walletAddress) return;
  try {
    posthog.identify(walletAddress);
  } catch {}
}
