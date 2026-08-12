import type { CanvasNodeConfig, CanvasSourceVideoSnapshot } from "./types";

export const defaultCanvasSourceVideoProjectName = "视频内容重构";

const snapshotKeys = [
  "sourceItemId",
  "sourcePlatform",
  "sourceTitle",
  "sourceVideoUrl",
  "sourceDurationSeconds",
  "sourceWidth",
  "sourceHeight",
  "sourceResolvedAt",
  "resolvedSourceUrl",
  "resolvedProjectName",
] as const;

export function canvasSourceVideoSnapshotConfig(source: CanvasSourceVideoSnapshot): CanvasNodeConfig {
  return {
    sourceUrl: source.sourceUrl,
    projectName: source.projectName,
    sourceItemId: source.id,
    sourcePlatform: source.platform,
    sourceTitle: source.title || "",
    sourceVideoUrl: source.url,
    sourceDurationSeconds: source.durationSeconds,
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceResolvedAt: source.resolvedAt,
    resolvedSourceUrl: source.sourceUrl,
    resolvedProjectName: source.projectName,
  };
}

export function clearCanvasSourceVideoSnapshot(config: CanvasNodeConfig): CanvasNodeConfig {
  const next = { ...config };
  for (const key of snapshotKeys) delete next[key];
  return next;
}

export function canvasSourceVideoSnapshotFromConfig(config: CanvasNodeConfig): CanvasSourceVideoSnapshot | undefined {
  const id = String(config.sourceItemId || "").trim();
  const projectName = String(config.resolvedProjectName || "").trim();
  const sourceUrl = String(config.resolvedSourceUrl || "").trim();
  const platform = String(config.sourcePlatform || "").trim() as CanvasSourceVideoSnapshot["platform"];
  const url = String(config.sourceVideoUrl || "").trim();
  const durationSeconds = Number(config.sourceDurationSeconds);
  const width = Number(config.sourceWidth);
  const height = Number(config.sourceHeight);
  const resolvedAt = String(config.sourceResolvedAt || "").trim();
  if (!id || !projectName || !sourceUrl || !platform || !url || !resolvedAt) return undefined;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return undefined;
  return {
    id,
    projectName,
    sourceUrl,
    platform,
    title: String(config.sourceTitle || "").trim() || undefined,
    url,
    durationSeconds,
    width,
    height,
    resolvedAt,
  };
}

export function isCanvasSourceVideoSnapshotCurrent(config: CanvasNodeConfig) {
  const snapshot = canvasSourceVideoSnapshotFromConfig(config);
  return Boolean(snapshot
    && snapshot.sourceUrl === String(config.sourceUrl || "").trim()
    && snapshot.projectName === String(config.projectName || "").trim());
}

export function isCanvasSourceVideoSnapshot(value: unknown): value is CanvasSourceVideoSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<CanvasSourceVideoSnapshot>;
  return typeof candidate.id === "string" && Boolean(candidate.id.trim())
    && typeof candidate.projectName === "string" && Boolean(candidate.projectName.trim())
    && typeof candidate.sourceUrl === "string" && /^https?:\/\//i.test(candidate.sourceUrl)
    && typeof candidate.platform === "string" && Boolean(candidate.platform)
    && typeof candidate.url === "string" && Boolean(candidate.url.trim())
    && typeof candidate.durationSeconds === "number" && Number.isFinite(candidate.durationSeconds) && candidate.durationSeconds > 0
    && typeof candidate.width === "number" && Number.isInteger(candidate.width) && candidate.width > 0
    && typeof candidate.height === "number" && Number.isInteger(candidate.height) && candidate.height > 0
    && typeof candidate.resolvedAt === "string" && Boolean(candidate.resolvedAt.trim());
}
