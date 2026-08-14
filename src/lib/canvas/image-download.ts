import { open, stat } from "node:fs/promises";
import { sniffImageFormat } from "../image-format";
import {
  CANVAS_IMAGE_DOWNLOAD_MAX_BYTES,
  CANVAS_SAVE_IMAGE_MAX_ITEMS,
  validateCanvasImageFilenamePrefix,
} from "./save-images";
import type { CanvasRunWithNodes } from "./types";

export class CanvasImageDownloadError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
    super(message);
    this.name = "CanvasImageDownloadError";
  }
}

export function resolveCanvasImageDownload(result: CanvasRunWithNodes, nodeRunId: string, index: number) {
  if (!nodeRunId.trim() || !Number.isSafeInteger(index) || index < 0) {
    throw new CanvasImageDownloadError("Canvas image download parameters are invalid.", 400);
  }
  const nodeRun = result.nodeRuns.find((candidate) => candidate.id === nodeRunId && candidate.runId === result.run.id);
  if (!nodeRun || nodeRun.nodeType !== "utility.save-images") {
    throw new CanvasImageDownloadError("Canvas image download result was not found.", 404);
  }
  const node = result.run.graphSnapshot.nodes.find((candidate) => candidate.id === nodeRun.nodeId);
  if (!node || node.type !== "utility.save-images") {
    throw new CanvasImageDownloadError("Canvas image download result was not found.", 404);
  }
  if (nodeRun.status !== "completed" && nodeRun.status !== "reused") {
    throw new CanvasImageDownloadError("Canvas image download result is not complete.", 400);
  }
  const artifact = nodeRun.outputs.downloads;
  if (artifact?.kind !== "images" || !artifact.items.length || artifact.items.length > CANVAS_SAVE_IMAGE_MAX_ITEMS) {
    throw new CanvasImageDownloadError("Canvas image download result is invalid.", 400);
  }
  const item = artifact.items[index];
  if (!item?.url?.trim()) throw new CanvasImageDownloadError("Canvas image download index is out of range.", 400);
  const prefixError = validateCanvasImageFilenamePrefix(node.config.filenamePrefix);
  if (prefixError) throw new CanvasImageDownloadError(prefixError, 400);
  return {
    url: item.url.trim(),
    filenamePrefix: String(node.config.filenamePrefix),
    ordinal: index + 1,
  };
}

export async function inspectCanvasImageDownload(filePath: string) {
  const file = await stat(filePath).catch(() => undefined);
  if (!file?.isFile() || !file.size) throw new CanvasImageDownloadError("Canvas image download file is empty.", 400);
  if (file.size > CANVAS_IMAGE_DOWNLOAD_MAX_BYTES) {
    throw new CanvasImageDownloadError(`Canvas image download exceeds the ${CANVAS_IMAGE_DOWNLOAD_MAX_BYTES} byte limit.`, 400);
  }
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const format = sniffImageFormat(header.subarray(0, bytesRead));
    if (!format) throw new CanvasImageDownloadError("Canvas image download is not a recognized image.", 400);
    return { size: file.size, mimeType: format.mimeType, extension: format.extension };
  } finally {
    await handle.close();
  }
}
