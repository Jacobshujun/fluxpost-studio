import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-source-editor-"));
try {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/content_pool_editor_worker.ts"], {
    env: { ...process.env, DATABASE_URL: "", FLUXPOST_CONTENT_POOL_FIXTURE: fixture, WORKSPACE_AUTH_MODE: "accounts", TOS_ENABLED: "false", OSS_ENABLED: "false" }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
} finally {
  if (path.dirname(fixture) !== path.resolve(os.tmpdir()) || !path.basename(fixture).startsWith("fluxpost-source-editor-")) throw new Error("Unsafe fixture path");
  rmSync(fixture, { recursive: true, force: true });
}
