import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.FLUXPOST_DIAG_DATABASE_URL ||
  process.env.DATABASE_READONLY_URL ||
  process.env.POSTGRES_READONLY_URL;

const options = parseArgs(process.argv.slice(2));
const limit = clampInt(options.limit, 1, 100, 20);
const logLimit = clampInt(options.logLimit ?? options.limit, 1, 100, limit);
const runId = normalizeOption(options.run || options.runId);
const scope = normalizeOption(options.scope);

if (!connectionString) {
  console.error(
    "Missing read-only PostgreSQL connection. Set FLUXPOST_DIAG_DATABASE_URL before running this command.",
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  application_name: "fluxpost-diagnostics",
  max: 2,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
});

try {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '15s'");
    await client.query("SET lock_timeout = '2s'");
    await client.query("SET idle_in_transaction_session_timeout = '30s'");
    await runDiagnostics(client, { limit, logLimit, runId, scope });
  } finally {
    client.release();
  }
} catch (error) {
  console.error(`PostgreSQL diagnostics failed: ${formatError(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}

async function runDiagnostics(client, context) {
  const status = await one(
    client,
    `
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        inet_server_addr()::text AS server_addr,
        inet_server_port() AS server_port,
        version() AS server_version,
        now() AS checked_at
    `,
  );

  section("Database");
  rows([
    ["database", status.database_name],
    ["user", status.user_name],
    ["server", `${status.server_addr || "local"}:${status.server_port || "-"}`],
    ["checkedAt", formatDate(status.checked_at)],
    ["version", shortVersion(status.server_version)],
  ]);

  const tableCounts = await all(
    client,
    `
      SELECT 'execution_logs' AS table_name, count(*)::int AS row_count FROM public.execution_logs
      UNION ALL SELECT 'simple_runs', count(*)::int FROM public.simple_runs
      UNION ALL SELECT 'simple_run_queue', count(*)::int FROM public.simple_run_queue
      UNION ALL SELECT 'feishu_publish_queue', count(*)::int FROM public.feishu_publish_queue
      UNION ALL SELECT 'distribution_check_jobs', count(*)::int FROM public.distribution_check_jobs
      UNION ALL SELECT 'content_projects', count(*)::int FROM public.content_projects
      UNION ALL SELECT 'generated_posts', count(*)::int FROM public.generated_posts
      UNION ALL SELECT 'crawl_jobs', count(*)::int FROM public.crawl_jobs
      UNION ALL SELECT 'runtime_posts', count(*)::int FROM public.runtime_posts
      UNION ALL SELECT 'workspace_accounts_safe', count(*)::int FROM diagnostics.workspace_accounts_safe
      ORDER BY table_name
    `,
  );

  section("Table Counts");
  table(tableCounts, ["table_name", "row_count"]);

  const simpleQueue = await all(
    client,
    `
      SELECT
        q.id,
        q.run_id,
        q.status,
        q.attempts,
        q.locked_by,
        q.locked_until,
        q.updated_at,
        left(coalesce(q.error, ''), 180) AS error
      FROM public.simple_run_queue q
      WHERE q.status IN ('queued', 'running')
         OR q.updated_at > now() - interval '12 hours'
      ORDER BY
        CASE q.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
        q.updated_at DESC
      LIMIT $1
    `,
    [context.limit],
  );

  section("Simple Queue");
  table(simpleQueue, ["id", "run_id", "status", "attempts", "locked_by", "locked_until", "updated_at", "error"]);

  const simpleRuns = await all(
    client,
    `
      SELECT
        id,
        status,
        keyword,
        created_at,
        updated_at,
        coalesce(jsonb_array_length(coalesce(data_json->'posts', '[]'::jsonb)), 0) AS posts,
        left(coalesce(data_json->>'error', data_json->>'message', ''), 180) AS note
      FROM public.simple_runs
      WHERE ($2::text IS NULL OR id = $2::text)
         OR ($2::text IS NULL AND updated_at > now() - interval '24 hours')
      ORDER BY updated_at DESC
      LIMIT $1
    `,
    [context.limit, context.runId],
  );

  section(context.runId ? `Simple Run ${context.runId}` : "Recent Simple Runs");
  table(simpleRuns, ["id", "status", "keyword", "created_at", "updated_at", "posts", "note"]);

  const feishuQueue = await all(
    client,
    `
      SELECT
        id,
        source,
        source_run_id,
        owner_user_id,
        status,
        attempts,
        locked_by,
        locked_until,
        updated_at,
        left(coalesce(error, ''), 180) AS error
      FROM public.feishu_publish_queue
      WHERE status IN ('queued', 'running')
         OR updated_at > now() - interval '12 hours'
         OR ($2::text IS NOT NULL AND source_run_id = $2::text)
      ORDER BY
        CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT $1
    `,
    [context.limit, context.runId],
  );

  section("Feishu Publish Queue");
  table(feishuQueue, [
    "id",
    "source",
    "source_run_id",
    "owner_user_id",
    "status",
    "attempts",
    "locked_by",
    "locked_until",
    "updated_at",
    "error",
  ]);

  const distributionQueue = await all(
    client,
    `
      SELECT
        id,
        owner_user_id,
        status,
        attempts,
        locked_by,
        locked_until,
        updated_at,
        coalesce((data_json->>'processed')::int, 0) AS processed,
        coalesce((data_json->>'total')::int, 0) AS total,
        coalesce((data_json->>'updated')::int, 0) AS updated,
        coalesce((data_json->>'failed')::int, 0) AS failed,
        left(coalesce(error, ''), 180) AS error
      FROM public.distribution_check_jobs
      WHERE status IN ('queued', 'running')
         OR updated_at > now() - interval '12 hours'
      ORDER BY
        CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT $1
    `,
    [context.limit],
  );

  section("Distribution Check Queue");
  table(distributionQueue, [
    "id",
    "owner_user_id",
    "status",
    "attempts",
    "locked_by",
    "locked_until",
    "updated_at",
    "processed",
    "total",
    "updated",
    "failed",
    "error",
  ]);

  const logQuery = buildLogQuery(context);
  const logs = await all(client, logQuery.sql, logQuery.params);

  section(context.scope ? `Recent Logs scope=${context.scope}` : "Recent Error/Warning Logs");
  table(logs, ["created_at", "status", "scope", "action", "message"]);

  const activeSessions = await all(
    client,
    `
      SELECT
        pid,
        usename,
        state,
        wait_event_type,
        wait_event,
        now() - query_start AS query_age,
        left(regexp_replace(query, '\\s+', ' ', 'g'), 180) AS query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND (state <> 'idle' OR wait_event_type IS NOT NULL)
      ORDER BY query_start NULLS LAST
      LIMIT $1
    `,
    [context.limit],
  );

  section("Active Sessions");
  table(activeSessions, ["pid", "usename", "state", "wait_event_type", "wait_event", "query_age", "query"]);

  const blocked = await all(
    client,
    `
      SELECT
        blocked.pid AS blocked_pid,
        blocked.usename AS blocked_user,
        blocking.pid AS blocking_pid,
        blocking.usename AS blocking_user,
        blocked.wait_event_type,
        blocked.wait_event,
        now() - blocked.query_start AS blocked_age,
        left(regexp_replace(blocked.query, '\\s+', ' ', 'g'), 160) AS blocked_query,
        left(regexp_replace(blocking.query, '\\s+', ' ', 'g'), 160) AS blocking_query
      FROM pg_stat_activity blocked
      JOIN pg_locks blocked_locks
        ON blocked_locks.pid = blocked.pid
       AND NOT blocked_locks.granted
      JOIN pg_locks blocking_locks
        ON blocking_locks.locktype = blocked_locks.locktype
       AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
       AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
       AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
       AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
       AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
       AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
       AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
       AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
       AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
       AND blocking_locks.pid <> blocked_locks.pid
       AND blocking_locks.granted
      JOIN pg_stat_activity blocking ON blocking.pid = blocking_locks.pid
      WHERE blocked.datname = current_database()
      ORDER BY blocked.query_start NULLS LAST
      LIMIT $1
    `,
    [context.limit],
  );

  section("Blocked Locks");
  table(blocked, [
    "blocked_pid",
    "blocked_user",
    "blocking_pid",
    "blocking_user",
    "wait_event_type",
    "wait_event",
    "blocked_age",
    "blocked_query",
    "blocking_query",
  ]);

  const settings = await all(
    client,
    `
      SELECT name, setting, unit
      FROM pg_settings
      WHERE name IN (
        'log_lock_waits',
        'deadlock_timeout',
        'statement_timeout',
        'lock_timeout',
        'idle_in_transaction_session_timeout',
        'shared_preload_libraries'
      )
      ORDER BY name
    `,
  );

  section("PostgreSQL Settings");
  table(settings, ["name", "setting", "unit"]);
}

function buildLogQuery(context) {
  const filters = [];
  const params = [context.logLimit];
  let nextIndex = 2;

  if (context.scope) {
    filters.push(`scope = $${nextIndex}`);
    params.push(context.scope);
    nextIndex += 1;
  } else {
    filters.push(`status IN ('failed', 'error', 'warning')`);
  }

  if (context.runId) {
    filters.push(`(id = $${nextIndex} OR data_json::text LIKE $${nextIndex + 1})`);
    params.push(context.runId, `%${context.runId}%`);
    nextIndex += 2;
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  return {
    params,
    sql: `
      SELECT
        created_at,
        status,
        scope,
        action,
        left(coalesce(
          data_json->>'message',
          data_json->>'error',
          data_json->>'firstFailedSourceError',
          data_json->>'detail',
          ''
        ), 220) AS message
      FROM public.execution_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $1
    `,
  };
}

async function one(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || {};
}

async function all(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

function section(label) {
  console.log("");
  console.log(`== ${label} ==`);
}

function rows(items) {
  for (const [key, value] of items) {
    console.log(`${key}: ${formatCell(value)}`);
  }
}

function table(items, columns) {
  if (!items.length) {
    console.log("(none)");
    return;
  }

  const widths = columns.map((column) =>
    Math.min(
      48,
      Math.max(
        column.length,
        ...items.map((item) => formatCell(item[column]).length),
      ),
    ),
  );

  console.log(columns.map((column, index) => pad(column, widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const item of items) {
    console.log(columns.map((column, index) => pad(formatCell(item[column]), widths[index])).join("  "));
  }
}

function pad(value, width) {
  const normalized = value.length > width ? `${value.slice(0, Math.max(0, width - 1))}...` : value;
  return normalized.padEnd(width, " ");
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (isPgInterval(value)) return formatPgInterval(value);
    if (typeof value.toPostgres === "function") return String(value);
    return JSON.stringify(value);
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function shortVersion(value) {
  const text = String(value || "");
  const match = text.match(/^PostgreSQL\s+[^ ]+/);
  return match ? match[0] : text.slice(0, 80);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeOption(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function formatError(error) {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  return error.message || String(error);
}

function isPgInterval(value) {
  return ["years", "months", "days", "hours", "minutes", "seconds", "milliseconds"].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
}

function formatPgInterval(value) {
  const parts = [];
  appendInterval(parts, value.years, "y");
  appendInterval(parts, value.months, "mo");
  appendInterval(parts, value.days, "d");
  appendInterval(parts, value.hours, "h");
  appendInterval(parts, value.minutes, "m");
  const seconds = Number(value.seconds || 0) + Number(value.milliseconds || 0) / 1000;
  if (seconds) parts.push(`${trimNumber(seconds)}s`);
  return parts.length ? parts.join(" ") : "0s";
}

function appendInterval(parts, value, suffix) {
  const number = Number(value || 0);
  if (number) parts.push(`${trimNumber(number)}${suffix}`);
}

function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
