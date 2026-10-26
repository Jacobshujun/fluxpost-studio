import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isManagedRuntimeMediaUrl } from "./runtime-media-storage";

export function isGeneratedLocalUrl(url: string) {
  return url.startsWith("/generated/") && !/[?#\\\u0000]/.test(url);
}

export async function readGeneratedLocalImage(url: string) {
  if (!isGeneratedLocalUrl(url)) throw new Error("Not a controlled generated image path.");
  const decoded = decodeURIComponent(url);
  const segments = decoded.split("/");
  if (segments.some((part) => part === "." || part === "..") || /[\\\u0000]/.test(decoded)) throw new Error("Invalid generated image path.");
  const expectedRoot = path.join(/*turbopackIgnore: true*/ await realpath(process.cwd()), "public", "generated");
  const root = await realpath(expectedRoot);
  if (path.relative(expectedRoot, root)) throw new Error("Generated image root cannot redirect outside the application.");
  const resolved = await realpath(path.join(root, ...segments.slice(2)));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Generated image escapes the controlled root.");
  const info = await stat(resolved);
  if (!info.isFile() || info.size <= 0 || info.size > 30 * 1024 * 1024) throw new Error("Generated image is missing, empty or exceeds 30 MB.");
  return readFile(resolved);
}

export async function readGeneratedImage(url: string) {
  if (isGeneratedLocalUrl(url)) return readGeneratedLocalImage(url);
  if (!isManagedRuntimeMediaUrl(url)) throw new Error("Generated image is not saved in managed application storage.");
  const { downloadThumbnailSource } = await import("./library-thumbnails");
  return downloadThumbnailSource(url, fetch);
}
