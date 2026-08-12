import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { runWithConcurrencyPool } from "../concurrency";
import { materializeRuntimeMedia } from "../runtime-media-materializer";
import { findExistingRuntimeMedia, persistRuntimeMedia } from "../runtime-media-storage";
import { parseCanvasVideoTimestamps, resolveCanvasImageDimensions } from "./node-utils";
import type { CanvasMediaReference, CanvasNodeConfig } from "./types";

const maxImageBytes = 30 * 1024 * 1024;
const maxVideoBytes = 512 * 1024 * 1024;
const maxImages = 20;
const maxVideos = 4;
const maxFrames = 20;
const mediaTimeoutMs = 120_000;
const videoEncodeTimeoutMs = 30 * 60_000;
const maxSourceDurationSeconds = 600;
const maxOutputEdge = 4096;
const outputRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-tools");

export class CanvasMediaNeedsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasMediaNeedsConfigError";
  }
}

type CanvasMediaProbe = {
  durationSeconds?: number;
  width: number;
  height: number;
  hasAudio: boolean;
  formatName?: string;
  sizeBytes: number;
};

export async function persistCanvasSourceVideo(sourceUrl: string) {
  if (/\.m3u8(?:$|[?#])/i.test(sourceUrl)) throw new Error("HLS sources are not supported. Provide a direct video file URL.");
  const fingerprint = mediaFingerprint("source-video", sourceUrl, {});
  const existing = await existingCanvasSourceVideo(fingerprint);
  if (existing) {
    const materialized = await materializeRuntimeMedia(existing.url, { maxBytes: maxVideoBytes, kind: "video" });
    try {
      return { url: existing.url, ...(await probeRequiredSourceVideo(materialized.filePath)) };
    } finally {
      await materialized.cleanup();
    }
  }

  const input = await materializeRuntimeMedia(sourceUrl, { maxBytes: maxVideoBytes, kind: "video" });
  let stagingPath = "";
  try {
    const metadata = await probeRequiredSourceVideo(input.filePath);
    const storageFormat = sourceVideoStorageFormat(input.filePath, metadata.formatName);
    const publicPath = `/generated/canvas-tools/${fingerprint}${storageFormat.extension}`;
    stagingPath = path.join(outputRoot, `.${fingerprint}-${randomUUID()}.tmp${storageFormat.extension}`);
    const outputPath = path.join(outputRoot, `${fingerprint}${storageFormat.extension}`);
    await mkdir(outputRoot, { recursive: true });
    await copyFile(input.filePath, stagingPath);
    await rename(stagingPath, outputPath);
    stagingPath = "";
    const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: storageFormat.contentType, overwrite: false });
    return { url, ...metadata };
  } finally {
    if (stagingPath) await rm(stagingPath, { force: true });
    await input.cleanup();
  }
}

export async function reconstructCanvasVideo(input: {
  source: CanvasMediaReference;
  replacement: CanvasMediaReference;
  replacementKind: "image" | "video";
}) {
  const source = await materializeRuntimeMedia(input.source.url, { maxBytes: maxVideoBytes, kind: "video" });
  let replacement: Awaited<ReturnType<typeof materializeRuntimeMedia>> | undefined;
  let stagingPath = "";
  try {
    replacement = await materializeRuntimeMedia(input.replacement.url, {
      maxBytes: input.replacementKind === "image" ? maxImageBytes : maxVideoBytes,
      kind: input.replacementKind,
    });
    const sourceMetadata = await probeRequiredSourceVideo(source.filePath);
    const replacementMetadata = await probeCanvasMediaFile(replacement.filePath);
    const dimensions = fitVideoOutputDimensions(replacementMetadata.width, replacementMetadata.height);
    const fingerprint = mediaFingerprint("video-reconstruct", input.source.url, {
      replacementUrl: input.replacement.url,
      replacementKind: input.replacementKind,
      duration: Math.round(sourceMetadata.durationSeconds * 1000),
      width: dimensions.width,
      height: dimensions.height,
    });
    const publicPath = `/generated/canvas-tools/${fingerprint}.mp4`;
    const existing = await existingOutput(publicPath);
    if (existing) {
      return { url: existing, width: dimensions.width, height: dimensions.height, durationSeconds: sourceMetadata.durationSeconds, mimeType: "video/mp4" };
    }

    await mkdir(outputRoot, { recursive: true });
    stagingPath = path.join(outputRoot, `.${fingerprint}-${randomUUID()}.tmp.mp4`);
    const outputPath = path.join(outputRoot, `${fingerprint}.mp4`);
    const videoFilter = input.replacementKind === "image"
      ? `scale=${dimensions.width}:${dimensions.height}:flags=lanczos,setsar=1,fps=30,format=yuv420p`
      : `scale=${dimensions.width}:${dimensions.height}:flags=lanczos,setsar=1,format=yuv420p`;
    const replacementArgs = input.replacementKind === "image"
      ? ["-loop", "1", "-framerate", "30", "-i", replacement.filePath]
      : ["-stream_loop", "-1", "-i", replacement.filePath];
    await runWithConcurrencyPool("localVideo", () => runMediaCommand("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      ...replacementArgs,
      "-i", source.filePath,
      "-map", "0:v:0", "-map", "1:a:0",
      "-vf", videoFilter,
      "-t", formatSeconds(sourceMetadata.durationSeconds),
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", "-shortest",
      stagingPath,
    ], videoEncodeTimeoutMs));
    const encoded = await stat(stagingPath);
    if (!encoded.isFile() || !encoded.size) throw new Error("FFmpeg produced an empty reconstructed video.");
    await rename(stagingPath, outputPath);
    stagingPath = "";
    const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: "video/mp4", overwrite: false });
    return { url, width: dimensions.width, height: dimensions.height, durationSeconds: sourceMetadata.durationSeconds, mimeType: "video/mp4" };
  } finally {
    if (stagingPath) await rm(stagingPath, { force: true });
    await Promise.all([source.cleanup(), replacement?.cleanup()]);
  }
}

export async function transformCanvasImages(items: CanvasMediaReference[], config: CanvasNodeConfig) {
  if (!items.length) throw new Error("Image transform requires at least one image.");
  if (items.length > maxImages) throw new Error(`Image transform accepts at most ${maxImages} images.`);
  const { width, height } = resolveCanvasImageDimensions(config);
  const fit = config.fit === "contain" ? "contain" : "cover";
  const format = config.format === "png" || config.format === "webp" ? config.format : "jpeg";
  const quality = Number(config.quality || 90);
  const outputs: CanvasMediaReference[] = [];
  for (const [index, item] of items.entries()) {
    const fingerprint = mediaFingerprint("transform", item.url, { width, height, fit, format, quality });
    const extension = format === "jpeg" ? "jpg" : format;
    const publicPath = `/generated/canvas-tools/${fingerprint}.${extension}`;
    const existing = await existingOutput(publicPath);
    if (existing) {
      outputs.push({ ...item, url: existing, width, height, mimeType: `image/${format}` });
      continue;
    }
    const input = await materializeRuntimeMedia(item.url, { maxBytes: maxImageBytes, kind: "image" });
    const outputPath = path.join(outputRoot, `${fingerprint}.${extension}`);
    try {
      await mkdir(outputRoot, { recursive: true });
      const filter = fit === "cover"
        ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=white`;
      const formatArgs = format === "jpeg"
        ? ["-q:v", String(qualityToJpegQ(quality))]
        : format === "webp" ? ["-quality", String(quality)] : [];
      await runMediaCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input.filePath, "-frames:v", "1", "-vf", filter, ...formatArgs, outputPath]);
      const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: `image/${format}`, overwrite: false });
      outputs.push({ ...item, url, name: item.name || `image-${index + 1}`, width, height, mimeType: `image/${format}` });
    } finally {
      await input.cleanup();
    }
  }
  return outputs;
}

export async function extractCanvasVideoFrames(items: CanvasMediaReference[], config: CanvasNodeConfig) {
  if (!items.length) throw new Error("Video frames requires at least one video.");
  if (items.length > maxVideos) throw new Error(`Video frames accepts at most ${maxVideos} videos.`);
  const maxEdge = Number(config.maxEdge || 1920);
  const planned: Array<{ item: CanvasMediaReference; inputPath: string; cleanup: () => Promise<void>; timestamps: number[]; width: number; height: number }> = [];
  try {
    for (const item of items) {
      const input = await materializeRuntimeMedia(item.url, { maxBytes: maxVideoBytes, kind: "video" });
      const metadata = await probeVideoMetadata(input.filePath);
      const dimensions = fitWithinMaxEdge(metadata.width, metadata.height, maxEdge);
      const duration = config.mode === "even" || config.mode === "timestamps" ? metadata.duration : undefined;
      planned.push({ item, inputPath: input.filePath, cleanup: input.cleanup, timestamps: parseCanvasVideoTimestamps(config, duration), ...dimensions });
    }
    const totalFrames = planned.reduce((total, item) => total + item.timestamps.length, 0);
    if (!totalFrames || totalFrames > maxFrames) throw new Error(`Video frames must produce between 1 and ${maxFrames} total frames.`);
    const quality = Number(config.quality || 90);
    const outputs: CanvasMediaReference[] = [];
    for (const [videoIndex, item] of planned.entries()) {
      for (const [frameIndex, timestamp] of item.timestamps.entries()) {
        const fingerprint = mediaFingerprint("frame", item.item.url, { timestamp, quality, maxEdge });
        const publicPath = `/generated/canvas-tools/${fingerprint}.jpg`;
        const existing = await existingOutput(publicPath);
        if (existing) {
          outputs.push({ url: existing, name: `video-${videoIndex + 1}-frame-${frameIndex + 1}`, width: item.width, height: item.height, mimeType: "image/jpeg" });
          continue;
        }
        const outputPath = path.join(outputRoot, `${fingerprint}.jpg`);
        await mkdir(outputRoot, { recursive: true });
        const filter = `scale=w=min(${maxEdge}\\,iw):h=min(${maxEdge}\\,ih):force_original_aspect_ratio=decrease`;
        await runMediaCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", formatSeconds(timestamp), "-i", item.inputPath, "-frames:v", "1", "-vf", filter, "-q:v", String(qualityToJpegQ(quality)), outputPath]);
        const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: "image/jpeg", overwrite: false });
        outputs.push({ url, name: `video-${videoIndex + 1}-frame-${frameIndex + 1}`, width: item.width, height: item.height, mimeType: "image/jpeg" });
      }
    }
    return outputs;
  } finally {
    await Promise.all(planned.map((item) => item.cleanup()));
  }
}

async function probeVideoMetadata(filePath: string) {
  const metadata = await probeCanvasMediaFile(filePath);
  const duration = metadata.durationSeconds;
  const width = metadata.width;
  const height = metadata.height;
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) throw new Error("ffprobe did not return a valid video duration.");
  return { duration, width, height };
}

export async function probeCanvasMediaFile(filePath: string): Promise<CanvasMediaProbe> {
  const output = await runMediaCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,format_name:stream=index,codec_type,width,height,duration",
    "-of", "json",
    filePath,
  ]);
  const data = JSON.parse(output) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ index?: number; codec_type?: string; width?: number; height?: number; duration?: string }>;
  };
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  const width = Number(video?.width);
  const height = Number(video?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("Media does not contain a valid video stream.");
  const duration = Number(audio?.duration || data.format?.duration);
  const file = await stat(filePath);
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    width,
    height,
    hasAudio: Boolean(audio),
    formatName: data.format?.format_name,
    sizeBytes: file.size,
  };
}

async function probeRequiredSourceVideo(filePath: string) {
  const metadata = await probeCanvasMediaFile(filePath);
  if (metadata.sizeBytes > maxVideoBytes) throw new Error("Source video exceeds the 512MB limit.");
  if (/\bhls\b/i.test(metadata.formatName || "")) throw new Error("HLS sources are not supported. Provide a direct video file URL.");
  if (!metadata.hasAudio) throw new Error("Source video does not contain an audio track.");
  if (!metadata.durationSeconds) throw new Error("Source video first audio track has no valid duration.");
  if (metadata.durationSeconds > maxSourceDurationSeconds) throw new Error("Source video audio exceeds the 600 second limit.");
  return {
    durationSeconds: metadata.durationSeconds,
    width: metadata.width,
    height: metadata.height,
    formatName: metadata.formatName,
  };
}

function fitVideoOutputDimensions(width: number, height: number) {
  const scale = Math.min(1, maxOutputEdge / Math.max(width, height));
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  return { width: even(width * scale), height: even(height * scale) };
}

function fitWithinMaxEdge(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function existingOutput(publicPath: string) {
  const filePath = path.join(outputRoot, path.basename(publicPath));
  const file = await stat(filePath).catch(() => undefined);
  if (file?.isFile() && file.size > 0) return publicPath;
  return findExistingRuntimeMedia(publicPath);
}

const sourceVideoStorageFormats = [
  { extension: ".mp4", contentType: "video/mp4" },
  { extension: ".mov", contentType: "video/quicktime" },
  { extension: ".webm", contentType: "video/webm" },
  { extension: ".mkv", contentType: "video/x-matroska" },
  { extension: ".avi", contentType: "video/x-msvideo" },
  { extension: ".ts", contentType: "video/mp2t" },
  { extension: ".mpg", contentType: "video/mpeg" },
] as const;

async function existingCanvasSourceVideo(fingerprint: string) {
  for (const format of sourceVideoStorageFormats) {
    const publicPath = `/generated/canvas-tools/${fingerprint}${format.extension}`;
    const url = await existingOutput(publicPath);
    if (url) return { url, ...format };
  }
  return undefined;
}

function sourceVideoStorageFormat(filePath: string, formatName?: string) {
  const normalizedFormat = String(formatName || "").toLowerCase();
  if (/(^|,)webm(,|$)/.test(normalizedFormat)) return sourceVideoStorageFormats[2];
  if (/(^|,)matroska(,|$)/.test(normalizedFormat)) return sourceVideoStorageFormats[3];
  if (/(^|,)avi(,|$)/.test(normalizedFormat)) return sourceVideoStorageFormats[4];
  if (/(^|,)mpegts(,|$)/.test(normalizedFormat)) return sourceVideoStorageFormats[5];
  if (/(^|,)mpeg(,|$)/.test(normalizedFormat)) return sourceVideoStorageFormats[6];
  if (/(^|,)mov(,|$)/.test(normalizedFormat)) {
    return path.extname(filePath).toLowerCase() === ".mov" ? sourceVideoStorageFormats[1] : sourceVideoStorageFormats[0];
  }
  const extension = path.extname(filePath).toLowerCase();
  return sourceVideoStorageFormats.find((format) => format.extension === extension) || sourceVideoStorageFormats[0];
}

function mediaFingerprint(kind: string, url: string, config: Record<string, string | number>) {
  return createHash("sha256").update(JSON.stringify({ kind, url, config })).digest("hex").slice(0, 32);
}

function qualityToJpegQ(quality: number) {
  const normalized = Math.max(1, Math.min(100, Math.round(quality)));
  return Math.max(2, Math.min(31, Math.round(31 - (normalized / 100) * 29)));
}

function formatSeconds(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

function runMediaCommand(command: "ffmpeg" | "ffprobe", args: string[], timeout = mediaTimeoutMs) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(command, args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CanvasMediaNeedsConfigError(`${command} is not installed or is not available on PATH.`));
          return;
        }
        const detail = stderr?.toString().trim().split(/\r?\n/).slice(-2).join(" ") || error.message;
        reject(new Error(`${command} failed: ${detail.slice(0, 300)}`));
        return;
      }
      resolve(stdout?.toString() || "");
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new CanvasMediaNeedsConfigError(`${command} is not installed or is not available on PATH.`));
      else reject(error);
    });
  });
}
