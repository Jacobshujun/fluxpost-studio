import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  deleteLibraryAssetFromDb,
  findLibraryAssetByLegacyMaterialIdFromDb,
  findLibraryAssetByOwnerHashFromDb,
  getLibraryAssetFromDb,
  listLibraryAssetsFromDb,
  listLibraryCollectionsFromDb,
  saveLibraryAssetAndTaggingJobToDb,
  saveLibraryAssetToDb,
  saveLibraryCollectionToDb,
} from "./database";
import { readLibraryImageDimensions } from "./library-image";
import {
  applyLibraryTagChanges,
  emptyLibraryTagProfile,
  getLibraryTagProfileForRole,
  getLibraryUnifiedTagLabels,
  getLibraryUnifiedTagLabelsForRole,
  matchesAllLibraryTags,
  mergeLibraryTagProfile,
  normalizeLibraryTagKey,
  normalizeLibraryManualOverrides,
  normalizeStringList,
} from "./library-tags";
import { listMaterialLibrary } from "./material-library";
import { deleteRuntimeMediaObject, persistLibraryObject } from "./runtime-media-storage";
import type {
  LibraryAsset,
  LibraryAssetPage,
  LibraryAssetRole,
  LibraryCollection,
  LibraryManualTagOverrides,
  LibraryTagProfile,
  LibraryTaggingJob,
  LibraryTaggingStatus,
  LibraryTagBatchResult,
  LibraryTagSuggestion,
  LibraryVisibility,
  MaterialLibraryAsset,
} from "./types";
import { isWorkspaceAdmin, scopeWorkspaceOwner, type WorkspaceAccessActor } from "./workspace-ownership";

const maxImageBytes = 30 * 1024 * 1024;
const pageLimitMax = 100;
const validRoles = new Set<LibraryAssetRole>(["reference", "vehicle"]);
const validVisibility = new Set<LibraryVisibility>(["private", "team"]);
const validTaggingStatuses = new Set<LibraryTaggingStatus>(["queued", "running", "completed", "failed"]);

export type LibraryAssetFilters = {
  cursor?: string;
  limit?: number;
  search?: string;
  role?: LibraryAssetRole;
  collectionId?: string;
  visibility?: LibraryVisibility;
  taggingStatus?: LibraryTaggingStatus;
  imageTypes?: string[];
  scenes?: string[];
  vehicleModels?: string[];
  vehicleColors?: string[];
  angles?: string[];
  people?: string[];
  customTags?: string[];
  tags?: string[];
};

export type PatchLibraryAssetInput = Partial<Pick<LibraryAsset, "name" | "roles" | "visibility" | "collectionIds">> & {
  manualOverrides?: LibraryManualTagOverrides;
  restoreAi?: Array<keyof LibraryManualTagOverrides>;
};

export type ImportLibraryAssetInput = {
  bytes: Buffer;
  originalName: string;
  relativePath?: string;
  role: LibraryAssetRole;
  visibility?: LibraryVisibility;
  collectionId?: string;
  legacyMaterialAssetId?: string;
  manualCustomTags?: string[];
  owner?: { id: string; displayName: string };
};

export async function listLibraryAssets(account: WorkspaceAccessActor, filters: LibraryAssetFilters = {}): Promise<LibraryAssetPage> {
  const collections = await listLibraryCollectionsFromDb();
  const visibleCollections = collections.filter((item) => isWorkspaceAdmin(account) || item.ownerUserId === account.id);
  const cursor = decodeCursor(filters.cursor);
  const query = normalizeSearch(filters.search);
  const assets = (await listLibraryAssetsFromDb())
    .filter((asset) => canReadAsset(account, asset))
    .filter((asset) => !filters.role || asset.roles.includes(filters.role))
    .map((asset) => ({ asset, tagProfile: filters.role ? getLibraryTagProfileForRole(asset, filters.role) : asset.effectiveTags }))
    .filter(({ asset }) => !filters.collectionId || asset.collectionIds.includes(filters.collectionId))
    .filter(({ asset }) => !filters.visibility || asset.visibility === filters.visibility)
    .filter(({ asset }) => filters.role === "vehicle" || !filters.taggingStatus || asset.taggingStatus === filters.taggingStatus)
    .filter(({ asset, tagProfile }) => !query || searchAsset(asset, tagProfile, query))
    .filter(({ tagProfile }) => matchDimension(tagProfile.imageType ? [tagProfile.imageType] : [], filters.imageTypes))
    .filter(({ tagProfile }) => matchDimension(tagProfile.scenes, filters.scenes))
    .filter(({ tagProfile }) => matchDimension(tagProfile.vehicleModels, filters.vehicleModels))
    .filter(({ tagProfile }) => matchDimension(tagProfile.vehicleColors, filters.vehicleColors))
    .filter(({ tagProfile }) => matchDimension(tagProfile.angles, filters.angles))
    .filter(({ tagProfile }) => matchDimension([tagProfile.people], filters.people))
    .filter(({ tagProfile }) => matchDimension(tagProfile.customTags, filters.customTags))
    .filter(({ tagProfile }) => matchesAllLibraryTags(tagProfile, filters.tags))
    .sort((left, right) => compareAssets(left.asset, right.asset))
    .map(({ asset }) => asset);
  const total = assets.length;
  const afterCursor = cursor ? assets.filter((asset) => compareAssetToCursor(asset, cursor) > 0) : assets;
  const limit = Math.max(1, Math.min(pageLimitMax, Math.floor(filters.limit || 60)));
  const page = afterCursor.slice(0, limit);
  return {
    assets: page.map((asset) => ({ ...asset, canEdit: canEditAsset(account, asset) })),
    collections: visibleCollections,
    total,
    nextCursor: afterCursor.length > limit && page.length ? encodeCursor(page[page.length - 1]) : undefined,
  };
}

export async function listLibraryTagSuggestions(
  account: WorkspaceAccessActor,
  filters: { role?: LibraryAssetRole; query?: string; limit?: number } = {},
): Promise<LibraryTagSuggestion[]> {
  const query = normalizeSearch(filters.query);
  const counts = new Map<string, LibraryTagSuggestion>();
  for (const asset of await listLibraryAssetsFromDb()) {
    if (!canReadAsset(account, asset) || (filters.role && !asset.roles.includes(filters.role))) continue;
    const labels = filters.role
      ? getLibraryUnifiedTagLabelsForRole(asset, filters.role)
      : getLibraryUnifiedTagLabels(asset.effectiveTags);
    for (const label of labels) {
      if (query && !normalizeSearch(label).includes(query)) continue;
      const key = normalizeLibraryTagKey(label);
      const current = counts.get(key);
      counts.set(key, current ? { ...current, count: current.count + 1 } : { label, count: 1 });
    }
  }
  const limit = Math.max(1, Math.min(50, Math.floor(filters.limit || 20)));
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"))
    .slice(0, limit);
}

export async function updateLibraryAssetTags(
  account: WorkspaceAccessActor,
  input: { role: LibraryAssetRole; assetIds: string[]; add?: string[]; remove?: string[] },
): Promise<LibraryTagBatchResult> {
  const role = requireRole(input.role);
  const assetIds = normalizeStringList(input.assetIds, 100);
  const add = normalizeStringList(input.add);
  const remove = normalizeStringList(input.remove);
  if (!assetIds.length) throw new Error("Select at least one library asset.");
  if (!add.length && !remove.length) throw new Error("Add or remove at least one tag.");

  const result: LibraryTagBatchResult = { assets: [], failures: [] };
  for (const assetId of assetIds) {
    try {
      const asset = await requireEditableAsset(account, assetId);
      if (!asset.roles.includes(role)) throw new Error("Library asset does not belong to the selected library.");
      const manualOverrides = applyLibraryTagChanges({
        effectiveTags: getLibraryTagProfileForRole(asset, role),
        manualOverrides: asset.manualOverrides,
      }, { add, remove });
      result.assets.push(await patchLibraryAsset(account, assetId, { manualOverrides }));
    } catch (error) {
      result.failures.push({ assetId, error: errorMessage(error) });
    }
  }
  return result;
}

export async function getLibraryAsset(account: WorkspaceAccessActor, assetId: string) {
  const asset = await getLibraryAssetFromDb(assetId);
  if (!asset || !canReadAsset(account, asset)) throw new Error("Library asset not found.");
  return { ...asset, canEdit: canEditAsset(account, asset) };
}

export async function createLibraryCollection(
  account: WorkspaceAccessActor,
  input: { name: string; role: LibraryAssetRole; parentId?: string },
) {
  const role = requireRole(input.role);
  const name = input.name.trim().replace(/[\u0000-\u001f/\\]/g, "").slice(0, 120);
  if (!name) throw new Error("Collection name is required.");
  const collections = await listLibraryCollectionsFromDb();
  const parent = input.parentId ? collections.find((item) => item.id === input.parentId) : undefined;
  if (input.parentId && (!parent || (!isWorkspaceAdmin(account) && parent.ownerUserId !== account.id) || parent.role !== role)) {
    throw new Error("Parent collection not found.");
  }
  const relativePath = parent?.relativePath ? `${parent.relativePath}/${name}` : name;
  const existing = collections.find((item) => item.ownerUserId === account.id && item.role === role && item.relativePath === relativePath);
  if (existing) return existing;
  const now = new Date().toISOString();
  const owner = scopeWorkspaceOwner(account);
  const collection: LibraryCollection = {
    id: `library-collection-${randomUUID()}`,
    ownerUserId: owner.ownerUserId,
    ownerDisplayName: owner.ownerDisplayName,
    role,
    name,
    parentId: parent?.id,
    relativePath,
    createdAt: now,
    updatedAt: now,
  };
  await saveLibraryCollectionToDb(collection);
  return collection;
}

export async function importLibraryAsset(account: WorkspaceAccessActor, input: ImportLibraryAssetInput) {
  const role = requireRole(input.role);
  const visibility = requireVisibility(input.visibility || "private");
  if (!input.bytes.length) throw new Error("Image file is empty.");
  if (input.bytes.length > maxImageBytes) throw new Error("Image exceeds the 30 MB limit.");
  const format = detectImageFormat(input.bytes);
  if (!format) throw new Error("Unsupported or invalid image file. Use JPEG, PNG, GIF, or WebP.");
  const owner = input.owner || { id: account.id, displayName: account.displayName || account.id };
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  let duplicate = await findLibraryAssetByOwnerHashFromDb(owner.id, sha256);
  if (duplicate?.roles.includes(role)) {
    return { status: "skipped_duplicate" as const, asset: { ...duplicate, canEdit: canEditAsset(account, duplicate) } };
  }
  if (input.legacyMaterialAssetId) {
    const migrated = await findLibraryAssetByLegacyMaterialIdFromDb(input.legacyMaterialAssetId);
    if (migrated?.roles.includes(role)) {
      return { status: "skipped_duplicate" as const, asset: { ...migrated, canEdit: canEditAsset(account, migrated) } };
    }
    duplicate ||= migrated;
  }

  const relativePath = normalizeRelativePath(input.relativePath || input.originalName);
  const collectionId = input.collectionId
    ? (await validateCollectionIds(account, [input.collectionId], [role]))[0]
    : path.posix.dirname(relativePath) !== "."
      ? await ensureLibraryCollectionPath(account, owner, role, path.posix.dirname(relativePath))
      : undefined;
  if (duplicate) {
    return reuseLibraryAssetForRole(account, duplicate, role, {
      collectionId,
      legacyMaterialAssetId: input.legacyMaterialAssetId,
      manualCustomTags: input.manualCustomTags,
    });
  }
  const publicPath = `/library/${safeObjectSegment(owner.id)}/${sha256}${format.extension}`;
  const uploaded = await persistLibraryObject({ publicPath, body: input.bytes, contentType: format.mimeType });
  const now = new Date().toISOString();
  const aiTags = emptyLibraryTagProfile();
  const manualOverrides = input.manualCustomTags?.length
    ? normalizeLibraryManualOverrides({ customTags: input.manualCustomTags })
    : {};
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
    roles: [role],
    collectionIds: collectionId ? [collectionId] : [],
    visibility,
    aiTags,
    manualOverrides,
    effectiveTags: mergeLibraryTagProfile(aiTags, manualOverrides),
    taggingStatus: role === "reference" ? "queued" : "completed",
    cleanupStatus: "ready",
    legacyMaterialAssetId: input.legacyMaterialAssetId,
    createdAt: now,
    updatedAt: now,
  };
  const job = role === "reference" ? makeLibraryTaggingJob(asset, now) : undefined;
  try {
    if (job) await saveLibraryAssetAndTaggingJobToDb(asset, job);
    else await saveLibraryAssetToDb(asset);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const racedDuplicate = await findLibraryAssetByOwnerHashFromDb(owner.id, sha256);
      if (racedDuplicate?.roles.includes(role)) {
        return { status: "skipped_duplicate" as const, asset: { ...racedDuplicate, canEdit: canEditAsset(account, racedDuplicate) } };
      }
      if (racedDuplicate) {
        return reuseLibraryAssetForRole(account, racedDuplicate, role, {
          collectionId,
          legacyMaterialAssetId: input.legacyMaterialAssetId,
          manualCustomTags: input.manualCustomTags,
        });
      }
      throw error;
    }
    try {
      await deleteRuntimeMediaObject(uploaded.objectKey);
    } catch (cleanupError) {
      throw new Error(`${errorMessage(error)} Object rollback also failed: ${errorMessage(cleanupError)}`);
    }
    throw error;
  }
  return { status: "imported" as const, asset: { ...asset, canEdit: true }, ...(job ? { job } : {}) };
}

export async function patchLibraryAsset(account: WorkspaceAccessActor, assetId: string, patch: PatchLibraryAssetInput) {
  return (await patchLibraryAssetWithResult(account, assetId, patch)).asset;
}

export async function patchLibraryAssetWithResult(account: WorkspaceAccessActor, assetId: string, patch: PatchLibraryAssetInput) {
  const asset = await requireEditableAsset(account, assetId);
  const overrides = { ...asset.manualOverrides, ...(patch.manualOverrides ? normalizeLibraryManualOverrides(patch.manualOverrides) : {}) };
  for (const key of patch.restoreAi || []) delete overrides[key];
  const roles = patch.roles ? Array.from(new Set(patch.roles.map(requireRole))) : asset.roles;
  const collectionIds = patch.collectionIds
    ? await validateCollectionIds(account, patch.collectionIds, roles)
    : asset.collectionIds;
  const now = new Date().toISOString();
  const referenceRemoved = asset.roles.includes("reference") && !roles.includes("reference");
  const next: LibraryAsset = {
    ...asset,
    name: patch.name === undefined ? asset.name : normalizeAssetName(patch.name),
    roles,
    collectionIds,
    visibility: patch.visibility === undefined ? asset.visibility : requireVisibility(patch.visibility),
    manualOverrides: overrides,
    effectiveTags: mergeLibraryTagProfile(asset.aiTags, overrides),
    taggingStatus: referenceRemoved ? "completed" : asset.taggingStatus,
    taggingError: referenceRemoved ? undefined : asset.taggingError,
    updatedAt: now,
  };
  const saved = await saveLibraryAssetRoleChange(asset, next);
  return { asset: { ...saved.asset, canEdit: true }, taggingQueued: Boolean(saved.job) };
}

export async function removeLibraryAssetFromCollection(account: WorkspaceAccessActor, collectionId: string, assetId: string) {
  const asset = await requireEditableAsset(account, assetId);
  if (!asset.collectionIds.includes(collectionId)) throw new Error("Asset is not in this collection.");
  return patchLibraryAsset(account, assetId, { collectionIds: asset.collectionIds.filter((id) => id !== collectionId) });
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
    const failed = {
      ...pending,
      cleanupStatus: "failed" as const,
      cleanupError: errorMessage(error).slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    await saveLibraryAssetToDb(failed);
    return { status: "cleanup_failed" as const, asset: { ...failed, canEdit: true } };
  }
}

export async function migrateLegacyMaterialAssets(account: WorkspaceAccessActor, limit = 20) {
  if (!isWorkspaceAdmin(account)) throw new Error("Only workspace admins can migrate legacy materials.");
  const library = await listMaterialLibrary(account);
  const candidates = library.assets.filter((asset) => asset.kind === "image").slice(0, Math.max(1, Math.min(100, limit)));
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] as string[] };
  for (const legacy of candidates) {
    try {
      if (await findLibraryAssetByLegacyMaterialIdFromDb(legacy.id)) {
        result.skipped += 1;
        continue;
      }
      const bytes = await readFile(legacy.path);
      const imported = await importLibraryAsset(account, {
        bytes,
        originalName: legacy.name,
        relativePath: legacyRelativePath(legacy, library.folders),
        role: "vehicle",
        legacyMaterialAssetId: legacy.id,
        manualCustomTags: legacy.tags,
        owner: { id: legacy.ownerUserId || account.id, displayName: legacy.ownerDisplayName || account.displayName || account.id },
      });
      if (imported.status === "imported") result.imported += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${legacy.name}: ${errorMessage(error)}`);
    }
  }
  return result;
}

async function reuseLibraryAssetForRole(
  account: WorkspaceAccessActor,
  asset: LibraryAsset,
  role: LibraryAssetRole,
  input: { collectionId?: string; legacyMaterialAssetId?: string; manualCustomTags?: string[] },
) {
  if (!canEditAsset(account, asset)) throw new Error("Library asset not found or is read-only.");
  const manualOverrides = input.manualCustomTags?.length
    ? normalizeLibraryManualOverrides({
        ...asset.manualOverrides,
        customTags: [...(asset.manualOverrides.customTags || []), ...input.manualCustomTags],
      })
    : asset.manualOverrides;
  const now = new Date().toISOString();
  const next: LibraryAsset = {
    ...asset,
    roles: [...asset.roles, role],
    collectionIds: input.collectionId && !asset.collectionIds.includes(input.collectionId)
      ? [...asset.collectionIds, input.collectionId]
      : asset.collectionIds,
    manualOverrides,
    effectiveTags: mergeLibraryTagProfile(asset.aiTags, manualOverrides),
    legacyMaterialAssetId: asset.legacyMaterialAssetId || input.legacyMaterialAssetId,
    updatedAt: now,
  };
  const saved = await saveLibraryAssetRoleChange(asset, next);
  return {
    status: "imported" as const,
    asset: { ...saved.asset, canEdit: true },
    ...(saved.job ? { job: saved.job } : {}),
  };
}

async function saveLibraryAssetRoleChange(previous: LibraryAsset, next: LibraryAsset) {
  const referenceAdded = !previous.roles.includes("reference") && next.roles.includes("reference");
  if (!referenceAdded) {
    await saveLibraryAssetToDb(next);
    return { asset: next };
  }
  const queued = { ...next, taggingStatus: "queued" as const, taggingError: undefined };
  const job = makeLibraryTaggingJob(queued, queued.updatedAt);
  await saveLibraryAssetAndTaggingJobToDb(queued, job);
  return { asset: queued, job };
}

export function makeLibraryTaggingJob(asset: LibraryAsset, now = new Date().toISOString()): LibraryTaggingJob {
  return {
    id: `library-tag-${randomUUID()}`,
    assetId: asset.id,
    ownerUserId: asset.ownerUserId,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function requireEditableAsset(account: WorkspaceAccessActor, assetId: string) {
  const asset = await getLibraryAssetFromDb(assetId);
  if (!asset || !canEditAsset(account, asset)) throw new Error("Library asset not found or is read-only.");
  return asset;
}

async function ensureLibraryCollectionPath(
  account: WorkspaceAccessActor,
  owner: { id: string; displayName: string },
  role: LibraryAssetRole,
  relativePath: string,
) {
  if (owner.id !== account.id && !isWorkspaceAdmin(account)) throw new Error("Cannot create a collection for this owner.");
  const segments = normalizeRelativePath(relativePath).split("/").filter(Boolean);
  const collections = await listLibraryCollectionsFromDb();
  let parentId: string | undefined;
  let currentPath = "";
  for (const name of segments) {
    currentPath = currentPath ? `${currentPath}/${name}` : name;
    let collection = collections.find((item) => item.ownerUserId === owner.id && item.role === role && item.relativePath === currentPath);
    if (!collection) {
      const now = new Date().toISOString();
      collection = {
        id: `library-collection-${randomUUID()}`,
        ownerUserId: owner.id,
        ownerDisplayName: owner.displayName,
        role,
        name: name.slice(0, 120),
        parentId,
        relativePath: currentPath,
        createdAt: now,
        updatedAt: now,
      };
      await saveLibraryCollectionToDb(collection);
      collections.push(collection);
    }
    parentId = collection.id;
  }
  return parentId;
}

async function validateCollectionIds(account: WorkspaceAccessActor, ids: string[], roles: LibraryAssetRole[]) {
  const requested = Array.from(new Set(ids));
  const collections = await listLibraryCollectionsFromDb();
  for (const id of requested) {
    const collection = collections.find((item) => item.id === id);
    if (!collection || (!isWorkspaceAdmin(account) && collection.ownerUserId !== account.id) || !roles.includes(collection.role)) {
      throw new Error("Library collection not found or does not match the asset role.");
    }
  }
  return requested;
}

function canReadAsset(account: WorkspaceAccessActor, asset: LibraryAsset) {
  return isWorkspaceAdmin(account) || asset.ownerUserId === account.id || asset.visibility === "team";
}

function canEditAsset(account: WorkspaceAccessActor, asset: LibraryAsset) {
  return isWorkspaceAdmin(account) || asset.ownerUserId === account.id;
}

function detectImageFormat(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: "image/png", extension: ".png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: ".jpg" };
  if (bytes.length >= 6 && /GIF8[79]a/.test(bytes.subarray(0, 6).toString("ascii"))) return { mimeType: "image/gif", extension: ".gif" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", extension: ".webp" };
  return undefined;
}

function requireRole(value: LibraryAssetRole) {
  if (!validRoles.has(value)) throw new Error("Invalid library asset role.");
  return value;
}

function requireVisibility(value: LibraryVisibility) {
  if (!validVisibility.has(value)) throw new Error("Invalid library visibility.");
  return value;
}

function matchDimension(values: string[], filters?: string[]) {
  if (!filters?.length) return true;
  const normalized = new Set(values.map(normalizeSearch));
  return filters.some((value) => normalized.has(normalizeSearch(value)));
}

function searchAsset(asset: LibraryAsset, tags: LibraryTagProfile, query: string) {
  return [asset.name, asset.originalName, ...getLibraryUnifiedTagLabels(tags)]
    .some((value) => normalizeSearch(value).includes(query));
}

function compareAssets(left: LibraryAsset, right: LibraryAsset) {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function compareAssetToCursor(asset: LibraryAsset, cursor: { createdAt: string; id: string }) {
  if (asset.createdAt !== cursor.createdAt) return cursor.createdAt.localeCompare(asset.createdAt);
  return cursor.id.localeCompare(asset.id);
}

function encodeCursor(asset: LibraryAsset) {
  return Buffer.from(JSON.stringify({ createdAt: asset.createdAt, id: asset.id })).toString("base64url");
}

function decodeCursor(value?: string) {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof decoded.createdAt === "string" && typeof decoded.id === "string") return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    throw new Error("Invalid library cursor.");
  }
  throw new Error("Invalid library cursor.");
}

function normalizeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment && segment !== "." && segment !== "..").join("/");
  return normalized.slice(0, 500) || "image";
}

function normalizeAssetName(value: string) {
  return value.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 160) || "未命名图片";
}

function safeObjectSegment(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizeSearch(value?: string) {
  return (value || "").trim().toLocaleLowerCase();
}

function legacyRelativePath(asset: MaterialLibraryAsset, folders: Array<{ id: string; name: string; parentId?: string }>) {
  const parts: string[] = [asset.name];
  let folderId: string | undefined = asset.folderId;
  const visited = new Set<string>();
  while (folderId && folderId !== "root" && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) break;
    parts.unshift(folder.name);
    folderId = folder.parentId;
  }
  return normalizeRelativePath(parts.join("/"));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueConstraintError(error: unknown) {
  const message = errorMessage(error);
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
  return code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || /unique constraint|UNIQUE constraint failed/i.test(message);
}

export function parseLibraryAssetFilters(url: URL): LibraryAssetFilters {
  const list = (name: string) => normalizeStringList(url.searchParams.getAll(name).flatMap((value) => value.split(",")));
  const role = url.searchParams.get("role") as LibraryAssetRole | null;
  const visibility = url.searchParams.get("visibility") as LibraryVisibility | null;
  const taggingStatus = url.searchParams.get("taggingStatus") as LibraryTaggingStatus | null;
  return {
    cursor: url.searchParams.get("cursor") || undefined,
    limit: Number(url.searchParams.get("limit") || 60),
    search: url.searchParams.get("search") || undefined,
    role: role && validRoles.has(role) ? role : undefined,
    collectionId: url.searchParams.get("collectionId") || undefined,
    visibility: visibility && validVisibility.has(visibility) ? visibility : undefined,
    taggingStatus: taggingStatus && validTaggingStatuses.has(taggingStatus) ? taggingStatus : undefined,
    imageTypes: list("imageType"), scenes: list("scene"), vehicleModels: list("vehicleModel"),
    vehicleColors: list("vehicleColor"), angles: list("angle"), people: list("people"), customTags: list("customTag"),
    tags: list("tag"),
  };
}
