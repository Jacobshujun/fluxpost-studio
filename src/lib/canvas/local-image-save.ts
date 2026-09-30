import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { materializeRuntimeMedia } from "../runtime-media-materializer";
import { canvasLocalDirectoryEnabled } from "./directory-snapshots";
import { inspectCanvasImageDownload } from "./image-download";
import {
  CANVAS_IMAGE_DOWNLOAD_MAX_BYTES,
  CANVAS_SAVE_IMAGE_MAX_ITEMS,
  validateCanvasImageFilenamePrefix,
  validateCanvasImageOutputFolder,
} from "./save-images";
import type { CanvasSaveImagesMetadata } from "./types";

export async function saveCanvasImagesToFolder(options: {
  runId: string;
  nodeId: string;
  outputFolder: string;
  filenamePrefix: string;
  urls: string[];
  previous?: CanvasSaveImagesMetadata;
  checkpoint: (metadata: CanvasSaveImagesMetadata) => Promise<void>;
}) {
  if (!canvasLocalDirectoryEnabled()) throw new Error("当前环境未启用本地目录保存。请在本地应用中运行此节点。");
  const validation = validateCanvasImageOutputFolder(options.outputFolder) || validateCanvasImageFilenamePrefix(options.filenamePrefix);
  if (validation) throw new Error(validation);
  if (!options.outputFolder.trim()) throw new Error("保存目录不能为空。");
  if (!options.urls.length || options.urls.length > CANVAS_SAVE_IMAGE_MAX_ITEMS) throw new Error("保存图片需要 1 至 30 张图片。");
  if (process.platform !== "win32" && /^(?:[a-z]:[\\/]|\\\\)/iu.test(options.outputFolder.trim())) {
    throw new Error("当前运行应用的电脑不支持 Windows 磁盘路径。");
  }
  const outputFolder = path.resolve(options.outputFolder.trim());
  const previous = options.previous;
  const matches = previous?.runId === options.runId && previous.nodeId === options.nodeId
    && previous.outputFolder === outputFolder && previous.filenamePrefix === options.filenamePrefix
    && previous.items.length === options.urls.length && previous.items.every((item, index) => item.url === options.urls[index]);
  const metadata: CanvasSaveImagesMetadata = matches ? structuredClone(previous) : {
    runId: options.runId, nodeId: options.nodeId, outputFolder, filenamePrefix: options.filenamePrefix,
    items: options.urls.map((url) => ({ url, status: "pending" })),
  };
  const checkpoint = () => options.checkpoint(structuredClone(metadata));
  await checkpoint();
  let nextOrdinal = 1;
  try {
    await mkdir(outputFolder, { recursive: true });
    for (const name of await readdir(outputFolder)) {
      if (!name.startsWith(`${options.filenamePrefix}_`)) continue;
      const suffix = name.slice(options.filenamePrefix.length + 1).match(/^(\d+)\.[a-z0-9]+$/iu);
      if (suffix) nextOrdinal = Math.max(nextOrdinal, Number(suffix[1]) + 1);
    }
  } catch (error) {
    const message = filesystemMessage(error);
    for (const item of metadata.items) { item.status = "failed"; item.error = message; }
    await checkpoint();
    return metadata;
  }

  for (const item of metadata.items) {
    let materialized: Awaited<ReturnType<typeof materializeRuntimeMedia>> | undefined;
    // Checkpoint failures must stop execution, rather than becoming ordinary image failures.
    let checkpointError: unknown;
    const persist = async () => {
      try { await checkpoint(); } catch (error) { checkpointError = error; throw error; }
    };
    try {
      if (item.claimed && item.filePath && item.sha256 && path.dirname(item.filePath) === outputFolder
        && await matchesSavedFile(item.filePath, item.sha256)) {
        item.status = "saved";
        delete item.error;
        await persist();
        continue;
      }
      materialized = await materializeRuntimeMedia(item.url, { maxBytes: CANVAS_IMAGE_DOWNLOAD_MAX_BYTES, kind: "image" });
      const inspected = await inspectCanvasImageDownload(materialized.filePath);
      const bytes = await readFile(materialized.filePath);
      if (bytes.length > CANVAS_IMAGE_DOWNLOAD_MAX_BYTES || bytes.length !== inspected.size) throw new Error("图片在保存前发生变化，请重试。");
      item.sha256 = hash(bytes);
      item.status = "pending";
      delete item.error;
      for (let ordinal = nextOrdinal; ; ordinal += 1) {
        if (!Number.isSafeInteger(ordinal)) throw new Error("图片编号超出范围。");
        item.filePath = path.join(outputFolder, `${options.filenamePrefix}_${String(ordinal).padStart(4, "0")}${inspected.extension}`);
        item.claimed = false;
        await persist();
        let handle;
        try { handle = await open(item.filePath, "wx"); } catch (error) {
          if (hasCode(error, "EEXIST")) continue;
          throw error;
        }
        try {
          item.claimed = true;
          await persist();
          await handle.writeFile(bytes);
          await handle.sync();
        } catch (error) {
          await handle.close();
          await unlink(item.filePath);
          throw error;
        }
        await handle.close();
        nextOrdinal = ordinal + 1;
        item.status = "saved";
        await persist();
        break;
      }
    } catch (error) {
      if (checkpointError) throw checkpointError;
      item.status = "failed";
      item.error = filesystemMessage(error);
      await checkpoint();
    } finally {
      await materialized?.cleanup();
    }
  }
  return metadata;
}

async function matchesSavedFile(filePath: string, sha256: string) {
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.size > CANVAS_IMAGE_DOWNLOAD_MAX_BYTES) return false;
    return hash(await readFile(filePath)) === sha256;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

function filesystemMessage(error: unknown) {
  if (hasCode(error, "EACCES") || hasCode(error, "EPERM")) return "没有权限写入或读取保存目录，请选择有写入权限的文件夹。";
  if (hasCode(error, "ENOSPC")) return "保存目录所在磁盘空间不足。";
  if (hasCode(error, "ENOTDIR") || hasCode(error, "EEXIST")) return "保存目录路径指向了文件，请选择文件夹。";
  return error instanceof Error ? error.message : "图片保存失败。";
}
