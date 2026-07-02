import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { sniffBrowserSupportedImageMime } from "@/lib/image-format";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

const maxMaterialPreviewBytes = 24 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const targetPath = url.searchParams.get("path") || "";
    if (!targetPath || !path.isAbsolute(targetPath)) {
      return NextResponse.json({ error: "Invalid material preview path" }, { status: 400 });
    }

    const fileStat = await stat(/*turbopackIgnore: true*/ targetPath).catch(() => undefined);
    if (!fileStat?.isFile()) {
      return NextResponse.json({ error: "Material preview not found" }, { status: 404 });
    }
    if (fileStat.size > maxMaterialPreviewBytes) {
      return NextResponse.json({ error: "Material preview image is too large" }, { status: 413 });
    }

    const contentType = await sniffMaterialImageContentType(targetPath);
    if (!contentType) {
      return NextResponse.json({ error: "Material preview is not a supported image" }, { status: 415 });
    }

    const stream = createReadStream(/*turbopackIgnore: true*/ targetPath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(fileStat.size),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Material preview failed" }, { status });
  }
}

async function sniffMaterialImageContentType(filePath: string) {
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
