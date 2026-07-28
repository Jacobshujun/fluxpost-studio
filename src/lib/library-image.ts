export function readLibraryImageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return validDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return validDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
  }
  if (mimeType === "image/webp" && buffer.length >= 30) {
    const kind = buffer.subarray(12, 16).toString("ascii");
    if (kind === "VP8X") {
      return validDimensions(1 + readUInt24LE(buffer, 24), 1 + readUInt24LE(buffer, 27));
    }
    if (kind === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return validDimensions((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (kind === "VP8 " && buffer.length >= 30) {
      return validDimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
    }
  }
  if (mimeType === "image/jpeg") return readJpegDimensions(buffer);
  return undefined;
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) return undefined;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return validDimensions(buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5));
    }
    offset += 2 + length;
  }
  return undefined;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function validDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return undefined;
  return { width, height };
}
