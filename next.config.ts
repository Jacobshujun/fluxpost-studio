import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/media/crawl/:path*",
          destination: "/api/media/local/crawl/:path*",
        },
        {
          source: "/generated/:path*",
          destination: "/api/media/local/generated/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
