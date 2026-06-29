import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // NOTE: Do NOT set output: 'standalone' — Vercel manages its own output format.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
