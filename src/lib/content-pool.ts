import { filterAlignedDownloadedImages, isLikelyNonContentImageUrl, normalizeContentImageUrls } from "./media-url-filter";
import { readContentProjectsFromDb, writeContentProjectsToDb } from "./database";
import { buildMediaCacheStatus } from "./media-cache-status";
import { buildProductionPlan } from "./production-plan";
import { updateSourceContentTags, updateSourceVisualTags } from "./source-tagging";
import { enrichSourceTimestamps } from "./source-timestamps";
import { extractDouyinCarouselImageUrls } from "./douyin-media";
import { replaceVideoFrameUrlsInMediaUrls, selectBestVideoHighlightFrames } from "./video-frame-policy";
import {
  accessActorFromOwner,
  applyWorkspaceOwner,
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  scopeWorkspaceOwner,
  type WorkspaceAccessActor,
} from "./workspace-ownership";
import type { ContentPoolSnapshot, ContentProject, GeneratedPost, NormalizedSourceItem, Platform, SourceUsageStatus, ViralAnalysis } from "./types";

type StoredContentPool = {
  projects: ContentProject[];
};

const sourceRewriteMaxAttempts = 3;
const sourceRewriteRetryDelayMs = 35;

export async function getContentPoolSnapshot(query?: string, account?: WorkspaceAccessActor): Promise<ContentPoolSnapshot> {
  const pool = await readPool();
  const projects = filterWorkspaceOwnedRecords(pool.projects.map(refreshProjectStats), account).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const matchedProject = query
    ? projects.find((project) => project.normalizedQuery === normalizeProjectKey(query, project.ownerUserId) || normalizeQuery(project.query) === normalizeQuery(query))
    : undefined;
  const activeProject = matchedProject || projects[0];
  return { projects, activeProject };
}

export async function getSourceItemsByIds(sourceItemIds: string[], account?: WorkspaceAccessActor) {
  if (!sourceItemIds.length) return [];
  const pool = await readPool();
  const projects = filterWorkspaceOwnedRecords(pool.projects.map(refreshProjectStats), account);
  const itemsById = new Map<string, NormalizedSourceItem>();
  projects.forEach((project) => {
    project.items.forEach((item) => {
      if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    });
  });
  return sourceItemIds.map((id) => itemsById.get(id)).filter((item): item is NormalizedSourceItem => Boolean(item));
}

export async function ingestCrawlItems(query: string, items: NormalizedSourceItem[], account?: WorkspaceAccessActor) {
  const pool = await readPool();
  const now = new Date().toISOString();
  const owner = account ? scopeWorkspaceOwner(account) : undefined;
  const normalizedQuery = normalizeProjectKey(query, owner?.ownerUserId);
  const project = ensureProject(pool, query, normalizedQuery, now, owner);

  project.query = query;
  project.updatedAt = now;
  project.lastCrawledAt = now;
  if (owner) Object.assign(project, owner);

  const existing = new Map(project.items.map((item) => [item.id, item]));
  for (const item of items) {
    const enrichedItem = applyWorkspaceOwner(enrichSourceTimestamps(item, now), account, item);
    const previous = existing.get(enrichedItem.id);
    if (previous) {
      const downloadedImages = enrichedItem.downloadedImages?.length ? enrichedItem.downloadedImages : previous.downloadedImages;
      const downloadedVideoUrl = enrichedItem.downloadedVideoUrl || previous.downloadedVideoUrl;
      const videoFrames = normalizeVideoFrames(enrichedItem.videoFrames?.length ? enrichedItem.videoFrames : previous.videoFrames);
      const downloadErrors = mergeStringArrays(previous.downloadErrors, enrichedItem.downloadErrors);
      const contentTagging = shouldKeepManualContentTagging(previous)
        ? previous.contentTagging
        : chooseContentTagging(enrichedItem, previous);
      const visualTagging = shouldKeepManualVisualTagging(previous)
        ? previous.visualTagging
        : chooseVisualTagging(enrichedItem, previous);
      const nextItem: NormalizedSourceItem = {
        ...previous,
        ...enrichedItem,
        downloadedImages,
        downloadedVideoUrl,
        videoFrames,
        productionPlan: buildProductionPlan(enrichedItem),
        downloadErrors: downloadErrors.length ? downloadErrors : undefined,
        mediaUrls: replaceVideoFrameUrlsInMediaUrls(
          mergeStringArrays(
            previous.mediaUrls,
            enrichedItem.mediaUrls,
            downloadedImages,
            downloadedVideoUrl ? [downloadedVideoUrl] : undefined,
          ),
          videoFrames,
        ),
        poolStatus: previous.poolStatus || "new",
        hotScore: calculateHotScore(enrichedItem),
        crawledAt: now,
        publishedAt: enrichedItem.publishedAt || previous.publishedAt,
        publishedLabel: enrichedItem.publishedLabel || previous.publishedLabel,
        firstSeenAt: previous.firstSeenAt || enrichedItem.firstSeenAt || now,
        lastSeenAt: now,
        usedCount: previous.usedCount || 0,
        analysis: previous.analysis || analyzeSourceItem(enrichedItem),
        contentTagging,
        visualTagging,
      };
      existing.set(enrichedItem.id, {
        ...nextItem,
        mediaCache: buildMediaCacheStatus(nextItem, now),
      });
    } else {
      const videoFrames = normalizeVideoFrames(enrichedItem.videoFrames);
      const nextItem: NormalizedSourceItem = {
        ...enrichedItem,
        videoFrames,
        mediaUrls: replaceVideoFrameUrlsInMediaUrls(enrichedItem.mediaUrls, videoFrames),
        poolStatus: "new",
        hotScore: calculateHotScore(enrichedItem),
        crawledAt: now,
        firstSeenAt: enrichedItem.firstSeenAt || now,
        lastSeenAt: now,
        usedCount: 0,
        analysis: analyzeSourceItem(enrichedItem),
        productionPlan: buildProductionPlan(enrichedItem),
      };
      existing.set(enrichedItem.id, {
        ...nextItem,
        mediaCache: buildMediaCacheStatus(nextItem, now),
      });
    }
  }

  project.items = Array.from(existing.values()).sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
  Object.assign(project, refreshProjectStats(project));
  await writePool(pool);
  return project;
}

export async function createSourceItem(query: string, item: Omit<NormalizedSourceItem, "id" | "sourceId" | "crawledAt" | "firstSeenAt" | "lastSeenAt" | "poolStatus" | "hotScore" | "usedCount" | "analysis" | "productionPlan"> & {
  id?: string;
  sourceId?: string;
  poolStatus?: SourceUsageStatus;
}, account?: WorkspaceAccessActor) {
  const pool = await readPool();
  const now = new Date().toISOString();
  const owner = account ? scopeWorkspaceOwner(account) : undefined;
  const normalizedQuery = normalizeProjectKey(query, owner?.ownerUserId);
  const project = ensureProject(pool, query, normalizedQuery, now, owner);
  const sourceId = item.sourceId || `manual-${Date.now()}`;
  const videoFrames = normalizeVideoFrames(item.videoFrames);
  const sourceItem: NormalizedSourceItem = {
    ...item,
    ...owner,
    id: item.id || `${item.platform}-${sourceId}`,
    sourceId,
    images: normalizeContentImageUrls(item.images || []),
    videoFrames,
    mediaUrls: replaceVideoFrameUrlsInMediaUrls(
      mergeStringArrays(
        item.mediaUrls,
        item.images,
        item.videoUrl ? [item.videoUrl] : undefined,
        item.sourceUrl ? [item.sourceUrl] : undefined,
      ),
      videoFrames,
    ),
    poolStatus: item.poolStatus || "new",
    crawledAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    usedCount: 0,
    raw: item.raw || { manual: true },
    metrics: item.metrics || {},
  };
  const enrichedItem = {
    ...sourceItem,
    hotScore: calculateHotScore(sourceItem),
    analysis: analyzeSourceItem(sourceItem),
    productionPlan: buildProductionPlan(sourceItem),
  };

  const nextItem = {
    ...enrichedItem,
    mediaCache: buildMediaCacheStatus(enrichedItem, now),
  };

  project.items = [nextItem, ...project.items.filter((existing) => existing.id !== enrichedItem.id)];
  Object.assign(project, refreshProjectStats({ ...project, ...owner, updatedAt: now }));
  await writePool(pool);
  return { project, item: nextItem };
}

export async function updateSourceItem(sourceItemId: string, patch: Partial<NormalizedSourceItem>, account?: WorkspaceAccessActor) {
  const pool = await readPool();
  const now = new Date().toISOString();
  let updatedItem: NormalizedSourceItem | undefined;

  pool.projects = pool.projects.map((project) => {
    let changed = false;
    const items = project.items.map((item) => {
      if (item.id !== sourceItemId) return item;
      if (!canMutateWorkspaceContent(account, item)) return item;
      changed = true;
      const videoFrames = normalizeVideoFrames(patch.videoFrames === undefined ? item.videoFrames : patch.videoFrames);
      const nextItem: NormalizedSourceItem = {
        ...item,
        ...patch,
        id: item.id,
        ownerUserId: item.ownerUserId,
        ownerDisplayName: item.ownerDisplayName,
        platform: patch.platform || item.platform,
        sourceId: patch.sourceId || item.sourceId,
        images: patch.images ? normalizeContentImageUrls(patch.images) : item.images,
        videoFrames,
        mediaUrls: replaceVideoFrameUrlsInMediaUrls(patch.mediaUrls ? mergeStringArrays(patch.mediaUrls) : item.mediaUrls, videoFrames),
        metrics: {
          ...item.metrics,
          ...(patch.metrics || {}),
        },
        raw: patch.raw === undefined ? item.raw : patch.raw,
        lastSeenAt: item.lastSeenAt || now,
        contentTagging:
          patch.contentTagging === undefined
            ? item.contentTagging
            : updateSourceContentTags(item.contentTagging, patch.contentTagging.tags),
        visualTagging:
          patch.visualTagging === undefined
            ? item.visualTagging
            : updateSourceVisualTags(item, patch.visualTagging.assets),
      };
      const recalculatedBase: NormalizedSourceItem = {
        ...nextItem,
        hotScore: patch.hotScore ?? calculateHotScore(nextItem),
        analysis: patch.analysis || item.analysis || analyzeSourceItem(nextItem),
        productionPlan: patch.productionPlan || (patch.contentTagging === undefined ? item.productionPlan : undefined) || buildProductionPlan(nextItem),
      };
      const recalculated = {
        ...recalculatedBase,
        mediaCache: buildMediaCacheStatus(recalculatedBase, now),
      };
      updatedItem = recalculated;
      return recalculated;
    });
    return changed ? refreshProjectStats({ ...project, items, updatedAt: now }) : project;
  });

  if (!updatedItem) throw new Error("Content item not found");
  await writePool(pool);
  return updatedItem;
}

export async function deleteSourceItem(sourceItemId: string, account?: WorkspaceAccessActor) {
  const pool = await readPool();
  const now = new Date().toISOString();
  let deleted = false;

  pool.projects = pool.projects.map((project) => {
    const nextItems = project.items.filter((item) => {
      if (item.id !== sourceItemId) return true;
      if (!canMutateWorkspaceContent(account, item)) return true;
      return false;
    });
    if (nextItems.length === project.items.length) return project;
    deleted = true;
    return refreshProjectStats({ ...project, items: nextItems, updatedAt: now });
  });

  if (!deleted) throw new Error("Content item not found");
  await writePool(pool);
}

export async function batchUpdateSourceItemStatus(sourceItemIds: string[], poolStatus: SourceUsageStatus, account?: WorkspaceAccessActor) {
  const ids = makeUniqueIds(sourceItemIds);
  const selectedIds = new Set(ids);
  const foundIds = new Set<string>();
  const updatedItems = new Map<string, NormalizedSourceItem>();
  const pool = await readPool();
  const now = new Date().toISOString();

  pool.projects = pool.projects.map((project) => {
    let changed = false;
    const items = project.items.map((item) => {
      if (!selectedIds.has(item.id) || !canMutateWorkspaceContent(account, item)) return item;
      changed = true;
      foundIds.add(item.id);
      const nextItem: NormalizedSourceItem = {
        ...item,
        poolStatus,
        analysis: item.analysis || analyzeSourceItem(item),
        productionPlan: item.productionPlan || buildProductionPlan(item),
        lastSeenAt: item.lastSeenAt || now,
      };
      updatedItems.set(nextItem.id, nextItem);
      return nextItem;
    });
    return changed ? refreshProjectStats({ ...project, items, updatedAt: now }) : project;
  });

  if (foundIds.size) await writePool(pool);
  return {
    items: Array.from(updatedItems.values()),
    updatedCount: foundIds.size,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
  };
}

export async function batchDeleteSourceItems(sourceItemIds: string[], account?: WorkspaceAccessActor) {
  const ids = makeUniqueIds(sourceItemIds);
  const selectedIds = new Set(ids);
  const foundIds = new Set<string>();
  const pool = await readPool();
  const now = new Date().toISOString();

  pool.projects = pool.projects.map((project) => {
    const nextItems = project.items.filter((item) => {
      const shouldDelete = selectedIds.has(item.id) && canMutateWorkspaceContent(account, item);
      if (shouldDelete) foundIds.add(item.id);
      return !shouldDelete;
    });
    if (nextItems.length === project.items.length) return project;
    return refreshProjectStats({ ...project, items: nextItems, updatedAt: now });
  });

  if (foundIds.size) await writePool(pool);
  return {
    deletedCount: foundIds.size,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
  };
}

export async function markSourceRewritten(sourceItemId: string, post: GeneratedPost, account?: WorkspaceAccessActor) {
  for (let attempt = 1; attempt <= sourceRewriteMaxAttempts; attempt += 1) {
    try {
      await markSourceRewrittenOnce(sourceItemId, post, account);
      return;
    } catch (error) {
      if (attempt >= sourceRewriteMaxAttempts || !isSourceRewriteRetryableError(error)) throw error;
      await delaySourceRewriteRetry(attempt);
    }
  }
}

async function markSourceRewrittenOnce(sourceItemId: string, post: GeneratedPost, account?: WorkspaceAccessActor) {
  const pool = await readPool();
  const access = account || accessActorFromOwner(post.ownerUserId, post.ownerDisplayName);
  let changed = false;
  const nextStatus: SourceUsageStatus =
    post.status === "published" ? "published" : post.status === "approved" ? "approved" : "rewritten";
  const now = new Date().toISOString();

  pool.projects = pool.projects.map((project) => {
    let projectChanged = false;
    const items = project.items.map((item) => {
      if (item.id !== sourceItemId || !canMutateWorkspaceContent(access, item)) return item;
      const currentStatus = item.poolStatus || "new";
      const shouldCountUsage = rankStatus(currentStatus) < rankStatus("rewritten") && rankStatus(nextStatus) >= rankStatus("rewritten");
      changed = true;
      projectChanged = true;
      return {
        ...item,
        poolStatus: rankStatus(nextStatus) > rankStatus(currentStatus) ? nextStatus : currentStatus,
        usedCount: shouldCountUsage ? (item.usedCount || 0) + 1 : item.usedCount || 0,
        analysis: item.analysis || analyzeSourceItem(item),
      };
    });
    return refreshProjectStats({ ...project, items, updatedAt: projectChanged ? now : project.updatedAt });
  });

  if (changed) await writePool(pool);
}

function isSourceRewriteRetryableError(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return code === "40P01" || code === "40001" || /\bdeadlock\b/i.test(message) || message.includes("\u6b7b\u9501");
}

function delaySourceRewriteRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, sourceRewriteRetryDelayMs * attempt));
}

export function calculateHotScore(item: NormalizedSourceItem) {
  const metrics = item.metrics;
  const reach = metrics.plays || metrics.views || metrics.reads || 0;
  const engagement =
    (metrics.likes || 0) * 1 +
    (metrics.comments || 0) * 4 +
    (metrics.collects || 0) * 5 +
    (metrics.shares || 0) * 6;
  const reachScore = Math.log10(Math.max(reach, 1)) * 12;
  const engagementScore = Math.log10(Math.max(engagement, 1)) * 18;
  const mediaScore = item.mediaType === "mixed" ? 12 : item.mediaType === "video" || item.mediaType === "image" ? 8 : 2;
  const completenessScore = [item.title, item.contentText, item.sourceUrl].filter(Boolean).length * 4;
  return Math.round(Math.min(reachScore + engagementScore + mediaScore + completenessScore, 100));
}

export function analyzeSourceItem(item: NormalizedSourceItem): ViralAnalysis {
  const text = `${item.title || ""}\n${item.contentText || ""}`;
  const metrics = item.metrics;
  const topMetric =
    (metrics.collects || 0) > (metrics.comments || 0) && (metrics.collects || 0) > (metrics.shares || 0)
      ? "收藏驱动"
      : (metrics.comments || 0) > (metrics.shares || 0)
        ? "讨论驱动"
        : (metrics.shares || 0) > 0
          ? "传播驱动"
          : "点击驱动";
  const angle = /测评|体验|实测|评测|试驾/.test(text)
    ? "真实体验/测评"
    : /价格|性价比|优惠|预算/.test(text)
      ? "价格与购买决策"
      : /安全|智驾|技术|AI|芯片/.test(text)
        ? "技术可信度"
        : /空间|座椅|家庭|出行/.test(text)
          ? "生活场景"
          : "热点观点";

  return {
    hook: item.title || firstSentence(item.contentText) || "用热点关键词快速建立注意力",
    angle,
    structure: inferStructure(text),
    emotion: inferEmotion(text, topMetric),
    rewriteDirection: `保留“${angle}”角度，换成品牌自己的素材和观点，避免复述原文表达。`,
    visualSuggestion: item.mediaType === "video" ? "优先截取视频中的产品关键帧，补充 2-3 张功能/场景图。" : "沿用首图信息密度，强化产品主体与关键词。",
    risk: "注意不要照搬原文句式、标题结构和图片排版，涉及数据或对比时需要二次核验。",
    keywords: extractKeywords(text),
  };
}

function refreshProjectStats(project: ContentProject): ContentProject {
  const platforms: Partial<Record<Platform, number>> = {};
  const observedAt = project.lastCrawledAt || project.updatedAt || new Date().toISOString();
  const items = project.items.map((item) => {
    const enrichedItem = enrichSourceTimestamps(item, observedAt);
    const storedImages = normalizeContentImageUrls(enrichedItem.images || []);
    const rawDouyinImages = enrichedItem.platform === "douyin" ? extractDouyinCarouselImageUrls(enrichedItem.raw) : [];
    const images = rawDouyinImages.length ? rawDouyinImages : storedImages;
    const rawImageRepairApplied =
      rawDouyinImages.length > 0 && rawDouyinImages.join("\n") !== storedImages.join("\n");
    const downloadedImages = rawImageRepairApplied ? undefined : filterAlignedDownloadedImages(enrichedItem.downloadedImages, images);
    const cleanDownloadedImageSet = new Set(downloadedImages || []);
    const droppedDownloadedImageSet = new Set((enrichedItem.downloadedImages || []).filter((url) => !cleanDownloadedImageSet.has(url)));
    const videoFrames = normalizeVideoFrames(enrichedItem.videoFrames);
    const normalizedItem: NormalizedSourceItem = {
      ...enrichedItem,
      images,
      downloadedImages,
      videoFrames,
      mediaUrls: replaceVideoFrameUrlsInMediaUrls(
        mergeStringArrays(
          enrichedItem.mediaUrls?.filter((url) => !isLikelyNonContentImageUrl(url) && !droppedDownloadedImageSet.has(url)),
          downloadedImages,
          images,
        ),
        videoFrames,
      ),
      productionPlan: enrichedItem.productionPlan || buildProductionPlan({ ...enrichedItem, images, downloadedImages, videoFrames }),
    };
    return {
      ...normalizedItem,
      mediaCache: buildMediaCacheStatus(normalizedItem),
    };
  }).filter(isValidSourceItem);
  const countByStatus = (status: SourceUsageStatus) => items.filter((item) => item.poolStatus === status).length;
  items.forEach((item) => {
    platforms[item.platform] = (platforms[item.platform] || 0) + 1;
  });
  return {
    ...project,
    items,
    totalItems: items.length,
    newItems: countByStatus("new"),
    analyzedItems: items.filter((item) => item.analysis).length,
    rewrittenItems: countByStatus("rewritten"),
    approvedItems: countByStatus("approved"),
    publishedItems: countByStatus("published"),
    platforms,
  };
}

function ensureProject(pool: StoredContentPool, query: string, normalizedQuery: string, now: string, owner?: { ownerUserId: string; ownerDisplayName: string }) {
  let project = pool.projects.find((item) => item.normalizedQuery === normalizedQuery);

  if (!project) {
    project = {
      id: `project-${normalizedQuery || Date.now()}`,
      ...owner,
      query,
      normalizedQuery,
      createdAt: now,
      updatedAt: now,
      lastCrawledAt: now,
      totalItems: 0,
      newItems: 0,
      analyzedItems: 0,
      rewrittenItems: 0,
      approvedItems: 0,
      publishedItems: 0,
      platforms: {},
      items: [],
    };
    pool.projects.push(project);
  }

  return project;
}

function isValidSourceItem(item: NormalizedSourceItem) {
  const hasContent = Boolean(item.title || item.contentText || item.images?.length || item.videoUrl || item.sourceUrl);
  if (!hasContent) return false;
  return true;
}

function canMutateWorkspaceContent(account: WorkspaceAccessActor | undefined, item: NormalizedSourceItem) {
  if (!account) return true;
  return canAccessWorkspaceOwner(account, item.ownerUserId);
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u3400-\u9fff_-]+/gi, "").slice(0, 80);
}

function normalizeProjectKey(query: string, ownerUserId?: string) {
  const base = normalizeQuery(query);
  const owner = ownerUserId ? normalizeQuery(ownerUserId) : "";
  return owner ? `${base || "project"}--owner-${owner}`.slice(0, 120) : base;
}

function mergeStringArrays(...groups: Array<string[] | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group || []).filter(Boolean)));
}

function normalizeVideoFrames(frames: NormalizedSourceItem["videoFrames"]) {
  const selectedFrames = selectBestVideoHighlightFrames(frames);
  return selectedFrames.length ? selectedFrames : undefined;
}

function makeUniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function readPool(): Promise<StoredContentPool> {
  return { projects: await readContentProjectsFromDb() };
}

async function writePool(pool: StoredContentPool) {
  await writeContentProjectsToDb(pool.projects);
}

function rankStatus(status?: SourceUsageStatus) {
  const order: Record<SourceUsageStatus, number> = {
    new: 0,
    analyzed: 1,
    rewritten: 2,
    approved: 3,
    published: 4,
  };
  return order[status || "new"];
}

function shouldKeepManualContentTagging(item: NormalizedSourceItem) {
  return item.contentTagging?.updatedBy === "user";
}

function shouldKeepManualVisualTagging(item: NormalizedSourceItem) {
  return Boolean(item.visualTagging?.assets?.some((asset) => asset.updatedBy === "user"));
}

function chooseContentTagging(next: NormalizedSourceItem, previous: NormalizedSourceItem) {
  if (next.contentTagging?.status === "success") return next.contentTagging;
  return previous.contentTagging || next.contentTagging;
}

function chooseVisualTagging(next: NormalizedSourceItem, previous: NormalizedSourceItem) {
  if (next.visualTagging?.status === "success") return next.visualTagging;
  return previous.visualTagging || next.visualTagging;
}

function firstSentence(value?: string) {
  return value?.split(/[。！？\n]/).map((item) => item.trim()).find(Boolean);
}

function inferStructure(text: string) {
  if (/^\s*#/.test(text) || (text.match(/#/g) || []).length >= 2) return "话题标签开场 -> 核心观点 -> 数据/体验补充";
  if (/[:：]/.test(text)) return "强观点标题 -> 分点说明 -> 行动/结论";
  if (text.length > 180) return "铺垫场景 -> 展开细节 -> 形成判断";
  return "短钩子 -> 单点卖点 -> 快速收束";
}

function inferEmotion(text: string, topMetric: string) {
  if (/震惊|疯|爆|硬刚|全网|最/.test(text)) return `强刺激/冲突感，偏${topMetric}`;
  if (/放心|安全|稳定|可靠/.test(text)) return `信任感，偏${topMetric}`;
  if (/体验|沉浸|实测|试驾/.test(text)) return `代入感，偏${topMetric}`;
  return `好奇心，偏${topMetric}`;
}

function extractKeywords(text: string) {
  const matches = text.match(/#[^#\s]+#/g) || [];
  const hashtags = matches.map((item) => item.replace(/#/g, "")).slice(0, 5);
  const terms = ["小鹏", "智驾", "AI", "空间", "安全", "测评", "体验", "价格"].filter((term) => text.includes(term));
  return Array.from(new Set([...hashtags, ...terms])).slice(0, 8);
}
