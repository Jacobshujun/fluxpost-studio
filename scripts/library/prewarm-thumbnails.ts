import { loadEnvConfig } from "@next/env";

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
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
}
