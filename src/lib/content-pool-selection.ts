import type {
  ContentPoolSelectionFilter,
  ContentPoolSelectionItem,
  ContentPoolSelectionPage,
  ContentPoolSelectionProject,
  ContentPoolSelectionSort,
  ContentProject,
  ContentTag,
  NormalizedSourceItem,
  SourceMediaType,
  SourceUsageStatus,
} from "./types";
import { matchesAllContentPoolCustomTags, normalizeContentPoolCustomTags } from "./content-pool-tags";

export const CONTENT_POOL_SELECTION_PAGE_LIMIT = 40;
export const CONTENT_POOL_SELECTION_MAX_LIMIT = 100;

type ContentPoolSelectionCursor = {
  sort: ContentPoolSelectionSort;
  projectId: string;
  itemId: string;
};

export function normalizeContentPoolSelectionFilter(input: Partial<ContentPoolSelectionFilter> = {}): ContentPoolSelectionFilter {
  return {
    projectId: cleanString(input.projectId) || undefined,
    query: cleanString(input.query),
    platforms: uniqueValues(input.platforms),
    statuses: uniqueValues(input.statuses),
    mediaTypes: uniqueValues(input.mediaTypes),
    contentTags: uniqueValues(input.contentTags),
    customTags: normalizeContentPoolCustomTags(input.customTags),
    localMediaComplete: input.localMediaComplete === true,
    sort: input.sort === "published-desc" || input.sort === "crawled-desc" ? input.sort : "hot-desc",
  };
}

export function selectContentPoolItems(projects: ContentProject[], input: Partial<ContentPoolSelectionFilter> = {}) {
  const filter = normalizeContentPoolSelectionFilter(input);
  const query = filter.query.normalize("NFKC").toLocaleLowerCase();
  const seen = new Set<string>();
  const items = projects.flatMap((project) => project.items.flatMap((item) => {
    if (seen.has(item.id)) return [];
    if (filter.projectId && project.id !== filter.projectId) return [];
    if (filter.platforms.length && !filter.platforms.includes(item.platform)) return [];
    const status = item.poolStatus || "new";
    if (filter.statuses.length && !filter.statuses.includes(status)) return [];
    const mediaType = normalizeMediaType(item.mediaType);
    if (filter.mediaTypes.length && !filter.mediaTypes.includes(mediaType)) return [];
    const contentTags = item.contentTagging?.tags || [];
    if (filter.contentTags.length && !filter.contentTags.every((tag) => contentTags.includes(tag))) return [];
    const customTags = normalizeContentPoolCustomTags(item.customTags);
    if (!matchesAllContentPoolCustomTags(customTags, filter.customTags)) return [];
    if (filter.localMediaComplete && item.mediaCache?.status !== "local_complete") return [];
    if (query && ![item.title, item.contentText, item.authorName, item.sourceId, ...customTags]
      .some((value) => String(value || "").normalize("NFKC").toLocaleLowerCase().includes(query))) return [];
    seen.add(item.id);
    return [contentPoolSelectionItem(project, item, status, mediaType, contentTags, customTags)];
  }));
  return items.sort(contentPoolSelectionComparator(filter.sort));
}

export function paginateContentPoolSelection(
  items: ContentPoolSelectionItem[],
  projects: ContentPoolSelectionProject[],
  sort: ContentPoolSelectionSort,
  cursor?: string,
  requestedLimit = CONTENT_POOL_SELECTION_PAGE_LIMIT,
): ContentPoolSelectionPage {
  const limit = Math.min(CONTENT_POOL_SELECTION_MAX_LIMIT, Math.max(1, Math.trunc(requestedLimit) || CONTENT_POOL_SELECTION_PAGE_LIMIT));
  const decoded = cursor ? decodeContentPoolSelectionCursor(cursor) : undefined;
  const start = decoded && decoded.sort === sort
    ? Math.max(0, items.findIndex((item) => item.projectId === decoded.projectId && item.id === decoded.itemId) + 1)
    : 0;
  const pageItems = items.slice(start, start + limit);
  const last = pageItems.at(-1);
  return {
    items: pageItems,
    projects,
    total: items.length,
    nextCursor: last && start + pageItems.length < items.length
      ? encodeContentPoolSelectionCursor({ sort, projectId: last.projectId, itemId: last.id })
      : undefined,
  };
}

export function contentPoolSelectionProjects(projects: ContentProject[]): ContentPoolSelectionProject[] {
  return projects.map((project) => ({ id: project.id, name: project.query, totalItems: project.items.length }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id));
}

export function encodeContentPoolSelectionCursor(cursor: ContentPoolSelectionCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeContentPoolSelectionCursor(cursor: string): ContentPoolSelectionCursor | undefined {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ContentPoolSelectionCursor>;
    if (!value.projectId || !value.itemId || !["hot-desc", "published-desc", "crawled-desc"].includes(String(value.sort))) return undefined;
    return value as ContentPoolSelectionCursor;
  } catch {
    return undefined;
  }
}

export function freezeContentPoolSelectionItem(item: ContentPoolSelectionItem, snapshotAt = new Date().toISOString()) {
  return {
    id: item.id,
    projectId: item.projectId,
    projectName: item.projectName,
    platform: item.platform,
    title: item.title,
    body: item.body,
    sourceUrl: item.sourceUrl,
    imageUrls: [...item.imageUrls],
    videoUrls: [...item.videoUrls],
    snapshotAt,
  };
}

export function freezeContentPoolSelectionItemsByIds(
  items: ContentPoolSelectionItem[],
  sourceItemIds: string[],
  snapshotAt = new Date().toISOString(),
) {
  const ids = Array.from(new Set(sourceItemIds.map(cleanString).filter(Boolean)));
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    values: ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [freezeContentPoolSelectionItem(item, snapshotAt)] : [];
    }),
    missingIds: ids.filter((id) => !byId.has(id)),
  };
}

function contentPoolSelectionItem(
  project: ContentProject,
  item: NormalizedSourceItem,
  status: SourceUsageStatus,
  mediaType: SourceMediaType,
  contentTags: ContentTag[],
  customTags: string[],
): ContentPoolSelectionItem {
  const downloadedImages = uniqueStrings(item.downloadedImages);
  const imageUrls = downloadedImages.length ? downloadedImages : uniqueStrings(item.images);
  const videoUrls = uniqueStrings(item.downloadedVideoUrl ? [item.downloadedVideoUrl] : item.videoUrl ? [item.videoUrl] : []);
  return {
    id: item.id,
    projectId: project.id,
    projectName: project.query,
    platform: item.platform,
    status,
    mediaType,
    contentTags: [...contentTags],
    customTags: [...customTags],
    title: item.title || "",
    body: item.contentText || "",
    authorName: item.authorName || "",
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl || "",
    imageUrls,
    videoUrls,
    thumbnailUrl: imageUrls[0],
    hotScore: Number(item.hotScore) || 0,
    publishedAt: item.publishedAt,
    crawledAt: item.crawledAt,
    localMediaComplete: item.mediaCache?.status === "local_complete",
  };
}

function contentPoolSelectionComparator(sort: ContentPoolSelectionSort) {
  return (left: ContentPoolSelectionItem, right: ContentPoolSelectionItem) => {
    const primary = sort === "hot-desc"
      ? right.hotScore - left.hotScore
      : timestamp(sort === "published-desc" ? right.publishedAt : right.crawledAt)
        - timestamp(sort === "published-desc" ? left.publishedAt : left.crawledAt);
    return primary || left.projectId.localeCompare(right.projectId) || left.id.localeCompare(right.id);
  };
}

function normalizeMediaType(value?: NormalizedSourceItem["mediaType"]): SourceMediaType {
  return value === "video" || value === "image" || value === "text" || value === "mixed" ? value : "unknown";
}

function uniqueValues<T extends string>(values?: T[]) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanString).filter(Boolean))) as T[];
}

function uniqueStrings(values?: string[]) {
  return Array.from(new Set((values || []).map(cleanString).filter(Boolean)));
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
