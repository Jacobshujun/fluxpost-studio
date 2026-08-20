import type { NextConfig } from "next";

const standaloneBuild = process.env.FLUXPOST_STANDALONE_BUILD === "1";
const localBuildSlots = new Set([".next-local-a", ".next-local-b"]);
const requestedDistDir = process.env.FLUXPOST_NEXT_DIST_DIR;

if (requestedDistDir && !localBuildSlots.has(requestedDistDir)) {
  throw new Error("FLUXPOST_NEXT_DIST_DIR must select a managed local build slot");
}

const nextConfig: NextConfig = {
  distDir: requestedDistDir,
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
