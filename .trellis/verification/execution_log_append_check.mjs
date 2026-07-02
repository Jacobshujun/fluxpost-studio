import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const activityLog = read("src/lib/activity-log.ts");
const database = read("src/lib/database.ts");
const check = read(".trellis/verification/check.ps1");

assertContains(
  activityLog,
  /import \{ appendExecutionLogToDb,\s*readExecutionLogsFromDb,\s*writeExecutionLogsToDb \} from "\.\/database";/,
  "Execution log writer should import the append-only database helper.",
);

const recordExecutionLogBlock =
  activityLog.match(/export async function recordExecutionLog\(input:[\s\S]*?\n\}/)?.[0] || "";
assertContains(
  recordExecutionLogBlock,
  /await appendExecutionLogToDb\(entry,\s*maxEntries\)/,
  "recordExecutionLog should append one row and trim old rows.",
);
assertNotContains(
  recordExecutionLogBlock,
  /readExecutionLog\(\)|writeExecutionLog\(\{\s*entries:\s*\[entry,\s*\.\.\./,
  "recordExecutionLog must not read and rewrite the whole execution log on every append.",
);

assertContains(
  database,
  /export async function appendExecutionLogToDb\(entry: ExecutionLogEntry,\s*limit = 300\)/,
  "Database layer should expose appendExecutionLogToDb.",
);
assertContains(
  database,
  /INSERT INTO execution_logs[\s\S]*ON CONFLICT\(id\) DO NOTHING/,
  "PostgreSQL execution-log append should be idempotent on rare id collisions.",
);
assertContains(
  database,
  /DELETE FROM execution_logs[\s\S]*ORDER BY created_at DESC,\s*id DESC[\s\S]*OFFSET \$1/,
  "PostgreSQL execution-log append should trim old rows without deleting and reinserting the live log set.",
);
assertContains(
  database,
  /INSERT OR IGNORE INTO execution_logs/,
  "SQLite execution-log append should be idempotent on rare id collisions.",
);

assertContains(
  check,
  /execution_log_append_check\.mjs/,
  "Trellis baseline must include the execution log append check.",
);

console.log("Execution log append check passed.");
