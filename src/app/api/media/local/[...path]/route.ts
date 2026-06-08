import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { sniffBrowserSupportedImageMime } from "@/lib/image-format";

export const runtime = "nodejs";

const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
const localRoots = {
  crawl: path.join(publicRoot, "media", "crawl"),
  generated: path.join(publicRoot, "generated"),
} as const;

type LocalMediaKind = keyof typeof localRoots;

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return serveLocalMedia(request, context, false);
}

export async function HEAD(request: Request, context: RouteContext) {
  return serveLocalMedia(request, context, true);
}

async function serveLocalMedia(request: Request, context: RouteContext, headOnly: boolean) {
  const params = await context.params;
  const resolved = resolveLocalMediaPath(params.path || []);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid local media path" }, { status: 400 });
  }

  const fileStat = await stat(resolved.filePath).catch(() => undefined);
  if (!fileStat?.isFile()) {
    return NextResponse.json({ error: "Local media not found" }, { status: 404 });
  }

  const size = fileStat.size;
  const contentType = await inferContentType(resolved.filePath);
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, size) : undefined;

  if (rangeHeader && !range) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  if (range) {
    const length = range.end - range.start + 1;
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Length": String(length),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Content-Type": contentType,
    };

    if (headOnly) return new NextResponse(null, { status: 206, headers });

    const stream = createReadStream(resolved.filePath, { start: range.start, end: range.end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
  }

  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Content-Length": String(size),
    "Content-Type": contentType,
  };

  if (headOnly) return new NextResponse(null, { headers });

  const stream = createReadStream(resolved.filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, { headers });
}

function resolveLocalMediaPath(segments: string[]) {
  const [kind, ...fileSegments] = segments;
  if (!isLocalMediaKind(kind) || fileSegments.length === 0) return undefined;
  if (fileSegments.some((segment) => !isSafeSegment(segment))) return undefined;

  const root = localRoots[kind];
  const filePath = path.resolve(root, ...fileSegments);
  const relativePath = path.relative(root, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;

  return { filePath };
}

function isLocalMediaKind(value: string | undefined): value is LocalMediaKind {
  return value === "crawl" || value === "generated";
}

function isSafeSegment(segment: string) {
  return Boolean(segment) && !segment.includes("\0") && !segment.includes("/") && !segment.includes("\\") && segment !== "." && segment !== "..";
}

function parseRange(rangeHeader: string, size: number) {
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return undefined;

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (!rawStart && !rawEnd) return undefined;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return undefined;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return undefined;
  if (start < 0 || end < start || start >= size) return undefined;

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

async function inferContentType(filePath: string) {
  const sniffed = await sniffLocalImageContentType(filePath);
  if (sniffed) return sniffed;

  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

async function sniffLocalImageContentType(filePath: string) {
  const handle = await open(filePath, "r").catch(() => undefined);
  if (!handle) return undefined;
  try {
    const buffer = Buffer.alloc(64);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    if (!result.bytesRead) return undefined;
    return sniffBrowserSupportedImageMime(buffer.subarray(0, result.bytesRead));
  } finally {
    await handle.close();
  }
}
