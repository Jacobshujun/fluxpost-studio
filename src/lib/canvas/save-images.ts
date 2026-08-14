import type { CanvasNodeConfig } from "./types";

export const CANVAS_SAVE_IMAGE_MAX_ITEMS = 30;
export const CANVAS_IMAGE_DOWNLOAD_MAX_BYTES = 30 * 1024 * 1024;

const invalidFilenamePrefix = /[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]/u;

export function validateCanvasImageFilenamePrefix(value: CanvasNodeConfig[string] | unknown) {
  if (typeof value !== "string" || !value.trim()) return "Save images: Filename prefix is required.";
  if (Array.from(value).length > 80) return "Save images: Filename prefix must be at most 80 characters.";
  if (invalidFilenamePrefix.test(value)) return "Save images: Filename prefix contains an invalid character.";
  if (/[. ]$/u.test(value)) return "Save images: Filename prefix cannot end with a space or period.";
  return undefined;
}

export function canvasImageDownloadFilename(prefix: string, ordinal: number, extension: string) {
  const prefixError = validateCanvasImageFilenamePrefix(prefix);
  if (prefixError) throw new Error(prefixError);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > CANVAS_SAVE_IMAGE_MAX_ITEMS) {
    throw new Error(`Save images: Download ordinal must be between 1 and ${CANVAS_SAVE_IMAGE_MAX_ITEMS}.`);
  }
  if (!/^\.[a-z0-9]{2,5}$/u.test(extension)) throw new Error("Save images: Download extension is invalid.");
  return `${prefix}_${String(ordinal).padStart(4, "0")}${extension}`;
}

export function canvasImageDownloadContentDisposition(filename: string) {
  const suffix = filename.match(/_(\d{4})(\.[a-z0-9]{2,5})$/iu);
  const fallback = `FluxPost_${suffix?.[1] || "0001"}${suffix?.[2]?.toLowerCase() || ".bin"}`;
  const encoded = encodeURIComponent(filename).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
