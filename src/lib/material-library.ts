import { stat } from "node:fs/promises";
import path from "node:path";
import { readMaterialLibraryFromDb, writeMaterialLibraryToDb } from "./database";
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

export async function listMaterialLibrary(): Promise<MaterialLibrarySnapshot> {
  const store = await readLibrary();
  return normalizeLibrary(store);
}

export async function createMaterialFolder(name: string, parentId = rootFolderId) {
  const store = normalizeLibrary(await readLibrary());
  assertFolderExists(store, parentId);
  const now = new Date().toISOString();
  const folder: MaterialFolder = {
    id: `folder-${Date.now()}`,
    name: normalizeName(name, "新建文件夹"),
    parentId,
    createdAt: now,
    updatedAt: now,
  };
  await writeLibrary({ ...store, folders: [...store.folders, folder] });
  return folder;
}

export async function updateMaterialFolder(folderId: string, patch: Partial<Pick<MaterialFolder, "name" | "parentId">>) {
  if (folderId === rootFolderId) throw new Error("Root folder cannot be edited");
  const store = normalizeLibrary(await readLibrary());
  const folder = store.folders.find((item) => item.id === folderId);
  if (!folder) throw new Error("Material folder not found");
  if (patch.parentId) assertFolderExists(store, patch.parentId);
  const nextFolder: MaterialFolder = {
    ...folder,
    ...patch,
    name: patch.name ? normalizeName(patch.name, folder.name) : folder.name,
    updatedAt: new Date().toISOString(),
  };
  await writeLibrary({
    ...store,
    folders: store.folders.map((item) => (item.id === folderId ? nextFolder : item)),
  });
  return nextFolder;
}

export async function deleteMaterialFolder(folderId: string) {
  if (folderId === rootFolderId) throw new Error("Root folder cannot be deleted");
  const store = normalizeLibrary(await readLibrary());
  assertFolderExists(store, folderId);
  const folderIds = collectDescendantFolderIds(store.folders, folderId);
  await writeLibrary({
    folders: store.folders.filter((folder) => !folderIds.has(folder.id)),
    assets: store.assets.filter((asset) => !folderIds.has(asset.folderId)),
  });
}

export async function createMaterialAsset(input: CreateAssetInput) {
  const store = normalizeLibrary(await readLibrary());
  assertFolderExists(store, input.folderId);
  const filePath = path.resolve(input.path);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error("Material path must be a file");
  const now = new Date().toISOString();
  const extension = path.extname(filePath).toLowerCase();
  const asset: MaterialLibraryAsset = {
    id: `asset-${Date.now()}`,
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

export async function updateMaterialAsset(assetId: string, patch: Partial<Pick<MaterialLibraryAsset, "folderId" | "name" | "tags">>) {
  const store = normalizeLibrary(await readLibrary());
  const asset = store.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("Material asset not found");
  if (patch.folderId) assertFolderExists(store, patch.folderId);
  const nextAsset: MaterialLibraryAsset = {
    ...asset,
    ...patch,
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

export async function deleteMaterialAsset(assetId: string) {
  const store = normalizeLibrary(await readLibrary());
  const assets = store.assets.filter((asset) => asset.id !== assetId);
  if (assets.length === store.assets.length) throw new Error("Material asset not found");
  await writeLibrary({ ...store, assets });
}

function normalizeLibrary(store: StoredMaterialLibrary): StoredMaterialLibrary {
  const now = new Date().toISOString();
  const folders = store.folders?.length
    ? store.folders
    : [
        {
          id: rootFolderId,
          name: "素材库",
          createdAt: now,
          updatedAt: now,
        },
      ];
  const hasRoot = folders.some((folder) => folder.id === rootFolderId);
  return {
    folders: hasRoot
      ? folders
      : [
          {
            id: rootFolderId,
            name: "素材库",
            createdAt: now,
            updatedAt: now,
          },
          ...folders,
        ],
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

function assertFolderExists(store: MaterialLibrarySnapshot, folderId: string) {
  if (!store.folders.some((folder) => folder.id === folderId)) {
    throw new Error("Material folder not found");
  }
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
