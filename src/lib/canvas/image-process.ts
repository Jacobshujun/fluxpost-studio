import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runWithConcurrencyPool } from "../concurrency";
import { materializeRuntimeMedia } from "../runtime-media-materializer";
import { persistRuntimeMedia } from "../runtime-media-storage";
import { getCanvasDirectorySnapshot } from "./directory-snapshots";
import { IMAGE_PROCESS_LIMITS, imageProcessConfigKey, resolveImageProcessConfig } from "./image-process-contract";
import type { ImageProcessConfig, ImageProcessingReport } from "./image-process-contract";
import type { CanvasMediaReference, CanvasNodeConfig } from "./types";

const rendererVersion = `image-process-v1-sharp-${sharp.versions.sharp}-vips-${sharp.versions.vips}`;
const cacheRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "cache", "canvas-image-process");
const outputRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-tools");
const digest = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

// libvips exposes animated WebP pages, but its PNG loader only exposes APNG's first frame.
function isAnimatedPng(buffer: Buffer) {
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    if (offset + length + 12 > buffer.length) throw new Error("PNG 数据块不完整。");
    if (buffer.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset += length + 12;
  }
  return false;
}

export async function encodeCanvasImage(buffer: Buffer, config: ImageProcessConfig) {
  if (!buffer.length || buffer.length > IMAGE_PROCESS_LIMITS.bytes) throw new Error("图片为空或超过 30 MB。");
  const options = { limitInputPixels: IMAGE_PROCESS_LIMITS.pixels, failOn: "warning" as const };
  const metadata = await sharp(buffer, options).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || "")) throw new Error("仅支持静态 JPEG、PNG、WebP 图片。");
  if ((metadata.pages ?? 1) > 1 || (metadata.format === "png" && isAnimatedPng(buffer))) throw new Error("不支持动画或多页图片。");
  const swapped = (metadata.orientation ?? 1) >= 5;
  const sourceWidth = swapped ? metadata.height! : metadata.width!;
  const sourceHeight = swapped ? metadata.width! : metadata.height!;
  let width = sourceWidth, height = sourceHeight;
  if (config.resizeMode === "percent") {
    width = Math.max(1, Math.round(sourceWidth * config.scalePercent / 100));
    height = Math.max(1, Math.round(sourceHeight * config.scalePercent / 100));
  } else if (config.resizeMode === "longest") {
    const scale = config.longestEdge / Math.max(sourceWidth, sourceHeight);
    width = Math.max(1, Math.round(sourceWidth * scale)); height = Math.max(1, Math.round(sourceHeight * scale));
  } else if (config.resizeMode === "custom") {
    width = config.width; height = config.height;
    if (config.fit === "inside") {
      const scale = Math.min(width / sourceWidth, height / sourceHeight);
      width = Math.max(1, Math.round(sourceWidth * scale)); height = Math.max(1, Math.round(sourceHeight * scale));
    }
  }
  if (Math.max(width, height) > IMAGE_PROCESS_LIMITS.edge || width * height > IMAGE_PROCESS_LIMITS.pixels) throw new Error("输出超过 8192 像素边长或 4000 万像素，请调整分辨率。");
  let pipeline = sharp(buffer, options).autoOrient().toColourspace("srgb");
  if (config.format === "jpeg") pipeline = pipeline.flatten({ background: config.background });
  if (config.resizeMode !== "original") pipeline = pipeline.resize(width, height, {
    kernel: sharp.kernel.lanczos3,
    fit: config.resizeMode === "custom" && config.fit !== "inside" ? config.fit : "fill",
    position: "centre", background: config.background,
  });
  const encode = (quality: number) => {
    const clone = pipeline.clone();
    return (config.format === "png" ? clone.png({ compressionLevel: 9, palette: false })
      : config.format === "jpeg" ? clone.jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
        : clone.webp({ quality, effort: 6 })).toBuffer({ resolveWithObject: true });
  };
  const targetBytes = config.compressionMode === "percent" ? Math.floor(buffer.length * config.targetPercent / 100)
    : config.compressionMode === "size" ? config.targetKB * 1024 : undefined;
  let quality = config.quality;
  let encoded = await encode(quality);
  if (targetBytes !== undefined && encoded.data.length > targetBytes) {
    const minimum = config.format === "png" ? encoded : await encode(config.minQuality);
    if (minimum.data.length > targetBytes) throw new Error(`目标 ${targetBytes} 字节无法达到；${config.format === "png" ? "PNG 无损压缩后" : `最低画质 ${config.minQuality} 下`}为 ${minimum.data.length} 字节。请提高目标体积或手动调整分辨率。`);
    encoded = minimum; quality = config.minQuality;
    let low = config.minQuality + 1, high = config.quality - 1;
    // At most seven further encodes for the integer 1..100 quality domain.
    while (low <= high) {
      const candidateQuality = Math.floor((low + high) / 2);
      const candidate = await encode(candidateQuality);
      if (candidate.data.length <= targetBytes) { encoded = candidate; quality = candidateQuality; low = candidateQuality + 1; }
      else high = candidateQuality - 1;
    }
  }
  return { buffer: encoded.data, sourceWidth, sourceHeight, width: encoded.info.width, height: encoded.info.height,
    quality: config.format === "png" ? undefined : quality, targetBytes };
}

async function readSource(item: CanvasMediaReference, ownerUserId: string) {
  let filePath: string;
  let cleanup = async () => {};
  if (item.url.startsWith("/api/canvas/local-directory/media?")) {
    const params = new URL(item.url, "http://localhost").searchParams;
    const snapshot = await getCanvasDirectorySnapshot(params.get("snapshot") || "", ownerUserId);
    const media = snapshot.groups.flatMap((group) => group.images).find((entry) => entry.id === params.get("media"));
    if (!media) throw new Error("本地目录快照中找不到图片。");
    filePath = media.absolutePath;
  } else {
    const materialized = await materializeRuntimeMedia(item.url, { maxBytes: IMAGE_PROCESS_LIMITS.bytes, kind: "image" });
    filePath = materialized.filePath; cleanup = materialized.cleanup;
  }
  try {
    const file = await stat(filePath);
    if (!file.isFile() || !file.size || file.size > IMAGE_PROCESS_LIMITS.bytes) throw new Error("图片为空或超过 30 MB。");
    const buffer = await readFile(filePath);
    if (buffer.length > IMAGE_PROCESS_LIMITS.bytes) throw new Error("图片超过 30 MB。");
    return buffer;
  } finally { await cleanup(); }
}

type CacheEntry = { sha256: string; report: ImageProcessingReport };
async function readCache(key: string): Promise<{ buffer: Buffer; entry: CacheEntry } | undefined> {
  try {
    const entry: CacheEntry = JSON.parse(await readFile(path.join(cacheRoot, `${key}.json`), "utf8"));
    const buffer = await readFile(path.join(cacheRoot, `${key}.bin`));
    if (digest(buffer) !== entry.sha256 || buffer.length !== entry.report.outputBytes) throw new Error("图片处理缓存校验失败。");
    return { buffer, entry };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
async function atomicWrite(filename: string, contents: Buffer | string) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, contents); await rename(temporary, filename); }
  finally { await rm(temporary, { force: true }); }
}

export async function processCanvasImages(items: CanvasMediaReference[], rawConfig: CanvasNodeConfig, ownerUserId: string): Promise<CanvasMediaReference[]> {
  if (!items.length || items.length > IMAGE_PROCESS_LIMITS.items) throw new Error("图片处理需要 1–20 张图片。");
  const config = resolveImageProcessConfig(rawConfig);
  const configKey = imageProcessConfigKey(rawConfig);
  const outputs: CanvasMediaReference[] = [];
  for (const [index, item] of items.entries()) {
    try {
      outputs.push(await runWithConcurrencyPool("localImage", async () => {
        const source = await readSource(item, ownerUserId);
        const key = digest(`${rendererVersion}:${digest(source)}:${configKey}`);
        await mkdir(cacheRoot, { recursive: true });
        const cached = await readCache(key);
        let buffer: Buffer, entry: CacheEntry;
        if (cached) ({ buffer, entry } = cached);
        else {
          const result = await encodeCanvasImage(source, config);
          buffer = result.buffer;
          entry = { sha256: digest(buffer), report: {
            configKey, sourceUrl: item.url, sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight,
            sourceBytes: source.length, outputBytes: buffer.length, outputWidth: result.width, outputHeight: result.height,
            ...(result.quality !== undefined ? { quality: result.quality } : {}),
            ...(result.targetBytes !== undefined ? { targetBytes: result.targetBytes } : {}),
            savingsPercent: (1 - buffer.length / source.length) * 100,
          } };
          await atomicWrite(path.join(cacheRoot, `${key}.bin`), buffer);
          await atomicWrite(path.join(cacheRoot, `${key}.json`), JSON.stringify(entry));
        }
        const extension = config.format === "jpeg" ? "jpg" : config.format;
        const publicPath = `/generated/canvas-tools/${key}.${extension}`;
        await mkdir(outputRoot, { recursive: true });
        const outputPath = path.join(outputRoot, `${key}.${extension}`);
        await atomicWrite(outputPath, buffer);
        const mimeType = `image/${config.format}`;
        const url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: mimeType, overwrite: false });
        const name = (item.name || `image-${index + 1}`).replace(/\.[^.]+$/, "");
        return { url, name: `${name}.${extension}`, mimeType, sha256: entry.sha256,
          width: entry.report.outputWidth, height: entry.report.outputHeight,
          imageProcessing: { ...entry.report, sourceUrl: item.url } };
      }));
    } catch (error) {
      throw new Error(`第 ${index + 1} 张图片处理失败：${error instanceof Error ? error.message : "未知错误"}`, { cause: error });
    }
  }
  return outputs;
}
