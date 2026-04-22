import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@babylonjs/core", "@babylonjs/loaders"],
  productionBrowserSourceMaps: false,
  serverExternalPackages: [
    "bigint-buffer",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        url: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/.well-known/appspecific/:path*',
        destination: '/404',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/.well-known/:path*',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org + project — set SENTRY_ORG and SENTRY_PROJECT in CI or .env.local
  org: process.env.SENTRY_ORG || "gamerplex",
  project: process.env.SENTRY_PROJECT || "gamerplex-frontend",
  // Upload source maps in CI only (SENTRY_AUTH_TOKEN must be set)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Don't widen bundle size by embedding source maps in the client build
  widenClientFileUpload: false,
  // Disable automatic instrumentation of server actions / route handlers
  // to avoid wrapping overhead on edge functions (geofence middleware)
  autoInstrumentServerFunctions: false,
  // Tree-shake Sentry logger from client bundle in production
  disableLogger: true,
});
