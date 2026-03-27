/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@babylonjs/core", "@babylonjs/loaders"],
  productionBrowserSourceMaps: false,
  serverExternalPackages: [
    "@solana/web3.js",
    "@solana/spl-token",
    "bigint-buffer",
  ],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/.well-known/appspecific/:path*',
        destination: '/404',
      },
    ]
  },
};

export default nextConfig;
