export type ImageFormat = {
  mimeType: string;
  extension: string;
  browserSupported: boolean;
  modelSupported: boolean;
};

const browserSupportedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const modelSupportedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function normalizeImageMime(value: string) {
  return value.split(";")[0]?.trim().toLowerCase().replace("image/jpg", "image/jpeg") || "";
}

export function normalizeModelSupportedImageMime(value: string) {
  const mimeType = normalizeImageMime(value);
  return modelSupportedImageMimeTypes.has(mimeType) ? mimeType : undefined;
}

export function sniffImageFormat(buffer: Buffer): ImageFormat | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return makeImageFormat("image/jpeg", ".jpg");
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return makeImageFormat("image/png", ".png");
  }
  if (buffer.length >= 6) {
    const gifHeader = buffer.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return makeImageFormat("image/gif", ".gif");
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return makeImageFormat("image/webp", ".webp");
  }
  if (isIsoBaseMediaImage(buffer, ["avif", "avis"])) {
    return makeImageFormat("image/avif", ".avif");
  }
  if (isIsoBaseMediaImage(buffer, ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"])) {
    return makeImageFormat("image/heic", ".heic");
  }
  return undefined;
}

export function sniffModelSupportedImageMime(buffer: Buffer) {
  const format = sniffImageFormat(buffer);
  return format?.modelSupported ? format.mimeType : undefined;
}

export function sniffBrowserSupportedImageMime(buffer: Buffer) {
  const format = sniffImageFormat(buffer);
  return format?.browserSupported ? format.mimeType : undefined;
}

function makeImageFormat(mimeType: string, extension: string): ImageFormat {
  return {
    mimeType,
    extension,
    browserSupported: browserSupportedImageMimeTypes.has(mimeType),
    modelSupported: modelSupportedImageMimeTypes.has(mimeType),
  };
}

function isIsoBaseMediaImage(buffer: Buffer, brands: string[]) {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const brandText = buffer.subarray(8, Math.min(buffer.length, 64)).toString("ascii");
  return brands.some((brand) => brandText.includes(brand));
}
