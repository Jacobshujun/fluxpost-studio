import { stat } from "node:fs/promises";
import path from "node:path";
import { readMaterialLibraryFromDb, writeMaterialLibraryToDb } from "./database";
import {
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  scopeWorkspaceOwner,
  type WorkspaceAccessActor,
} from "./workspace-ownership";
import type { MaterialAssetKind, MaterialFolder, MaterialLibraryAsset, MaterialLibrarySnapshot } from "./types";

type StoredMaterialLibrary = MaterialLibrarySnapshot;

type CreateAssetInput = {
  folderId: string;
  path: string;
  name?: string;
  tags?: string[];
};

const rootFolderId = "root";
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const documentExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".md"]);

export async function listMaterialLibrary(account?: WorkspaceAccessActor): Promise<MaterialLibrarySnapshot> {
  const store = await readLibrary();
  return scopeLibrary(normalizeLibrary(store), account);
}

export async function createMaterialFolder(name: string, parentId = rootFolderId, account?: WorkspaceAccessActor) {
  const store = normalizeLibrary(await readLibrary());
  assertFolderExists(scopeLibrary(store, account), parentId);
  const now = new Date().toISOString();
  const folder: MaterialFolder = {
    id: `folder-${Date.now()}`,
    ...(account ? scopeWorkspaceOwner(account) : {}),
    name: normalizeName(name, "New folder"),
    parentId,
    createdAt: now,
    updatedAt: now,
  };
  await writeLibrary({ ...store, folders: [...store.folders, folder] });
  return folder;
}

export async function updateMaterialFolder(
  folderId: string,
  patch: Partial<Pick<MaterialFolder, "name" | "parentId">>,
  account?: WorkspaceAccessActor,
) {
  if (folderId === rootFolderId) throw new Error("Root folder cannot be edited");
  const store = normalizeLibrary(await readLibrary());
  const folder = store.folders.find((item) => item.id === folderId);
  if (!folder || !canMutateMaterialRecord(account, folder)) throw new Error("Material folder not found");
  if (patch.parentId) assertFolderExists(scopeLibrary(store, account), patch.parentId);
  const nextFolder: MaterialFolder = {
    ...folder,
    ...patch,
    ownerUserId: folder.ownerUserId,
    ownerDisplayName: folder.ownerDisplayName,
    name: patch.name ? normalizeName(patch.name, folder.name) : folder.name,
    updatedAt: new Date().toISOString(),
  };
  await writeLibrary({
    ...store,
    folders: store.folders.map((item) => (item.id === folderId ? nextFolder : item)),
  });
  return nextFolder;
}

export async function deleteMaterialFolder(folderId: string, account?: WorkspaceAccessActor) {
  if (folderId === rootFolderId) throw new Error("Root folder cannot be deleted");
  const store = normalizeLibrary(await readLibrary());
  const scoped = scopeLibrary(store, account);
  assertFolderExists(scoped, folderId);
  const folderIds = collectDescendantFolderIds(scoped.folders, folderId);
  await writeLibrary({
    folders: store.folders.filter((folder) => !folderIds.has(folder.id)),
    assets: store.assets.filter((asset) => !folderIds.has(asset.folderId)),
  });
}

export async function createMaterialAsset(input: CreateAssetInput, account?: WorkspaceAccessActor) {
  const store = normalizeLibrary(await readLibrary());
  assertFolderExists(scopeLibrary(store, account), input.folderId);
  const filePath = path.resolve(input.path);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error("Material path must be a file");
  const now = new Date().toISOString();
  const extension = path.extname(filePath).toLowerCase();
  const asset: MaterialLibraryAsset = {
    id: `asset-${Date.now()}`,
    ...(account ? scopeWorkspaceOwner(account) : {}),
    folderId: input.folderId,
    path: filePath,
    name: normalizeName(input.name || path.basename(filePath), path.basename(filePath)),
    extension,
    kind: resolveAssetKind(extension),
    tags: normalizeTags(input.tags),
    createdAt: now,
    updatedAt: now,
  };
  await writeLibrary({
    ...store,
    assets: [asset, ...store.assets.filter((item) => item.path !== asset.path)],
  });
  return asset;
}

export async function updateMaterialAsset(
  assetId: string,
  patch: Partial<Pick<MaterialLibraryAsset, "folderId" | "name" | "tags">>,
  account?: WorkspaceAccessActor,
) {
  const store = normalizeLibrary(await readLibrary());
  const asset = store.assets.find((item) => item.id === assetId);
  if (!asset || !canMutateMaterialRecord(account, asset)) throw new Error("Material asset not found");
  if (patch.folderId) assertFolderExists(scopeLibrary(store, account), patch.folderId);
  const nextAsset: MaterialLibraryAsset = {
    ...asset,
    ...patch,
    ownerUserId: asset.ownerUserId,
    ownerDisplayName: asset.ownerDisplayName,
    name: patch.name ? normalizeName(patch.name, asset.name) : asset.name,
    tags: patch.tags ? normalizeTags(patch.tags) : asset.tags,
    updatedAt: new Date().toISOString(),
  };
  await writeLibrary({
    ...store,
    assets: store.assets.map((item) => (item.id === assetId ? nextAsset : item)),
  });
  return nextAsset;
}

export async function deleteMaterialAsset(assetId: string, account?: WorkspaceAccessActor) {
  const store = normalizeLibrary(await readLibrary());
  const assets = store.assets.filter((asset) => asset.id !== assetId || !canMutateMaterialRecord(account, asset));
  if (assets.length === store.assets.length) throw new Error("Material asset not found");
  await writeLibrary({ ...store, assets });
}

function normalizeLibrary(store: StoredMaterialLibrary): StoredMaterialLibrary {
  const folders = store.folders?.length ? store.folders : [makeRootFolder()];
  const hasRoot = folders.some((folder) => folder.id === rootFolderId);
  return {
    folders: hasRoot ? folders : [makeRootFolder(), ...folders],
    assets: Array.isArray(store.assets) ? store.assets : [],
  };
}

async function readLibrary(): Promise<StoredMaterialLibrary> {
  const store = await readMaterialLibraryFromDb();
  return {
    folders: Array.isArray(store.folders) ? store.folders : [],
    assets: Array.isArray(store.assets) ? store.assets : [],
  };
}

async function writeLibrary(store: StoredMaterialLibrary) {
  await writeMaterialLibraryToDb(normalizeLibrary(store));
}

function scopeLibrary(store: StoredMaterialLibrary, account?: WorkspaceAccessActor): StoredMaterialLibrary {
  if (!account) return store;
  return {
    folders: [store.folders.find((folder) => folder.id === rootFolderId) || makeRootFolder(), ...filterWorkspaceOwnedRecords(store.folders.filter((folder) => folder.id !== rootFolderId), account)],
    assets: filterWorkspaceOwnedRecords(store.assets, account),
  };
}

function makeRootFolder(): MaterialFolder {
  const now = new Date().toISOString();
  return {
    id: rootFolderId,
    name: "Material Library",
    createdAt: now,
    updatedAt: now,
  };
}

function assertFolderExists(store: MaterialLibrarySnapshot, folderId: string) {
  if (!store.folders.some((folder) => folder.id === folderId)) {
    throw new Error("Material folder not found");
  }
}

function canMutateMaterialRecord(account: WorkspaceAccessActor | undefined, record: MaterialFolder | MaterialLibraryAsset) {
  if (!account) return true;
  return canAccessWorkspaceOwner(account, record.ownerUserId);
}

function collectDescendantFolderIds(folders: MaterialFolder[], folderId: string) {
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function normalizeName(value: string, fallback: string) {
  return value.trim().slice(0, 120) || fallback;
}

function normalizeTags(tags?: string[]) {
  return Array.from(new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);
}

function resolveAssetKind(extension: string): MaterialAssetKind {
  if (imageExtensions.has(extension)) return "image";
  if (documentExtensions.has(extension)) return "document";
  return "other";
}
