import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { runWithConcurrencyPool } from "../concurrency";
import { getCanvasSubtitleTranscriptCacheFromDb, saveCanvasSubtitleTranscriptCacheToDb } from "../database";
import { materializeRuntimeMedia } from "../runtime-media-materializer";
import { findExistingRuntimeMedia, persistRuntimeMedia } from "../runtime-media-storage";
import { requireCanvasSubtitleFont } from "./subtitle-fonts";
import { normalizeCanvasSubtitleStyle } from "./subtitle-style";
import { CanvasMediaNeedsConfigError, probeCanvasMediaFile } from "./media-tools";
import { CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION, canvasSubtitleRecognizerSettings, canvasSubtitleRecognizerSettingsHash, transcribeCanvasLocalSubtitleTimeline } from "./local-subtitle-timeline";
import type { CanvasMediaReference, CanvasSubtitleSegment, CanvasSubtitleStyle } from "./types";

const maxVideoBytes = 512 * 1024 * 1024;
const maxDurationSeconds = 600;
const videoEncodeTimeoutMs = 30 * 60_000;
const outputRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-tools");
const activeTimelines = new Map<string, Promise<CanvasSubtitleSegment[]>>();

export async function addCanvasVideoSubtitles(input: { source: CanvasMediaReference; style: CanvasSubtitleStyle; ownerUserId: string }) {
  const source = await materializeRuntimeMedia(input.source.url, { maxBytes: maxVideoBytes, kind: "video" });
  let stagingPath = "";
  let assPath = "";
  try {
    const metadata = await probeCanvasMediaFile(source.filePath);
    if (!metadata.hasAudio) throw new Error("Subtitle source video does not contain an audio track.");
    if (!metadata.durationSeconds || metadata.durationSeconds > maxDurationSeconds) throw new Error(`Subtitle source video duration must be at most ${maxDurationSeconds} seconds.`);
    const style = normalizeCanvasSubtitleStyle(input.style);
    style.fontFamily = await requireCanvasSubtitleFont(style.fontFamily).catch((error) => {
      throw new CanvasMediaNeedsConfigError(error instanceof Error ? error.message : "Subtitle font is unavailable.");
    });
    await requireSubtitleFfmpegCapabilities();
    const videoSha256 = await hashFile(source.filePath);
    const recognizer = canvasSubtitleRecognizerSettings();
    const settingsHash = canvasSubtitleRecognizerSettingsHash();
    const cacheId = buildCanvasSubtitleTimelineCacheId({
      ownerUserId: input.ownerUserId,
      videoSha256,
      engine: recognizer.engine,
      model: recognizer.model,
      settingsHash,
    });
    const segments = await resolveTimeline(cacheId, {
      ownerUserId: input.ownerUserId,
      videoSha256,
      engine: recognizer.engine,
      model: recognizer.model,
      settingsHash,
      videoPath: source.filePath,
      durationSeconds: metadata.durationSeconds,
      mediaStartSeconds: metadata.mediaStartSeconds,
      audioStartSeconds: metadata.audioStartSeconds,
    });
    const fingerprint = sha256(JSON.stringify({ kind: "video-subtitles-v3", videoSha256, segments, style, width: metadata.width, height: metadata.height, rotation: metadata.rotation })).slice(0, 32);
    const publicPath = `/generated/canvas-tools/${fingerprint}.mp4`;
    const existing = await existingOutput(publicPath);
    if (existing) return subtitleResult(existing, metadata, segments);

    await mkdir(outputRoot, { recursive: true });
    const assFilename = `.${fingerprint}-${randomUUID()}.ass`;
    assPath = path.join(outputRoot, assFilename);
    stagingPath = path.join(outputRoot, `.${fingerprint}-${randomUUID()}.tmp.mp4`);
    const outputPath = path.join(outputRoot, `${fingerprint}.mp4`);
    await writeFile(assPath, buildCanvasSubtitleAss({ segments, style, width: metadata.width, height: metadata.height }), "utf8");
    await runWithConcurrencyPool("localVideo", () => runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", source.filePath,
      "-map", "0:v:0", "-map", "0:a:0",
      "-vf", `ass=${assFilename}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      stagingPath,
    ], outputRoot));
    const encoded = await stat(stagingPath);
    if (!encoded.isFile() || !encoded.size) throw new Error("FFmpeg produced an empty subtitled video.");
    await rename(stagingPath, outputPath);
    stagingPath = "";
    const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: "video/mp4", overwrite: false });
    return subtitleResult(url, metadata, segments);
  } finally {
    await Promise.all([
      source.cleanup(),
      assPath ? rm(assPath, { force: true }) : Promise.resolve(),
      stagingPath ? rm(stagingPath, { force: true }) : Promise.resolve(),
    ]);
  }
}

export function buildCanvasSubtitleAss(input: { segments: CanvasSubtitleSegment[]; style: CanvasSubtitleStyle; width: number; height: number }) {
  const style = normalizeCanvasSubtitleStyle(input.style);
  const fontSize = Math.max(12, Math.round(input.height * style.fontSizePercent / 100));
  const outline = Math.round(input.height * style.outlineWidthPercent / 100 * 10) / 10;
  const marginV = Math.round(input.height * style.verticalMarginPercent / 100);
  const marginH = Math.round(input.width * 0.04);
  const alignment = assAlignment(style.verticalPosition, style.horizontalAlign);
  const mainStyle = `Style: Main,${escapeAssField(style.fontFamily)},${fontSize},${assColor(style.textColor)},&H000000FF,${assColor(style.outlineColor)},&H00000000,${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,${outline},0,${alignment},${marginH},${marginH},${marginV},1`;
  const boxStyle = `Style: Box,${escapeAssField(style.fontFamily)},${fontSize},&HFF000000,&HFF000000,${assColor(style.backgroundColor, 100 - style.backgroundOpacity)},&H00000000,${style.bold ? -1 : 0},0,0,0,100,100,0,0,3,${Math.max(3, Math.round(fontSize * 0.2))},0,${alignment},${marginH},${marginH},${marginV},1`;
  const events = input.segments.flatMap((segment) => {
    const text = wrapSubtitleText(segment.text, style.maxCharsPerLine);
    const prefix = `Dialogue: 0,${assTime(segment.startMs)},${assTime(segment.endMs)}`;
    return style.backgroundEnabled
      ? [`${prefix},Box,,0,0,0,,${text}`, `${prefix},Main,,0,0,0,,${text}`]
      : [`${prefix},Main,,0,0,0,,${text}`];
  });
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${input.width}`, `PlayResY: ${input.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]", "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    mainStyle, boxStyle, "", "[Events]", "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text", ...events, "",
  ].join("\n");
}

export function wrapSubtitleText(value: string, maxCharsPerLine: number) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, " ").trim();
  const characters = Array.from(escaped);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += maxCharsPerLine) lines.push(characters.slice(index, index + maxCharsPerLine).join(""));
  return lines.join("\\N");
}

export function buildCanvasSubtitleTimelineCacheId(input: {
  ownerUserId: string;
  videoSha256: string;
  engine: "faster-whisper";
  model: string;
  settingsHash: string;
  protocolVersion?: number;
}) {
  return sha256(JSON.stringify({
    ownerUserId: input.ownerUserId,
    videoSha256: input.videoSha256,
    engine: input.engine,
    model: input.model,
    settingsHash: input.settingsHash,
    protocolVersion: input.protocolVersion ?? CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION,
  }));
}

async function resolveTimeline(cacheId: string, input: { ownerUserId: string; videoSha256: string; engine: "faster-whisper"; model: string; settingsHash: string; videoPath: string; durationSeconds: number; mediaStartSeconds: number; audioStartSeconds: number }) {
  const cached = await getCanvasSubtitleTranscriptCacheFromDb(cacheId);
  if (cached) return cached.segments;
  const active = activeTimelines.get(cacheId);
  if (active) return active;
  const request = runWithConcurrencyPool("localVideo", () => transcribeCanvasLocalSubtitleTimeline(input)).then(async (segments) => {
    const now = new Date().toISOString();
    await saveCanvasSubtitleTranscriptCacheToDb({
      id: cacheId,
      ownerUserId: input.ownerUserId,
      videoSha256: input.videoSha256,
      engine: input.engine,
      model: input.model,
      settingsHash: input.settingsHash,
      protocolVersion: CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION,
      segments,
      createdAt: now,
      updatedAt: now,
    });
    return segments;
  }).finally(() => activeTimelines.delete(cacheId));
  activeTimelines.set(cacheId, request);
  return request;
}

function subtitleResult(url: string, metadata: { width: number; height: number; durationSeconds?: number }, segments: CanvasSubtitleSegment[]) {
  return {
    video: { url, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds, mimeType: "video/mp4" } satisfies CanvasMediaReference,
    text: segments.map((segment) => segment.text).join("\n"),
    segments,
  };
}

function assAlignment(vertical: CanvasSubtitleStyle["verticalPosition"], horizontal: CanvasSubtitleStyle["horizontalAlign"]) {
  const base = horizontal === "left" ? 1 : horizontal === "right" ? 3 : 2;
  return base + (vertical === "top" ? 6 : vertical === "middle" ? 3 : 0);
}

function assColor(hex: string, alpha = 0) {
  const value = hex.replace("#", "");
  const red = value.slice(0, 2);
  const green = value.slice(2, 4);
  const blue = value.slice(4, 6);
  return `&H${Math.round(Math.max(0, Math.min(100, alpha)) * 255 / 100).toString(16).padStart(2, "0").toUpperCase()}${blue}${green}${red}`;
}

function assTime(milliseconds: number) {
  const centiseconds = Math.floor(milliseconds / 10);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds % 360000 / 6000);
  const seconds = Math.floor(centiseconds % 6000 / 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function escapeAssField(value: string) {
  return value.replace(/,/g, " ").replace(/[\r\n]/g, " ").trim();
}

function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function existingOutput(publicPath: string) {
  const file = await stat(path.join(outputRoot, path.basename(publicPath))).catch(() => undefined);
  return file?.isFile() && file.size > 0 ? publicPath : findExistingRuntimeMedia(publicPath);
}

function requireSubtitleFfmpegCapabilities() {
  return new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", ["-hide_banner", "-filters"], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new CanvasMediaNeedsConfigError(`ffmpeg is unavailable: ${(stderr || error.message).toString().trim().slice(0, 240)}`));
        return;
      }
      if (!/^\s*\.\.\s+ass\s/m.test(stdout)) {
        reject(new CanvasMediaNeedsConfigError("ffmpeg was built without the libass subtitle filter."));
        return;
      }
      resolve();
    });
  });
}

function runFfmpeg(args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", args, { cwd, timeout: videoEncodeTimeoutMs, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(new CanvasMediaNeedsConfigError("ffmpeg is not installed or available on PATH."));
      reject(new Error(`ffmpeg subtitle rendering failed: ${(stderr || error.message).toString().trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300)}`));
    });
  });
}
