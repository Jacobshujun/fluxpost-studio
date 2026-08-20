import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { findExistingRuntimeMedia, persistRuntimeMedia } from "../runtime-media-storage";
import { probeCanvasMediaFile } from "./media-tools";
import { MAX_CANVAS_VIDEO_BYTES } from "./video-loader";
import type { CanvasVideoSnapshot } from "./types";

export const MAX_CANVAS_VIDEO_UPLOAD_BYTES = MAX_CANVAS_VIDEO_BYTES;
const stagingRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "canvas-video-upload-staging");
const outputRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-video-uploads");

type CanvasVideoUploadDependencies = {
  stagingRoot?: string;
  outputRoot?: string;
  maxBytes?: number;
  probeMedia?: typeof probeCanvasMediaFile;
  findExistingMedia?: typeof findExistingRuntimeMedia;
  persistMedia?: typeof persistRuntimeMedia;
  now?: () => Date;
};

export class CanvasVideoUploadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasVideoUploadInputError";
  }
}

export async function saveCanvasVideoUpload(request: Request, requestedFilename: string, dependencies: CanvasVideoUploadDependencies = {}): Promise<CanvasVideoSnapshot> {
  const filename = normalizeFilename(requestedFilename);
  const maxBytes = dependencies.maxBytes || MAX_CANVAS_VIDEO_UPLOAD_BYTES;
  if (!request.body) throw new CanvasVideoUploadInputError("上传视频不能为空。");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CanvasVideoUploadInputError("上传视频超过 512 MB 限制。");
  }

  const uploadStagingRoot = dependencies.stagingRoot || stagingRoot;
  const uploadOutputRoot = dependencies.outputRoot || outputRoot;
  const probeMedia = dependencies.probeMedia || probeCanvasMediaFile;
  const findExistingMedia = dependencies.findExistingMedia || findExistingRuntimeMedia;
  const persistMedia = dependencies.persistMedia || persistRuntimeMedia;
  await mkdir(uploadStagingRoot, { recursive: true });
  const stagingPath = path.join(/*turbopackIgnore: true*/ uploadStagingRoot, `${Date.now()}-${randomUUID()}.upload`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const hash = createHash("sha256");
  const headerParts: Buffer[] = [];
  let headerBytes = 0;
  let bytes = 0;
  try {
    handle = await open(stagingPath, "wx");
    try {
      const reader = request.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new CanvasVideoUploadInputError("上传视频超过 512 MB 限制。");
        }
        const chunk = Buffer.from(value);
        hash.update(chunk);
        if (headerBytes < 64) {
          const part = chunk.subarray(0, 64 - headerBytes);
          headerParts.push(part);
          headerBytes += part.length;
        }
        await handle.write(chunk);
      }
    } catch (error) {
      if (request.signal.aborted) throw new CanvasVideoUploadInputError("视频上传已取消。");
      throw error;
    } finally {
      await handle.close();
      handle = undefined;
    }
    if (!bytes) throw new CanvasVideoUploadInputError("上传视频不能为空。");
    const metadata = await probeMedia(stagingPath).catch((error) => {
      throw new CanvasVideoUploadInputError(error instanceof Error ? error.message : "无法识别上传视频。");
    });
    if (!metadata.durationSeconds) throw new CanvasVideoUploadInputError("上传视频没有有效时长。");
    const format = detectCanvasVideoFormat(Buffer.concat(headerParts), metadata.formatName);
    const digest = hash.digest("hex");
    const publicPath = `/generated/canvas-video-uploads/${digest}${format.extension}`;
    const outputPath = path.join(/*turbopackIgnore: true*/ uploadOutputRoot, `${digest}${format.extension}`);
    await mkdir(uploadOutputRoot, { recursive: true });
    const remote = await findExistingMedia(publicPath);
    let url: string;
    if (remote) {
      url = remote;
    } else {
      const existing = await stat(/*turbopackIgnore: true*/ outputPath).catch(() => undefined);
      if (existing && (!existing.isFile() || existing.size !== bytes)) throw new Error("视频内容哈希路径发生冲突。");
      if (!existing) await rename(stagingPath, outputPath);
      url = await persistMedia({ filePath: outputPath, publicPath, contentType: format.mimeType, overwrite: false });
    }
    return {
      id: `sha256:${digest}`,
      filename,
      url,
      mimeType: format.mimeType,
      bytes,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width,
      height: metadata.height,
      hasAudio: metadata.hasAudio,
      uploadedAt: (dependencies.now?.() || new Date()).toISOString(),
    };
  } finally {
    try {
      if (handle) await handle.close();
    } finally {
      await rm(stagingPath, { force: true });
    }
  }
}

function normalizeFilename(value: string) {
  const filename = path.basename(String(value || "").trim()).replace(/[\u0000-\u001f]/g, "").slice(0, 255);
  if (!filename) throw new CanvasVideoUploadInputError("视频文件名不能为空。");
  return filename;
}

function detectCanvasVideoFormat(header: Buffer, formatName?: string): Pick<CanvasVideoSnapshot, "mimeType"> & { extension: string } {
  const format = String(formatName || "").toLowerCase();
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && /webm/.test(format)) {
    return { extension: ".webm", mimeType: "video/webm" };
  }
  if (header.length >= 12 && header.toString("ascii", 4, 8) === "ftyp" && /(^|,)mov(,|$)/.test(format)) {
    const brand = header.toString("ascii", 8, 12);
    if (brand === "qt  ") return { extension: ".mov", mimeType: "video/quicktime" };
    if (!/^3g/i.test(brand)) return { extension: ".mp4", mimeType: "video/mp4" };
  }
  throw new CanvasVideoUploadInputError("仅支持有效的 MP4、MOV 或 WebM 视频。");
}
