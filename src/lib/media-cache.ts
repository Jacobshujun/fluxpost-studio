import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { concurrencyConfig, mapWithConcurrency } from "./concurrency";
import { sniffImageFormat } from "./image-format";
import { buildMediaCacheStatus } from "./media-cache-status";
import { buildMediaRequestHeaders } from "./media-request";
import { replaceVideoFrameUrlsInMediaUrls, selectBestVideoHighlightFrames } from "./video-frame-policy";
import type { NormalizedSourceItem, VideoFrameAsset } from "./types";

const mediaCacheRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "media", "crawl");
const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
const maxImagesToCache = 18;
const frameScanSeconds = 36;
const frameIntervalSeconds = 3;
const ffmpegTimeoutMs = 90_000;
const imageTranscodeTimeoutMs = 90_000;

export async function cacheCrawledMedia(items: NormalizedSourceItem[]) {
  return mapWithConcurrency(items, concurrencyConfig.media, async (item) => {
    const downloadErrors: string[] = [];
    const itemDir = path.join(mediaCacheRoot, item.platform, sanitizePathSegment(item.sourceId));
    const publicDir = `/media/crawl/${item.platform}/${sanitizePathSegment(item.sourceId)}`;

    const downloadedImages: string[] = [];
    for (const [index, imageUrl] of item.images.slice(0, maxImagesToCache).entries()) {
      if (isLocalAppMediaUrl(imageUrl)) {
        downloadedImages.push(imageUrl);
        continue;
      }
      if (!/^https?:\/\//i.test(imageUrl)) {
        downloadErrors.push(`image-${index + 1}: unsupported image URL`);
        continue;
      }
      try {
        const localUrl = await cacheRemoteMedia(imageUrl, itemDir, publicDir, `image-${index + 1}`, "image");
        if (localUrl) downloadedImages.push(localUrl);
      } catch (error) {
        downloadErrors.push(`image-${index + 1}: ${error instanceof Error ? error.message : "download failed"}`);
      }
    }

    let downloadedVideoUrl = item.downloadedVideoUrl;
    if (!downloadedVideoUrl && item.videoUrl && isLocalAppMediaUrl(item.videoUrl)) {
      downloadedVideoUrl = item.videoUrl;
    } else if (item.videoUrl && isDownloadableVideoUrl(item.videoUrl)) {
      try {
        downloadedVideoUrl = await cacheRemoteMedia(item.videoUrl, itemDir, publicDir, "video-1", "video");
      } catch (error) {
        downloadErrors.push(`video-1: ${error instanceof Error ? error.message : "download failed"}`);
      }
    }

    let videoFrames: VideoFrameAsset[] | undefined = item.videoFrames;
    if (downloadedVideoUrl) {
      try {
        const frames = await cacheVideoFrames(downloadedVideoUrl, itemDir, publicDir);
        videoFrames = frames.length ? frames : videoFrames;
      } catch (error) {
        downloadErrors.push(`video-frames: ${error instanceof Error ? error.message : "extraction failed"}`);
      }
    }

    const selectedVideoFrames = selectBestVideoHighlightFrames(videoFrames);

    const nextItem: NormalizedSourceItem = {
      ...item,
      downloadedImages: downloadedImages.length ? downloadedImages : undefined,
      downloadedVideoUrl,
      videoFrames: selectedVideoFrames.length ? selectedVideoFrames : undefined,
      downloadErrors: downloadErrors.length ? downloadErrors : undefined,
      mediaUrls: replaceVideoFrameUrlsInMediaUrls(
        [
          item.sourceUrl,
          downloadedVideoUrl,
          item.videoUrl,
          ...downloadedImages,
          ...item.images,
          ...item.mediaUrls,
        ].filter((url): url is string => Boolean(url)),
        selectedVideoFrames,
      ),
    };
    return {
      ...nextItem,
      mediaCache: buildMediaCacheStatus(nextItem, new Date().toISOString()),
    };
  });
}

async function cacheRemoteMedia(url: string, itemDir: string, publicDir: string, basename: string, kind: "image" | "video") {
  const extension = inferExtension(url, kind);
  const hashedBasename = `${basename}${extension}`;
  const filePath = path.join(itemDir, hashedBasename);
  const publicUrl = `${publicDir}/${hashedBasename}`;

  try {
    const existing = await stat(filePath);
    if (existing.size > 0) {
      if (kind === "image") return ensureBrowserReadableCachedImage(filePath, publicUrl);
      return publicUrl;
    }
  } catch {
    // File is not cached yet.
  }

  await mkdir(itemDir, { recursive: true });
  await downloadRemoteFile(url, filePath, kind === "video" ? 120 * 1024 * 1024 : 12 * 1024 * 1024);
  if (kind === "image") return ensureBrowserReadableCachedImage(filePath, publicUrl);
  return publicUrl;
}

async function ensureBrowserReadableCachedImage(filePath: string, publicUrl: string) {
  const buffer = await readFile(filePath);
  const format = sniffImageFormat(buffer);
  if (format?.browserSupported) return publicUrl;
  if (format?.mimeType === "image/heic") {
    await transcodeImageToJpeg(filePath);
    return publicUrl;
  }
  await rm(filePath, { force: true }).catch(() => undefined);
  throw new Error(format ? `unsupported cached image format (${format.mimeType})` : "unsupported cached image format");
}

async function transcodeImageToJpeg(filePath: string) {
  const parsed = path.parse(filePath);
  const tempPath = path.join(parsed.dir, `.${parsed.name}-${Date.now()}.jpg`);
  await runFfmpeg(
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      tempPath,
    ],
    imageTranscodeTimeoutMs,
  );
  await rm(filePath, { force: true });
  await rename(tempPath, filePath);
}

async function cacheVideoFrames(downloadedVideoUrl: string, itemDir: string, publicDir: string) {
  const videoPath = publicUrlToFilePath(downloadedVideoUrl);
  if (!videoPath) return [];

  const videoStat = await stat(videoPath).catch(() => undefined);
  if (!videoStat?.size) return [];

  const framesDir = path.join(itemDir, "frames");
  const publicFramesDir = `${publicDir}/frames`;
  await mkdir(framesDir, { recursive: true });

  let frames = await listVideoFrames(framesDir, publicFramesDir);
  if (frames.length >= 2) return selectBestVideoHighlightFrames(frames);

  const coverPath = path.join(framesDir, "cover.jpg");
  const coverExists = await hasUsableFile(coverPath);
  if (!coverExists) {
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "0.7",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=720:-2",
      "-q:v",
      "3",
      coverPath,
    ]).catch(() =>
      runFfmpeg([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=720:-2",
        "-q:v",
        "3",
        coverPath,
      ]),
    );
  }

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-t",
    String(frameScanSeconds),
    "-vf",
    `fps=1/${frameIntervalSeconds},scale=720:-2`,
    "-q:v",
    "3",
    path.join(framesDir, "frame-%03d.jpg"),
  ]);

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-t",
    String(frameScanSeconds),
    "-vf",
    "select=gt(scene\\,0.34),scale=720:-2",
    "-fps_mode",
    "vfr",
    "-q:v",
    "3",
    path.join(framesDir, "scene-%03d.jpg"),
  ]).catch(() => undefined);

  frames = await listVideoFrames(framesDir, publicFramesDir);
  return selectBestVideoHighlightFrames(frames);
}

async function listVideoFrames(framesDir: string, publicFramesDir: string): Promise<VideoFrameAsset[]> {
  const entries = await readdir(framesDir, { withFileTypes: true }).catch(() => []);
  const frameFiles = entries
    .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp)$/i.test(entry.name))
    .map((entry) => entry.name);

  const usableFiles: string[] = [];
  for (const file of frameFiles) {
    if (await hasUsableFile(path.join(framesDir, file))) usableFiles.push(file);
  }

  return usableFiles
    .sort(compareFrameFiles)
    .map((file) => makeVideoFrameAsset(file, publicFramesDir));
}

function makeVideoFrameAsset(file: string, publicFramesDir: string): VideoFrameAsset {
  const name = path.parse(file).name;
  const frameMatch = file.match(/^frame-(\d+)/i);
  const sceneMatch = file.match(/^scene-(\d+)/i);
  const intervalIndex = frameMatch ? Number(frameMatch[1]) : undefined;
  const sceneIndex = sceneMatch ? Number(sceneMatch[1]) : undefined;

  if (/^cover/i.test(file)) {
    return {
      id: name,
      url: `${publicFramesDir}/${file}`,
      timestamp: 0.7,
      score: 82,
      type: "cover",
      reason: "Cover frame",
    };
  }

  if (sceneIndex) {
    return {
      id: name,
      url: `${publicFramesDir}/${file}`,
      score: Math.max(78, 92 - sceneIndex),
      type: "scene_change",
      reason: "Scene-change candidate",
    };
  }

  return {
    id: name,
    url: `${publicFramesDir}/${file}`,
    timestamp: intervalIndex ? Math.max(0, (intervalIndex - 1) * frameIntervalSeconds) : undefined,
    score: intervalIndex ? Math.max(64, 82 - intervalIndex) : 70,
    type: "interval",
    reason: "Interval frame",
  };
}

function compareFrameFiles(a: string, b: string) {
  const priority = (file: string) => (/^cover/i.test(file) ? 0 : /^scene-/i.test(file) ? 1 : /^frame-/i.test(file) ? 2 : 3);
  const priorityDiff = priority(a) - priority(b);
  if (priorityDiff !== 0) return priorityDiff;
  return extractFileNumber(a) - extractFileNumber(b);
}

function extractFileNumber(file: string) {
  const match = file.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function hasUsableFile(filePath: string) {
  const fileStat = await stat(filePath).catch(() => undefined);
  return Boolean(fileStat && fileStat.size > 0);
}

function publicUrlToFilePath(publicUrl: string) {
  if (!publicUrl.startsWith("/")) return undefined;
  const cleanPath = publicUrl.split(/[?#]/)[0].replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, cleanPath);
  const relativePath = path.relative(publicRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;
  return filePath;
}

function runFfmpeg(args: string[], timeoutMs = ffmpegTimeoutMs) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile("ffmpeg", args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
      if (error) {
        const detail = stderr?.toString().trim().split(/\r?\n/).slice(-2).join(" ") || error.message;
        reject(new Error(detail.slice(0, 240)));
        return;
      }
      resolve();
    });
    child.on("error", reject);
  });
}

function downloadRemoteFile(url: string, filePath: string, maxBytes: number, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 4) {
      reject(new Error("too many redirects"));
      return;
    }

    const parsedUrl = new URL(url);
    const request = parsedUrl.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(
      parsedUrl,
      {
        headers: buildMediaRequestHeaders(parsedUrl.toString()),
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();
          downloadRemoteFile(redirectUrl, filePath, maxBytes, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        const contentLength = Number(res.headers["content-length"] || 0);
        if (contentLength > maxBytes) {
          res.resume();
          reject(new Error(`file too large (${Math.round(contentLength / 1024 / 1024)} MB)`));
          return;
        }

        const file = createWriteStream(filePath);
        let bytes = 0;
        let settled = false;

        const fail = async (error: Error) => {
          if (settled) return;
          settled = true;
          file.destroy();
          res.destroy();
          await rm(filePath, { force: true }).catch(() => undefined);
          reject(error);
        };

        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            void fail(new Error(`file too large (>${Math.round(maxBytes / 1024 / 1024)} MB)`));
          }
        });
        res.on("error", (error) => void fail(error));
        file.on("error", (error) => void fail(error));
        file.on("finish", () => {
          if (settled) return;
          settled = true;
          resolve();
        });

        res.pipe(file);
      },
    );

    req.setTimeout(45000, () => req.destroy(new Error("download timeout")));
    req.on("error", async (error) => {
      await rm(filePath, { force: true }).catch(() => undefined);
      reject(error);
    });
    req.end();
  });
}

function inferExtension(url: string, kind: "image" | "video") {
  const pathName = new URL(url).pathname;
  const match = pathName.match(/\.(png|jpe?g|webp|gif|mp4|mov)(?:$|[?#])/i) || pathName.match(/\.(png|jpe?g|webp|gif|mp4|mov)$/i);
  if (match?.[1]) return `.${match[1].toLowerCase().replace("jpeg", "jpg")}`;
  if (kind === "video") return ".mp4";
  if (/webp/i.test(url)) return ".webp";
  return ".jpg";
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "unknown";
}

function isDownloadableVideoUrl(url: string) {
  return /^https?:\/\//i.test(url) && isLikelyVideoUrl(url) && !/\.m3u8(\?|$)/i.test(url);
}

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|mov)(\?|$)/i.test(url) || /mime_type=video|douyinvod|\/video\/tos\/|aweme\/v1\/play|api-play/i.test(url);
}

function isLocalAppMediaUrl(url: string) {
  return url.startsWith("/media/") || url.startsWith("/generated/");
}
