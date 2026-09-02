import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  deleteLibraryAssetFromDb,
  deleteLibraryCollectionFromDb,
  deleteLibrarySmartFolderFromDb,
  findLibraryAssetByOwnerHashFromDb,
  getLibraryAssetFromDb,
  isLibraryAssetFavoriteInDb,
  listLibraryCollectionsFromDb,
  listLibrarySmartFoldersFromDb,
  queryLibraryAssetIdsFromDb,
  queryLibraryAssetsFromDb,
  queryLibraryTagSuggestionsFromDb,
  replaceLibraryAssetCollectionsFromDb,
  saveLibraryAssetToDb,
  saveLibraryCollectionToDb,
  saveLibrarySmartFolderToDb,
  setLibraryAssetFavoriteInDb,
  type LibraryDatabaseCursor,
} from "./database";
import { readLibraryImageDimensions } from "./library-image";
import {
  applyLibraryTagChanges,
  emptyLibraryTagProfile,
  mergeLibraryTagProfile,
  normalizeLibraryManualOverrides,
  normalizeStringList,
} from "./library-tags";
import { compareLibraryText, libraryListSortDirection, normalizeLibraryListSort } from "./library-sort";
import { libraryThumbnailVersion } from "./library-thumbnails";
import { deleteRuntimeMediaObject, persistLibraryObject } from "./runtime-media-storage";
import type {
  LibraryAsset,
  LibraryAssetFilters,
  LibraryAssetPage,
  LibraryBatchResult,
  LibraryCollection,
  LibraryCollectionBatchRequest,
  LibraryCollectionBatchResult,
  LibraryListSort,
  LibraryManualTagOverrides,
  LibraryNavigation,
  LibrarySelection,
  LibrarySmartFolder,
  LibrarySmartFolderCondition,
  LibraryTagBatchResult,
  LibraryTaggingJob,
  LibraryTaggingStatus,
  LibraryTagSuggestion,
  LibraryVisibility,
} from "./types";
import { isWorkspaceAdmin, scopeWorkspaceOwner, type WorkspaceAccessActor } from "./workspace-ownership";

const maxImageBytes = 30 * 1024 * 1024;
const pageLimitMax = 100;
const validVisibility = new Set<LibraryVisibility>(["private", "team"]);
const validTaggingStatuses = new Set<LibraryTaggingStatus>(["idle", "queued", "running", "completed", "failed"]);
const validSmartFolderFields = new Set<LibrarySmartFolderCondition["field"]>([
  "tag", "collection", "text", "owner", "visibility", "imageType", "width", "height", "byteSize", "createdAt", "taggingStatus", "favorite",
]);
const validSmartFolderOperators = new Set<LibrarySmartFolderCondition["operator"]>([
  "contains", "not_contains", "equals", "one_of", "gte", "lte", "before", "after", "is",
]);
const smartFolderOperators: Record<LibrarySmartFolderCondition["field"], Set<LibrarySmartFolderCondition["operator"]>> = {
  tag: new Set(["contains", "not_contains"]), collection: new Set(["contains", "not_contains"]), text: new Set(["contains", "not_contains"]),
  owner: new Set(["equals", "one_of"]), visibility: new Set(["equals", "one_of"]), imageType: new Set(["equals", "one_of", "not_contains"]),
  width: new Set(["equals", "gte", "lte"]), height: new Set(["equals", "gte", "lte"]), byteSize: new Set(["equals", "gte", "lte"]),
  createdAt: new Set(["before", "after"]), taggingStatus: new Set(["equals", "one_of"]), favorite: new Set(["is"]),
};

export type PatchLibraryAssetInput = Partial<Pick<LibraryAsset, "name" | "note" | "visibility">> & {
  collectionIds?: string[];
  manualOverrides?: LibraryManualTagOverrides;
  restoreAi?: Array<keyof LibraryManualTagOverrides>;
};

export type ImportLibraryAssetInput = {
  bytes: Buffer;
  originalName: string;
  relativePath?: string;
  visibility?: LibraryVisibility;
  collectionIds?: string[];
  manualCustomTags?: string[];
  owner?: { id: string; displayName: string };
};

export async function listLibraryAssets(account: WorkspaceAccessActor, filters: LibraryAssetFilters = {}): Promise<LibraryAssetPage> {
  const normalized = normalizeLibraryAssetFilters(filters);
  const smartFolder = normalized.smartFolderId ? await requireReadableSmartFolder(account, normalized.smartFolderId) : undefined;
  if (normalized.collectionId) await requireReadableCollection(account, normalized.collectionId);
  const sort = normalized.sort || "newest";
  const signature = filterSignature(normalized);
  const cursor = decodeCursor(normalized.cursor, sort, signature);
  const result = await queryLibraryAssetsFromDb({
    actorId: account.id,
    isAdmin: isWorkspaceAdmin(account),
    filters: normalized,
    smartFolder,
    cursor,
  });
  const assets = result.assets.map((asset) => libraryAssetView(account, asset));
  return {
    assets,
    total: result.total,
    nextCursor: result.hasMore && assets.length ? encodeCursor(assets[assets.length - 1], sort, signature) : undefined,
  };
}

export async function listLibraryNavigation(account: WorkspaceAccessActor): Promise<LibraryNavigation> {
  const [collections, smartFolders, all, uncategorized, favorites] = await Promise.all([
    listLibraryCollectionsFromDb(),
    listLibrarySmartFoldersFromDb(),
    queryLibraryAssetsFromDb({ actorId: account.id, isAdmin: isWorkspaceAdmin(account), filters: { limit: 1 } }),
    queryLibraryAssetsFromDb({ actorId: account.id, isAdmin: isWorkspaceAdmin(account), filters: { limit: 1, uncategorized: true } }),
    queryLibraryAssetsFromDb({ actorId: account.id, isAdmin: isWorkspaceAdmin(account), filters: { limit: 1, favorite: true } }),
  ]);
  return {
    collections: collections.filter((item) => canReadOrganizer(account, item)).map((item) => ({ ...item, canEdit: canEditOrganizer(account, item) })),
    smartFolders: smartFolders.filter((item) => canReadOrganizer(account, item)).map((item) => ({ ...item, canEdit: canEditOrganizer(account, item) })),
    counts: { all: all.total, uncategorized: uncategorized.total, favorites: favorites.total },
  };
}

export async function resolveLibraryAssetSelections(account: WorkspaceAccessActor, assetIds: unknown[]) {
  const ids = normalizeIdArray(assetIds, "asset");
  if (!ids.length) return [];
  return Promise.all(ids.map(async (id) => {
    const asset = await getLibraryAssetFromDb(id);
    if (!asset || !canReadAsset(account, asset)) throw new Error(`Library asset is not accessible: ${id}`);
    return libraryAssetView(account, { ...asset, favorite: await isLibraryAssetFavoriteInDb(account.id, id) });
  }));
}

export async function resolveLibrarySelectionIds(account: WorkspaceAccessActor, selection: LibrarySelection) {
  if (selection.mode === "ids") {
    const assets = await resolveLibraryAssetSelections(account, selection.assetIds);
    return assets.map((asset) => asset.id);
  }
  const filters = normalizeLibraryAssetFilters({ ...selection.filters, cursor: undefined, limit: undefined });
  const smartFolder = filters.smartFolderId ? await requireReadableSmartFolder(account, filters.smartFolderId) : undefined;
  if (filters.collectionId) await requireReadableCollection(account, filters.collectionId);
  return queryLibraryAssetIdsFromDb(
    { actorId: account.id, isAdmin: isWorkspaceAdmin(account), filters, smartFolder },
    normalizeIdArray(selection.excludedAssetIds || [], "excluded asset"),
  );
}

export async function listLibraryTagSuggestions(account: WorkspaceAccessActor, filters: { query?: string; limit?: number } = {}): Promise<LibraryTagSuggestion[]> {
  return queryLibraryTagSuggestionsFromDb({ actorId: account.id, isAdmin: isWorkspaceAdmin(account), query: filters.query, limit: filters.limit });
}

export async function updateLibraryAssetTags(
  account: WorkspaceAccessActor,
  input: { selection: LibrarySelection; add?: string[]; remove?: string[] },
): Promise<LibraryTagBatchResult> {
  const assetIds = await resolveLibrarySelectionIds(account, input.selection);
  const add = normalizeStringList(input.add);
  const remove = normalizeStringList(input.remove);
  if (!assetIds.length) throw new Error("Select at least one library asset.");
  if (!add.length && !remove.length) throw new Error("Add or remove at least one tag.");
  const result: LibraryTagBatchResult = { assets: [], failures: [] };
  for (const assetId of assetIds) {
    try {
      const asset = await requireEditableAsset(account, assetId);
      const manualOverrides = applyLibraryTagChanges({ effectiveTags: asset.effectiveTags, manualOverrides: asset.manualOverrides }, { add, remove });
      result.assets.push(await patchLibraryAsset(account, assetId, { manualOverrides }));
    } catch (error) {
      result.failures.push({ assetId, error: errorMessage(error) });
    }
  }
  return result;
}

export async function renameLibraryTag(account: WorkspaceAccessActor, input: { from: string; to: string }) {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to) throw new Error("Both source and target tags are required.");
  return updateLibraryAssetTags(account, {
    selection: { mode: "query", filters: { tags: [from] } }, add: [to], remove: [from],
  });
}

export async function getLibraryAsset(account: WorkspaceAccessActor, assetId: string) {
  const asset = await getLibraryAssetFromDb(assetId);
  if (!asset || !canReadAsset(account, asset)) throw new Error("Library asset not found.");
  return libraryAssetView(account, { ...asset, favorite: await isLibraryAssetFavoriteInDb(account.id, assetId) });
}

export async function createLibraryCollection(
  account: WorkspaceAccessActor,
  input: { name: string; visibility?: LibraryVisibility; parentId?: string },
) {
  const name = normalizeCollectionName(input.name);
  const visibility = requireVisibility(input.visibility || "private");
  const collections = await listLibraryCollectionsFromDb();
  const parent = input.parentId ? collections.find((item) => item.id === input.parentId) : undefined;
  if (input.parentId && (!parent || !canEditOrganizer(account, parent))) throw new Error("Parent collection not found or is read-only.");
  const owner = parent ? { ownerUserId: parent.ownerUserId, ownerDisplayName: parent.ownerDisplayName } : scopeWorkspaceOwner(account);
  const relativePath = parent?.relativePath ? `${parent.relativePath}/${name}` : name;
  const existing = collections.find((item) => item.ownerUserId === owner.ownerUserId && item.relativePath === relativePath);
  if (existing) return { ...existing, canEdit: canEditOrganizer(account, existing) };
  const now = new Date().toISOString();
  const collection: LibraryCollection = {
    id: `library-collection-${randomUUID()}`,
    ...owner,
    visibility,
    kind: "folder",
    name,
    parentId: parent?.id,
    relativePath,
    createdAt: now,
    updatedAt: now,
  };
  await saveLibraryCollectionToDb(collection);
  return { ...collection, canEdit: true };
}

export async function updateLibraryCollection(account: WorkspaceAccessActor, collectionId: string, input: { name?: string; visibility?: LibraryVisibility; parentId?: string | null }) {
  const collections = await listLibraryCollectionsFromDb();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection || !canEditOrganizer(account, collection)) throw new Error("Library collection not found or is read-only.");
  let parentId = collection.parentId;
  if (input.parentId !== undefined) {
    parentId = input.parentId || undefined;
    if (parentId === collectionId) throw new Error("A collection cannot contain itself.");
    if (parentId) {
      const parent = collections.find((item) => item.id === parentId);
      if (!parent || !canEditOrganizer(account, parent) || parent.ownerUserId !== collection.ownerUserId) throw new Error("Parent collection not found or is read-only.");
      if (collectionDescendantIds(collections, collectionId).has(parentId)) throw new Error("A collection cannot be moved into its descendant.");
    }
  }
  const next = {
    ...collection,
    name: input.name === undefined ? collection.name : normalizeCollectionName(input.name),
    visibility: input.visibility === undefined ? collection.visibility : requireVisibility(input.visibility),
    parentId,
    updatedAt: new Date().toISOString(),
  };
  next.relativePath = next.parentId
    ? `${collections.find((item) => item.id === next.parentId)?.relativePath || ""}/${next.name}`.replace(/^\//, "")
    : next.name;
  await saveLibraryCollectionToDb(next);
  await refreshCollectionDescendantPaths(collections.map((item) => item.id === collectionId ? next : item), collectionId);
  return { ...next, canEdit: true };
}

export async function deleteLibraryCollection(account: WorkspaceAccessActor, collectionId: string) {
  const collections = await listLibraryCollectionsFromDb();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection || !canEditOrganizer(account, collection)) throw new Error("Library collection not found or is read-only.");
  const now = new Date().toISOString();
  const reparented = collections.map((item) => item.parentId === collectionId ? { ...item, parentId: collection.parentId, updatedAt: now } : item);
  for (const child of reparented.filter((item) => item.parentId === collection.parentId && collections.find((current) => current.id === item.id)?.parentId === collectionId)) {
    const parentPath = child.parentId ? reparented.find((item) => item.id === child.parentId)?.relativePath : undefined;
    child.relativePath = parentPath ? `${parentPath}/${child.name}` : child.name;
    await saveLibraryCollectionToDb(child);
    await refreshCollectionDescendantPaths(reparented, child.id);
  }
  await deleteLibraryCollectionFromDb(collectionId);
  return { deleted: true, collectionId };
}

export async function updateLibraryAssetCollections(account: WorkspaceAccessActor, input: LibraryCollectionBatchRequest): Promise<LibraryCollectionBatchResult> {
  const assetIds = await resolveLibrarySelectionIds(account, input.selection);
  if (!assetIds.length) throw new Error("Select at least one library asset.");
  if (input.action === "add_to_collections") {
    const collectionIds = normalizeIdArray(input.collectionIds, "collection");
    await requireManageableCollections(account, collectionIds);
    return updateCollectionMemberships(account, input.action, assetIds, collectionIds);
  }
  if (input.action === "remove_from_collection") {
    const collectionId = normalizeIdArray([input.collectionId], "collection")[0];
    await requireManageableCollections(account, [collectionId]);
    return updateCollectionMemberships(account, input.action, assetIds, [collectionId]);
  }
  const parentId = input.parentId?.trim() || undefined;
  if (parentId) await requireManageableCollections(account, [parentId]);
  const collection = await createLibraryCollection(account, { name: input.name, parentId });
  const result = await updateCollectionMemberships(account, input.action, assetIds, [collection.id]);
  return { ...result, collection };
}

export async function importLibraryAsset(account: WorkspaceAccessActor, input: ImportLibraryAssetInput) {
  const visibility = requireVisibility(input.visibility || "team");
  if (!input.bytes.length) throw new Error("Image file is empty.");
  if (input.bytes.length > maxImageBytes) throw new Error("Image exceeds the 30 MB limit.");
  const format = detectImageFormat(input.bytes);
  if (!format) throw new Error("Unsupported or invalid image file. Use JPEG, PNG, GIF, or WebP.");
  const owner = input.owner || { id: account.id, displayName: account.displayName || account.id };
  if (owner.id !== account.id && !isWorkspaceAdmin(account)) throw new Error("Cannot import for another owner.");
  const requestedCollections = normalizeIdArray(input.collectionIds || [], "collection");
  if (requestedCollections.length) await requireManageableCollections(account, requestedCollections);
  const relativePath = normalizeRelativePath(input.relativePath || input.originalName);
  const directoryCollection = path.posix.dirname(relativePath) !== "."
    ? await ensureLibraryCollectionPath(account, owner, path.posix.dirname(relativePath), requestedCollections[0])
    : undefined;
  const collectionIds = stableCollectionUnion(requestedCollections, directoryCollection ? [directoryCollection] : []);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const duplicate = await findLibraryAssetByOwnerHashFromDb(owner.id, sha256);
  if (duplicate) {
    const nextCollections = stableCollectionUnion(duplicate.collectionIds, collectionIds);
    if (!sameStringList(duplicate.collectionIds, nextCollections)) await replaceLibraryAssetCollectionsFromDb(duplicate.id, nextCollections);
    return { status: "skipped_duplicate" as const, asset: libraryAssetView(account, { ...duplicate, collectionIds: nextCollections }) };
  }
  const publicPath = `/library/${safeObjectSegment(owner.id)}/${sha256}${format.extension}`;
  const uploaded = await persistLibraryObject({ publicPath, body: input.bytes, contentType: format.mimeType });
  const now = new Date().toISOString();
  const aiTags = emptyLibraryTagProfile();
  const manualOverrides = input.manualCustomTags?.length ? normalizeLibraryManualOverrides({ customTags: input.manualCustomTags }) : {};
  const dimensions = readLibraryImageDimensions(input.bytes, format.mimeType);
  const asset: LibraryAsset = {
    id: `library-${randomUUID()}`,
    ownerUserId: owner.id,
    ownerDisplayName: owner.displayName,
    name: normalizeAssetName(path.posix.basename(relativePath) || input.originalName),
    originalName: normalizeAssetName(input.originalName),
    relativePath,
    objectKey: uploaded.objectKey,
    publicUrl: uploaded.publicUrl,
    mimeType: format.mimeType,
    extension: format.extension,
    byteSize: input.bytes.length,
    ...dimensions,
    sha256,
    collectionIds,
    note: "",
    visibility,
    aiTags,
    manualOverrides,
    effectiveTags: mergeLibraryTagProfile(aiTags, manualOverrides),
    taggingStatus: "idle",
    cleanupStatus: "ready",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await saveLibraryAssetToDb(asset);
    if (collectionIds.length) await replaceLibraryAssetCollectionsFromDb(asset.id, collectionIds, now);
  } catch (error) {
    try { await deleteRuntimeMediaObject(uploaded.objectKey); } catch (cleanupError) {
      throw new Error(`${errorMessage(error)} Object rollback also failed: ${errorMessage(cleanupError)}`);
    }
    if (isUniqueConstraintError(error)) {
      const racedDuplicate = await findLibraryAssetByOwnerHashFromDb(owner.id, sha256);
      if (racedDuplicate) return { status: "skipped_duplicate" as const, asset: libraryAssetView(account, racedDuplicate) };
    }
    throw error;
  }
  return { status: "imported" as const, asset: libraryAssetView(account, asset) };
}

export async function patchLibraryAsset(account: WorkspaceAccessActor, assetId: string, patch: PatchLibraryAssetInput) {
  return (await patchLibraryAssetWithResult(account, assetId, patch)).asset;
}

export async function patchLibraryAssetWithResult(account: WorkspaceAccessActor, assetId: string, patch: PatchLibraryAssetInput) {
  const asset = await requireEditableAsset(account, assetId);
  const collectionIds = patch.collectionIds === undefined ? asset.collectionIds : normalizeIdArray(patch.collectionIds, "collection");
  if (patch.collectionIds !== undefined) await requireManageableCollections(account, collectionIds);
  const overrides = { ...asset.manualOverrides, ...(patch.manualOverrides ? normalizeLibraryManualOverrides(patch.manualOverrides) : {}) };
  for (const key of patch.restoreAi || []) delete overrides[key];
  const next: LibraryAsset = {
    ...asset,
    name: patch.name === undefined ? asset.name : normalizeAssetName(patch.name),
    note: patch.note === undefined ? asset.note : normalizeNote(patch.note),
    visibility: patch.visibility === undefined ? asset.visibility : requireVisibility(patch.visibility),
    manualOverrides: overrides,
    effectiveTags: mergeLibraryTagProfile(asset.aiTags, overrides),
    updatedAt: new Date().toISOString(),
  };
  await saveLibraryAssetToDb(next);
  if (!sameStringList(asset.collectionIds, collectionIds)) await replaceLibraryAssetCollectionsFromDb(asset.id, collectionIds);
  return { asset: libraryAssetView(account, { ...next, collectionIds }), taggingQueued: false };
}

export async function removeLibraryAssetFromCollection(account: WorkspaceAccessActor, collectionId: string, assetId: string) {
  await requireManageableCollections(account, [collectionId]);
  const asset = await getLibraryAsset(account, assetId);
  if (!asset.collectionIds.includes(collectionId)) throw new Error("Asset is not in this collection.");
  await replaceLibraryAssetCollectionsFromDb(assetId, asset.collectionIds.filter((id) => id !== collectionId));
  return { ...asset, collectionIds: asset.collectionIds.filter((id) => id !== collectionId) };
}

export async function setLibraryAssetFavorite(account: WorkspaceAccessActor, assetId: string, favorite: boolean) {
  const asset = await getLibraryAsset(account, assetId);
  await setLibraryAssetFavoriteInDb(account.id, assetId, favorite);
  return { ...asset, favorite };
}

export async function setLibrarySelectionFavorite(account: WorkspaceAccessActor, selection: LibrarySelection, favorite: boolean): Promise<LibraryBatchResult> {
  const assetIds = await resolveLibrarySelectionIds(account, selection);
  return runLibraryBatch(assetIds, async (assetId) => { await setLibraryAssetFavorite(account, assetId, favorite); });
}

export async function setLibrarySelectionVisibility(account: WorkspaceAccessActor, selection: LibrarySelection, visibility: LibraryVisibility): Promise<LibraryBatchResult> {
  const assetIds = await resolveLibrarySelectionIds(account, selection);
  const nextVisibility = requireVisibility(visibility);
  return runLibraryBatch(assetIds, async (assetId) => { await patchLibraryAsset(account, assetId, { visibility: nextVisibility }); });
}

export async function permanentlyDeleteLibrarySelection(account: WorkspaceAccessActor, selection: LibrarySelection): Promise<LibraryBatchResult> {
  const assetIds = await resolveLibrarySelectionIds(account, selection);
  return runLibraryBatch(assetIds, async (assetId) => {
    const result = await permanentlyDeleteLibraryAsset(account, assetId);
    if (result.status !== "deleted") throw new Error(result.asset.cleanupError || "Object cleanup failed.");
  });
}

export async function permanentlyDeleteLibraryAsset(account: WorkspaceAccessActor, assetId: string) {
  const asset = await requireEditableAsset(account, assetId);
  const pending = { ...asset, cleanupStatus: "pending" as const, cleanupError: undefined, updatedAt: new Date().toISOString() };
  await saveLibraryAssetToDb(pending);
  try {
    await deleteRuntimeMediaObject(asset.objectKey);
    await deleteLibraryAssetFromDb(asset.id);
    return { status: "deleted" as const, assetId };
  } catch (error) {
    const failed = { ...pending, cleanupStatus: "failed" as const, cleanupError: errorMessage(error).slice(0, 500), updatedAt: new Date().toISOString() };
    await saveLibraryAssetToDb(failed);
    return { status: "cleanup_failed" as const, asset: libraryAssetView(account, failed) };
  }
}

export async function listLibrarySmartFolders(account: WorkspaceAccessActor) {
  return (await listLibrarySmartFoldersFromDb()).filter((folder) => canReadOrganizer(account, folder)).map((folder) => ({ ...folder, canEdit: canEditOrganizer(account, folder) }));
}

export async function createLibrarySmartFolder(account: WorkspaceAccessActor, input: Pick<LibrarySmartFolder, "name" | "visibility" | "match" | "conditions">) {
  const now = new Date().toISOString();
  const owner = scopeWorkspaceOwner(account);
  const folder: LibrarySmartFolder = {
    id: `library-smart-${randomUUID()}`,
    ...owner,
    name: normalizeCollectionName(input.name),
    visibility: requireVisibility(input.visibility || "private"),
    match: input.match === "any" ? "any" : "all",
    conditions: normalizeSmartFolderConditions(input.conditions),
    createdAt: now,
    updatedAt: now,
  };
  await validateSmartFolderCollectionAccess(account, folder.conditions);
  await saveLibrarySmartFolderToDb(folder);
  return { ...folder, canEdit: true };
}

export async function updateLibrarySmartFolder(account: WorkspaceAccessActor, folderId: string, input: Partial<Pick<LibrarySmartFolder, "name" | "visibility" | "match" | "conditions">>) {
  const folder = await requireEditableSmartFolder(account, folderId);
  const conditions = input.conditions === undefined ? folder.conditions : normalizeSmartFolderConditions(input.conditions);
  await validateSmartFolderCollectionAccess(account, conditions);
  const next: LibrarySmartFolder = {
    ...folder,
    name: input.name === undefined ? folder.name : normalizeCollectionName(input.name),
    visibility: input.visibility === undefined ? folder.visibility : requireVisibility(input.visibility),
    match: input.match === undefined ? folder.match : input.match === "any" ? "any" : "all",
    conditions,
    updatedAt: new Date().toISOString(),
  };
  delete next.canEdit;
  await saveLibrarySmartFolderToDb(next);
  return { ...next, canEdit: true };
}

export async function deleteLibrarySmartFolder(account: WorkspaceAccessActor, folderId: string) {
  await requireEditableSmartFolder(account, folderId);
  await deleteLibrarySmartFolderFromDb(folderId);
  return { deleted: true, folderId };
}

export function makeLibraryTaggingJob(asset: LibraryAsset, now = new Date().toISOString()): LibraryTaggingJob {
  return { id: `library-tag-${randomUUID()}`, assetId: asset.id, ownerUserId: asset.ownerUserId, status: "queued", attempts: 0, maxAttempts: 3, runAfter: now, createdAt: now, updatedAt: now };
}

export function parseLibraryAssetFilters(url: URL): LibraryAssetFilters {
  const list = (name: string) => normalizeStringList(url.searchParams.getAll(name).flatMap((value) => value.split(",")));
  if (url.searchParams.has("role")) throw new Error("Library role filters are no longer supported. Use a collection or smart folder.");
  const visibility = url.searchParams.get("visibility") as LibraryVisibility | null;
  const taggingStatus = url.searchParams.get("taggingStatus") as LibraryTaggingStatus | null;
  const addedFrom = parseLibraryDateFilter(url.searchParams.get("addedFrom"), "addedFrom");
  const addedBefore = parseLibraryDateFilter(url.searchParams.get("addedBefore"), "addedBefore");
  if (addedFrom && addedBefore && addedFrom >= addedBefore) throw new Error("Library added-time range must start before it ends.");
  return normalizeLibraryAssetFilters({
    cursor: url.searchParams.get("cursor") || undefined,
    limit: Number(url.searchParams.get("limit") || 60),
    search: url.searchParams.get("search") || undefined,
    collectionId: url.searchParams.get("collectionId") || undefined,
    includeDescendants: url.searchParams.get("includeDescendants") !== "false",
    smartFolderId: url.searchParams.get("smartFolderId") || undefined,
    uncategorized: url.searchParams.get("uncategorized") === "true",
    favorite: url.searchParams.get("favorite") === "true",
    visibility: visibility && validVisibility.has(visibility) ? visibility : undefined,
    taggingStatus: taggingStatus && validTaggingStatuses.has(taggingStatus) ? taggingStatus : undefined,
    imageTypes: list("imageType"), scenes: list("scene"), vehicleModels: list("vehicleModel"), vehicleColors: list("vehicleColor"),
    angles: list("angle"), people: list("people"), customTags: list("customTag"), tags: list("tag"), ownerIds: list("ownerId"),
    minWidth: optionalNumber(url.searchParams.get("minWidth")), maxWidth: optionalNumber(url.searchParams.get("maxWidth")),
    minHeight: optionalNumber(url.searchParams.get("minHeight")), maxHeight: optionalNumber(url.searchParams.get("maxHeight")),
    minByteSize: optionalNumber(url.searchParams.get("minByteSize")), maxByteSize: optionalNumber(url.searchParams.get("maxByteSize")),
    sort: normalizeLibraryListSort(url.searchParams.get("sort")), addedFrom, addedBefore,
  });
}

export function parseLibrarySelection(value: unknown): LibrarySelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("selection is required.");
  const selection = value as Record<string, unknown>;
  if (selection.mode === "ids") {
    if (!Array.isArray(selection.assetIds)) throw new Error("selection.assetIds must be an array.");
    return { mode: "ids", assetIds: normalizeIdArray(selection.assetIds, "asset") };
  }
  if (selection.mode === "query") {
    if (!selection.filters || typeof selection.filters !== "object" || Array.isArray(selection.filters)) throw new Error("selection.filters is required.");
    return {
      mode: "query",
      filters: selection.filters as LibraryAssetFilters,
      excludedAssetIds: normalizeIdArray(Array.isArray(selection.excludedAssetIds) ? selection.excludedAssetIds : [], "excluded asset"),
    };
  }
  throw new Error("selection.mode must be ids or query.");
}

export function compareAssets(left: LibraryAsset, right: LibraryAsset, sort: LibraryListSort = "newest") {
  const direction = libraryListSortDirection(sort);
  const leftValue = assetSortValue(left, sort);
  const rightValue = assetSortValue(right, sort);
  const value = sort === "newest" || sort === "oldest" ? leftValue.localeCompare(rightValue) : compareLibraryText(leftValue, rightValue);
  return direction * value || direction * left.id.localeCompare(right.id);
}

async function updateCollectionMemberships(account: WorkspaceAccessActor, action: LibraryCollectionBatchRequest["action"], assetIds: string[], collectionIds: string[]): Promise<LibraryCollectionBatchResult> {
  const result: LibraryCollectionBatchResult = { action, assets: [], unchangedAssetIds: [], failures: [] };
  for (const assetId of assetIds) {
    try {
      const asset = await getLibraryAssetFromDb(assetId);
      if (!asset || !canReadAsset(account, asset)) throw new Error("Library asset not found.");
      const nextIds = action === "remove_from_collection" ? asset.collectionIds.filter((id) => id !== collectionIds[0]) : stableCollectionUnion(asset.collectionIds, collectionIds);
      if (sameStringList(asset.collectionIds, nextIds)) { result.unchangedAssetIds.push(assetId); continue; }
      await replaceLibraryAssetCollectionsFromDb(assetId, nextIds);
      result.assets.push(libraryAssetView(account, { ...asset, collectionIds: nextIds }));
    } catch (error) {
      result.failures.push({ assetId, error: errorMessage(error) });
    }
  }
  return result;
}

async function ensureLibraryCollectionPath(account: WorkspaceAccessActor, owner: { id: string; displayName: string }, relativePath: string, parentId?: string) {
  const collections = await listLibraryCollectionsFromDb();
  let parent = parentId ? collections.find((item) => item.id === parentId) : undefined;
  if (parentId && (!parent || !canEditOrganizer(account, parent))) throw new Error("Parent collection not found or is read-only.");
  for (const segment of normalizeRelativePath(relativePath).split("/").filter(Boolean)) {
    const currentPath = parent?.relativePath ? `${parent.relativePath}/${segment}` : segment;
    let collection = collections.find((item) => item.ownerUserId === owner.id && item.relativePath === currentPath);
    if (!collection) {
      collection = await createLibraryCollection(account, { name: segment, visibility: "private", parentId: parent?.id });
      collections.push(collection);
    }
    parent = collection;
  }
  return parent?.id;
}

async function requireManageableCollections(account: WorkspaceAccessActor, ids: string[]) {
  const collections = await listLibraryCollectionsFromDb();
  return ids.map((id) => {
    const collection = collections.find((item) => item.id === id);
    if (!collection || !canEditOrganizer(account, collection)) throw new Error(`Library collection is not manageable: ${id}`);
    return collection;
  });
}

async function requireReadableCollection(account: WorkspaceAccessActor, id: string) {
  const collection = (await listLibraryCollectionsFromDb()).find((item) => item.id === id);
  if (!collection || !canReadOrganizer(account, collection)) throw new Error("Library collection not found.");
  return collection;
}

async function requireReadableSmartFolder(account: WorkspaceAccessActor, id: string) {
  const folder = (await listLibrarySmartFoldersFromDb()).find((item) => item.id === id);
  if (!folder || !canReadOrganizer(account, folder)) throw new Error("Library smart folder not found.");
  return folder;
}

async function requireEditableSmartFolder(account: WorkspaceAccessActor, id: string) {
  const folder = await requireReadableSmartFolder(account, id);
  if (!canEditOrganizer(account, folder)) throw new Error("Library smart folder is read-only.");
  return folder;
}

async function validateSmartFolderCollectionAccess(account: WorkspaceAccessActor, conditions: LibrarySmartFolderCondition[]) {
  for (const condition of conditions) if (condition.field === "collection" && typeof condition.value === "string") await requireReadableCollection(account, condition.value);
}

function normalizeSmartFolderConditions(value: unknown): LibrarySmartFolderCondition[] {
  if (!Array.isArray(value) || !value.length) throw new Error("A smart folder requires at least one condition.");
  if (value.length > 20) throw new Error("A smart folder supports at most 20 conditions.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Smart folder condition ${index + 1} is invalid.`);
    const input = item as Partial<LibrarySmartFolderCondition>;
    if (!input.field || !validSmartFolderFields.has(input.field)) throw new Error(`Smart folder condition ${index + 1} has an invalid field.`);
    if (!input.operator || !validSmartFolderOperators.has(input.operator)) throw new Error(`Smart folder condition ${index + 1} has an invalid operator.`);
    if (!smartFolderOperators[input.field].has(input.operator)) throw new Error(`Smart folder condition ${index + 1} does not support that operator.`);
    if (input.value === undefined || input.value === null || input.value === "") throw new Error(`Smart folder condition ${index + 1} requires a value.`);
    return { id: typeof input.id === "string" && input.id.trim() ? input.id.trim().slice(0, 80) : `condition-${index + 1}`, field: input.field, operator: input.operator, value: input.value, includeDescendants: input.includeDescendants !== false };
  });
}

function normalizeLibraryAssetFilters(filters: LibraryAssetFilters): LibraryAssetFilters {
  return {
    ...filters,
    limit: Math.max(1, Math.min(pageLimitMax, Math.floor(filters.limit || 60))),
    sort: normalizeLibraryListSort(filters.sort),
    search: filters.search?.trim().slice(0, 200) || undefined,
    collectionId: filters.collectionId?.trim() || undefined,
    smartFolderId: filters.smartFolderId?.trim() || undefined,
    tags: normalizeStringList(filters.tags, 20), imageTypes: normalizeStringList(filters.imageTypes, 20), scenes: normalizeStringList(filters.scenes, 20),
    vehicleModels: normalizeStringList(filters.vehicleModels, 20), vehicleColors: normalizeStringList(filters.vehicleColors, 20), angles: normalizeStringList(filters.angles, 20),
    people: normalizeStringList(filters.people, 20), customTags: normalizeStringList(filters.customTags, 20), ownerIds: normalizeStringList(filters.ownerIds, 20),
  };
}

type LibraryAssetCursor = { version: 3; sort: LibraryListSort; signature: string; value: string; id: string };

function encodeCursor(asset: LibraryAsset, sort: LibraryListSort, signature: string) {
  const cursor: LibraryAssetCursor = { version: 3, sort, signature, value: assetSortValue(asset, sort), id: asset.id };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | undefined, sort: LibraryListSort, signature: string): LibraryDatabaseCursor | undefined {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<LibraryAssetCursor>;
    if (decoded.version === 3 && decoded.sort === sort && decoded.signature === signature && typeof decoded.value === "string" && typeof decoded.id === "string") return { value: decoded.value, id: decoded.id };
  } catch { throw new Error("Invalid library cursor."); }
  throw new Error("Invalid library cursor.");
}

function filterSignature(filters: LibraryAssetFilters) {
  const { cursor: _cursor, limit: _limit, ...stable } = filters;
  return createHash("sha256").update(stableJson(stable)).digest("hex").slice(0, 16);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function runLibraryBatch(assetIds: string[], operation: (assetId: string) => Promise<void>): Promise<LibraryBatchResult> {
  const result: LibraryBatchResult = { matched: assetIds.length, succeeded: 0, failed: 0, failures: [] };
  for (let offset = 0; offset < assetIds.length; offset += 100) {
    for (const assetId of assetIds.slice(offset, offset + 100)) {
      try {
        await operation(assetId);
        result.succeeded += 1;
      } catch (error) {
        result.failed += 1;
        result.failures.push({ assetId, error: errorMessage(error) });
      }
    }
  }
  return result;
}

function collectionDescendantIds(collections: LibraryCollection[], collectionId: string) {
  const descendants = new Set<string>();
  const pending = [collectionId];
  while (pending.length) {
    const parentId = pending.pop()!;
    for (const child of collections) {
      if (child.parentId !== parentId || descendants.has(child.id)) continue;
      descendants.add(child.id);
      pending.push(child.id);
    }
  }
  return descendants;
}

async function refreshCollectionDescendantPaths(collections: LibraryCollection[], collectionId: string) {
  const parent = collections.find((item) => item.id === collectionId);
  if (!parent) return;
  for (const child of collections.filter((item) => item.parentId === collectionId)) {
    const next = { ...child, relativePath: parent.relativePath ? `${parent.relativePath}/${child.name}` : child.name };
    await saveLibraryCollectionToDb(next);
    const index = collections.findIndex((item) => item.id === next.id);
    if (index >= 0) collections[index] = next;
    await refreshCollectionDescendantPaths(collections, child.id);
  }
}

function assetSortValue(asset: LibraryAsset, sort: LibraryListSort) {
  if (sort === "newest" || sort === "oldest") return asset.createdAt;
  if (sort === "name-asc" || sort === "name-desc") return asset.name.toLocaleLowerCase();
  return asset.ownerDisplayName.toLocaleLowerCase();
}

function libraryAssetView(account: WorkspaceAccessActor, asset: LibraryAsset): LibraryAsset {
  return {
    ...asset,
    canEdit: canEditAsset(account, asset),
    thumbnailUrl: `/api/library/assets/${encodeURIComponent(asset.id)}/thumbnail?version=${libraryThumbnailVersion}`,
  };
}

async function requireEditableAsset(account: WorkspaceAccessActor, assetId: string) {
  const asset = await getLibraryAssetFromDb(assetId);
  if (!asset || !canEditAsset(account, asset)) throw new Error("Library asset not found or is read-only.");
  return asset;
}

function canReadAsset(account: WorkspaceAccessActor, asset: LibraryAsset) { return isWorkspaceAdmin(account) || asset.ownerUserId === account.id || asset.visibility === "team"; }
function canEditAsset(account: WorkspaceAccessActor, asset: LibraryAsset) { return isWorkspaceAdmin(account) || asset.ownerUserId === account.id; }
function canReadOrganizer(account: WorkspaceAccessActor, item: Pick<LibraryCollection | LibrarySmartFolder, "ownerUserId" | "visibility">) { return isWorkspaceAdmin(account) || item.ownerUserId === account.id || item.visibility === "team"; }
function canEditOrganizer(account: WorkspaceAccessActor, item: Pick<LibraryCollection | LibrarySmartFolder, "ownerUserId">) { return isWorkspaceAdmin(account) || item.ownerUserId === account.id; }

function requireVisibility(value: LibraryVisibility) { if (!validVisibility.has(value)) throw new Error("Invalid library visibility."); return value; }
function normalizeCollectionName(value: string) { const name = value.trim().replace(/[\u0000-\u001f/\\]/g, "").slice(0, 120); if (!name) throw new Error("Collection name is required."); return name; }
function normalizeAssetName(value: string) { return value.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 160) || "未命名图片"; }
function normalizeNote(value: string) { return value.trim().slice(0, 2000); }
function normalizeRelativePath(value: string) { return value.replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment && segment !== "." && segment !== "..").join("/").slice(0, 500) || "image"; }
function safeObjectSegment(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
function optionalNumber(value: string | null) { if (value === null || !value.trim()) return undefined; const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error("Invalid library numeric filter."); return number; }
function parseLibraryDateFilter(value: string | null, name: "addedFrom" | "addedBefore") { if (value === null) return undefined; const timestamp = Date.parse(value); if (!value.trim() || !Number.isFinite(timestamp)) throw new Error(`Invalid library ${name} timestamp.`); return new Date(timestamp).toISOString(); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function isUniqueConstraintError(error: unknown) { const message = errorMessage(error); const code = error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : ""; return code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || /unique constraint|UNIQUE constraint failed/i.test(message); }
function normalizeIdArray(values: unknown[], label: string) { const result: string[] = []; const seen = new Set<string>(); for (const value of values) { if (typeof value !== "string" || !value.trim()) throw new Error(`Each library ${label} id must be a non-empty string.`); const id = value.trim(); if (!seen.has(id)) { seen.add(id); result.push(id); } } return result; }
function stableCollectionUnion(current: string[], requested: string[]) { const result = [...current]; const seen = new Set(current); for (const id of requested) if (!seen.has(id)) { seen.add(id); result.push(id); } return result; }
function sameStringList(left: string[], right: string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }

function detectImageFormat(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: "image/png", extension: ".png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: ".jpg" };
  if (bytes.length >= 6 && /GIF8[79]a/.test(bytes.subarray(0, 6).toString("ascii"))) return { mimeType: "image/gif", extension: ".gif" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", extension: ".webp" };
  return undefined;
}
