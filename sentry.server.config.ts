import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "production" : "development",
  tracesSampleRate: 0.05,
  debug: false,
});
