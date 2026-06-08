import { readExecutionLogsFromDb, writeExecutionLogsToDb } from "./database";
import type { ExecutionLogEntry } from "./types";

type StoredExecutionLog = {
  entries: ExecutionLogEntry[];
};

const maxEntries = 300;

export async function listExecutionLogs(limit = 120) {
  const log = await readExecutionLog();
  return log.entries.slice(0, limit);
}

export async function clearExecutionLogs() {
  await writeExecutionLog({ entries: [] });
}

export async function recordExecutionLog(input: Omit<ExecutionLogEntry, "id" | "createdAt">) {
  try {
    const log = await readExecutionLog();
    const entry: ExecutionLogEntry = {
      id: `exec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...input,
      details: normalizeDetails(input.details),
    };
    await writeExecutionLog({ entries: [entry, ...log.entries].slice(0, maxEntries) });
  } catch (error) {
    console.warn("Failed to record execution log", error);
  }
}

export function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***")
    .replace(/(--base-token\s+)(\S+)/gi, "$1***")
    .replace(/(FEISHU_BITABLE_APP_TOKEN=)(\S+)/gi, "$1***")
    .slice(0, 420);
}

function normalizeDetails(details?: ExecutionLogEntry["details"]) {
  if (!details) return undefined;
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === "string" && value.length > 180 ? `${value.slice(0, 180)}...` : value]),
  ) as ExecutionLogEntry["details"];
}

async function readExecutionLog(): Promise<StoredExecutionLog> {
  return { entries: await readExecutionLogsFromDb(maxEntries) };
}

async function writeExecutionLog(log: StoredExecutionLog) {
  await writeExecutionLogsToDb(log.entries.slice(0, maxEntries));
}
