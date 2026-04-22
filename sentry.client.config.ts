import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "production" : "development",
  // Capture 100% of errors in all environments. Adjust traces to 0.1 on mainnet
  // once volume grows to avoid quota burn.
  tracesSampleRate: 0.05,
  // Only send errors — no performance tracing by default (saves quota).
  debug: false,
});
