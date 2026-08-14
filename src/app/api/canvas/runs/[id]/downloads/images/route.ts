import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  CanvasImageDownloadError,
  inspectCanvasImageDownload,
  resolveCanvasImageDownload,
} from "@/lib/canvas/image-download";
import {
  CANVAS_IMAGE_DOWNLOAD_MAX_BYTES,
  canvasImageDownloadContentDisposition,
  canvasImageDownloadFilename,
} from "@/lib/canvas/save-images";
import { getCanvasRun } from "@/lib/canvas/runs";
import { materializeRuntimeMedia, type MaterializedRuntimeMedia } from "@/lib/runtime-media-materializer";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  let materialized: MaterializedRuntimeMedia | undefined;
  try {
    const account = await requireWorkspaceAccount(request);
    const runId = (await context.params).id;
    const searchParams = new URL(request.url).searchParams;
    const nodeRunId = searchParams.get("nodeRunId")?.trim() || "";
    const rawIndex = searchParams.get("index") || "";
    if (!nodeRunId || !/^\d+$/u.test(rawIndex)) {
      throw new CanvasImageDownloadError("nodeRunId and a zero-based image index are required.", 400);
    }
    const result = await getCanvasRun(runId, account);
    if (!result) throw new CanvasImageDownloadError("Canvas run not found.", 404);
    const selected = resolveCanvasImageDownload(result, nodeRunId, Number(rawIndex));
    try {
      materialized = await materializeRuntimeMedia(selected.url, {
        maxBytes: CANVAS_IMAGE_DOWNLOAD_MAX_BYTES,
        kind: "image",
      });
    } catch (error) {
      throw new CanvasImageDownloadError(error instanceof Error ? error.message : "Canvas image could not be downloaded.", 400);
    }
    const inspected = await inspectCanvasImageDownload(materialized.filePath);
    const filename = canvasImageDownloadFilename(selected.filenamePrefix, selected.ordinal, inspected.extension);
    const stream = createReadStream(materialized.filePath);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      void materialized?.cleanup().catch((error) => console.error("Canvas image download cleanup failed", error));
    };
    stream.once("close", cleanup);
    stream.once("error", cleanup);
    const body = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": canvasImageDownloadContentDisposition(filename),
        "Content-Length": String(inspected.size),
        "Content-Type": inspected.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (materialized) {
      await materialized.cleanup().catch((cleanupError) => console.error("Canvas image download cleanup failed", cleanupError));
    }
    const message = error instanceof Error ? error.message : "Canvas image could not be downloaded.";
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof CanvasImageDownloadError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
