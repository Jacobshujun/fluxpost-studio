import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { runWithConcurrencyPool } from "./concurrency";
import { sniffBrowserSupportedImageMime, sniffImageFormat } from "./image-format";
import { materializeRuntimeMedia } from "./runtime-media-materializer";
import { isRuntimeMediaStorageEnabled, persistLibraryObject, persistRuntimeMedia } from "./runtime-media-storage";
import { getCanvasDirectorySnapshot } from "./canvas/directory-snapshots";
import type { CanvasMediaReference } from "./canvas/types";
import type { WorkspaceAccessActor } from "./workspace-ownership";
import {
  buildWonderImageRequest, validateWonderEndpoint, wonderImportedMediaId, wonderJobResult,
  wonderMediaReady, wonderSubmittedJobId, WONDER_IMAGE_API_VERSION, WONDER_IMAGE_MAX_BYTES, WONDER_IMAGE_MAX_REFERENCES,
} from "./wonder-image-contract";

export type WonderImageSubmission = { jobId: string; status: string; pending: true };
export type WonderImageResult = { jobId: string; status: "Finished"; pending: false; items: CanvasMediaReference[] };

async function boundedResponse(response: Response, limit: number, signal: AbortSignal) {
  if (!response.body) throw new Error("Wonder Image: 服务响应为空。");
  if (Number(response.headers.get("content-length")) > limit) { await response.body.cancel(); throw new Error("Wonder Image: 服务响应超过大小限制。"); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) throw new Error("Wonder Image: 服务响应超过大小限制。");
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}

function providerError(value: unknown, status: number, apiKey: string) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const raw = [body.Code, body.code, body.Message, body.message].filter((entry): entry is string => typeof entry === "string").join(": ");
  const message = raw.replaceAll(apiKey, "[redacted]").replace(/https?:\/\/\S+/g, "[provider-url]").slice(0, 500);
  return new Error(`Wonder Image: 请求失败（HTTP ${status}）${message ? `：${message}` : "，请检查地址、密钥、模型权限或服务状态。"}`);
}

async function requestWonder(endpoint: string, apiKey: string, action: string, fields: Record<string, string>, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await fetch(endpoint, {
    method: "POST", redirect: "error", signal,
    headers: {
      Authorization: apiKey, "x-acs-action": action, "x-acs-version": WONDER_IMAGE_API_VERSION,
      "x-acs-date": new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
  const bytes = await boundedResponse(response, 1024 * 1024, signal);
  let body: unknown;
  try { body = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`Wonder Image: 服务返回了无效响应（HTTP ${response.status}）。`); }
  if (!response.ok) throw providerError(body, response.status, apiKey);
  return body;
}

async function referenceBytes(image: CanvasMediaReference, account: WorkspaceAccessActor, signal: AbortSignal) {
  signal.throwIfAborted();
  let bytes: Buffer;
  if (image.url.startsWith("data:")) {
    const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image.url);
    if (!match || match[1].length > Math.ceil(WONDER_IMAGE_MAX_BYTES / 3) * 4) throw new Error("Wonder Image: 参考图 Base64 无效或超过 20MB。");
    bytes = Buffer.from(match[1], "base64");
  } else {
    let filePath: string, cleanup = async () => {};
    if (image.url.startsWith("/api/canvas/local-directory/media?")) {
      const query = new URL(image.url, "http://localhost").searchParams;
      const snapshot = await getCanvasDirectorySnapshot(query.get("snapshot") || "", account.id);
      const media = snapshot.groups.flatMap((group) => group.images).find((entry) => entry.id === query.get("media"));
      if (!media) throw new Error("Wonder Image: 找不到可访问的目录参考图。");
      filePath = media.absolutePath;
    } else {
      const materialized = await materializeRuntimeMedia(image.url, { maxBytes: WONDER_IMAGE_MAX_BYTES, kind: "image", signal });
      filePath = materialized.filePath;
      cleanup = materialized.cleanup;
    }
    try {
      const file = await stat(filePath);
      if (!file.isFile() || file.size > WONDER_IMAGE_MAX_BYTES) throw new Error("Wonder Image: 参考图超过 20MB。");
      bytes = await readFile(filePath, { signal });
    } finally { await cleanup(); }
  }
  if (!bytes.length || bytes.length > WONDER_IMAGE_MAX_BYTES) throw new Error("Wonder Image: 参考图为空或超过 20MB。");
  const format = sniffImageFormat(bytes);
  if (!format || !["image/jpeg", "image/png", "image/webp"].includes(format.mimeType)) throw new Error("Wonder Image: 参考图仅支持 JPEG、PNG 或 WebP。");
  const metadata = await sharp(bytes, { limitInputPixels: 8000 * 8000 }).metadata();
  if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 400 || Math.max(metadata.width, metadata.height) > 8000) {
    throw new Error("Wonder Image: 参考图短边须不低于 400px，长边不得超过 8000px。");
  }
  return { bytes, format };
}

async function registerReference(endpoint: string, apiKey: string, image: CanvasMediaReference, account: WorkspaceAccessActor, signal: AbortSignal) {
  const { bytes, format } = await referenceBytes(image, account, signal);
  let inputUrl = image.url;
  if (!/^https?:\/\//i.test(inputUrl)) {
    if (!isRuntimeMediaStorageEnabled()) throw new Error("Wonder Image: 本地参考图需要先完整配置对象存储，以提供万镜可访问的公网地址。");
    const uploaded = await persistLibraryObject({ publicPath: `/generated/wonder-reference-${randomUUID()}${format.extension}`, body: bytes, contentType: format.mimeType });
    inputUrl = uploaded.publicUrl;
  }
  const imported = await requestWonder(endpoint, apiKey, "ImportMedia", { ImportSource: "url", InputURL: inputUrl, MediaType: "image", Overwrite: "false" }, signal);
  const mediaId = wonderImportedMediaId(imported);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const media = await requestWonder(endpoint, apiKey, "GetMedia", { MediaId: mediaId }, signal);
    if (wonderMediaReady(media)) return mediaId;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 5_000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error("Wonder Image: 参考图媒资尚未就绪，请稍后手动重试。");
}

export async function generateWonderImages(input: {
  endpoint: string; apiKey: string; prompt: string; model: string; images: CanvasMediaReference[];
  count: number; resolution: string; aspectRatio: string; account: WorkspaceAccessActor;
  resumeJobId?: string; signal?: AbortSignal;
}): Promise<WonderImageSubmission | WonderImageResult> {
  const endpoint = validateWonderEndpoint(input.endpoint), apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Wonder Image: 请在节点中保存 API Key。");
  if (input.images.length > WONDER_IMAGE_MAX_REFERENCES) throw new Error("Wonder Image: 最多支持 9 张参考图。");
  buildWonderImageRequest({ ...input, mediaIds: [] });
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000);
  try {
    return await runWithConcurrencyPool("image", async () => {
      const jobId = input.resumeJobId || await (async () => {
        const mediaIds: string[] = [];
        for (const image of input.images) mediaIds.push(await registerReference(endpoint, apiKey, image, input.account, signal));
        const submitted = await requestWonder(endpoint, apiKey, "SubmitImageGenerationJob", buildWonderImageRequest({ ...input, mediaIds }), signal);
        return wonderSubmittedJobId(submitted);
      })();
      if (!input.resumeJobId) return { jobId, status: "Created", pending: true };
      const queried = wonderJobResult(await requestWonder(endpoint, apiKey, "GetImageGenerationJob", { JobId: jobId }, signal));
      if (queried.status !== "Finished") return { jobId, status: queried.status, pending: true };
      if (queried.urls.length !== input.count) throw new Error("Wonder Image: 返回图片数量与请求不一致。");
      const items: CanvasMediaReference[] = [];
      for (const url of queried.urls) {
        const materialized = await materializeRuntimeMedia(url, { maxBytes: 40 * 1024 * 1024, kind: "image", signal });
        try {
          const bytes = await readFile(materialized.filePath, { signal }), format = sniffImageFormat(bytes);
          const mimeType = format && sniffBrowserSupportedImageMime(bytes);
          if (!format || !mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Wonder Image: 输出不是有效的 JPEG、PNG 或 WebP 图片。");
          const metadata = await sharp(bytes, { limitInputPixels: 16_000 * 16_000 }).metadata();
          if (!metadata.width || !metadata.height) throw new Error("Wonder Image: 输出图片尺寸无效。");
          const publicPath = `/generated/wonder-${randomUUID()}${format.extension}`;
          const storedUrl = await persistRuntimeMedia({ filePath: materialized.filePath, publicPath, contentType: mimeType });
          items.push({ url: storedUrl, width: metadata.width, height: metadata.height, mimeType });
        } finally { await materialized.cleanup(); }
      }
      return { jobId, status: "Finished", pending: false, items };
    }, { signal });
  } catch (error) {
    input.signal?.throwIfAborted();
    if (signal.aborted) throw new Error("Wonder Image: 请求超时，请稍后手动重试。");
    if (error instanceof Error && error.message.startsWith("Wonder Image:")) throw new Error(error.message.replaceAll(apiKey, "[redacted]").replace(/https?:\/\/\S+/g, "[provider-url]"));
    throw new Error("Wonder Image: 图片请求或保存失败，请检查参考图、网络和存储配置。");
  }
}
