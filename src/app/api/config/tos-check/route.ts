import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { deleteRuntimeMediaObject, persistTosProbeObject } from "@/lib/runtime-media-storage";
import type { TosStorageProbeResult } from "@/lib/types";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

const probeImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
  "base64",
);
const probeVideo = Buffer.alloc(4096, 0x5a);

export async function POST(request: Request) {
  const startedAt = Date.now();
  const objectKeys: string[] = [];
  let operationError: unknown;
  const result: TosStorageProbeResult = {
    ok: false,
    uploadVerified: false,
    headVerified: false,
    publicReadVerified: false,
    rangeVerified: false,
    cleanupVerified: false,
  };

  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) return NextResponse.json(result, { status: 403 });

    const probeId = `${Date.now()}-${randomUUID()}`;
    const image = await persistTosProbeObject({ objectKeySuffix: `${probeId}.png`, body: probeImage, contentType: "image/png" });
    objectKeys.push(image.objectKey);
    const video = await persistTosProbeObject({ objectKeySuffix: `${probeId}.mp4`, body: probeVideo, contentType: "video/mp4" });
    objectKeys.push(video.objectKey);
    result.uploadVerified = true;
    result.headVerified = true;

    const imageResponse = await fetch(image.url, { cache: "no-store" });
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!imageResponse.ok || !imageBytes.equals(probeImage)) throw new Error(`TOS public image GET failed with HTTP ${imageResponse.status}.`);
    result.publicReadVerified = true;

    const rangeResponse = await fetch(video.url, {
      cache: "no-store",
      headers: { Range: "bytes=0-31" },
    });
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    if (rangeResponse.status !== 206 || rangeBytes.length !== 32) {
      throw new Error(`TOS public video Range check failed with HTTP ${rangeResponse.status} and ${rangeBytes.length} bytes.`);
    }
    result.rangeVerified = true;
  } catch (error) {
    operationError = error;
  }

  const cleanupResults = await Promise.allSettled(objectKeys.map((objectKey) => deleteRuntimeMediaObject(objectKey)));
  result.cleanupVerified = cleanupResults.every((item) => item.status === "fulfilled");

  if (operationError || !result.cleanupVerified) {
    const error = operationError || new Error("TOS probe object cleanup failed.");
    await recordExecutionLog({
      scope: "storage/tos",
      action: "TOS storage probe failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
      details: result,
    });
    const status = isWorkspaceSignInError(error) ? 401 : 502;
    return NextResponse.json(result, { status });
  }

  result.ok = true;
  await recordExecutionLog({
    scope: "storage/tos",
    action: "TOS storage probe passed",
    status: "success",
    message: "TOS upload, public read, byte range, and cleanup checks passed.",
    durationMs: Date.now() - startedAt,
    details: result,
  });
  return NextResponse.json(result);
}
