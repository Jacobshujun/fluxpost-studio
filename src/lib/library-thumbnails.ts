import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runWithConcurrencyPool } from "./concurrency";
import { isManagedRuntimeMediaUrl } from "./runtime-media-storage";
import type { LibraryAsset } from "./types";

export const libraryThumbnailWidth = 240;
export const libraryThumbnailHeight = 144;
export const libraryThumbnailMimeType = "image/webp";
export const libraryThumbnailCacheControl = "private, max-age=31536000, immutable";

const sourceByteLimit = 30 * 1024 * 1024;
const cacheRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "library-thumbnails", "v1");
const pending = new Map<string, Promise<LibraryThumbnailResult>>();

export type LibraryThumbnailResult = {
  bytes: Buffer;
  cacheStatus: "generated" | "hit";
  etag: string;
};

export type LibraryThumbnailDependencies = {
  fetchSource?: typeof fetch;
  isManagedSource?: (url: string) => boolean;
  cacheDirectory?: string;
};

export async function getLibraryThumbnail(
  asset: Pick<LibraryAsset, "publicUrl" | "sha256">,
  dependencies: LibraryThumbnailDependencies = {},
): Promise<LibraryThumbnailResult> {
  assertAssetThumbnailSource(asset, dependencies.isManagedSource || isManagedRuntimeMediaUrl);
  const key = asset.sha256.toLowerCase();
  const cacheDirectory = dependencies.cacheDirectory || cacheRoot;
  const operationKey = `${cacheDirectory}\0${key}`;
  const existing = pending.get(operationKey);
  if (existing) return existing;

  const operation = runWithConcurrencyPool("libraryThumbnail", () => generateOrReadThumbnail(asset, cacheDirectory, dependencies.fetchSource || fetch));
  pending.set(operationKey, operation);
  try {
    return await operation;
  } finally {
    if (pending.get(operationKey) === operation) pending.delete(operationKey);
  }
}

export function libraryThumbnailPath(sha256: string, cacheDirectory = cacheRoot) {
  const key = normalizeSha256(sha256);
  return path.join(cacheDirectory, `${key}.webp`);
}

function assertAssetThumbnailSource(asset: Pick<LibraryAsset, "publicUrl" | "sha256">, isManagedSource: (url: string) => boolean) {
  normalizeSha256(asset.sha256);
  if (!isManagedSource(asset.publicUrl)) throw new Error("Library thumbnail source is not managed TOS media.");
}

async function generateOrReadThumbnail(
  asset: Pick<LibraryAsset, "publicUrl" | "sha256">,
  cacheDirectory: string,
  fetchSource: typeof fetch,
): Promise<LibraryThumbnailResult> {
  const filePath = libraryThumbnailPath(asset.sha256, cacheDirectory);
  const cached = await readValidThumbnail(filePath);
  if (cached) return { bytes: cached, cacheStatus: "hit", etag: thumbnailEtag(asset.sha256) };

  const source = await downloadThumbnailSource(asset.publicUrl, fetchSource);
  let bytes: Buffer;
  try {
    bytes = await sharp(source, { failOn: "error", limitInputPixels: 80_000_000 })
      .rotate()
      .resize(libraryThumbnailWidth, libraryThumbnailHeight, { fit: "cover", position: "attention" })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
  } catch (error) {
    throw new Error(`Library thumbnail generation failed: ${errorMessage(error)}`);
  }
  await writeThumbnailAtomically(filePath, bytes);
  return { bytes, cacheStatus: "generated", etag: thumbnailEtag(asset.sha256) };
}

async function readValidThumbnail(filePath: string) {
  const fileStat = await stat(filePath).catch(() => undefined);
  if (!fileStat?.isFile() || fileStat.size <= 0) return undefined;
  const bytes = await readFile(filePath);
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format === "webp" && metadata.width === libraryThumbnailWidth && metadata.height === libraryThumbnailHeight) return bytes;
  } catch {
    // Invalid derived cache files are replaced from the immutable source.
  }
  await rm(filePath, { force: true });
  return undefined;
}

async function downloadThumbnailSource(url: string, fetchSource: typeof fetch) {
  let response: Response;
  try {
    response = await fetchSource(url, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  } catch (error) {
    throw new Error(`Library thumbnail source request failed: ${errorMessage(error)}`);
  }
  if (!response.ok) throw new Error(`Library thumbnail source returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!contentType.startsWith("image/")) throw new Error("Library thumbnail source is not an image.");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > sourceByteLimit) throw new Error("Library thumbnail source exceeds the 30 MB limit.");
  if (!response.body) throw new Error("Library thumbnail source response is empty.");

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > sourceByteLimit) {
        await reader.cancel();
        throw new Error("Library thumbnail source exceeds the 30 MB limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("Library thumbnail source response is empty.");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

async function writeThumbnailAtomically(filePath: string, bytes: Buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, filePath).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
      const existing = await readValidThumbnail(filePath);
      if (!existing) throw error;
    });
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function normalizeSha256(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("Library asset SHA-256 is invalid.");
  return normalized;
}

function thumbnailEtag(sha256: string) {
  return `"library-thumbnail-v1-${normalizeSha256(sha256)}"`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
