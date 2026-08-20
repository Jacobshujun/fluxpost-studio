import type { CanvasNodeConfig, CanvasVideoSnapshot } from "./types";

export const MAX_CANVAS_VIDEO_LOADER_ITEMS = 200;
export const MAX_CANVAS_VIDEO_BYTES = 512 * 1024 * 1024;
export const canvasVideoMimeTypes = ["video/mp4", "video/quicktime", "video/webm"] as const;

export function normalizeCanvasVideoSnapshot(value: unknown): CanvasVideoSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const mimeType = String(value.mimeType || "") as CanvasVideoSnapshot["mimeType"];
  const uploadedAt = String(value.uploadedAt || "");
  const snapshot: CanvasVideoSnapshot = {
    id: String(value.id || "").trim(),
    filename: String(value.filename || "").trim(),
    url: String(value.url || "").trim(),
    mimeType,
    bytes: Number(value.bytes),
    durationSeconds: Number(value.durationSeconds),
    width: Number(value.width),
    height: Number(value.height),
    hasAudio: value.hasAudio === true,
    uploadedAt,
  };
  if (!snapshot.id || snapshot.id.length > 160 || !snapshot.filename || snapshot.filename.length > 255 || !snapshot.url) return undefined;
  if (!canvasVideoMimeTypes.includes(mimeType)) return undefined;
  if (!Number.isSafeInteger(snapshot.bytes) || snapshot.bytes <= 0 || snapshot.bytes > MAX_CANVAS_VIDEO_BYTES) return undefined;
  if (!Number.isFinite(snapshot.durationSeconds) || snapshot.durationSeconds <= 0) return undefined;
  if (!Number.isInteger(snapshot.width) || snapshot.width <= 0 || !Number.isInteger(snapshot.height) || snapshot.height <= 0) return undefined;
  if (!Number.isFinite(Date.parse(uploadedAt))) return undefined;
  return snapshot;
}

export function canvasVideoSnapshotsFromConfig(config: CanvasNodeConfig) {
  const values = Array.isArray(config.videos) ? config.videos : [];
  const unique = new Map<string, CanvasVideoSnapshot>();
  for (const value of values) {
    const snapshot = normalizeCanvasVideoSnapshot(value);
    if (snapshot && !unique.has(snapshot.id)) unique.set(snapshot.id, snapshot);
  }
  return Array.from(unique.values()).slice(0, MAX_CANVAS_VIDEO_LOADER_ITEMS);
}

export function canvasVideoLoaderConfig(values: unknown[], selectedVideoId?: string): CanvasNodeConfig {
  const videos = canvasVideoSnapshotsFromConfig({ videos: values as CanvasVideoSnapshot[] });
  const selected = videos.find((video) => video.id === selectedVideoId) || videos[0];
  return { videos, selectedVideoId: selected?.id || "" };
}

export function selectedCanvasVideo(config: CanvasNodeConfig) {
  const videos = canvasVideoSnapshotsFromConfig(config);
  return videos.find((video) => video.id === String(config.selectedVideoId || ""));
}

export function validateCanvasVideoLoaderConfig(config: CanvasNodeConfig) {
  const rawVideos = Array.isArray(config.videos) ? config.videos : [];
  const errors: string[] = [];
  if (!rawVideos.length) errors.push("视频加载节点至少需要一个视频。");
  if (rawVideos.length > MAX_CANVAS_VIDEO_LOADER_ITEMS) errors.push(`视频加载节点最多支持 ${MAX_CANVAS_VIDEO_LOADER_ITEMS} 个视频。`);
  const videos = canvasVideoSnapshotsFromConfig(config);
  if (rawVideos.length && videos.length !== rawVideos.length) errors.push("视频加载节点包含无效或重复的视频快照。");
  if (videos.length && !selectedCanvasVideo(config)) errors.push("视频加载节点需要选择一个当前视频。");
  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
