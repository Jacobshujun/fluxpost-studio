import { normalizeModelSupportedImageMime, sniffModelSupportedImageMime } from "./image-format";
import { buildMediaRequestHeaders } from "./media-request";
import { readRuntimeMedia } from "./runtime-media-materializer";

const maxInlineImageBytes = 7 * 1024 * 1024;
const remoteImageFetchTimeoutMs = 20_000;

export async function toModelImageUrl(url: string) {
  if (/^data:image\//i.test(url)) return normalizeDataImageUrl(url);
  if (/^https?:\/\//i.test(url)) return remoteImageToDataUrl(url);
  if (!isAppLocalMediaUrl(url)) return undefined;

  const buffer = await readRuntimeMedia(url, maxInlineImageBytes);
  if (buffer.length > maxInlineImageBytes) {
    throw new Error(`Visual asset is too large for inline model input: ${url}`);
  }
  const mimeType = sniffModelSupportedImageMime(buffer);
  if (!mimeType) {
    throw new Error(`local image is not a supported model image: ${url}`);
  }
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function isAppLocalMediaUrl(url: string) {
  return url.startsWith("/media/") || url.startsWith("/generated/");
}

function normalizeDataImageUrl(url: string) {
  const match = url.match(/^data:([^;,]+);base64,/i);
  const mimeType = normalizeModelSupportedImageMime(match?.[1] || "");
  return mimeType ? url.replace(/^data:[^;,]+/i, `data:${mimeType}`) : undefined;
}

async function remoteImageToDataUrl(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteImageFetchTimeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: buildMediaRequestHeaders(url),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`remote image HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxInlineImageBytes) {
    throw new Error(`remote image is too large (${Math.round(contentLength / 1024 / 1024)} MB)`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("remote image is empty");
  }
  if (buffer.length > maxInlineImageBytes) {
    throw new Error(`remote image is too large (${Math.round(buffer.length / 1024 / 1024)} MB)`);
  }

  const contentType = response.headers.get("content-type") || "";
  const mimeType = normalizeModelSupportedImageMime(contentType) || sniffModelSupportedImageMime(buffer);
  if (!mimeType) {
    const normalizedContentType = contentType.split(";")[0]?.trim() || "unknown content type";
    throw new Error(`remote image is not a supported model image (${normalizedContentType})`);
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
