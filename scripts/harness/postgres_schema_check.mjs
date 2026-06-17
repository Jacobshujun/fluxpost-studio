import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schemaPath = path.join(projectRoot, "db", "migrations", "001_initial_postgres.sql");
const packagePath = path.join(projectRoot, "package.json");

const requiredTables = [
  "app_meta",
  "workspace_accounts",
  "workspace_sessions",
  "content_projects",
  "generated_posts",
  "batch_jobs",
  "material_folders",
  "material_assets",
  "execution_logs",
  "crawl_jobs",
  "runtime_posts",
  "simple_runs",
  "simple_run_queue",
  "image_generation_queue",
  "feishu_publish_queue",
  "lark_task_launches",
];

if (!existsSync(schemaPath)) {
  throw new Error(`PostgreSQL schema file missing: ${schemaPath}`);
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
if (!packageJson.dependencies?.pg) {
  throw new Error("PostgreSQL dependency pg is missing from package.json dependencies.");
}

const sql = readFileSync(schemaPath, "utf8");
for (const table of requiredTables) {
  assertIncludes(sql, `CREATE TABLE IF NOT EXISTS ${table}`, `missing table ${table}`);
}

for (const table of requiredTables.filter((table) => table !== "app_meta")) {
  const tablePattern = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\([\\s\\S]*?data_json\\s+JSONB\\s+NOT NULL`, "i");
  if (!tablePattern.test(sql)) {
    throw new Error(`Table ${table} must include data_json JSONB NOT NULL.`);
  }
}

[
  "idx_content_projects_updated_at",
  "idx_generated_posts_updated_at",
  "idx_generated_posts_source_item_id",
  "idx_batch_jobs_created_at",
  "idx_execution_logs_created_at",
  "idx_crawl_jobs_created_at",
  "idx_runtime_posts_updated_at",
  "idx_simple_runs_created_at",
  "idx_simple_run_queue_ready",
  "idx_simple_run_queue_run_id",
  "idx_image_generation_queue_ready",
  "idx_image_generation_queue_provider_status",
  "idx_feishu_publish_queue_ready",
  "idx_feishu_publish_queue_owner_status",
  "idx_feishu_publish_queue_source_run_id",
  "idx_lark_task_launches_message_id",
  "idx_lark_task_launches_run_id",
  "idx_lark_task_launches_created_at",
  "idx_workspace_accounts_status",
  "idx_workspace_sessions_account_id",
  "idx_workspace_sessions_expires_at",
].forEach((indexName) => assertIncludes(sql, `CREATE INDEX IF NOT EXISTS ${indexName}`, `missing index ${indexName}`));

console.log(`PostgreSQL schema ok: ${requiredTables.length} tables`);

function assertIncludes(value, needle, message) {
  if (!value.includes(needle)) {
    throw new Error(message);
  }
}
