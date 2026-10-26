import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/generated_image_evidence_check.ts"], {
  encoding: "utf8", env: { ...process.env, DATABASE_URL: "" },
});
if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
process.stdout.write(result.stdout);
