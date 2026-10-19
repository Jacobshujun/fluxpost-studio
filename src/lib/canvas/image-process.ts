import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { appConfig } from "../config";
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

type EncodedImage = { buffer: Buffer; sourceWidth: number; sourceHeight: number; width: number; height: number; quality?: number; targetBytes?: number };

// A separate process is required: aborting a Promise leaves Sharp native work running.
export async function encodeCanvasImage(buffer: Buffer, config: ImageProcessConfig, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<EncodedImage> {
  options.signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, [path.join(process.cwd(), "src", "lib", "canvas", "image-encoder.mjs")], {
      serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let result: EncodedImage | undefined;
    let failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; worker.kill("SIGKILL"); };
    const abort = () => stop(options.signal?.reason instanceof Error ? options.signal.reason : new DOMException("Image processing cancelled.", "AbortError"));
    const timer = setTimeout(() => stop(new Error(`Image encoding timed out after ${Math.ceil(timeoutMs / 1000)}s.`)), timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.once("error", (error) => { failure ??= error; });
    worker.once("message", (message: { result?: EncodedImage; error?: { name: string; message: string } }) => {
      if (message.error) { failure ??= Object.assign(new Error(message.error.message), { name: message.error.name }); }
      else result = message.result;
    });
    worker.once("close", (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0 || !result) reject(new Error(`Image encoder exited without a result (${signal || code}).`));
      else resolve(result);
    });
    if (options.signal?.aborted) abort();
    else worker.send({ buffer, config, limits: IMAGE_PROCESS_LIMITS }, (error) => { if (error) stop(error); });
  });
}

async function readSource(item: CanvasMediaReference, ownerUserId: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let filePath: string;
  let cleanup = async () => {};
  if (item.url.startsWith("/api/canvas/local-directory/media?")) {
    const params = new URL(item.url, "http://localhost").searchParams;
    const snapshot = await getCanvasDirectorySnapshot(params.get("snapshot") || "", ownerUserId);
    const media = snapshot.groups.flatMap((group) => group.images).find((entry) => entry.id === params.get("media"));
    if (!media) throw new Error("本地目录快照中找不到图片。");
    filePath = media.absolutePath;
  } else {
    const materialized = await materializeRuntimeMedia(item.url, { maxBytes: IMAGE_PROCESS_LIMITS.bytes, kind: "image", signal });
    filePath = materialized.filePath; cleanup = materialized.cleanup;
  }
  try {
    signal?.throwIfAborted();
    const file = await stat(filePath);
    if (!file.isFile() || !file.size || file.size > IMAGE_PROCESS_LIMITS.bytes) throw new Error("图片为空或超过 30 MB。");
    const buffer = await readFile(filePath, { signal });
    if (buffer.length > IMAGE_PROCESS_LIMITS.bytes) throw new Error("图片超过 30 MB。");
    return buffer;
  } finally { await cleanup(); }
}

type CacheEntry = { sha256: string; report: ImageProcessingReport };
async function readCache(key: string, signal?: AbortSignal): Promise<{ buffer: Buffer; entry: CacheEntry } | undefined> {
  try {
    const entry: CacheEntry = JSON.parse(await readFile(path.join(cacheRoot, `${key}.json`), { encoding: "utf8", signal }));
    const buffer = await readFile(path.join(cacheRoot, `${key}.bin`), { signal });
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

export async function processCanvasImages(items: CanvasMediaReference[], rawConfig: CanvasNodeConfig, ownerUserId: string, signal?: AbortSignal): Promise<CanvasMediaReference[]> {
  signal?.throwIfAborted();
  if (!items.length || items.length > IMAGE_PROCESS_LIMITS.items) throw new Error("图片处理需要 1–20 张图片。");
  const config = resolveImageProcessConfig(rawConfig);
  const configKey = imageProcessConfigKey(rawConfig);
  const outputs: CanvasMediaReference[] = [];
  for (const [index, item] of items.entries()) {
    try {
      signal?.throwIfAborted();
      const source = await readSource(item, ownerUserId, signal);
      const key = digest(`${rendererVersion}:${digest(source)}:${configKey}`);
      await mkdir(cacheRoot, { recursive: true });
      const cached = await readCache(key, signal);
      let buffer: Buffer, entry: CacheEntry;
      if (cached) ({ buffer, entry } = cached);
      else {
        const result = await runWithConcurrencyPool("localImage", () => encodeCanvasImage(source, config, { signal }), { signal });
        signal?.throwIfAborted();
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
      // TOS persistence consumes its staging file. Concurrent cache hits must not
      // upload or remove another run's file, even when the public object is shared.
      const outputPath = appConfig.tosEnabled
        ? path.join(cacheRoot, `${key}.${randomUUID()}.${extension}`)
        : path.join(outputRoot, `${key}.${extension}`);
      await atomicWrite(outputPath, buffer);
      const mimeType = `image/${config.format}`;
      let url: string;
      try {
        signal?.throwIfAborted();
        url = await persistRuntimeMedia({ filePath: outputPath, publicPath, contentType: mimeType, overwrite: false });
      } finally {
        if (appConfig.tosEnabled) await rm(outputPath, { force: true });
      }
      signal?.throwIfAborted();
      const name = (item.name || `image-${index + 1}`).replace(/\.[^.]+$/, "");
      outputs.push({ url, name: `${name}.${extension}`, mimeType, sha256: entry.sha256,
        width: entry.report.outputWidth, height: entry.report.outputHeight,
        imageProcessing: { ...entry.report, sourceUrl: item.url } });
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(`第 ${index + 1} 张图片处理失败：${error instanceof Error ? error.message : "未知错误"}`, { cause: error });
    }
  }
  return outputs;
}
