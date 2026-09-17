import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { materializeRuntimeMedia, resolveRuntimeMediaReference } from "../runtime-media-materializer";
import { persistRuntimeMedia } from "../runtime-media-storage";
import { runWithConcurrencyPool } from "../concurrency";
import { getCanvasDirectorySnapshot } from "./directory-snapshots";
import { CanvasMediaNeedsConfigError, probeCanvasMediaFile, runMediaCommand } from "./media-tools";
import { composeConfigKey, composeDuration, composeLayerGeometry, findComposeSource, isLayerComposeConfig, LAYER_COMPOSE_LIMITS, validateLayerComposeConfig } from "./layer-compose-contract";
import type { ComposeLayer, ComposeSource, LayerComposeConfig } from "./layer-compose-contract";
import type { CanvasMediaReference } from "./types";

type PreparedSource = ComposeSource & { filePath: string; digest: string; width: number; height: number; cleanup: () => Promise<void> };
const outputRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-tools");
async function digestFile(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
async function prepareSource(source: ComposeSource, owner: string, verifyContent = true): Promise<PreparedSource> {
  const maxBytes = source.kind === "image" ? LAYER_COMPOSE_LIMITS.imageBytes : LAYER_COMPOSE_LIMITS.videoBytes;
  let filePath: string;
  let cleanup = async () => {};
  if (source.kind === "image" && source.media.url.startsWith("/api/canvas/local-directory/media?")) {
    const params = new URL(source.media.url, "http://localhost").searchParams;
    const snapshot = await getCanvasDirectorySnapshot(params.get("snapshot") || "", owner);
    const item = snapshot.groups.flatMap((group) => group.images).find((entry) => entry.id === params.get("media"));
    if (!item) throw new Error("本地目录快照中找不到图片。");
    filePath = item.absolutePath;
  } else {
    const materialized = await materializeRuntimeMedia(source.media.url, { kind: source.kind, maxBytes });
    filePath = materialized.filePath; cleanup = materialized.cleanup;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile() || !info.size || info.size > maxBytes) throw new Error(`素材为空或超过 ${maxBytes / 1024 / 1024} MB。`);
    const digest = verifyContent ? await digestFile(filePath) : "";
    if (verifyContent && source.media.sha256 && source.media.sha256 !== digest) throw new CanvasMediaNeedsConfigError("素材内容已改变，请重新选择素材。");
    if (source.kind === "video") {
      const metadata = await probeCanvasMediaFile(filePath);
      if (!metadata.durationSeconds || metadata.durationSeconds > 600 || /\bhls\b/i.test(metadata.formatName || "")) throw new Error("视频必须是最长 600 秒的完整视频文件。");
      return { ...source, filePath, cleanup, digest, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds, hasAudio: metadata.hasAudio };
    }
    const metadata = await sharp(filePath, { limitInputPixels: 40_000_000, failOn: "warning" }).metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) throw new Error("图片必须是静态 PNG、JPEG 或 WebP。");
    if (metadata.format === "png") {
      const buffer = await readFile(filePath);
      for (let offset = 8; offset + 12 <= buffer.length;) {
        const size = buffer.readUInt32BE(offset);
        if (offset + size + 12 > buffer.length) throw new Error("PNG 数据不完整。");
        if (buffer.toString("ascii", offset + 4, offset + 8) === "acTL") throw new Error("不支持动画 PNG。");
        offset += size + 12;
      }
    }
    const swapped = (metadata.orientation || 1) >= 5;
    return { ...source, filePath, cleanup, digest, width: swapped ? metadata.height : metadata.width, height: swapped ? metadata.width : metadata.height, hasAudio: false };
  } catch (error) { await cleanup(); throw error; }
}

type SourceMetadata = Pick<PreparedSource, "width" | "height" | "durationSeconds" | "hasAudio">;
const metadataCache = new Map<string, { value: SourceMetadata; expires: number }>();
const metadataRequests = new Map<string, Promise<SourceMetadata>>();

export async function inspectComposeSource(source: ComposeSource, owner: string): Promise<SourceMetadata> {
  // Resolve private snapshots on every access, before consulting the owner-scoped cache.
  let localPath: string | undefined;
  let url = source.media.url;
  if (source.kind === "image" && url.startsWith("/api/canvas/local-directory/media?")) {
    const params = new URL(url, "http://localhost").searchParams;
    const snapshot = await getCanvasDirectorySnapshot(params.get("snapshot") || "", owner);
    const item = snapshot.groups.flatMap((group) => group.images).find((entry) => entry.id === params.get("media"));
    if (!item) throw new Error("本地目录快照中找不到图片。");
    localPath = item.absolutePath;
  } else {
    const resolved = await resolveRuntimeMediaReference(url);
    localPath = resolved.localPath; url = resolved.url;
  }
  const info = localPath ? await stat(localPath) : undefined;
  const key = JSON.stringify([owner, source.kind, localPath || url, info && [info.size, info.mtimeMs, info.ctimeMs]]);
  const cached = metadataCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const pending = metadataRequests.get(key);
  if (pending) return pending;
  const request = runWithConcurrencyPool("mediaMetadata", async () => {
    // Preview only: no full-file SHA. Actual composition always verifies content.
    const prepared = await prepareSource(source, owner, false);
    try {
      const value = { width: prepared.width, height: prepared.height, durationSeconds: prepared.durationSeconds, hasAudio: prepared.hasAudio };
      metadataCache.delete(key);
      metadataCache.set(key, { value, expires: Date.now() + (localPath ? 300_000 : 60_000) });
      while (metadataCache.size > 128) metadataCache.delete(metadataCache.keys().next().value!);
      return value;
    } finally { await prepared.cleanup(); }
  });
  metadataRequests.set(key, request);
  try { return await request; }
  finally { if (metadataRequests.get(key) === request) metadataRequests.delete(key); }
}

async function layerImage(layer: ComposeLayer, source: PreparedSource | undefined, config: LayerComposeConfig) {
  const geometry = layer.kind === "solid"
    ? { x: Math.round(layer.x), y: Math.round(layer.y), width: Math.round(layer.width), height: Math.round(layer.height), crop: { left: 0, top: 0, width: 1, height: 1 } }
    : composeLayerGeometry(layer, source!.width, source!.height);
  const left = Math.max(0, geometry.x), top = Math.max(0, geometry.y);
  const width = Math.min(config.width, geometry.x + geometry.width) - left;
  const height = Math.min(config.height, geometry.y + geometry.height) - top;
  if (width <= 0 || height <= 0 || !layer.opacity) return undefined;
  if (geometry.width * geometry.height > 40_000_000) throw new CanvasMediaNeedsConfigError("图层缩放后超过 4000 万像素，请缩小图层。");
  let buffer: Buffer;
  if (layer.kind === "solid") {
    buffer = await sharp({ create: { width, height, channels: 4, background: layer.color } }).png().toBuffer();
  } else {
    const oriented = await sharp(source!.filePath, { limitInputPixels: 40_000_000 }).autoOrient().toColourspace("srgb").png().toBuffer();
    buffer = await sharp(oriented).extract(geometry.crop).resize(geometry.width, geometry.height, { fit: "fill" }).ensureAlpha().png().toBuffer();
    buffer = await sharp(buffer).extract({ left: left - geometry.x, top: top - geometry.y, width, height }).png().toBuffer();
  }
  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < raw.data.length; index += 4) raw.data[index] = Math.round(raw.data[index] * layer.opacity);
  return { input: await sharp(raw.data, { raw: raw.info }).png().toBuffer(), left, top };
}

export async function renderLayerComposition(rawConfig: unknown, sources: ComposeSource[], owner: string): Promise<{ kind: "images" | "videos"; item: CanvasMediaReference }> {
  const errors = validateLayerComposeConfig(rawConfig);
  if (errors.length || !isLayerComposeConfig(rawConfig)) throw new CanvasMediaNeedsConfigError(errors.join(" "));
  const config = structuredClone(rawConfig);
  const visible = config.layers.filter((layer) => layer.visible);
  const isVideo = visible.some((layer) => layer.kind === "video");
  return runWithConcurrencyPool(isVideo ? "localVideo" : "localImage", async () => {
    const prepared: PreparedSource[] = [];
    const temporary = await mkdtemp(path.join(tmpdir(), "fluxpost-compose-"));
    let staging = "";
    try {
      for (const layer of visible.filter((entry) => entry.kind !== "solid")) {
        const source = findComposeSource(layer, sources);
        if (!source) throw new CanvasMediaNeedsConfigError(`「${layer.name}」素材已失效，请重新选择。`);
        if (!prepared.some((entry) => entry.kind === source.kind && entry.key === source.key)) prepared.push(await prepareSource(source, owner));
      }
      const duration = isVideo ? composeDuration(config, prepared) : 0;
      if (isVideo && (!duration || duration > 600)) throw new CanvasMediaNeedsConfigError("输出时长必须大于 0 且不超过 600 秒。");
      const audioLayer = visible.find((layer) => layer.id === config.audioLayerId);
      const hasAudio = Boolean(audioLayer && findComposeSource(audioLayer, prepared)?.hasAudio);
      const configKey = composeConfigKey(config);
      const key = createHash("sha256").update(JSON.stringify({ renderer: "layer-compose-v1", configKey, sources: prepared.map((source) => [source.kind, source.key, source.digest]) })).digest("hex");
      const extension = isVideo ? "mp4" : "png";
      const publicPath = `/generated/canvas-tools/${key}.${extension}`;
      const output = path.join(outputRoot, `${key}.${extension}`);
      await mkdir(outputRoot, { recursive: true });
      let cached = false;
      try { cached = (await stat(output)).size > 0; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!cached) {
        staging = path.join(outputRoot, `.${key}-${randomUUID()}.tmp.${extension}`);
        if (!isVideo) {
          const overlays = [];
          for (const layer of visible) {
            const image = await layerImage(layer, findComposeSource(layer, prepared) as PreparedSource | undefined, config);
            if (image) overlays.push(image);
          }
          await sharp({ create: { width: config.width, height: config.height, channels: 4,
            background: config.background === "transparent" ? { r: 0, g: 0, b: 0, alpha: 0 } : config.background } }).composite(overlays).png().toFile(staging);
        } else {
          const args = ["-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1", "-f", "lavfi", "-i", `color=c=${config.background}:s=${config.width}x${config.height}:r=30:d=${duration}`];
          const filters: string[] = ["[0:v]format=rgba[base0]"];
          let inputIndex = 1, baseIndex = 0, audioIndex: number | undefined;
          for (const layer of visible) {
            const source = findComposeSource(layer, prepared) as PreparedSource | undefined;
            let x: number, y: number;
            if (layer.kind === "video") {
              const geometry = composeLayerGeometry(layer, source!.width, source!.height);
              if (geometry.width * geometry.height > 40_000_000) throw new CanvasMediaNeedsConfigError("视频图层缩放后超过 4000 万像素。");
              if (layer.endBehavior === "loop") args.push("-stream_loop", "-1");
              args.push("-i", source!.filePath);
              const crop = geometry.crop;
              const hold = layer.endBehavior === "hold" ? `,tpad=stop_mode=clone:stop_duration=${duration}` : "";
              filters.push(`[${inputIndex}:v]setpts=PTS-STARTPTS,format=rgba,crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}:exact=1,scale=${geometry.width}:${geometry.height},setsar=1,fps=30,colorchannelmixer=aa=${layer.opacity}${hold},trim=duration=${duration}[layer${inputIndex}]`);
              x = geometry.x; y = geometry.y;
              if (layer.id === config.audioLayerId && source!.hasAudio) audioIndex = inputIndex;
            } else {
              const image = await layerImage(layer, source, config);
              if (!image) continue;
              const file = path.join(temporary, `${inputIndex}.png`);
              await writeFile(file, image.input);
              args.push("-loop", "1", "-framerate", "30", "-i", file);
              filters.push(`[${inputIndex}:v]format=rgba,setsar=1[layer${inputIndex}]`);
              x = image.left; y = image.top;
            }
            filters.push(`[base${baseIndex}][layer${inputIndex}]overlay=x=${x}:y=${y}:format=rgb:eof_action=pass:repeatlast=0[base${baseIndex + 1}]`);
            inputIndex++; baseIndex++;
          }
          filters.push(`[base${baseIndex}]format=yuv420p[out]`);
          if (audioIndex !== undefined) filters.push(`[${audioIndex}:a:0]asetpts=PTS-STARTPTS,apad,atrim=duration=${duration}[audio]`);
          args.push("-filter_complex", filters.join(";"), "-map", "[out]");
          if (audioIndex !== undefined) args.push("-map", "[audio]", "-c:a", "aac", "-b:a", "160k");
          args.push("-t", String(duration), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", staging);
          await runMediaCommand("ffmpeg", args, 30 * 60_000);
        }
        await validateOutput(staging, config, isVideo, duration, hasAudio);
        await rename(staging, output); staging = "";
      } else await validateOutput(output, config, isVideo, duration, hasAudio);
      const url = await persistRuntimeMedia({ filePath: output, publicPath, contentType: isVideo ? "video/mp4" : "image/png", overwrite: false });
      return { kind: isVideo ? "videos" : "images", item: { url, name: `合成.${extension}`, mimeType: isVideo ? "video/mp4" : "image/png", width: config.width, height: config.height,
        ...(isVideo ? { durationSeconds: duration } : {}), sha256: await digestFile(output), layerComposition: { configKey, hasAudio } } };
    } finally {
      if (staging) await rm(staging, { force: true });
      await rm(temporary, { recursive: true, force: true });
      await Promise.all(prepared.map((source) => source.cleanup()));
    }
  });
}
async function validateOutput(filePath: string, config: LayerComposeConfig, video: boolean, duration: number, hasAudio: boolean) {
  if (video) {
    const info = await probeCanvasMediaFile(filePath);
    if (info.width !== config.width || info.height !== config.height || Math.abs((info.durationSeconds || 0) - duration) > 0.1 || info.hasAudio !== hasAudio) throw new Error("合成视频的尺寸、时长或声音校验失败。");
  } else {
    const info = await sharp(filePath).metadata();
    if (info.width !== config.width || info.height !== config.height || info.format !== "png") throw new Error("合成图片尺寸校验失败。");
  }
}
