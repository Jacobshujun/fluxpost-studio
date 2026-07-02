import { execFile } from "node:child_process";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NormalizedSourceItem, Platform } from "./types";

const cleanupTimeoutMs = 90_000;

export function shouldCleanCachedSourceImage(item: Pick<NormalizedSourceItem, "platform">) {
  return item.platform === "weibo";
}

export async function cleanCachedSourceImage(filePath: string, options: { platform: Platform; force?: boolean }) {
  if (options.platform !== "weibo") return;
  const markerPath = getCleanupMarkerPath(filePath);
  if (options.force !== true && await cleanupMarkerExists(markerPath)) return;

  const parsed = path.parse(filePath);
  const tempPath = path.join(parsed.dir, `.${parsed.name}-cleanup-${Date.now()}${parsed.ext || ".jpg"}`);

  try {
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-vf",
      "crop=iw:floor(ih*0.91):0:0",
      "-q:v",
      "3",
      tempPath,
    ]);
    await rename(tempPath, filePath);
    await writeFile(markerPath, "weibo-cleaned\n", "utf8");
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(`weibo image cleanup failed: ${error instanceof Error ? error.message : "ffmpeg failed"}`);
  }
}

function getCleanupMarkerPath(filePath: string) {
  return `${filePath}.weibo-cleaned`;
}

async function cleanupMarkerExists(markerPath: string) {
  const marker = await stat(markerPath).catch(() => undefined);
  return Boolean(marker?.size);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: cleanupTimeoutMs }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve();
    });
  });
}
