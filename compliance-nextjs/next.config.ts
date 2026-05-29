import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // NOTE: Do NOT set output: 'standalone' — Vercel manages its own output format.
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
