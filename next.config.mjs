/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@babylonjs/core", "@babylonjs/loaders"],
  productionBrowserSourceMaps: false, // Fix .map 404s
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/.well-known/appspecific/:path*',
        destination: '/404', // Gracefully handle 404s to avoid console noise
      },
    ]
  },
};

export default nextConfig;
