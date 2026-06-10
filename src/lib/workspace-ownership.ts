import type { WorkspaceAccount } from "./types";

export type WorkspaceAccessActor = Pick<WorkspaceAccount, "id" | "displayName" | "role">;

export type WorkspaceOwnedRecord = {
  ownerUserId?: string;
  ownerDisplayName?: string;
};

export function isWorkspaceAdmin(account?: WorkspaceAccessActor | null) {
  return account?.role === "admin";
}

export function canAccessWorkspaceOwner(account: WorkspaceAccessActor | undefined | null, ownerUserId?: string) {
  if (!account) return false;
  if (isWorkspaceAdmin(account)) return true;
  return Boolean(ownerUserId && ownerUserId === account.id);
}

export function assertCanAccessWorkspaceRecord<T extends WorkspaceOwnedRecord>(
  account: WorkspaceAccessActor | undefined | null,
  record: T | undefined | null,
  message = "Workspace record not found",
) {
  if (!record || !canAccessWorkspaceOwner(account, record.ownerUserId)) {
    throw new Error(message);
  }
}

export function filterWorkspaceOwnedRecords<T extends WorkspaceOwnedRecord>(records: T[], account?: WorkspaceAccessActor | null) {
  if (!account) return records;
  if (isWorkspaceAdmin(account)) return records;
  return records.filter((record) => record.ownerUserId === account.id);
}

export function scopeWorkspaceOwner(account: WorkspaceAccessActor): Required<WorkspaceOwnedRecord> {
  return {
    ownerUserId: account.id,
    ownerDisplayName: account.displayName || account.id,
  };
}

export function accessActorFromOwner(ownerUserId?: string, ownerDisplayName?: string): WorkspaceAccessActor | undefined {
  const id = typeof ownerUserId === "string" ? ownerUserId.trim() : "";
  if (!id) return undefined;
  return {
    id,
    displayName: (typeof ownerDisplayName === "string" ? ownerDisplayName.trim() : "") || id,
    role: "operator",
  };
}

export function applyWorkspaceOwner<T extends WorkspaceOwnedRecord>(
  record: T,
  account?: WorkspaceAccessActor | null,
  fallback?: WorkspaceOwnedRecord,
) {
  const owner = account ? scopeWorkspaceOwner(account) : fallback?.ownerUserId ? fallback : undefined;
  if (!owner) return record;
  return {
    ...record,
    ownerUserId: owner.ownerUserId,
    ownerDisplayName: owner.ownerDisplayName,
  };
}
