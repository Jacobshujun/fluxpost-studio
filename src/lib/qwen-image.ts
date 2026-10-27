import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runWithConcurrencyPool } from "./concurrency";
import { materializeRuntimeMedia } from "./runtime-media-materializer";
import { persistRuntimeMedia } from "./runtime-media-storage";
import { getCanvasDirectorySnapshot } from "./canvas/directory-snapshots";
import type { CanvasMediaReference } from "./canvas/types";
import type { WorkspaceAccessActor } from "./workspace-ownership";
import { buildQwenImageRequest, QWEN_IMAGE_MAX_BYTES, QWEN_IMAGE_MAX_REFERENCES, qwenImageResponseUrls, validateQwenEndpoint } from "./qwen-image-contract";

async function boundedResponse(response: Response, limit: number, signal: AbortSignal) {
  if (!response.ok || !response.body) throw new Error(`Qwen: HTTP ${response.status}，请检查地域、密钥、权限或服务状态。`);
  if (Number(response.headers.get("content-length")) > limit) { await response.body.cancel(); throw new Error("Qwen: 响应超过大小限制。"); }
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) throw new Error("Qwen: 响应超过大小限制。");
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}

async function referenceData(image: CanvasMediaReference, account: WorkspaceAccessActor, signal: AbortSignal) {
  let buffer: Buffer;
  signal.throwIfAborted();
  if (image.url.startsWith("data:")) {
    const match = /^data:image\/(?:jpeg|jpg|png|webp|gif|bmp|tiff);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image.url);
    if (!match || match[1].length > Math.ceil(QWEN_IMAGE_MAX_BYTES / 3) * 4) throw new Error("Qwen: 参考图 Base64 无效或超过 10MB。");
    buffer = Buffer.from(match[1], "base64");
  } else {
    let filePath: string;
    let cleanup = async () => {};
    if (image.url.startsWith("/api/canvas/local-directory/media?")) {
      const query = new URL(image.url, "http://localhost").searchParams;
      const snapshot = await getCanvasDirectorySnapshot(query.get("snapshot") || "", account.id);
      const media = snapshot.groups.flatMap((group) => group.images).find((entry) => entry.id === query.get("media"));
      if (!media) throw new Error("Qwen: 找不到可访问的目录参考图。");
      filePath = media.absolutePath;
    } else {
      const materialized = await materializeRuntimeMedia(image.url, { maxBytes: QWEN_IMAGE_MAX_BYTES, kind: "image", signal });
      filePath = materialized.filePath;
      cleanup = materialized.cleanup;
    }
    try {
      const file = await stat(filePath);
      if (!file.isFile() || file.size > QWEN_IMAGE_MAX_BYTES) throw new Error("Qwen: 参考图超过 10MB。");
      buffer = await readFile(filePath, { signal });
    } finally { await cleanup(); }
  }
  if (!buffer.length || buffer.length > QWEN_IMAGE_MAX_BYTES) throw new Error("Qwen: 参考图为空或超过 10MB。");
  // libvips does not decode BMP; the documented input is forwarded unchanged after header validation.
  const bmp = buffer.length >= 54 && buffer.toString("ascii", 0, 2) === "BM";
  const metadata = bmp
    ? { format: "bmp", width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) }
    : await sharp(buffer, { limitInputPixels: 8000 * 8000 }).metadata();
  if (bmp && (buffer.readUInt32LE(14) < 40 || buffer.readUInt32LE(10) >= buffer.length || buffer.readUInt16LE(26) !== 1)) throw new Error("Qwen: BMP 参考图头无效。");
  const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", tiff: "image/tiff", bmp: "image/bmp" };
  const mime = formats[metadata.format || ""];
  if (!mime || !metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1 || metadata.width > 8000 || metadata.height > 8000
    || Math.max(metadata.width / metadata.height, metadata.height / metadata.width) > 10) {
    throw new Error("Qwen: 参考图须为 JPEG/PNG/WebP/GIF/TIFF/BMP，边长 1–8000，长短边比不超过 10:1。");
  }
  signal.throwIfAborted();
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function generateQwenImages(input: {
  endpoint: string; apiKey: string; prompt: string; images: CanvasMediaReference[];
  promptExtend: boolean; count: number; size?: string; account: WorkspaceAccessActor; signal?: AbortSignal;
}): Promise<CanvasMediaReference[]> {
  const endpoint = validateQwenEndpoint(input.endpoint);
  if (!input.apiKey.trim()) throw new Error("Qwen: 请在节点中保存 API Key。");
  if (input.images.length > QWEN_IMAGE_MAX_REFERENCES) throw new Error("Qwen: 最多支持 3 张参考图。");
  buildQwenImageRequest({ ...input, images: [] });
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000);
  try {
    return await runWithConcurrencyPool("image", async () => {
      const images: string[] = [];
      for (const image of input.images) images.push(await referenceData(image, input.account, signal));
      signal.throwIfAborted();
      const body = buildQwenImageRequest({ ...input, images });
      const response = await fetch(endpoint, { method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify(body) });
      const urls = qwenImageResponseUrls(JSON.parse((await boundedResponse(response, 1024 * 1024, signal)).toString("utf8")));
      if (urls.length !== input.count) throw new Error("Qwen: 返回图片数量与请求不一致。");
      const results: CanvasMediaReference[] = [];
      for (const url of urls) {
        signal.throwIfAborted();
        const bytes = await boundedResponse(await fetch(url, { signal, redirect: "error" }), 40 * 1024 * 1024, signal);
        const metadata = await sharp(bytes, { limitInputPixels: 2048 * 2048 }).metadata();
        if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error("Qwen: 输出不是有效的 PNG 图片。");
        if (input.size && `${metadata.width}*${metadata.height}` !== input.size.trim()) throw new Error("Qwen: 返回图片尺寸与请求不一致。");
        const publicPath = `/generated/qwen-${randomUUID()}.png`;
        const filePath = path.join(process.cwd(), "public", publicPath.slice(1));
        signal.throwIfAborted();
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, bytes, { flag: "wx", signal });
        const storedUrl = await persistRuntimeMedia({ filePath, publicPath, contentType: "image/png" });
        signal.throwIfAborted();
        results.push({ url: storedUrl, width: metadata.width, height: metadata.height, mimeType: "image/png" });
      }
      return results;
    }, { signal });
  } catch (error) {
    input.signal?.throwIfAborted();
    if (signal.aborted) throw new Error("Qwen: 请求超时，请检查任务后手动重试。");
    // Provider bodies, paths and signed URLs must never enter durable run errors.
    const message = error instanceof Error && error.message.startsWith("Qwen:")
      ? error.message.replaceAll(input.apiKey, "[redacted]")
      : "Qwen: 图片请求或保存失败，请检查参考图、网络和存储。";
    throw new Error(message);
  }
}
