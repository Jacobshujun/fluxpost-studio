import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const cleanup = read("src/lib/source-image-cleanup.ts");
const mediaCache = read("src/lib/media-cache.ts");
const types = read("src/lib/types.ts");

assertContains(cleanup, /export function shouldCleanCachedSourceImage\(/, "Source image cleanup must expose a platform gate helper.");
assertContains(cleanup, /item\.platform === "weibo"/, "Cached source image cleanup must only target Weibo items.");
assertContains(cleanup, /export async function cleanCachedSourceImage\(/, "Source image cleanup must expose the image cleanup function.");
assertContains(cleanup, /execFile\("ffmpeg"/, "Source image cleanup must use ffmpeg for deterministic local image processing.");
assertContains(cleanup, /crop=iw:floor\(ih\*0\.91\):0:0/, "Weibo image cleanup must crop away the bottom 9 percent.");
assertContains(cleanup, /rename\(tempPath,\s*filePath\)/, "Cleaned image should replace the cached file so the public URL remains stable.");
assertContains(cleanup, /weibo-cleaned/, "Weibo image cleanup must write a sidecar marker after cleanup.");
assertContains(cleanup, /cleanupMarkerExists/, "Weibo image cleanup must skip already-cleaned cached images.");
assertContains(cleanup, /force\?:\s*boolean/, "Weibo image cleanup must allow forced cleanup after an overwritten download.");

assertContains(mediaCache, /shouldCleanCachedSourceImage/, "Media cache must import the Weibo image cleanup gate.");
assertContains(mediaCache, /cleanCachedSourceImage/, "Media cache must import the cached image cleanup function.");
assertContains(mediaCache, /cacheRemoteMedia\(imageUrl,[\s\S]*item,[\s\S]*kind:\s*"image"/, "Image caching should pass the source item into the media cache helper.");
assertContains(mediaCache, /shouldCleanCachedSourceImage\(sourceItem\)[\s\S]*cleanCachedSourceImage\(filePath,[\s\S]*platform:\s*sourceItem\.platform,[\s\S]*force:\s*forceCleanup/, "Media cache must clean cached images only after the source item passes the Weibo gate.");
assertContains(mediaCache, /downloadErrors\.push\(`image-\$\{index \+ 1\}: \$\{error instanceof Error \? error\.message : "download failed"\}`\)/, "Weibo cleanup failures should be reported as image download errors without blocking the item.");

const normalizedSourceItemBlock = types.slice(types.indexOf("export type NormalizedSourceItem"), types.indexOf("export type ContentProject"));
assertContains(normalizedSourceItemBlock, /images:\s*string\[\]/, "Normalized source items must keep original remote image URLs.");
assertContains(normalizedSourceItemBlock, /downloadedImages\?:\s*string\[\]/, "Normalized source items must keep local cleaned image URLs separately.");
assertContains(mediaCache, /images:\s*item\.images/, "Media cache must preserve the original remote images field.");
assertNotContains(mediaCache, /images:\s*downloadedImages/, "Media cache must not replace original remote image URLs with cleaned local URLs.");

console.log("Weibo image cleanup check passed.");
