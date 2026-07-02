import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { concurrencyConfig, mapWithConcurrency } from "./concurrency";
import { sniffImageFormat } from "./image-format";
import { buildMediaCacheStatus } from "./media-cache-status";
import { buildMediaRequestHeaders } from "./media-request";
import { cleanCachedSourceImage, shouldCleanCachedSourceImage } from "./source-image-cleanup";
import { isVideoFrameAiReviewConfigured, reviewVideoFramesWithAi } from "./video-frame-review";
import { isArkVideoTranscriptionConfigured, mergeTranscriptIntoContentText, transcribeVideoContent } from "./video-transcription";
import { replaceVideoFrameUrlsInMediaUrls, selectBestVideoHighlightFrames } from "./video-frame-policy";
import { rankVideoUrlsByQuality, type VideoQualityCandidate } from "./video-quality";
import type { NormalizedSourceItem, SourceVideoTranscript, VideoFrameAsset } from "./types";

const mediaCacheRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "media", "crawl");
const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
const maxImagesToCache = 18;
const frameIntervalSeconds = 3;
const maxVideoFrameCandidates = 18;
const sceneFrameLimit = 8;
const ffmpegTimeoutMs = 90_000;
const imageTranscodeTimeoutMs = 90_000;
const perceptualHashSize = 16;
const frameQualitySampleSize = 32;

export type CacheCrawledMediaOptions = {
  enableVideoTranscription?: boolean;
  forceVideoRefresh?: boolean;
};

export async function cacheCrawledMedia(items: NormalizedSourceItem[], options: CacheCrawledMediaOptions = {}) {
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
        const localUrl = await cacheRemoteMedia(imageUrl, itemDir, publicDir, `image-${index + 1}`, "image", { sourceItem: item });
        if (localUrl) downloadedImages.push(localUrl);
      } catch (error) {
        downloadErrors.push(`image-${index + 1}: ${error instanceof Error ? error.message : "download failed"}`);
      }
    }

    let downloadedVideoUrl = item.downloadedVideoUrl;
    const shouldRefreshVideo = shouldRefreshVideoCacheForItem(item, options);
    if (shouldRefreshVideo) {
      const videoResult = await cacheRemoteVideoCandidates(item, itemDir, publicDir, { overwrite: options.forceVideoRefresh === true });
      downloadedVideoUrl = videoResult.downloadedVideoUrl || downloadedVideoUrl;
      downloadErrors.push(...videoResult.errors);
    } else if (!downloadedVideoUrl && item.videoUrl && isLocalAppMediaUrl(item.videoUrl)) {
      downloadedVideoUrl = item.videoUrl;
    } else if (!downloadedVideoUrl) {
      const videoResult = await cacheRemoteVideoCandidates(item, itemDir, publicDir);
      downloadedVideoUrl = videoResult.downloadedVideoUrl;
      downloadErrors.push(...videoResult.errors);
    }

    let videoFrames: VideoFrameAsset[] | undefined = item.videoFrames;
    let videoTranscript: SourceVideoTranscript | undefined = item.videoTranscript;
    let contentText = item.contentText;
    if (downloadedVideoUrl) {
      try {
        const frames = await cacheVideoFrames(downloadedVideoUrl, itemDir, publicDir, item.id, { refresh: options.forceVideoRefresh === true && shouldRefreshVideo });
        videoFrames = frames.length ? frames : videoFrames;
      } catch (error) {
        downloadErrors.push(`video-frames: ${error instanceof Error ? error.message : "extraction failed"}`);
      }
      if (options.enableVideoTranscription === true && isArkVideoTranscriptionConfigured() && videoTranscript?.status !== "success") {
        try {
          const videoPath = publicUrlToFilePath(downloadedVideoUrl);
          if (!videoPath) throw new Error("downloaded video is not a local media URL");
          videoTranscript = await transcribeVideoContent({
            videoPath,
            videoPublicUrl: downloadedVideoUrl,
            sourceItemId: item.id,
          });
          if (videoTranscript.status === "success") {
            contentText = mergeTranscriptIntoContentText(contentText, videoTranscript.text);
          } else if (videoTranscript.error) {
            downloadErrors.push(`video-transcript: ${videoTranscript.error}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "transcription failed";
          videoTranscript = {
            status: "failed",
            provider: "ark_video",
            transcribedAt: new Date().toISOString(),
            error: message,
          };
          downloadErrors.push(`video-transcript: ${message}`);
        }
      }
    }

    const selectedVideoFrames = selectBestVideoHighlightFrames(videoFrames);

    const nextItem: NormalizedSourceItem = {
      ...item,
      contentText,
      images: item.images,
      downloadedImages: downloadedImages.length ? downloadedImages : undefined,
      downloadedVideoUrl,
      videoFrames: selectedVideoFrames.length ? selectedVideoFrames : undefined,
      videoTranscript,
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

type VideoDownloadResult = {
  downloadedVideoUrl?: string;
  errors: string[];
};

type CacheRemoteVideoCandidateOptions = {
  overwrite?: boolean;
};

async function cacheRemoteVideoCandidates(
  item: NormalizedSourceItem,
  itemDir: string,
  publicDir: string,
  options: CacheRemoteVideoCandidateOptions = {},
): Promise<VideoDownloadResult> {
  const candidates = buildVideoDownloadCandidates(item);
  const attemptErrors: string[] = [];
  for (const [index, url] of candidates.entries()) {
    try {
      return {
        downloadedVideoUrl: await cacheRemoteMedia(url, itemDir, publicDir, "video-1", "video", { overwrite: options.overwrite === true }),
        errors: [],
      };
    } catch (error) {
      const prefix = index === 0 ? "video-1" : `video-1-fallback-${index}`;
      attemptErrors.push(`${prefix}: ${error instanceof Error ? error.message : "download failed"}`);
    }
  }
  return { errors: attemptErrors };
}

export function shouldRefreshVideoCacheForItem(item: Pick<NormalizedSourceItem, "videoUrl" | "downloadedVideoUrl" | "mediaUrls" | "raw">, options: CacheCrawledMediaOptions = {}) {
  if (options.forceVideoRefresh === true) return buildVideoDownloadCandidates(item as NormalizedSourceItem).length > 0;
  if (item.downloadedVideoUrl) return false;
  if (item.videoUrl && isLocalAppMediaUrl(item.videoUrl)) return false;
  return buildVideoDownloadCandidates(item as NormalizedSourceItem).length > 0;
}

export function buildVideoDownloadCandidates(item: NormalizedSourceItem) {
  const primary = item.videoUrl && isDownloadableVideoUrl(item.videoUrl) ? item.videoUrl : "";
  const ranked = rankVideoUrlsByQuality([
    ...extractVideoCandidatesFromUnknown(item.raw),
    ...item.mediaUrls.map((url, index) => ({ url, sourcePriority: -index })),
  ]).filter((url) => isDownloadableVideoUrl(url) && url !== primary);
  return dedupeStrings([
    primary,
    ...ranked.filter(isDirectVideoDownloadUrl),
    ...ranked.filter((url) => !isDirectVideoDownloadUrl(url)),
  ].filter(Boolean));
}

function extractVideoCandidatesFromUnknown(value: unknown): VideoQualityCandidate[] {
  const candidates: VideoQualityCandidate[] = [];
  const visit = (node: unknown, keyHint: string, context: Partial<VideoQualityCandidate>, depth: number) => {
    if (depth > 7 || candidates.length > 120) return;
    if (typeof node === "string") {
      if (isDownloadableVideoUrl(node)) candidates.push({ ...context, url: node, keyHint: joinKeyHint(context.keyHint, keyHint) });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${keyHint}.${index}`, context, depth + 1));
      return;
    }
    if (!isRecord(node)) return;

    const nextContext: Partial<VideoQualityCandidate> = {
      ...context,
      width: firstPositiveNumber(node, ["width", "w"]) || context.width,
      height: firstPositiveNumber(node, ["height", "h"]) || context.height,
      bitrate: firstPositiveNumber(node, ["bit_rate", "bitrate", "avg_bitrate", "avgBitrate", "video_bitrate"]) || context.bitrate,
      quality: firstString(node, ["quality", "quality_type", "qualityType", "gear_name", "gearName", "definition", "format", "format_id"]) || context.quality,
      keyHint: keyHint || context.keyHint,
    };

    Object.entries(node).forEach(([key, child]) => visit(child, keyHint ? `${keyHint}.${key}` : key, nextContext, depth + 1));
  };

  visit(value, "", {}, 0);
  return candidates;
}

type CacheRemoteMediaOptions = {
  overwrite?: boolean;
  sourceItem?: NormalizedSourceItem;
};

async function cacheRemoteMedia(
  url: string,
  itemDir: string,
  publicDir: string,
  basename: string,
  kind: "image" | "video",
  options: CacheRemoteMediaOptions = {},
) {
  const extension = inferExtension(url, kind);
  const hashedBasename = `${basename}${extension}`;
  const filePath = path.join(itemDir, hashedBasename);
  const publicUrl = `${publicDir}/${hashedBasename}`;

  if (!options.overwrite) {
    try {
      const existing = await stat(filePath);
      if (existing.size > 0) {
        if (kind === "image") return ensureCachedSourceImage(filePath, publicUrl, options.sourceItem, false);
        return publicUrl;
      }
    } catch {
      // File is not cached yet.
    }
  }

  await mkdir(itemDir, { recursive: true });
  await downloadRemoteFile(url, filePath, kind === "video" ? 120 * 1024 * 1024 : 12 * 1024 * 1024);
  if (kind === "image") return ensureCachedSourceImage(filePath, publicUrl, options.sourceItem, true);
  return publicUrl;
}

async function ensureCachedSourceImage(filePath: string, publicUrl: string, sourceItem?: NormalizedSourceItem, forceCleanup = false) {
  const readableUrl = await ensureBrowserReadableCachedImage(filePath, publicUrl);
  if (sourceItem && shouldCleanCachedSourceImage(sourceItem)) {
    await cleanCachedSourceImage(filePath, { platform: sourceItem.platform, force: forceCleanup });
    return ensureBrowserReadableCachedImage(filePath, readableUrl);
  }
  return readableUrl;
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

async function cacheVideoFrames(
  downloadedVideoUrl: string,
  itemDir: string,
  publicDir: string,
  sourceItemId?: string,
  options: { refresh?: boolean } = {},
) {
  const videoPath = publicUrlToFilePath(downloadedVideoUrl);
  if (!videoPath) return [];

  const videoStat = await stat(videoPath).catch(() => undefined);
  if (!videoStat?.size) return [];

  const framesDir = path.join(itemDir, "frames");
  const publicFramesDir = `${publicDir}/frames`;
  if (options.refresh === true) {
    await rm(framesDir, { recursive: true, force: true }).catch(() => undefined);
  }
  await mkdir(framesDir, { recursive: true });

  let frames = await listVideoFrames(framesDir, publicFramesDir);
  if (frames.length >= 2) return selectReviewedVideoFrames(frames, sourceItemId);

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

  const durationSeconds = await probeVideoDurationSeconds(videoPath);
  const sampleTimestamps = buildVideoFrameSampleTimestamps(durationSeconds);
  for (const [index, timestamp] of sampleTimestamps.entries()) {
    const framePath = path.join(framesDir, `frame-${String(index + 1).padStart(3, "0")}-t${formatTimestampForFile(timestamp)}.jpg`);
    if (await hasUsableFile(framePath)) continue;
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(Math.max(0, timestamp)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=720:-2",
      "-q:v",
      "3",
      framePath,
    ]).catch(() => undefined);
  }

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    ...(durationSeconds ? ["-t", String(Math.min(durationSeconds, 180))] : []),
    "-vf",
    "select=gt(scene\\,0.34),scale=720:-2",
    "-fps_mode",
    "vfr",
    "-q:v",
    "3",
    path.join(framesDir, "scene-%03d.jpg"),
  ]).catch(() => undefined);

  frames = await listVideoFrames(framesDir, publicFramesDir);
  return selectReviewedVideoFrames(frames, sourceItemId);
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

  const frames: VideoFrameAsset[] = [];
  for (const file of usableFiles.sort(compareFrameFiles)) {
    const framePath = path.join(framesDir, file);
    frames.push({
      ...makeVideoFrameAsset(file, publicFramesDir),
      perceptualHash: await computeFramePerceptualHash(framePath).catch(() => undefined),
      qualityScore: await computeFrameQualityScore(framePath).catch(() => undefined),
    });
  }
  return limitSceneFrames(frames);
}

function makeVideoFrameAsset(file: string, publicFramesDir: string): VideoFrameAsset {
  const name = path.parse(file).name;
  const frameMatch = file.match(/^frame-(\d+)/i);
  const sceneMatch = file.match(/^scene-(\d+)/i);
  const timestampMatch = file.match(/-t(\d+(?:p\d+)?)/i);
  const intervalIndex = frameMatch ? Number(frameMatch[1]) : undefined;
  const sceneIndex = sceneMatch ? Number(sceneMatch[1]) : undefined;
  const encodedTimestamp = timestampMatch ? Number(timestampMatch[1].replace("p", ".")) : undefined;

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
    timestamp: Number.isFinite(encodedTimestamp)
      ? encodedTimestamp
      : intervalIndex
        ? Math.max(0, (intervalIndex - 1) * frameIntervalSeconds)
        : undefined,
    score: intervalIndex ? Math.max(64, 82 - intervalIndex) : 70,
    type: "interval",
    reason: "Interval frame",
  };
}

async function selectReviewedVideoFrames(frames: VideoFrameAsset[], sourceItemId?: string) {
  const localSelected = selectBestVideoHighlightFrames(frames);
  let reviewedFrames = frames;
  let aiReviewStatus: "skipped" | "success" | "failed" = isVideoFrameAiReviewConfigured() ? "failed" : "skipped";
  let aiReviewError: string | undefined;

  if (isVideoFrameAiReviewConfigured()) {
    try {
      reviewedFrames = await reviewVideoFramesWithAi(frames);
      aiReviewStatus = "success";
    } catch (error) {
      aiReviewError = compactError(error);
      aiReviewStatus = "failed";
    }
  }

  const selected = selectBestVideoHighlightFrames(reviewedFrames);
  await recordExecutionLog({
    scope: "media/cache",
    action: "视频高光帧选择",
    status: aiReviewStatus === "failed" ? "info" : "success",
    message: `候选帧 ${frames.length} 张，选中 ${selected.length} 张，AI 复评 ${aiReviewStatus}`,
    details: {
      sourceItemId: sourceItemId || "",
      candidateFrames: frames.length,
      locallySelectedFrames: localSelected.length,
      selectedFrames: selected.length,
      aiReviewStatus,
      aiReviewError: aiReviewError || "",
      selectedReasons: selected.map((frame) => `${frame.id}: ${frame.selectionReason || frame.reason}`).join("; "),
    },
  });
  return selected;
}

async function probeVideoDurationSeconds(videoPath: string) {
  const metadata = await runFfmpegForMetadata(["-hide_banner", "-i", videoPath], 8_000).catch(() => "");
  const match = metadata.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const parsed = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildVideoFrameSampleTimestamps(durationSeconds: number | undefined) {
  const duration = Number.isFinite(durationSeconds) && (durationSeconds || 0) > 0 ? durationSeconds || 0 : 54;
  const end = Math.max(1, duration - 0.8);
  const fixed = [0.7, 2, 5, 8, 12, 18, 24, 32, 45].filter((value) => value < end);
  const segments = Math.max(6, Math.min(maxVideoFrameCandidates, Math.ceil(duration / Math.max(frameIntervalSeconds, duration / 10))));
  const distributed = Array.from({ length: segments }, (_value, index) => {
    if (segments === 1) return Math.min(0.7, end);
    return Math.min(end, Math.max(0.7, (end * index) / (segments - 1)));
  });
  return dedupeNumbers([...fixed, ...distributed])
    .sort((a, b) => a - b)
    .slice(0, maxVideoFrameCandidates);
}

async function computeFrameQualityScore(framePath: string) {
  const pixels = await runFfmpegBuffer([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    framePath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${frameQualitySampleSize}:${frameQualitySampleSize}:force_original_aspect_ratio=disable,format=gray`,
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  const expectedLength = frameQualitySampleSize * frameQualitySampleSize;
  if (pixels.length < expectedLength) return undefined;
  const values = Array.from(pixels.subarray(0, expectedLength));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;
  const contrast = Math.sqrt(variance);
  const brightnessPenalty = average < 24 || average > 235 ? 45 : average < 42 || average > 215 ? 18 : 0;
  const contrastPenalty = contrast < 8 ? 35 : contrast < 16 ? 15 : 0;
  return Math.max(0, Math.min(100, Math.round(70 + Math.min(25, contrast / 2) - brightnessPenalty - contrastPenalty)));
}

function limitSceneFrames(frames: VideoFrameAsset[]) {
  let sceneCount = 0;
  return frames.filter((frame) => {
    if (frame.type !== "scene_change") return true;
    sceneCount += 1;
    return sceneCount <= sceneFrameLimit;
  });
}

function formatTimestampForFile(value: number) {
  return String(Math.round(value * 10) / 10).replace(".", "p");
}

function dedupeNumbers(values: number[]) {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    const normalized = Math.round(value * 10) / 10;
    if (!Number.isFinite(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
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

function runFfmpegBuffer(args: string[], timeoutMs = ffmpegTimeoutMs) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = execFile("ffmpeg", args, { encoding: "buffer", maxBuffer: 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr?.toString().trim().split(/\r?\n/).slice(-2).join(" ") || error.message;
        reject(new Error(detail.slice(0, 240)));
        return;
      }
      resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || ""));
    });
    child.on("error", reject);
  });
}

function runFfmpegForMetadata(args: string[], timeoutMs = ffmpegTimeoutMs) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile("ffmpeg", args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      const output = `${stdout || ""}\n${stderr || ""}`.trim();
      if (output) {
        resolve(output);
        return;
      }
      if (error) {
        reject(error);
        return;
      }
      resolve("");
    });
    child.on("error", reject);
  });
}

async function computeFramePerceptualHash(framePath: string) {
  const pixels = await runFfmpegBuffer([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    framePath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${perceptualHashSize}:${perceptualHashSize}:force_original_aspect_ratio=disable,format=gray`,
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  const expectedLength = perceptualHashSize * perceptualHashSize;
  if (pixels.length < expectedLength) return undefined;

  const values = Array.from(pixels.subarray(0, expectedLength));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => (value >= average ? "1" : "0")).join("");
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

function isDirectVideoDownloadUrl(url: string) {
  return /\/video\/tos\/|douyinvod|mime_type=video|\.(?:mp4|mov)(?:\?|$)/i.test(url) && !/\/aweme\/v1\/play/i.test(url);
}

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|mov)(\?|$)/i.test(url) || /mime_type=video|douyinvod|\/video\/tos\/|aweme\/v1\/play|api-play/i.test(url);
}

function isLocalAppMediaUrl(url: string) {
  return url.startsWith("/media/") || url.startsWith("/generated/");
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstPositiveNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[, ]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function joinKeyHint(left: unknown, right: string) {
  return [typeof left === "string" ? left : "", right].filter(Boolean).join(".");
}
