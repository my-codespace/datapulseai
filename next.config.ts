import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@google/generative-ai', 'cheerio'],
};

export default nextConfig;
