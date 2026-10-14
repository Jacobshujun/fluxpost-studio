import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/library_ui_runtime_check.ts"], { cwd: process.cwd(), encoding: "utf8", env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`${result.stdout}${result.stderr}`);
process.stdout.write(result.stdout);
