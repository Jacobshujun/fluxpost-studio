import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sniffImageFormat } from "./image-format";
import { persistRuntimeMedia } from "./runtime-media-storage";

export type ReviewImageUploadResult = {
  imageUrl: string;
  bytes: number;
  mimeType: string;
};

export class ReviewImageUploadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewImageUploadInputError";
  }
}

const maxReviewImageUploadBytes = 30 * 1024 * 1024;

export async function saveReviewImageUpload(file: File): Promise<ReviewImageUploadResult> {
  if (!file.size) throw new ReviewImageUploadInputError("Uploaded image is empty.");
  if (file.size > maxReviewImageUploadBytes) throw new ReviewImageUploadInputError("Uploaded image is too large.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) throw new ReviewImageUploadInputError("Uploaded image is empty.");
  if (buffer.length > maxReviewImageUploadBytes) throw new ReviewImageUploadInputError("Uploaded image is too large.");

  const format = sniffImageFormat(buffer);
  if (!format?.browserSupported) throw new ReviewImageUploadInputError("Uploaded file is not a supported browser image.");

  const uploadDir = path.join(process.cwd(), "public", "generated", "review-uploads");
  await mkdir(uploadDir, { recursive: true });

  const fileName = `review-${Date.now()}-${randomUUID()}${format.extension}`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, buffer);
  const imageUrl = await persistRuntimeMedia({
    filePath,
    publicPath: `/generated/review-uploads/${fileName}`,
    contentType: format.mimeType,
  });

  return {
    imageUrl,
    bytes: buffer.length,
    mimeType: format.mimeType,
  };
}
