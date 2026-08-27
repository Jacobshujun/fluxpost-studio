import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCanvasDirectorySnapshot } from "@/lib/canvas/directory-snapshots";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const params = new URL(request.url).searchParams;
    const snapshot = await getCanvasDirectorySnapshot(params.get("snapshot") || "", account.id);
    const media = snapshot.groups.flatMap((group) => [...group.images, ...group.audios, ...group.videos]).find((item) => item.id === params.get("media"));
    if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
    const file = await stat(media.absolutePath);
    const range = request.headers.get("range");
    const headers = new Headers({ "Content-Type": media.mimeType || "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": String(file.size) });
    if (!range) return new NextResponse(Readable.toWeb(createReadStream(media.absolutePath)) as ReadableStream, { headers });
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new NextResponse(null, { status: 416 });
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= file.size) return new NextResponse(null, { status: 416 });
    headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`); headers.set("Content-Length", String(end - start + 1));
    return new NextResponse(Readable.toWeb(createReadStream(media.absolutePath, { start, end })) as ReadableStream, { status: 206, headers });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : 404;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Media unavailable." }, { status });
  }
}
