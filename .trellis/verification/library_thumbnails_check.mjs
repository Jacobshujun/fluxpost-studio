import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = (file) => {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) throw new Error(`Missing file: ${file}`);
  return readFileSync(absolute, "utf8");
};

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const runtime = spawnSync(process.execPath, [tsxCli, ".trellis/verification/library_thumbnails_runtime_check.ts"], {
  cwd: root,
  env: process.env,
  shell: false,
  encoding: "utf8",
});
if (runtime.stdout) process.stdout.write(runtime.stdout);
if (runtime.stderr) process.stderr.write(runtime.stderr);
if (runtime.error) throw runtime.error;
assert(runtime.status === 0, `Library thumbnail runtime check failed with exit code ${runtime.status}.`);

const route = read("src/app/api/library/assets/[id]/thumbnail/route.ts");
for (const contract of ["requireWorkspaceAccount(request)", "getLibraryAsset(account", "getLibraryThumbnail(asset, {}, variant)", "variantParam", "libraryThumbnailCacheControl", "status: isWorkspaceSignInError(error) ? 401 : 404", "{ status: 502 }"]) {
  assert(route.includes(contract), `Thumbnail route contract missing: ${contract}`);
}
const prewarm = read("scripts/library/prewarm-thumbnails.ts");
const prewarmService = read("src/lib/library-thumbnail-prewarm.ts");
assert(prewarm.includes("loadEnvConfig(process.cwd())") && prewarm.includes("listLibraryAssetsFromDb") && prewarm.includes("prewarmLibraryThumbnails"), "Prewarm must load app env and reuse the database/cache services.");
assert(prewarm.includes("async function main()") && prewarm.includes("void main().catch"), "Prewarm must use a CommonJS-compatible async entry point.");
assert(prewarm.includes('import { loadEnvConfig } from "@next/env"'), "Prewarm must use the CommonJS-compatible named @next/env export.");
assert(prewarmService.includes("getLibraryThumbnail") && prewarmService.includes("cacheStatus === \"generated\"") && prewarmService.includes("summary.failed += 1"), "Prewarm service must reuse thumbnail generation and report generated, skipped, and failed assets.");
assert(!/persistLibraryObject|putObject|saveLibraryAsset/.test(prewarm), "Prewarm must not write TOS or database records.");
const packageJson = JSON.parse(read("package.json"));
assert(packageJson.dependencies?.sharp === "0.34.5", "Sharp must be a direct locked runtime dependency.");
assert(packageJson.scripts?.["library:thumbnails:prewarm"] === "tsx scripts/library/prewarm-thumbnails.ts", "Thumbnail prewarm script is missing.");

console.log("Library thumbnail authorization and prewarm contracts passed.");
