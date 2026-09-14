import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runWithConcurrencyPool } from "./concurrency";
import { downloadThumbnailSource, readValidThumbnail, writeThumbnailAtomically } from "./library-thumbnails";
import { buildMediaRequestHeaders, isProxyableRemoteMediaUrl } from "./media-request";

const pending = new Map<string, Promise<{ bytes: Buffer; etag: string }>>();
const cacheRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "review-thumbnails");
const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public");

export async function getReviewThumbnail(source: string, size: 240 | 960) {
  const local = source.startsWith("/generated/") || source.startsWith("/media/");
  let localPath: string | undefined;
  let identity = source;
  if (local) {
    const root = await realpath(publicRoot);
    localPath = await realpath(path.resolve(/*turbopackIgnore: true*/ root, `.${decodeURIComponent(source.split(/[?#]/, 1)[0])}`));
    const relative = path.relative(root, localPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid local image path");
    const info = await stat(localPath);
    if (!info.isFile() || info.size > 30 * 1024 * 1024) throw new Error("Invalid local image size");
    identity += `:${info.size}:${info.mtimeMs}`;
  } else if (!isProxyableRemoteMediaUrl(source)) throw new Error("Unsupported stored image source");
  const key = createHash("sha256").update(`review-contain-v1:${size}:${identity}`).digest("hex");
  const existing = pending.get(key);
  if (existing) return existing;
  const operation = runWithConcurrencyPool("libraryThumbnail", async () => {
    const filePath = path.join(cacheRoot, `${key}.webp`);
    const etag = `"${key}"`;
    const cached = await readValidThumbnail(filePath, size, size);
    if (cached) return { bytes: cached, etag };
    const input = localPath ? await readFile(localPath) : await downloadThumbnailSource(source, (url, init) => fetch(url, { ...init, headers: buildMediaRequestHeaders(source) }));
    const bytes = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate().resize(size, size, { fit: "contain", background: "#ffffff00" }).webp({ quality: size === 240 ? 72 : 85 }).toBuffer();
    await writeThumbnailAtomically(filePath, bytes, size, size);
    return { bytes, etag };
  });
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}
