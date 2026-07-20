import { filterAlignedDownloadedImages, normalizeContentImageUrls } from "./media-url-filter";
import { isManagedRuntimeMediaUrl } from "./runtime-media-storage";
import type { NormalizedSourceItem, SourceMediaCacheStatus } from "./types";

export function buildMediaCacheStatus(item: NormalizedSourceItem, updatedAt?: string): SourceMediaCacheStatus {
  const sourceImages = normalizeContentImageUrls(item.images || []);
  const alignedLocalImages = sourceImages.length
    ? filterAlignedDownloadedImages(item.downloadedImages, sourceImages) || []
    : item.downloadedImages || [];
  const localImages = Array.from(new Set(alignedLocalImages.filter(isDurableCachedMediaUrl)));
  const videoPresent = Boolean(
    item.videoUrl ||
      item.downloadedVideoUrl ||
      item.videoFrames?.length ||
      item.mediaType === "video" ||
      item.mediaType === "mixed",
  );
  const localVideo = Boolean(item.downloadedVideoUrl && isDurableCachedMediaUrl(item.downloadedVideoUrl));
  const frameCount = item.videoFrames?.filter((frame) => isDurableCachedMediaUrl(frame.url)).length || 0;
  const errorCount = item.downloadErrors?.length || 0;
  const remoteImages = Math.max(sourceImages.length - localImages.length, 0);
  const hasMedia = sourceImages.length > 0 || videoPresent;
  const localAssetCount = localImages.length + (localVideo ? 1 : 0) + frameCount;
  const imagesComplete = sourceImages.length === 0 || localImages.length >= sourceImages.length;
  const videoComplete = !videoPresent || localVideo;

  return {
    status: resolveMediaCacheState({
      hasMedia,
      localAssetCount,
      imagesComplete,
      videoComplete,
      errorCount,
    }),
    imageTotal: sourceImages.length,
    localImages: localImages.length,
    remoteImages,
    videoPresent,
    localVideo,
    frameCount,
    errorCount,
    errors: (item.downloadErrors || []).slice(0, 6),
    updatedAt: updatedAt || item.mediaCache?.updatedAt || item.crawledAt || item.lastSeenAt,
  };
}

function resolveMediaCacheState({
  hasMedia,
  localAssetCount,
  imagesComplete,
  videoComplete,
  errorCount,
}: {
  hasMedia: boolean;
  localAssetCount: number;
  imagesComplete: boolean;
  videoComplete: boolean;
  errorCount: number;
}): SourceMediaCacheStatus["status"] {
  if (!hasMedia) return "none";
  if (imagesComplete && videoComplete && errorCount === 0) return "local_complete";
  if (localAssetCount > 0) return "partial";
  if (errorCount > 0) return "failed";
  return "remote_only";
}

function isLocalAppMediaUrl(url?: string) {
  return Boolean(url && (url.startsWith("/media/") || url.startsWith("/generated/")));
}

function isDurableCachedMediaUrl(url?: string) {
  return isLocalAppMediaUrl(url) || isManagedRuntimeMediaUrl(url);
}
