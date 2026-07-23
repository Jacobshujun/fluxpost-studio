import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import convert from "heic-convert";
import { sniffImageFormat } from "./image-format";

const heicJpegQuality = 0.9;

export async function convertHeicBufferToJpeg(buffer: Buffer) {
  const sourceFormat = sniffImageFormat(buffer);
  if (sourceFormat?.mimeType !== "image/heic") {
    throw new Error(`HEIC conversion requires image/heic bytes, received ${sourceFormat?.mimeType || "unknown format"}.`);
  }

  const converted = Buffer.from(
    await convert({
      buffer,
      format: "JPEG",
      quality: heicJpegQuality,
    }),
  );
  const outputFormat = sniffImageFormat(converted);
  if (outputFormat?.mimeType !== "image/jpeg" || !outputFormat.browserSupported) {
    throw new Error("HEIC conversion did not produce a valid browser-readable JPEG.");
  }
  return converted;
}

export async function normalizeHeicFileToJpeg(filePath: string) {
  const source = await readFile(filePath);
  if (sniffImageFormat(source)?.mimeType !== "image/heic") return false;

  const converted = await convertHeicBufferToJpeg(source);
  const parsed = path.parse(filePath);
  const token = randomUUID();
  const tempPath = path.join(parsed.dir, `.${parsed.name}-${token}.jpg`);
  await writeFile(tempPath, converted, { flag: "wx" });

  try {
    await rename(tempPath, filePath);
    return true;
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}
