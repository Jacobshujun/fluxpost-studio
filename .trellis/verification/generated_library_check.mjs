import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";

const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-generated-library-"));
const schemaSource = readFileSync("src/lib/generated-image-schema.ts", "utf8").replace(/\r\n/g, "\n").split("`")[1];
if (readFileSync("db/migrations/007_generated_image_library.sql", "utf8").replace(/\r\n/g, "\n").split("\n").slice(1).join("\n") !== schemaSource) throw new Error("Generated image migration/schema drift.");
let pool;
let schema;
let url = "";
try {
  if (process.argv.includes("--postgres")) {
    const original = process.env.DATABASE_URL;
    if (!original || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(original).hostname)) throw new Error("Isolated PostgreSQL check requires loopback DATABASE_URL.");
    pool = new Pool({ connectionString: original });
    schema = `generated_test_${process.pid}_${Date.now()}`;
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const connection = new URL(original); connection.searchParams.set("options", `-c search_path=${schema}`); url = connection.toString();
    const seed = new Pool({ connectionString: url });
    try { await seed.query(readFileSync("src/lib/database.ts", "utf8").split("const postgresSchemaSql = `")[1].split("`;")[0]); }
    finally { await seed.end(); }
  }
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/generated_library_runtime_check.ts"], {
    env: { ...process.env, DATABASE_URL: url, FLUXPOST_GENERATED_FIXTURE: fixture, FLUXPOST_DISABLE_BACKGROUND_WORKERS: "1" }, encoding: "utf8", timeout: 120_000,
  });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
} finally {
  if (pool && schema) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool?.end();
  // mkdtemp returned this exact isolated test root; no project/runtime paths enter cleanup.
  rmSync(fixture, { recursive: true, force: true });
}
