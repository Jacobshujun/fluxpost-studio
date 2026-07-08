import type { NormalizedSourceItem } from "./types";

export function resolveSourceVideoUrls(source: NormalizedSourceItem) {
  const preferred = firstNonEmptyString([source.downloadedVideoUrl, source.videoUrl]);
  return preferred ? [preferred] : [];
}

export function hasSourceVideoReference(source: NormalizedSourceItem) {
  return resolveSourceVideoUrls(source).length > 0;
}

export function isSourceVideoLike(source: NormalizedSourceItem) {
  return Boolean(
    source.mediaType === "video" ||
      source.mediaType === "mixed" ||
      source.videoUrl ||
      source.downloadedVideoUrl ||
      source.mediaCache?.videoPresent,
  );
}

function firstNonEmptyString(values: Array<string | undefined>) {
  return values.map((value) => (typeof value === "string" ? value.trim() : "")).find(Boolean) || "";
}
