import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === true;
const configuredBackend = args.backend || (process.env.DATABASE_URL ? "postgres" : "sqlite");

if (configuredBackend !== "postgres" && configuredBackend !== "sqlite") {
  throw new Error("--backend must be either postgres or sqlite.");
}

const result = configuredBackend === "postgres"
  ? await cleanPostgres(process.env.DATABASE_URL, apply)
  : cleanSqlite(path.resolve(process.cwd(), args.sqlite || "data/fluxpost.db"), apply);

console.log(JSON.stringify(result));

async function cleanPostgres(databaseUrl, shouldApply) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the PostgreSQL backend.");
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      "SELECT id FROM generated_posts WHERE data_json ? 'canvasImageBatch' ORDER BY id",
    );
    if (shouldApply && before.rows.length) {
      await client.query(
        "UPDATE generated_posts SET data_json = data_json - 'canvasImageBatch' WHERE data_json ? 'canvasImageBatch'",
      );
    }
    if (shouldApply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    return report("postgres", shouldApply, before.rows.map((row) => String(row.id)));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function cleanSqlite(sqlitePath, shouldApply) {
  if (!existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
  const database = new DatabaseSync(sqlitePath, { readOnly: !shouldApply });
  try {
    if (shouldApply) database.exec("BEGIN IMMEDIATE");
    const rows = database.prepare(
      "SELECT id FROM generated_posts WHERE json_type(data_json, '$.canvasImageBatch') IS NOT NULL ORDER BY id",
    ).all();
    if (shouldApply && rows.length) {
      database.prepare(
        "UPDATE generated_posts SET data_json = json_remove(data_json, '$.canvasImageBatch') WHERE json_type(data_json, '$.canvasImageBatch') IS NOT NULL",
      ).run();
    }
    if (shouldApply) database.exec("COMMIT");
    return report("sqlite", shouldApply, rows.map((row) => String(row.id)));
  } catch (error) {
    if (shouldApply) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}

function report(backend, shouldApply, ids) {
  return {
    backend,
    mode: shouldApply ? "apply" : "dry-run",
    matched: ids.length,
    changed: shouldApply ? ids.length : 0,
    ids,
  };
}

function parseArgs(values) {
  const result = {};
  const supported = new Set(["apply", "backend", "sqlite"]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    if (!supported.has(key)) throw new Error(`Unknown option: --${key}`);
    if (key === "apply") {
      result.apply = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`--${key} requires a value.`);
    result[key] = next;
    index += 1;
  }
  return result;
}
