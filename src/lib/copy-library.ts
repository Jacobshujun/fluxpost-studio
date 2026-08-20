import { randomUUID } from "node:crypto";
import {
  deleteCopyLibraryEntryFromDb,
  getCopyLibraryEntryFromDb,
  listCopyLibraryEntriesFromDb,
  saveCopyLibraryEntryToDb,
} from "./database";
import { compareLibraryText, libraryListSortDirection, normalizeLibraryListSort } from "./library-sort";
import { applyFinishedBodyPolicy } from "./finished-body-policy";
import type { CopyLibraryEntry, CopyLibraryEntryView, LibraryListSort, LibraryVisibility } from "./types";
import { isWorkspaceAdmin, scopeWorkspaceOwner, type WorkspaceAccessActor } from "./workspace-ownership";

const validVisibility = new Set<LibraryVisibility>(["private", "team"]);
const titleLimit = 200;
const bodyLimit = 30_000;
const tagLimit = 30;
const tagLengthLimit = 40;

export type CopyLibraryFilters = {
  search?: string;
  tags?: string[];
  visibility?: LibraryVisibility;
  sort?: LibraryListSort;
};

export type CopyLibraryInput = {
  title?: unknown;
  body?: unknown;
  tags?: unknown;
  visibility?: unknown;
};

export async function listCopyLibraryEntries(account: WorkspaceAccessActor, filters: CopyLibraryFilters = {}) {
  const search = normalizeSearch(filters.search);
  const filterTags = normalizeTags(filters.tags || []);
  const sort = normalizeLibraryListSort(filters.sort);
  const entries = (await listCopyLibraryEntriesFromDb())
    .filter((entry) => canReadCopyLibraryEntry(account, entry))
    .filter((entry) => !filters.visibility || entry.visibility === filters.visibility)
    .filter((entry) => !search || [entry.title, entry.body, ...entry.tags].some((value) => normalizeSearch(value).includes(search)))
    .filter((entry) => filterTags.every((tag) => entry.tags.some((value) => normalizeTagKey(value) === normalizeTagKey(tag))))
    .sort((left, right) => compareCopyLibraryEntries(left, right, sort))
    .map((entry) => toEntryView(account, entry));
  return { entries, tags: collectVisibleTags(entries) };
}

export async function getCopyLibraryEntry(account: WorkspaceAccessActor, entryId: string) {
  const entry = await requireVisibleEntry(account, entryId);
  return toEntryView(account, entry);
}

export async function createCopyLibraryEntry(account: WorkspaceAccessActor, input: CopyLibraryInput) {
  const owner = scopeWorkspaceOwner(account);
  const now = new Date().toISOString();
  const normalized = normalizeCopyLibraryInput(input, true);
  const entry: CopyLibraryEntry = {
    id: `copy-${randomUUID()}`,
    ...owner,
    ...normalized,
    ...applyFinishedBodyPolicy({ body: normalized.body }),
    createdAt: now,
    updatedAt: now,
  };
  await saveCopyLibraryEntryToDb(entry);
  return toEntryView(account, entry);
}

export async function updateCopyLibraryEntry(account: WorkspaceAccessActor, entryId: string, input: CopyLibraryInput) {
  const current = await requireEditableEntry(account, entryId);
  const patch = normalizeCopyLibraryInput(input, false);
  if (typeof input.body === "string" && input.body === current.body) delete patch.body;
  if (!Object.keys(patch).length) throw new Error("At least one copy field is required.");
  const finishedBody = patch.body === undefined
    ? undefined
    : applyFinishedBodyPolicy({ body: patch.body, bodyPolicyVersion: current.bodyPolicyVersion }, current);
  const entry: CopyLibraryEntry = {
    ...current,
    ...patch,
    ...(finishedBody || {}),
    updatedAt: new Date().toISOString(),
  };
  await saveCopyLibraryEntryToDb(entry);
  return toEntryView(account, entry);
}

export async function deleteCopyLibraryEntry(account: WorkspaceAccessActor, entryId: string) {
  await requireEditableEntry(account, entryId);
  await deleteCopyLibraryEntryFromDb(entryId);
  return { deleted: true as const, id: entryId };
}

export function parseCopyLibraryFilters(url: URL): CopyLibraryFilters {
  const visibility = url.searchParams.get("visibility") as LibraryVisibility | null;
  return {
    search: url.searchParams.get("q") || undefined,
    tags: url.searchParams.getAll("tag").flatMap((value) => value.split(",")),
    visibility: visibility && validVisibility.has(visibility) ? visibility : undefined,
    sort: normalizeLibraryListSort(url.searchParams.get("sort")),
  };
}

export function normalizeTags(values: unknown) {
  if (!Array.isArray(values)) throw new Error("Tags must be an array.");
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") throw new Error("Each tag must be text.");
    const tag = value.trim();
    if (!tag) continue;
    if (tag.length > tagLengthLimit) throw new Error(`Each tag must be ${tagLengthLimit} characters or fewer.`);
    const key = normalizeTagKey(tag);
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  if (tags.length > tagLimit) throw new Error(`A copy entry can have at most ${tagLimit} tags.`);
  return tags;
}

export function canReadCopyLibraryEntry(account: WorkspaceAccessActor, entry: CopyLibraryEntry) {
  return isWorkspaceAdmin(account) || entry.ownerUserId === account.id || entry.visibility === "team";
}

export function canEditCopyLibraryEntry(account: WorkspaceAccessActor, entry: CopyLibraryEntry) {
  return isWorkspaceAdmin(account) || entry.ownerUserId === account.id;
}

function normalizeCopyLibraryInput(input: CopyLibraryInput, creating: true): Pick<CopyLibraryEntry, "title" | "body" | "tags" | "visibility">;
function normalizeCopyLibraryInput(input: CopyLibraryInput, creating: false): Partial<Pick<CopyLibraryEntry, "title" | "body" | "tags" | "visibility">>;
function normalizeCopyLibraryInput(input: CopyLibraryInput, creating: boolean) {
  const result: Partial<Pick<CopyLibraryEntry, "title" | "body" | "tags" | "visibility">> = {};
  if (creating || input.title !== undefined) result.title = requireText(input.title, "Title", titleLimit);
  if (creating || input.body !== undefined) result.body = requireText(input.body, "Body", bodyLimit);
  if (creating || input.tags !== undefined) result.tags = normalizeTags(input.tags || []);
  if (creating || input.visibility !== undefined) {
    const visibility = input.visibility === undefined ? "team" : input.visibility;
    if (typeof visibility !== "string" || !validVisibility.has(visibility as LibraryVisibility)) throw new Error("Invalid copy visibility.");
    result.visibility = visibility as LibraryVisibility;
  }
  return result;
}

async function requireVisibleEntry(account: WorkspaceAccessActor, entryId: string) {
  const entry = await getCopyLibraryEntryFromDb(requireEntryId(entryId));
  if (!entry || !canReadCopyLibraryEntry(account, entry)) throw new Error("Copy entry not found.");
  return entry;
}

async function requireEditableEntry(account: WorkspaceAccessActor, entryId: string) {
  const entry = await getCopyLibraryEntryFromDb(requireEntryId(entryId));
  if (!entry) throw new Error("Copy entry not found.");
  if (!canEditCopyLibraryEntry(account, entry)) throw new Error("Copy entry is read-only.");
  return entry;
}

function toEntryView(account: WorkspaceAccessActor, entry: CopyLibraryEntry): CopyLibraryEntryView {
  return { ...entry, canEdit: canEditCopyLibraryEntry(account, entry) };
}

function collectVisibleTags(entries: CopyLibraryEntry[]) {
  const labels = new Map<string, string>();
  entries.forEach((entry) => entry.tags.forEach((tag) => labels.set(normalizeTagKey(tag), labels.get(normalizeTagKey(tag)) || tag)));
  return [...labels.values()].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function compareCopyLibraryEntries(left: CopyLibraryEntry, right: CopyLibraryEntry, sort: LibraryListSort = "newest") {
  const direction = libraryListSortDirection(sort);
  const value = sort === "newest" || sort === "oldest"
    ? left.updatedAt.localeCompare(right.updatedAt)
    : sort === "name-asc" || sort === "name-desc"
      ? compareLibraryText(left.title, right.title)
      : compareLibraryText(left.ownerDisplayName, right.ownerDisplayName);
  return direction * value || direction * left.id.localeCompare(right.id);
}

function requireEntryId(value: string) {
  const id = value.trim();
  if (!id || id.length > 160) throw new Error("Invalid copy entry id.");
  return id;
}

function requireText(value: unknown, label: string, limit: number) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > limit) throw new Error(`${label} must be ${limit} characters or fewer.`);
  return normalized;
}

function normalizeSearch(value?: string) {
  return (value || "").trim().toLocaleLowerCase();
}

function normalizeTagKey(value: string) {
  return value.trim().toLocaleLowerCase();
}
