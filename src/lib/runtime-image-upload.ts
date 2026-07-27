import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sniffImageFormat } from "./image-format";
import { persistRuntimeMedia } from "./runtime-media-storage";

export type RuntimeImageUploadResult = {
  imageUrl: string;
  bytes: number;
  mimeType: string;
};

export class RuntimeImageUploadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeImageUploadInputError";
  }
}

const maxRuntimeImageUploadBytes = 30 * 1024 * 1024;

export async function saveRuntimeImageUpload(
  file: File,
  target: {
    directory: "review-uploads" | "canvas-uploads";
    prefix: "review" | "canvas";
    maxBytes?: number;
    allowedMimeTypes?: readonly string[];
  },
): Promise<RuntimeImageUploadResult> {
  const maxBytes = target.maxBytes || maxRuntimeImageUploadBytes;
  if (!file.size) throw new RuntimeImageUploadInputError("Uploaded image is empty.");
  if (file.size > maxBytes) throw new RuntimeImageUploadInputError("Uploaded image is too large.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) throw new RuntimeImageUploadInputError("Uploaded image is empty.");
  if (buffer.length > maxBytes) throw new RuntimeImageUploadInputError("Uploaded image is too large.");

  const format = sniffImageFormat(buffer);
  if (!format?.browserSupported) throw new RuntimeImageUploadInputError("Uploaded file is not a supported browser image.");
  if (target.allowedMimeTypes && !target.allowedMimeTypes.includes(format.mimeType)) {
    throw new RuntimeImageUploadInputError("Uploaded image must be PNG or JPEG.");
  }

  const uploadDir = target.directory === "canvas-uploads"
    ? path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "canvas-uploads")
    : path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "review-uploads");
  await mkdir(uploadDir, { recursive: true });

  const fileName = `${target.prefix}-${Date.now()}-${randomUUID()}${format.extension}`;
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, fileName);
  await writeFile(filePath, buffer);
  const imageUrl = await persistRuntimeMedia({
    filePath,
    publicPath: `/generated/${target.directory}/${fileName}`,
    contentType: format.mimeType,
  });

  return { imageUrl, bytes: buffer.length, mimeType: format.mimeType };
}
