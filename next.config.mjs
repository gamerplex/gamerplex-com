/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@babylonjs/core", "@babylonjs/loaders"],
  productionBrowserSourceMaps: false, // Fix .map 404s
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    config.resolve.alias = {
        ...config.resolve.alias,
        '@babylonjs/core': path.resolve(__dirname, 'node_modules/@babylonjs/core'),
        '@babylonjs/loaders': path.resolve(__dirname, 'node_modules/@babylonjs/loaders'),
    };
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
