import type { NormalizedSourceItem } from "./types";
import { mergeDownloadedAndRemoteImages } from "./media-url-filter";

export const manualSourceFields = ["title", "contentText", "images"] as const;

// Keep this order authoritative, including an explicitly empty image list.
export function preserveManualSourceFields(previous: NormalizedSourceItem, incoming: NormalizedSourceItem): NormalizedSourceItem {
  const next = { ...incoming, manualEditedFields: previous.manualEditedFields };
  for (const field of previous.manualEditedFields || []) {
    if (field === "images") {
      next.images = previous.images;
      next.downloadedImages = previous.downloadedImages;
      next.visualTagging = previous.visualTagging;
      next.mediaUrls = [...new Set([
        ...previous.images, ...(previous.downloadedImages || []),
        ...(next.videoFrames || []).map((frame) => frame.url),
        ...[next.videoUrl, next.downloadedVideoUrl].filter((url): url is string => Boolean(url)),
      ])];
    } else next[field] = previous[field];
  }
  return next;
}

export function applyManualSourceImages(item: NormalizedSourceItem, images: string[]): NormalizedSourceItem {
  const displayed = mergeDownloadedAndRemoteImages(item.downloadedImages, item.images);
  const tags = item.visualTagging?.assets.flatMap((asset) => {
    if (asset.kind !== "image") return [asset];
    const oldIndex = displayed.indexOf(asset.url);
    const sourceUrl = oldIndex >= 0 ? item.images[oldIndex] : asset.url;
    const index = images.indexOf(sourceUrl);
    return index < 0 ? [] : [{ ...asset, id: `image-${index + 1}`, index, url: images[index], localPath: undefined }];
  });
  return {
    ...item, images, downloadedImages: undefined,
    mediaUrls: [...new Set([
      ...images, ...(item.videoFrames || []).map((frame) => frame.url),
      ...[item.videoUrl, item.downloadedVideoUrl].filter((url): url is string => Boolean(url)),
    ])],
    visualTagging: item.visualTagging ? { ...item.visualTagging, assets: tags || [] } : undefined,
  };
}

export function validateManualSourcePatch(patch: Partial<NormalizedSourceItem>) {
  for (const field of ["title", "contentText"] as const) {
    if (patch[field] !== undefined && typeof patch[field] !== "string") throw new Error(`${field} must be text`);
  }
  if (patch.images !== undefined && (!Array.isArray(patch.images) || patch.images.some((url) =>
    typeof url !== "string" || !/^(https?:\/\/|\/generated\/|\/media\/)/i.test(url) || /[\r\n]/.test(url)))) {
    throw new Error("Images must contain valid image URLs");
  }
}
