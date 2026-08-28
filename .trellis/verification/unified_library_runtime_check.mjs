import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-unified-library-"));
try {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/unified_library_runtime_worker.ts"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "", FLUXPOST_UNIFIED_LIBRARY_FIXTURE: fixture },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${result.stdout || ""}${result.stderr || ""}`.trim());
  process.stdout.write(result.stdout);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
