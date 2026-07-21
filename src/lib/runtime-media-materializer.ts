import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { buildMediaRequestHeaders } from "./media-request";

export type MaterializedRuntimeMedia = {
  filePath: string;
  temporary: boolean;
  cleanup: () => Promise<void>;
};

export async function materializeRuntimeMedia(
  url: string,
  options: { maxBytes: number; kind: "image" | "video"; temporaryRoot?: string },
): Promise<MaterializedRuntimeMedia> {
  const localPath = resolveExistingLocalMediaPath(url);
  if (localPath) return { filePath: localPath, temporary: false, cleanup: async () => undefined };
  if (!/^https?:\/\//i.test(url)) throw new Error("Runtime media URL is not a local file or HTTP(S) URL.");

  const response = await fetch(url, { headers: buildMediaRequestHeaders(url) });
  if (!response.ok || !response.body) throw new Error(`Runtime media download failed: HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > options.maxBytes) throw new Error(`Runtime media exceeds the ${options.maxBytes} byte limit.`);

  const temporaryRoot = path.resolve(options.temporaryRoot || tmpdir());
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(path.join(temporaryRoot, "fluxpost-runtime-media-"));
  const filePath = path.join(folder, `asset${resolveExtension(url, response.headers.get("content-type"), options.kind)}`);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > options.maxBytes ? new Error(`Runtime media exceeds the ${options.maxBytes} byte limit.`) : null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body as never), limiter, createWriteStream(filePath));
    if (!bytes) throw new Error("Runtime media download returned an empty file.");
    return { filePath, temporary: true, cleanup: () => rm(folder, { recursive: true, force: true }) };
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}

export async function readRuntimeMedia(url: string, maxBytes: number) {
  const localPath = resolveExistingLocalMediaPath(url);
  if (localPath) {
    const buffer = await readFile(localPath);
    if (buffer.length > maxBytes) throw new Error(`Runtime media exceeds the ${maxBytes} byte limit.`);
    return buffer;
  }
  const materialized = await materializeRuntimeMedia(url, { maxBytes, kind: "image" });
  try {
    return await readFile(materialized.filePath);
  } finally {
    await materialized.cleanup();
  }
}

function resolveExistingLocalMediaPath(url: string) {
  if (!url.startsWith("/media/") && !url.startsWith("/generated/")) return undefined;
  const cleanPath = decodeURIComponent(url.split(/[?#]/, 1)[0] || "").replace(/^\/+/, "");
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, cleanPath);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) || !existsSync(filePath)) return undefined;
  return filePath;
}

function resolveExtension(url: string, contentType: string | null, kind: "image" | "video") {
  const mime = (contentType || "").split(";", 1)[0].trim().toLowerCase();
  const byMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  };
  if (byMime[mime]) return byMime[mime];
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(extension)) return extension;
  } catch {
    // URL validation happens before this helper.
  }
  return kind === "video" ? ".mp4" : ".bin";
}
