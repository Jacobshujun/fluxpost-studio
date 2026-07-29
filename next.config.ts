import type { NextConfig } from "next";

const standaloneBuild = process.env.FLUXPOST_STANDALONE_BUILD === "1";

const nextConfig: NextConfig = {
  output: standaloneBuild ? "standalone" : undefined,
  outputFileTracingExcludes: {
    "*": ["public/generated/**/*", "public/media/**/*", "data/**/*", "test-artifacts/**/*"],
  },
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
