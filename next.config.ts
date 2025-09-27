import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* CI stricte: activer les erreurs ESLint et TypeScript au build */
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
