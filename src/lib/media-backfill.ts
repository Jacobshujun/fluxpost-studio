import { readContentProjectsFromDb, writeContentProjectsToDb } from "./database";
import { cacheCrawledMedia } from "./media-cache";
import { buildMediaCacheStatus } from "./media-cache-status";
import { replaceVideoFrameUrlsInMediaUrls, selectBestVideoHighlightFrames } from "./video-frame-policy";
import { canAccessWorkspaceOwner, type WorkspaceAccessActor } from "./workspace-ownership";
import type { NormalizedSourceItem } from "./types";

export async function backfillSourceItemMedia(sourceItemIds: string[], account?: WorkspaceAccessActor) {
  const ids = makeUniqueIds(sourceItemIds);
  const selectedIds = new Set(ids);
  const foundIds = new Set<string>();
  const projects = await readContentProjectsFromDb();
  const now = new Date().toISOString();
  const itemsToCache: NormalizedSourceItem[] = [];

  projects.forEach((project) => {
    project.items.forEach((item) => {
      if (selectedIds.has(item.id) && canMutateWorkspaceContent(account, item)) {
        foundIds.add(item.id);
        itemsToCache.push(item);
      }
    });
  });

  if (!itemsToCache.length) {
    return {
      items: [] as NormalizedSourceItem[],
      requestedCount: ids.length,
      updatedCount: 0,
      notFoundIds: ids,
      localImages: 0,
      remoteImages: 0,
      localVideos: 0,
      videoFrames: 0,
      errorCount: 0,
    };
  }

  const cachedItems = await cacheCrawledMedia(itemsToCache);
  const cachedById = new Map(cachedItems.map((item) => [item.id, item]));
  const updatedItems = new Map<string, NormalizedSourceItem>();

  const nextProjects = projects.map((project) => {
    let changed = false;
    const items = project.items.map((item) => {
      const cachedItem = cachedById.get(item.id);
      if (!cachedItem) return item;
      changed = true;

      const downloadedImages = cachedItem.downloadedImages?.length
        ? cachedItem.downloadedImages
        : item.downloadedImages;
      const downloadedVideoUrl = cachedItem.downloadedVideoUrl || item.downloadedVideoUrl;
      const selectedVideoFrames = selectBestVideoHighlightFrames(cachedItem.videoFrames?.length ? cachedItem.videoFrames : item.videoFrames);
      const videoFrames = selectedVideoFrames.length ? selectedVideoFrames : undefined;
      const nextItem: NormalizedSourceItem = {
        ...item,
        downloadedImages,
        downloadedVideoUrl,
        videoFrames,
        downloadErrors: cachedItem.downloadErrors,
        mediaUrls: replaceVideoFrameUrlsInMediaUrls(
          mergeStringArrays(
            item.mediaUrls,
            cachedItem.mediaUrls,
            downloadedImages,
            downloadedVideoUrl ? [downloadedVideoUrl] : undefined,
          ),
          videoFrames,
        ),
        lastSeenAt: item.lastSeenAt || now,
      };
      const withStatus = {
        ...nextItem,
        mediaCache: buildMediaCacheStatus(nextItem, now),
      };
      updatedItems.set(withStatus.id, withStatus);
      return withStatus;
    });
    return changed ? { ...project, items, updatedAt: now } : project;
  });

  if (updatedItems.size) await writeContentProjectsToDb(nextProjects);

  const updated = Array.from(updatedItems.values());
  return {
    items: updated,
    requestedCount: ids.length,
    updatedCount: updated.length,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
    localImages: updated.reduce((sum, item) => sum + (item.mediaCache?.localImages || 0), 0),
    remoteImages: updated.reduce((sum, item) => sum + (item.mediaCache?.remoteImages || 0), 0),
    localVideos: updated.filter((item) => item.mediaCache?.localVideo).length,
    videoFrames: updated.reduce((sum, item) => sum + (item.mediaCache?.frameCount || 0), 0),
    errorCount: updated.reduce((sum, item) => sum + (item.mediaCache?.errorCount || 0), 0),
  };
}

function mergeStringArrays(...groups: Array<string[] | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group || []).filter(Boolean)));
}

function makeUniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function canMutateWorkspaceContent(account: WorkspaceAccessActor | undefined, item: NormalizedSourceItem) {
  if (!account) return true;
  return canAccessWorkspaceOwner(account, item.ownerUserId);
}
