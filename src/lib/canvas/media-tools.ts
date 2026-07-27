import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
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
const outputRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-tools");

export class CanvasMediaNeedsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasMediaNeedsConfigError";
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
  const output = await runMediaCommand("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", filePath]);
  const data = JSON.parse(output) as { format?: { duration?: string }; streams?: Array<{ width?: number; height?: number }> };
  const duration = Number(data.format?.duration);
  const width = Number(data.streams?.[0]?.width);
  const height = Number(data.streams?.[0]?.height);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("ffprobe did not return a valid video duration.");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("ffprobe did not return valid video dimensions.");
  return { duration, width, height };
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

function runMediaCommand(command: "ffmpeg" | "ffprobe", args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(command, args, { timeout: mediaTimeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
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
