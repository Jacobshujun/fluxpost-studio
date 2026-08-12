import { createHash } from "node:crypto";
import { concurrencyConfig, mapWithConcurrency } from "../concurrency";
import { getContentSafetyPolicy, normalizeContentSafetyPolicySnapshot } from "../content-safety-policy";
import { ingestCrawlItems } from "../content-pool";
import { buildVideoDownloadCandidates } from "../media-cache";
import { detectSourceLinkPlatform, resolveSourceLinks } from "../source-link-import";
import { filterUnsafeSourceItems } from "../source-safety";
import { tagSourceItems } from "../source-tagging";
import type { NormalizedSourceItem, Platform } from "../types";
import type { WorkspaceAccessActor } from "../workspace-ownership";
import { persistCanvasSourceVideo } from "./media-tools";
import type { CanvasSourceVideoSnapshot } from "./types";

const maxSourceVideoLinks = 200;

export class CanvasSourceVideoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasSourceVideoValidationError";
  }
}

export async function resolveCanvasSourceVideos(input: {
  links: string[];
  projectName: string;
  account: WorkspaceAccessActor;
}): Promise<CanvasSourceVideoSnapshot[]> {
  const projectName = input.projectName.trim();
  if (!projectName) throw new CanvasSourceVideoValidationError("内容池项目名不能为空。");
  if (projectName.length > 80) throw new CanvasSourceVideoValidationError("内容池项目名不能超过 80 个字符。");
  const links = normalizeSourceVideoLinks(input.links);
  if (!links.length) throw new CanvasSourceVideoValidationError("至少需要一个源视频链接。");
  if (links.length > maxSourceVideoLinks) throw new CanvasSourceVideoValidationError(`源视频链接不能超过 ${maxSourceVideoLinks} 条。`);

  const platformLinks = links.filter((url) => Boolean(detectSourceLinkPlatform(url)));
  const resolvedPlatformItems = platformLinks.length
    ? await asSourceVideoValidation("Platform source resolution failed", () => resolveSourceLinks({ links: platformLinks, videoFrameOriginalReference: false, enableVideoTranscription: false }))
    : { total: 0, valid: 0, items: [], results: [] };
  const failed = resolvedPlatformItems.results.find((result) => result.status !== "imported");
  if (failed) throw new CanvasSourceVideoValidationError(`${failed.url}: ${failed.error || "平台链接解析失败。"}`);
  if (resolvedPlatformItems.items.length !== platformLinks.length) {
    throw new CanvasSourceVideoValidationError("平台链接解析结果数量与输入不一致。");
  }

  let platformIndex = 0;
  const candidates = links.map((sourceUrl) => {
    const platform = detectSourceLinkPlatform(sourceUrl);
    if (platform) {
      const item = resolvedPlatformItems.items[platformIndex++];
      if (!item) throw new CanvasSourceVideoValidationError(`${sourceUrl}: 未返回视频内容。`);
      return { sourceUrl, item: { ...item, sourceUrl } };
    }
    return { sourceUrl, item: directSourceVideoItem(sourceUrl) };
  });

  const prepared = await mapWithConcurrency(candidates, Math.min(concurrencyConfig.media, 4), async ({ sourceUrl, item }) => {
    const videoUrl = item.downloadedVideoUrl || buildVideoDownloadCandidates(item)[0];
    if (!videoUrl) throw new CanvasSourceVideoValidationError(`${sourceUrl}: 未解析出可下载的视频文件。`);
    try {
      const durable = await persistCanvasSourceVideo(videoUrl);
      return {
        sourceUrl,
        metadata: durable,
        item: {
          ...item,
          sourceUrl,
          mediaType: "video" as const,
          downloadedVideoUrl: durable.url,
          mediaUrls: uniqueStrings([durable.url, item.videoUrl, ...item.mediaUrls]),
        },
      };
    } catch (error) {
      throw new CanvasSourceVideoValidationError(`${sourceUrl}: ${error instanceof Error ? error.message : "视频校验失败。"}`);
    }
  });

  const policy = normalizeContentSafetyPolicySnapshot(await asSourceVideoValidation("Content safety policy could not be loaded", () => getContentSafetyPolicy()));
  const safety = await asSourceVideoValidation("Source video safety validation failed", () => filterUnsafeSourceItems(prepared.map((entry) => entry.item), {
    scope: "canvas/source-video",
    query: projectName,
  }, policy));
  if (safety.filtered.length) {
    const filtered = safety.filtered[0];
    throw new CanvasSourceVideoValidationError(`${filtered.sourceUrl || filtered.id}: 未通过内容安全检查。`);
  }
  if (safety.items.length !== prepared.length) throw new CanvasSourceVideoValidationError("源视频安全检查结果不完整。");

  const tagged = await asSourceVideoValidation("Source video tagging failed", () => tagSourceItems(safety.items));
  if (tagged.length !== prepared.length) throw new CanvasSourceVideoValidationError("源视频标签处理结果不完整。");
  const project = await asSourceVideoValidation("Source video content-pool ingestion failed", () => ingestCrawlItems(projectName, tagged, input.account));
  const stored = new Map(project.items.map((item) => [item.id, item]));
  const preparedById = new Map(prepared.map((entry) => [entry.item.id, entry]));
  const resolvedAt = new Date().toISOString();
  return tagged.map((item): CanvasSourceVideoSnapshot => {
    const entry = preparedById.get(item.id);
    const storedItem = stored.get(item.id);
    if (!entry || !storedItem || !storedItem.downloadedVideoUrl) {
      throw new CanvasSourceVideoValidationError(`${item.sourceUrl || item.id}: 内容池入库结果缺少持久视频。`);
    }
    return {
      id: storedItem.id,
      projectName,
      sourceUrl: entry.sourceUrl,
      platform: storedItem.platform,
      title: storedItem.title,
      url: storedItem.downloadedVideoUrl,
      durationSeconds: entry.metadata.durationSeconds,
      width: entry.metadata.width,
      height: entry.metadata.height,
      resolvedAt,
    };
  });
}

function normalizeSourceVideoLinks(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => String(value || "").split(/\r?\n/)).map((value) => value.trim()).filter(Boolean).map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new CanvasSourceVideoValidationError(`${value}: 不是有效的 URL。`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new CanvasSourceVideoValidationError(`${value}: 仅支持 HTTP(S) URL。`);
    url.hash = "";
    const normalized = url.toString();
    if (seen.has(normalized)) throw new CanvasSourceVideoValidationError(`${normalized}: 源链接重复。`);
    seen.add(normalized);
    return normalized;
  });
}

function directSourceVideoItem(sourceUrl: string): NormalizedSourceItem {
  const sourceId = `direct-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)}`;
  return {
    id: `original-${sourceId}`,
    platform: "original" satisfies Platform,
    sourceId,
    mediaType: "video",
    sourceUrl,
    title: directVideoTitle(sourceUrl),
    contentText: "",
    images: [],
    videoUrl: sourceUrl,
    mediaUrls: [sourceUrl],
    metrics: {},
    raw: { source: "canvas-source-video", sourceUrl },
  };
}

function directVideoTitle(sourceUrl: string) {
  try {
    return decodeURIComponent(new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1) || "源视频").slice(0, 120);
  } catch {
    return "源视频";
  }
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

async function asSourceVideoValidation<T>(context: string, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CanvasSourceVideoValidationError) throw error;
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new CanvasSourceVideoValidationError(`${context}: ${detail}`);
  }
}
