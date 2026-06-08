import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = path.join(process.cwd(), "data", "fluxpost.db");

if (!existsSync(dbPath)) {
  throw new Error(`SQLite database not found at ${dbPath}`);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

try {
  const requiredTables = [
    "app_meta",
    "content_projects",
    "generated_posts",
    "batch_jobs",
    "material_folders",
    "material_assets",
    "execution_logs",
    "crawl_jobs",
    "runtime_posts",
    "simple_runs",
  ];

  for (const table of requiredTables) {
    const row = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!row || Number(row.count) !== 1) {
      throw new Error(`Missing SQLite table: ${table}`);
    }
  }

  const contentRow = db.prepare("SELECT COUNT(*) AS count FROM content_projects").get();
  const logRow = db.prepare("SELECT COUNT(*) AS count FROM execution_logs").get();
  const metaRow = db.prepare("SELECT value FROM app_meta WHERE key = 'legacy_json_migrated_v1'").get();

  if (!metaRow?.value) {
    throw new Error("SQLite legacy migration marker is missing");
  }

  console.log(
    `SQLite ok: ${dbPath} content_projects=${Number(contentRow.count)} execution_logs=${Number(logRow.count)}`,
  );
} finally {
  db.close();
}
