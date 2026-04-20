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

export default nextConfig;
