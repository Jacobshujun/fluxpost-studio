import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const [{ listLibraryAssetsFromDb }, { prewarmLibraryThumbnails }] = await Promise.all([
  import("../../src/lib/database"),
  import("../../src/lib/library-thumbnail-prewarm"),
]);

const assets = await listLibraryAssetsFromDb();
const { summary, failures } = await prewarmLibraryThumbnails(assets);

console.log(JSON.stringify(summary));
failures.forEach((failure) => console.error(failure));
if (summary.failed) process.exitCode = 1;
