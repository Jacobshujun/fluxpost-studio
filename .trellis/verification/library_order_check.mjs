import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-library-order-"));
try {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/library_order_runtime_check.ts"], {
    env: { ...process.env, DATABASE_URL: "", FLUXPOST_LIBRARY_ORDER_FIXTURE: fixture }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
} finally { rmSync(fixture, { recursive: true, force: true }); }
