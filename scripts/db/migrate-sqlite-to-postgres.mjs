import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const sqlitePath = path.resolve(projectRoot, args.sqlite || "data/fluxpost.db");
const schemaPath = path.resolve(projectRoot, "db/migrations/001_initial_postgres.sql");
const databaseUrl = process.env.DATABASE_URL;
const dryRun = Boolean(args["dry-run"]);
const resetTarget = Boolean(args["reset-target"]);

const tables = [
  {
    name: "app_meta",
    columns: ["key", "value", "updated_at"],
    conflict: "key",
  },
  {
    name: "content_projects",
    columns: ["id", "normalized_query", "query", "created_at", "updated_at", "last_crawled_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "generated_posts",
    columns: ["id", "source_item_id", "platform", "status", "created_at", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "batch_jobs",
    columns: ["id", "status", "created_at", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "material_folders",
    columns: ["id", "parent_id", "name", "created_at", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "material_assets",
    columns: ["id", "folder_id", "path", "kind", "created_at", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "execution_logs",
    columns: ["id", "scope", "action", "status", "created_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "crawl_jobs",
    columns: ["id", "status", "platform", "query", "created_at", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "runtime_posts",
    columns: ["id", "source_item_id", "platform", "status", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "simple_runs",
    columns: ["id", "status", "keyword", "created_at", "updated_at", "data_json"],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
  },
  {
    name: "simple_run_queue",
    columns: [
      "id",
      "run_id",
      "status",
      "priority",
      "attempts",
      "max_attempts",
      "run_after",
      "locked_by",
      "locked_until",
      "created_at",
      "updated_at",
      "started_at",
      "completed_at",
      "error",
      "data_json",
    ],
    conflict: "id",
    jsonColumns: new Set(["data_json"]),
    optional: true,
  },
];

async function main() {
  if (!databaseUrl && !dryRun) {
    throw new Error("DATABASE_URL is required. Set it in the shell before running the migration script.");
  }
  if (!existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }
  if (!existsSync(schemaPath)) {
    throw new Error(`PostgreSQL schema file not found: ${schemaPath}`);
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
  const counts = [];

  try {
    for (const table of tables) {
      if (!sqliteHasTable(sqlite, table.name)) {
        if (table.optional) {
          counts.push({ table: table.name, count: 0 });
          continue;
        }
        throw new Error(`Missing SQLite table: ${table.name}`);
      }
      const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table.name}`).get();
      counts.push({ table: table.name, count: Number(row.count || 0) });
    }

    if (dryRun) {
      console.log("SQLite to PostgreSQL migration dry run:");
      counts.forEach((item) => console.log(`${item.table}: ${item.count}`));
      return;
    }

    if (!pool) throw new Error("DATABASE_URL is required. Set it in the shell before running the migration script.");
    await pool.query(readFileSync(schemaPath, "utf8"));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (resetTarget) {
        await client.query(`TRUNCATE ${tables.map((table) => table.name).join(", ")} RESTART IDENTITY`);
      }

      for (const table of tables) {
        if (!sqliteHasTable(sqlite, table.name)) {
          if (table.optional) {
            console.log(`${table.name}: skipped missing optional source table`);
            continue;
          }
          throw new Error(`Missing SQLite table: ${table.name}`);
        }
        const rows = sqlite.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all();
        const upsertSql = buildUpsertSql(table);
        for (const row of rows) {
          await client.query(upsertSql, table.columns.map((column) => row[column]));
        }
        console.log(`${table.name}: migrated ${rows.length}`);
      }

      await client.query(
        `
          INSERT INTO app_meta (key, value, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `,
        ["sqlite_to_postgres_migrated_at", new Date().toISOString(), new Date().toISOString()],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    console.log("SQLite to PostgreSQL migration completed.");
  } finally {
    sqlite.close();
    await pool?.end();
  }
}

function buildUpsertSql(table) {
  const values = table.columns.map((column, index) => {
    const placeholder = `$${index + 1}`;
    return table.jsonColumns?.has(column) ? `${placeholder}::jsonb` : placeholder;
  });
  const updateColumns = table.columns.filter((column) => column !== table.conflict);
  return `
    INSERT INTO ${table.name} (${table.columns.join(", ")})
    VALUES (${values.join(", ")})
    ON CONFLICT(${table.conflict}) DO UPDATE SET
      ${updateColumns.map((column) => `${column} = excluded.${column}`).join(", ")}
  `;
}

function sqliteHasTable(sqlite, tableName) {
  const row = sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row && Number(row.count) === 1);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
