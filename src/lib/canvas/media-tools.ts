import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { runWithConcurrencyPool } from "../concurrency";
import { materializeRuntimeMedia } from "../runtime-media-materializer";
import { findExistingRuntimeMedia, persistRuntimeMedia } from "../runtime-media-storage";
import { parseCanvasVideoTimestamps, resolveCanvasImageDimensions } from "./node-utils";
import { normalizeCanvasMediaMaskConfig, validateCanvasMediaMaskConfig } from "./types";
import type { CanvasMediaMaskConfig, CanvasMaskRegion, CanvasMediaReference, CanvasNodeConfig, CanvasSlideshowTextStyle } from "./types";

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

export async function renderCanvasImageSlideshow(input: {
  images: CanvasMediaReference[];
  audio: CanvasMediaReference;
  title?: string;
  body?: string;
  titleStyle?: CanvasSlideshowTextStyle;
  bodyStyle?: CanvasSlideshowTextStyle;
  durationSeconds: number;
  ratio: "9:16" | "3:4" | "1:1" | "16:9";
  transition: "beat" | "smooth" | "none";
  motion: boolean;
  seed: string;
}) {
  if (!input.images.length) throw new Error("Image slideshow requires at least one image.");
  const dimensions = ({ "9:16": [1080, 1920], "3:4": [1080, 1440], "1:1": [1080, 1080], "16:9": [1920, 1080] } as const)[input.ratio];
  const images = await Promise.all(input.images.map((item) => materializeCanvasMediaReference(item, "image", maxImageBytes)));
  const audio = await materializeCanvasMediaReference(input.audio, "video", maxVideoBytes);
  const audioDuration = await probeCanvasAudioDuration(audio.filePath);
  const duration = Math.floor(Math.min(Math.max(1, Math.min(600, Number(input.durationSeconds) || 10)), audioDuration) * 25) / 25;
  if (duration < 1) throw new Error("Audio is too short to create a slideshow.");
  const segment = duration / input.images.length;
  const beatCuts = input.transition === "beat" ? await analyzeBeatCuts(audio.filePath, duration, input.images.length) : undefined;
  const transitionCuts = beatCuts || Array.from({ length: Math.max(0, input.images.length - 1) }, (_, index) => segment * (index + 1));
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, imageUrls: input.images.map((item) => item.url), audioUrl: input.audio.url, duration, dimensions })).digest("hex").slice(0, 32);
  const publicPath = `/generated/canvas-tools/${fingerprint}.mp4`;
  const existing = await existingOutput(publicPath);
  if (existing) {
    await Promise.all(images.map((item) => item.cleanup())); await audio.cleanup();
    return { url: existing, mimeType: "video/mp4" as const, width: dimensions[0], height: dimensions[1], durationSeconds: duration };
  }
  const outputPath = path.join(outputRoot, `${fingerprint}.mp4`);
  await mkdir(outputRoot, { recursive: true });
  const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
  const transitionDuration = input.transition === "none" || input.images.length === 1 ? 0 : Math.min(0.4, segment * 0.4);
  for (const item of images) args.push("-loop", "1", "-framerate", "25", "-t", formatSeconds(segment + transitionDuration), "-i", item.filePath);
  args.push("-i", audio.filePath);
  const overlayPath = input.title || input.body ? path.join(outputRoot, `.${fingerprint}-text.png`) : undefined;
  if (overlayPath) {
    await renderSlideshowTextLayer(overlayPath, dimensions[0], dimensions[1], input.title || "", input.body || "", input.titleStyle, input.bodyStyle);
    args.push("-loop", "1", "-i", overlayPath);
  }
  const filters = images.map((_item, index) => {
    const frames = Math.max(1, Math.round((segment + transitionDuration) * 25));
    const motion = input.motion ? `,zoompan=z='min(zoom+0.00035,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${dimensions[0]}x${dimensions[1]}:fps=25` : "";
    return `[${index}:v]split=2[bg${index}][fg${index}];[bg${index}]scale=${dimensions[0]}:${dimensions[1]}:force_original_aspect_ratio=increase,crop=${dimensions[0]}:${dimensions[1]},gblur=sigma=30[blur${index}];[fg${index}]scale=${dimensions[0]}:${dimensions[1]}:force_original_aspect_ratio=decrease[fit${index}];[blur${index}][fit${index}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=25${motion},trim=duration=${formatSeconds(segment + transitionDuration)},setpts=PTS-STARTPTS[v${index}]`;
  });
  if (images.length === 1) filters.push("[v0]null[base]");
  else if (input.transition === "none") filters.push(`${images.map((_item, index) => `[v${index}]`).join("")}concat=n=${images.length}:v=1:a=0[base]`);
  else {
    let previous = "v0";
    for (let index = 1; index < images.length; index += 1) {
      const output = index === images.length - 1 ? "base" : `x${index}`;
      filters.push(`[${previous}][v${index}]xfade=transition=${deterministicTransition(input.seed, index)}:duration=${formatSeconds(transitionDuration)}:offset=${formatSeconds(transitionCuts[index - 1])}[${output}]`);
      previous = output;
    }
  }
  filters.push(overlayPath ? `[base][${images.length + 1}:v]overlay=0:0,trim=duration=${formatSeconds(duration)},format=yuv420p[vout]` : `[base]trim=duration=${formatSeconds(duration)},format=yuv420p[vout]`);
  const fadeStart = Math.max(0, duration - 0.18);
  args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-map", `${images.length}:a:0`, "-t", formatSeconds(duration), "-r", "25", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "main", "-level", "4.0", "-pix_fmt", "yuv420p", "-tag:v", "avc1", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-af", `afade=t=out:st=${formatSeconds(fadeStart)}:d=0.18`, "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", outputPath);
  try {
    await runWithConcurrencyPool("localVideo", () => runMediaCommand("ffmpeg", args, videoEncodeTimeoutMs));
    const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: "video/mp4", overwrite: false });
    return { url, mimeType: "video/mp4" as const, width: dimensions[0], height: dimensions[1], durationSeconds: duration, beatFallback: input.transition === "beat" && !beatCuts };
  } finally {
    if (overlayPath) await rm(overlayPath, { force: true });
    await Promise.all(images.map((item) => item.cleanup())); await audio.cleanup();
  }
}

async function materializeCanvasMediaReference(item: CanvasMediaReference, kind: "image" | "video", maxBytes: number) {
  if (item.localPath && item.sha256) {
    const file = await stat(item.localPath);
    if (!file.isFile() || file.size > maxBytes) throw new Error("Directory snapshot media is unavailable or exceeds its size limit.");
    return { filePath: item.localPath, resolvedUrl: item.url, temporary: false, cleanup: async () => undefined };
  }
  return materializeRuntimeMedia(item.url, { maxBytes, kind });
}

async function renderSlideshowTextLayer(filePath: string, width: number, height: number, title: string, body: string, titleStyle?: CanvasSlideshowTextStyle, bodyStyle?: CanvasSlideshowTextStyle) {
  const { default: sharp } = await import("sharp");
  const fallback: CanvasSlideshowTextStyle = { x: 0.5, y: 0.1, width: 0.9, fontFamily: "Microsoft YaHei", fontWeight: 700, fontSize: 64, autoScale: true, lineHeight: 1.2, align: "center", color: "#ffffff", outlineColor: "#000000", outlineWidth: 4, shadow: true, backgroundColor: "#000000", backgroundOpacity: 0, padding: 16 };
  const titleResolved = titleStyle || fallback;
  const bodyResolved = bodyStyle || { ...fallback, y: 0.72, fontSize: 42 };
  const titleLines = wrapSlideshowText(title, Math.max(8, Math.floor(width * titleResolved.width / titleResolved.fontSize)));
  const bodyLines = wrapSlideshowText(body, Math.max(12, Math.floor(width * bodyResolved.width / bodyResolved.fontSize)));
  if (titleLines.length > 3 || bodyLines.length > 8) throw new Error("Slideshow text does not fit at the minimum readable size.");
  const block = (value: string, lines: string[], style: CanvasSlideshowTextStyle, name: string) => {
    if (!value) return "";
    const boxWidth = width * style.width; const x = width * style.x; const y = height * style.y;
    const anchor = style.align === "left" ? "start" : style.align === "right" ? "end" : "middle";
    const textX = style.align === "left" ? x - boxWidth / 2 + style.padding : style.align === "right" ? x + boxWidth / 2 - style.padding : x;
    const lineHeight = style.fontSize * style.lineHeight;
    const boxHeight = lines.length * lineHeight + style.padding * 2;
    const background = style.backgroundOpacity > 0 ? `<rect x="${x - boxWidth / 2}" y="${y - style.padding}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="${escapeXml(style.backgroundColor)}" fill-opacity="${style.backgroundOpacity}"/>` : "";
    const shadow = style.shadow ? "filter='url(#shadow)'" : "";
    const spans = lines.map((line, index) => `<tspan x="${textX}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("");
    return `${background}<text class="${name}" x="${textX}" y="${y}" text-anchor="${anchor}" fill="${escapeXml(style.color)}" stroke="${escapeXml(style.outlineColor)}" stroke-width="${style.outlineWidth}" font-family="${escapeXml(style.fontFamily)},sans-serif" font-size="${style.fontSize}" font-weight="${style.fontWeight}" ${shadow}>${spans}</text>`;
  };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="shadow"><feDropShadow dx="3" dy="4" stdDeviation="4" flood-opacity="0.6"/></filter></defs><style>text{paint-order:stroke fill;stroke-linejoin:round}</style>${block(title, titleLines, titleResolved, "title")}${block(body, bodyLines, bodyResolved, "body")}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

function wrapSlideshowText(value: string, maxChars: number) {
  return value.trim().split(/\r?\n/).flatMap((paragraph) => paragraph ? Array.from({ length: Math.ceil(Array.from(paragraph).length / maxChars) }, (_, index) => Array.from(paragraph).slice(index * maxChars, (index + 1) * maxChars).join("")) : [""]);
}
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function deterministicTransition(seed: string, index: number) { const values = ["fade", "smoothleft", "smoothright", "smoothup", "smoothdown", "dissolve"] as const; return values[createHash("sha256").update(`${seed}:${index}`).digest()[0] % values.length]; }

async function analyzeBeatCuts(audioPath: string, duration: number, imageCount: number) {
  if (imageCount <= 1) return [];
  const pcmPath = path.join(outputRoot, `.beat-${randomUUID()}.pcm`);
  try {
    await runMediaCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", audioPath, "-t", formatSeconds(duration), "-ac", "1", "-ar", "16000", "-f", "s16le", pcmPath]);
    const pcm = await readFile(pcmPath);
    const samplesPerFrame = 320;
    const frameCount = Math.floor(pcm.length / 2 / samplesPerFrame);
    if (frameCount < 20) return undefined;
    const rms = Array.from({ length: frameCount }, (_, frame) => {
      let sum = 0;
      for (let offset = 0; offset < samplesPerFrame; offset += 1) { const value = pcm.readInt16LE((frame * samplesPerFrame + offset) * 2) / 32768; sum += value * value; }
      return Math.sqrt(sum / samplesPerFrame);
    });
    const novelty = rms.map((value, index) => Math.max(0, value - (index ? rms[index - 1] : value)));
    const sorted = novelty.filter((value) => value > 0).sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.85)] || 0;
    if (!threshold) return undefined;
    const peaks = novelty.flatMap((value, index) => value >= threshold && value >= (novelty[index - 1] || 0) && value >= (novelty[index + 1] || 0) ? [index * 0.02] : []);
    const cuts: number[] = [];
    for (let index = 1; index < imageCount; index += 1) {
      const ideal = duration * index / imageCount;
      const nearby = peaks.filter((peak) => Math.abs(peak - ideal) <= Math.min(0.75, duration / imageCount * 0.45) && (!cuts.length || peak - cuts[cuts.length - 1] >= 0.2));
      if (!nearby.length) return undefined;
      cuts.push(nearby.sort((left, right) => Math.abs(left - ideal) - Math.abs(right - ideal))[0]);
    }
    return cuts;
  } finally { await rm(pcmPath, { force: true }); }
}

export async function probeCanvasAudioDuration(filePath: string) {
  const output = await runMediaCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,duration", "-of", "json", filePath]);
  const data = JSON.parse(output) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; duration?: string }> };
  if (!data.streams?.some((stream) => stream.codec_type === "audio")) throw new Error("Media does not contain an audio stream.");
  const duration = Number(data.format?.duration || data.streams.find((stream) => stream.codec_type === "audio")?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Audio duration is invalid.");
  return duration;
}

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
  codedWidth: number;
  codedHeight: number;
  rotation: number;
  mediaStartSeconds: number;
  videoStartSeconds: number;
  audioStartSeconds: number;
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

export async function maskCanvasMedia(input: { kind: "image" | "video"; items: CanvasMediaReference[]; config: CanvasMediaMaskConfig }) {
  const configErrors = validateCanvasMediaMaskConfig(input.config);
  if (configErrors.length) throw new CanvasMediaNeedsConfigError(configErrors.join(" "));
  const normalized = normalizeCanvasMediaMaskConfig(input.config);
  const limit = input.kind === "image" ? maxImages : maxVideos;
  if (!input.items.length || input.items.length > limit) throw new Error(`Media mask accepts 1-${limit} ${input.kind === "image" ? "images" : "videos"}.`);
  const outputs: CanvasMediaReference[] = [];
  for (const item of input.items) {
    const regions = normalized.itemOverrides?.[item.url] || normalized.itemOverrides?.[item.sha256 || ""] || normalized.regions;
    const fingerprint = mediaFingerprint("media-mask", item.url, { kind: input.kind, config: JSON.stringify({ ...normalized, regions }) } as unknown as Record<string, string | number>);
    const extension = input.kind === "image" ? "png" : "mp4";
    const mimeType = input.kind === "image" ? "image/png" : "video/mp4";
    const publicPath = `/generated/canvas-tools/${fingerprint}.${extension}`;
    const existing = await existingOutput(publicPath);
    if (existing) {
      outputs.push({ ...item, url: existing, mimeType });
      continue;
    }
    const source = await materializeCanvasMediaReference(item, input.kind, input.kind === "image" ? maxImageBytes : maxVideoBytes);
    let stagingPath = "";
    const overlays: Array<{ filePath: string; cleanup: () => Promise<void> }> = [];
    try {
      const metadata = input.kind === "video" ? await probeCanvasMediaFile(source.filePath) : undefined;
      const outputPath = path.join(outputRoot, `${fingerprint}.${extension}`);
      stagingPath = path.join(outputRoot, `.${fingerprint}-${randomUUID()}.tmp.${extension}`);
      await mkdir(outputRoot, { recursive: true });
      const built = await buildMaskFilter(regions, input.kind, metadata?.width || item.width || 1, metadata?.height || item.height || 1, metadata?.durationSeconds || 0, overlays);
      const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", source.filePath, ...built.inputs.flatMap((filePath) => ["-i", filePath]), "-filter_complex", built.filter, "-map", "[masked]", ...(input.kind === "video" && metadata?.hasAudio ? ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "160k"] : []), "-c:v", input.kind === "video" ? "libx264" : "png", ...(input.kind === "video" ? ["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", formatSeconds(metadata?.durationSeconds || 0)] : ["-frames:v", "1"]), stagingPath];
      const run = () => runMediaCommand("ffmpeg", args, input.kind === "video" ? videoEncodeTimeoutMs : mediaTimeoutMs);
      if (input.kind === "video") await runWithConcurrencyPool("localVideo", run); else await run();
      const encoded = await stat(stagingPath);
      if (!encoded.isFile() || !encoded.size) throw new Error("FFmpeg produced an empty masked media file.");
      await rename(stagingPath, outputPath); stagingPath = "";
      const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: mimeType, overwrite: false });
      outputs.push({ ...item, url, mimeType, ...(metadata ? { width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds } : { width: item.width, height: item.height }) });
    } finally {
      if (stagingPath) await rm(stagingPath, { force: true });
      await source.cleanup();
      await Promise.all(overlays.map((overlay) => overlay.cleanup()));
    }
  }
  return outputs;
}

async function buildMaskFilter(regions: CanvasMaskRegion[], kind: "image" | "video", width: number, height: number, duration: number, overlays: Array<{ filePath: string; cleanup: () => Promise<void> }>) {
  let current = "0:v";
  const filters: string[] = [];
  const inputs: string[] = [];
  for (const [index, region] of regions.entries()) {
    const geometry = maskGeometryExpressions(region, width, height);
    const x = geometry.x; const y = geometry.y; const w = geometry.width; const h = geometry.height;
    const staticWidth = Math.max(1, Math.round(region.width * width)); const staticHeight = Math.max(1, Math.round(region.height * height));
    const enable = kind === "video" ? `:enable='between(t,${formatSeconds((region.startMs || 0) / 1000)},${formatSeconds((region.endMs === undefined ? duration * 1000 : region.endMs) / 1000)})'` : "";
    const out = `mask${index}`;
    if (region.mode === "solid" && region.shape === "rounded-rectangle" && !(region.keyframes?.length)) {
      const rounded = await createRoundedMaskOverlay(region, staticWidth, staticHeight);
      overlays.push(rounded);
      const overlayIndex = inputs.length + 1;
      inputs.push(rounded.filePath);
      filters.push(`[${current}][${overlayIndex}:v]overlay=${Math.round(region.x * width)}:${Math.round(region.y * height)}:format=auto${enable}[${out}]`);
    } else if (region.mode === "solid") {
      filters.push(`[${current}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${region.color}@${Math.max(0, Math.min(1, region.opacity))}:t=fill${enable}[${out}]`);
    } else if (region.mode === "image") {
      if (!region.imageUrl) throw new CanvasMediaNeedsConfigError(`Mask region ${region.id} image overlay is missing.`);
      const overlay = await materializeRuntimeMedia(region.imageUrl, { maxBytes: maxImageBytes, kind: "image" });
      overlays.push(overlay);
      const overlayIndex = inputs.length + 1;
      inputs.push(overlay.filePath);
      filters.push(`[${overlayIndex}:v]format=rgba,scale=${w}:${h},colorchannelmixer=aa=${Math.max(0, Math.min(1, region.opacity))}[${out}src];[${current}][${out}src]overlay=${x}:${y}:format=auto${enable}[${out}]`);
    } else {
      const splitA = `m${index}a`; const splitB = `m${index}b`; const effect = region.mode === "blur" ? `boxblur=10` : `scale=${Math.max(1, Math.floor(staticWidth / 12))}:${Math.max(1, Math.floor(staticHeight / 12))}:flags=area,scale=${staticWidth}:${staticHeight}:flags=neighbor`;
      filters.push(`[${current}]split=2[${splitA}][${splitB}];[${splitB}]crop=${w}:${h}:${x}:${y},${effect}[${out}src];[${splitA}][${out}src]overlay=${x}:${y}${enable}[${out}]`);
    }
    current = out;
  }
  if (!regions.length) filters.push(`[0:v]null[masked]`); else filters.push(`[${current}]null[masked]`);
  return { filter: filters.join(";"), inputs };
}

async function createRoundedMaskOverlay(region: CanvasMaskRegion, width: number, height: number) {
  const { default: sharp } = await import("sharp");
  const filePath = path.join(outputRoot, `.mask-${randomUUID()}.png`);
  const radius = Math.max(0, Math.min(Math.min(width, height) / 2, (region.radius ?? 0.18) * Math.min(width, height)));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="${region.color}" fill-opacity="${Math.max(0, Math.min(1, region.opacity))}"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
  return { filePath, cleanup: () => rm(filePath, { force: true }) };
}

function maskGeometryExpressions(region: CanvasMaskRegion, width: number, height: number) {
  const keyframes = region.keyframes || [];
  const value = (property: "x" | "y" | "width" | "height", fallback: number) => {
    if (keyframes.length < 2) return String(Math.max(1, Math.round(fallback)));
    const points = keyframes.map((frame) => ({ time: frame.timeMs / 1000, value: Number(frame[property]) * (property === "x" || property === "width" ? width : height) }));
    let expression = String(Math.round(points[points.length - 1].value));
    for (let index = points.length - 2; index >= 0; index -= 1) {
      const left = points[index]; const right = points[index + 1];
      const slope = (right.value - left.value) / Math.max(0.001, right.time - left.time);
      const interpolated = `${left.value}+(${slope})*(t-${left.time})`;
      expression = `if(lt(t\\,${right.time})\\,${interpolated}\\,${expression})`;
    }
    return expression;
  };
  return {
    x: value("x", region.x * width),
    y: value("y", region.y * height),
    width: value("width", region.width * width),
    height: value("height", region.height * height),
  };
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
    "-show_entries", "format=duration,format_name,start_time:stream=index,codec_type,width,height,duration,start_time:stream_side_data=rotation",
    "-of", "json",
    filePath,
  ]);
  const data = JSON.parse(output) as {
    format?: { duration?: string; format_name?: string; start_time?: string };
    streams?: Array<{ index?: number; codec_type?: string; width?: number; height?: number; duration?: string; start_time?: string; side_data_list?: Array<{ rotation?: number }> }>;
  };
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const audio = data.streams?.find((stream) => stream.codec_type === "audio");
  const codedWidth = Number(video?.width);
  const codedHeight = Number(video?.height);
  if (!Number.isInteger(codedWidth) || !Number.isInteger(codedHeight) || codedWidth <= 0 || codedHeight <= 0) throw new Error("Media does not contain a valid video stream.");
  const rotation = normalizeVideoRotation(video?.side_data_list?.find((item) => Number.isFinite(Number(item.rotation)))?.rotation);
  const swapsDimensions = Math.abs(rotation) === 90;
  const width = swapsDimensions ? codedHeight : codedWidth;
  const height = swapsDimensions ? codedWidth : codedHeight;
  const duration = Number(data.format?.duration || video?.duration || audio?.duration);
  const formatStartSeconds = optionalFiniteSeconds(data.format?.start_time);
  const videoStartSeconds = optionalFiniteSeconds(video?.start_time) ?? formatStartSeconds ?? 0;
  const mediaStartSeconds = formatStartSeconds ?? videoStartSeconds;
  const audioStartSeconds = optionalFiniteSeconds(audio?.start_time) ?? mediaStartSeconds;
  const file = await stat(filePath);
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    width,
    height,
    codedWidth,
    codedHeight,
    rotation,
    mediaStartSeconds,
    videoStartSeconds,
    audioStartSeconds,
    hasAudio: Boolean(audio),
    formatName: data.format?.format_name,
    sizeBytes: file.size,
  };
}

function normalizeVideoRotation(value: unknown) {
  if (!Number.isFinite(Number(value))) return 0;
  const normalized = ((Math.round(Number(value)) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 270) return normalized === 270 ? -90 : 90;
  return normalized === 180 ? 180 : 0;
}

function optionalFiniteSeconds(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
