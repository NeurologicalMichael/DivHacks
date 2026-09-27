import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  ...(process.env.GITHUB_PAGES === "true"
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
        basePath,
        assetPrefix: basePath || undefined,
      }
    : {}),
};

export default nextConfig;
