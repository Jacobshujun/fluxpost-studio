import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-review-usability-"));
try {
  const result = spawnSync(process.execPath, ["--import", "tsx", ".trellis/verification/review_usability_worker.ts"], { env: { ...process.env, DATABASE_URL: "", REVIEW_TEST_ROOT: fixture, FLUXPOST_DISABLE_BACKGROUND_WORKERS: "1", TZ: "America/Los_Angeles" }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${result.stdout}${result.stderr}`);
  process.stdout.write(result.stdout);
} finally { rmSync(fixture, { recursive: true, force: true }); }
