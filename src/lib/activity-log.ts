import { AsyncLocalStorage } from "node:async_hooks";
import { appendExecutionLogToDb, readExecutionLogsFromDb, writeExecutionLogsToDb } from "./database";
import type { ExecutionLogEntry } from "./types";
import {
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  isWorkspaceAdmin,
  scopeWorkspaceOwner,
  type WorkspaceAccessActor,
  type WorkspaceOwnedRecord,
} from "./workspace-ownership";

type StoredExecutionLog = {
  entries: ExecutionLogEntry[];
};

const maxEntries = 300;
const executionLogOwnerStorage = new AsyncLocalStorage<WorkspaceOwnedRecord>();

export async function listExecutionLogs(limit = 120, account?: WorkspaceAccessActor) {
  const log = await readExecutionLog();
  return filterWorkspaceOwnedRecords(log.entries, account).slice(0, limit);
}

export async function clearExecutionLogs(account?: WorkspaceAccessActor) {
  if (!account || isWorkspaceAdmin(account)) {
    await writeExecutionLog({ entries: [] });
    return;
  }
  const log = await readExecutionLog();
  await writeExecutionLog({
    entries: log.entries.filter((entry) => !canAccessWorkspaceOwner(account, entry.ownerUserId)),
  });
}

export async function recordExecutionLog(input: Omit<ExecutionLogEntry, "id" | "createdAt">) {
  try {
    const owner = executionLogOwnerStorage.getStore();
    const entry: ExecutionLogEntry = {
      id: `exec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...input,
      ownerUserId: input.ownerUserId || owner?.ownerUserId,
      ownerDisplayName: input.ownerDisplayName || owner?.ownerDisplayName,
      details: normalizeDetails(input.details),
    };
    await appendExecutionLogToDb(entry, maxEntries);
  } catch (error) {
    console.warn("Failed to record execution log", error);
  }
}

export function runWithExecutionLogOwner<T>(account: WorkspaceAccessActor, operation: () => Promise<T>) {
  return executionLogOwnerStorage.run(scopeWorkspaceOwner(account), operation);
}

export function enterExecutionLogOwner(account: WorkspaceAccessActor) {
  executionLogOwnerStorage.enterWith(scopeWorkspaceOwner(account));
}

export function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***")
    .replace(/(--base-token\s+)(\S+)/gi, "$1***")
    .replace(/(FEISHU_BITABLE_APP_TOKEN=)(\S+)/gi, "$1***")
    .replace(/(FEISHU_APP_SECRET=)(\S+)/gi, "$1***")
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
