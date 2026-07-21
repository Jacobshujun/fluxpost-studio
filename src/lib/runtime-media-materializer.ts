import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { buildMediaRequestHeaders } from "./media-request";
import { findExistingRuntimeMedia } from "./runtime-media-storage";

export type MaterializedRuntimeMedia = {
  filePath: string;
  resolvedUrl: string;
  temporary: boolean;
  cleanup: () => Promise<void>;
};

export type RuntimeMediaReference = {
  url: string;
  localPath?: string;
  recoveredFromTos: boolean;
};

const imageDownloadTimeoutMs = 120_000;
const videoDownloadTimeoutMs = 300_000;

export async function resolveRuntimeMediaReference(url: string): Promise<RuntimeMediaReference> {
  const localPath = resolveExistingLocalMediaPath(url);
  if (localPath) return { url, localPath, recoveredFromTos: false };
  if (/^https?:\/\//i.test(url)) return { url, recoveredFromTos: false };

  if (isAppLocalRuntimeMediaUrl(url)) {
    const recoveredUrl = await findExistingRuntimeMedia(url);
    if (recoveredUrl) return { url: recoveredUrl, recoveredFromTos: true };
    throw new Error(`Runtime media local file is missing and no matching TOS object was found: ${url}`);
  }

  throw new Error("Runtime media URL is not an app-managed local path or HTTP(S) URL.");
}

export async function materializeRuntimeMedia(
  url: string,
  options: { maxBytes: number; kind: "image" | "video"; temporaryRoot?: string; timeoutMs?: number },
): Promise<MaterializedRuntimeMedia> {
  const resolved = await resolveRuntimeMediaReference(url);
  if (resolved.localPath) {
    return { filePath: resolved.localPath, resolvedUrl: resolved.url, temporary: false, cleanup: async () => undefined };
  }

  const timeoutMs = options.timeoutMs || (options.kind === "video" ? videoDownloadTimeoutMs : imageDownloadTimeoutMs);
  let response: Response;
  try {
    response = await fetch(resolved.url, {
      headers: buildMediaRequestHeaders(resolved.url),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(`Runtime media download timed out after ${formatTimeoutSeconds(timeoutMs)}s.`);
    }
    throw error;
  }
  if (!response.ok || !response.body) throw new Error(`Runtime media download failed: HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > options.maxBytes) throw new Error(`Runtime media exceeds the ${options.maxBytes} byte limit.`);

  const temporaryRoot = path.resolve(options.temporaryRoot || tmpdir());
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(path.join(temporaryRoot, "fluxpost-runtime-media-"));
  const filePath = path.join(folder, `asset${resolveExtension(resolved.url, response.headers.get("content-type"), options.kind)}`);
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
    return {
      filePath,
      resolvedUrl: resolved.url,
      temporary: true,
      cleanup: () => rm(folder, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    if (isTimeoutError(error)) {
      throw new Error(`Runtime media download timed out after ${formatTimeoutSeconds(timeoutMs)}s.`);
    }
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
  if (!isAppLocalRuntimeMediaUrl(url)) return undefined;
  const cleanPath = decodeURIComponent(url.split(/[?#]/, 1)[0] || "").replace(/^\/+/, "");
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, cleanPath);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`) || !existsSync(filePath)) return undefined;
  return filePath;
}

function isAppLocalRuntimeMediaUrl(url: string) {
  return url.startsWith("/media/") || url.startsWith("/generated/");
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError" || /aborted due to timeout|operation was aborted/i.test(error.message))
  );
}

function formatTimeoutSeconds(timeoutMs: number) {
  return Math.max(1, Math.ceil(timeoutMs / 1000));
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
