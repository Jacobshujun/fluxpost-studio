import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-library-colors-"));
try {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/library_colors_runtime_check.ts"], {
    env: { ...process.env, DATABASE_URL: "", FLUXPOST_COLOR_FIXTURE: fixture, TOS_PUBLIC_BASE_URL: "https://colors.invalid", TOS_OBJECT_PREFIX: "fixture" }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
} finally { rmSync(fixture, { recursive: true, force: true }); }
