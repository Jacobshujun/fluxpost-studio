import { compactError, recordExecutionLog } from "./activity-log";
import { concurrencyConfig, mapWithConcurrency } from "./concurrency";
import { ingestCrawlItems } from "./content-pool";
import { filterUnsafeSourceItems } from "./source-safety";
import { tagSourceItems } from "./source-tagging";
import { detectPlatformFromSourceUrl, fetchTikHubItemBySourceLink } from "./tikhub";
import { buildDongchediArticleUrl, extractDongchediArticleId, fetchDongchediItemBySource } from "./dongchedi";
import { buildXiaopengBbsThreadUrl, extractXiaopengBbsThreadId, fetchXiaopengBbsItemBySource } from "./xiaopeng-bbs";
import type { WorkspaceAccessActor } from "./workspace-ownership";
import type { ContentProject, ContentSafetyPolicy, NormalizedSourceItem, Platform, SourceLinkPlatform } from "./types";

export type SourceLinkImportStatus = "imported" | "filtered" | "duplicate" | "unsupported" | "failed";

export type SourceLinkImportResult = {
  url: string;
  platform?: Platform;
  status: SourceLinkImportStatus;
  sourceId?: string;
  itemId?: string;
  title?: string;
  error?: string;
};

export type SourceLinkImportSummary = {
  total: number;
  valid: number;
  imported: number;
  filteredUnsafe: number;
  duplicates: number;
  unsupported: number;
  failed: number;
  taggedContent: number;
  taggedVisual: number;
  localImages: number;
  videoFrames: number;
};

export type SourceLinkImportResponse = {
  query: string;
  items: NormalizedSourceItem[];
  project?: ContentProject;
  results: SourceLinkImportResult[];
  summary: SourceLinkImportSummary;
};

export type SourceLinkImportInput = {
  query: string;
  links: string[];
  platform?: SourceLinkPlatform;
  cookie?: string;
  videoFrameOriginalReference?: boolean;
  enableVideoTranscription?: boolean;
  owner?: WorkspaceAccessActor;
  contentSafetyPolicy: ContentSafetyPolicy;
};

export type SourceLinkResolveInput = {
  links: string[];
  platform?: SourceLinkPlatform;
  cookie?: string;
  videoFrameOriginalReference?: boolean;
  enableVideoTranscription?: boolean;
};

export type SourceLinkResolveResponse = {
  total: number;
  valid: number;
  items: NormalizedSourceItem[];
  results: SourceLinkImportResult[];
  stopped?: boolean;
  stopReason?: string;
};

type ParsedSourceLink = {
  raw: string;
  url: string;
  platform?: SourceLinkPlatform;
  duplicateInput?: boolean;
};

type FetchedSourceLink = {
  item?: NormalizedSourceItem;
  result: SourceLinkImportResult;
};

type SourceLinkResolveOptions = {
  cookie?: string;
  videoFrameOriginalReference?: boolean;
  enableVideoTranscription?: boolean;
};

const maxSourceLinksPerBatch = 200;

export async function importSourceLinks(input: SourceLinkImportInput): Promise<SourceLinkImportResponse> {
  const startedAt = Date.now();
  const parsedLinks = parseSourceLinks(input.links, input.platform);
  const { initialResults, candidates } = splitParsedSourceLinks(parsedLinks);

  await recordExecutionLog({
    scope: "crawl/links",
    action: "Source link import started",
    status: "running",
    message: `Importing ${candidates.length} source links into ${input.query}.`,
    details: {
      query: input.query,
      total: parsedLinks.length,
      valid: candidates.length,
      unsupported: initialResults.filter((result) => result.status === "unsupported").length,
      duplicates: initialResults.filter((result) => result.status === "duplicate").length,
      contentSafetyPolicyRevision: input.contentSafetyPolicy.revision,
    },
  });

  const resolved = await resolveParsedSourceLinks(parsedLinks, {
    cookie: input.cookie,
    videoFrameOriginalReference: input.videoFrameOriginalReference !== false,
    enableVideoTranscription: input.enableVideoTranscription === true,
  });
  const results = resolved.results;
  const dedupedItems = resolved.items;
  const safetyResult = await filterUnsafeSourceItems(dedupedItems, {
    scope: "crawl/links",
    query: input.query,
  }, input.contentSafetyPolicy);
  const filteredIds = new Set(safetyResult.filtered.map((item) => item.id));
  for (const result of results) {
    if (result.itemId && filteredIds.has(result.itemId)) {
      result.status = "filtered";
      result.error = "Filtered by source safety gate";
    }
  }

  const taggedItems = await tagSourceItems(safetyResult.items);
  const importedIds = new Set(taggedItems.map((item) => item.id));
  for (const result of results) {
    if (result.itemId && importedIds.has(result.itemId)) {
      result.status = "imported";
      result.error = undefined;
    }
  }

  const project = taggedItems.length ? await ingestCrawlItems(input.query, taggedItems, input.owner) : undefined;
  const summary = summarizeLinkImport(parsedLinks.length, results, taggedItems);
  await recordExecutionLog({
    scope: "crawl/links",
    action: "Source link import completed",
    status: summary.imported ? "success" : "info",
    message: `Imported ${summary.imported}/${summary.total} source links into ${input.query}.`,
    durationMs: Date.now() - startedAt,
    details: {
      query: input.query,
      total: summary.total,
      imported: summary.imported,
      filteredUnsafe: summary.filteredUnsafe,
      failed: summary.failed,
      unsupported: summary.unsupported,
      duplicates: summary.duplicates,
    },
  });

  return {
    query: input.query,
    items: taggedItems,
    project,
    results,
    summary,
  };
}

export async function resolveSourceLinks(input: SourceLinkResolveInput): Promise<SourceLinkResolveResponse> {
  return resolveParsedSourceLinks(parseSourceLinks(input.links, input.platform), {
    cookie: input.cookie,
    videoFrameOriginalReference: input.videoFrameOriginalReference !== false,
    enableVideoTranscription: input.enableVideoTranscription === true,
  });
}

export async function resolveSourceLinksSerial(
  input: SourceLinkResolveInput & { onResult?: (result: SourceLinkImportResult) => Promise<void> | void },
): Promise<SourceLinkResolveResponse> {
  const parsedLinks = parseSourceLinks(input.links, input.platform);
  const results: SourceLinkImportResult[] = [];
  const items: NormalizedSourceItem[] = [];
  let stopped = false;
  let stopReason = "";

  for (let index = 0; index < parsedLinks.length; index += 1) {
    const link = parsedLinks[index];
    const resolved = await resolveParsedSourceLinks([link], {
      cookie: input.cookie,
      videoFrameOriginalReference: input.videoFrameOriginalReference !== false,
      enableVideoTranscription: input.enableVideoTranscription === true,
    });
    const result = resolved.results[0];
    if (result) {
      results.push(result);
      if (result.status === "imported" && resolved.items[0]) items.push(resolved.items[0]);
      await input.onResult?.(result);
      if (result.status === "failed" && /HTTP (?:403|429)|login|anti-bot challenge|challenge/i.test(result.error || "")) {
        stopped = true;
        stopReason = result.error || "Dongchedi access challenge";
        for (const remaining of parsedLinks.slice(index + 1)) {
          const skipped: SourceLinkImportResult = {
            url: remaining.url || remaining.raw,
            platform: remaining.platform,
            status: "failed",
            error: `Stopped after source access failure: ${stopReason}`,
          };
          results.push(skipped);
          await input.onResult?.(skipped);
        }
        break;
      }
    }
  }

  return {
    total: parsedLinks.length,
    valid: parsedLinks.filter((link) => Boolean(link.url && link.platform && !link.duplicateInput)).length,
    items,
    results,
    stopped,
    stopReason: stopReason || undefined,
  };
}

async function resolveParsedSourceLinks(
  parsedLinks: ParsedSourceLink[],
  options: SourceLinkResolveOptions = {},
): Promise<SourceLinkResolveResponse> {
  const cookie = options.cookie;
  const videoFrameOriginalReference = options.videoFrameOriginalReference !== false;
  const enableVideoTranscription = options.enableVideoTranscription === true;
  const { initialResults, candidates } = splitParsedSourceLinks(parsedLinks);
  const fetched = await mapWithConcurrency<ParsedSourceLink, FetchedSourceLink>(candidates, concurrencyConfig.crawl, async (link) => {
    try {
      const items =
        link.platform === "xiaopeng_bbs"
          ? await fetchXiaopengBbsItemBySource(link.url, { enableVideoTranscription })
          : link.platform === "dongchedi"
            ? await fetchDongchediItemBySource(link.url, { cookie, enableVideoTranscription })
          : await fetchTikHubItemBySourceLink({
              url: link.url,
              platform: link.platform,
              cookie,
              enableVideoTranscription,
            });
      const item = applyVideoFrameOriginalReferencePreference(items[0], videoFrameOriginalReference);
      if (!item) {
        return {
          result: {
            url: link.url,
            platform: link.platform,
            status: "failed",
            error: "No source item returned",
          } satisfies SourceLinkImportResult,
        };
      }
      return {
        item,
        result: resultFromItem(link.url, item, "imported"),
      };
    } catch (error) {
      return {
        result: {
          url: link.url,
          platform: link.platform,
          status: "failed",
          error: compactError(error),
        } satisfies SourceLinkImportResult,
      };
    }
  });

  const results = [...initialResults, ...fetched.map((entry) => entry.result)];
  const dedupedItems: NormalizedSourceItem[] = [];
  const seenItems = new Set<string>();
  for (const entry of fetched) {
    const item = entry.item;
    if (!item) continue;
    const key = `${item.platform}:${item.sourceId}`;
    if (seenItems.has(key)) {
      entry.result.status = "duplicate";
      entry.result.error = "Duplicate source item";
      continue;
    }
    seenItems.add(key);
    dedupedItems.push(item);
  }

  return {
    total: parsedLinks.length,
    valid: candidates.length,
    items: dedupedItems,
    results,
  };
}

function applyVideoFrameOriginalReferencePreference(item: NormalizedSourceItem | undefined, enabled: boolean) {
  if (!item) return item;
  if (!isVideoLikeImportedSource(item)) return item;
  return {
    ...item,
    videoFrameOriginalReference: enabled,
  };
}

function isVideoLikeImportedSource(item: NormalizedSourceItem) {
  return Boolean(
    item.mediaType === "video" ||
      item.mediaType === "mixed" ||
      item.videoUrl ||
      item.downloadedVideoUrl ||
      item.videoFrames?.length ||
      item.mediaCache?.videoPresent,
  );
}

function splitParsedSourceLinks(parsedLinks: ParsedSourceLink[]) {
  const initialResults: SourceLinkImportResult[] = [];
  const candidates: ParsedSourceLink[] = [];

  for (const link of parsedLinks) {
    if (!link.url) {
      initialResults.push({
        url: link.raw,
        status: "failed",
        error: "Invalid URL",
      });
      continue;
    }
    if (link.duplicateInput) {
      initialResults.push({
        url: link.url,
        platform: link.platform,
        status: "duplicate",
        error: "Duplicate input link",
      });
      continue;
    }
    if (!link.platform) {
      initialResults.push({
        url: link.url,
        status: "unsupported",
        error: "Unsupported source link platform",
      });
      continue;
    }
    candidates.push(link);
  }

  return { initialResults, candidates };
}

export function parseSourceLinks(values: string[], platform?: SourceLinkPlatform): ParsedSourceLink[] {
  const seen = new Set<string>();
  return values
    .flatMap((value) => String(value || "").split(/\r?\n/))
    .map((raw) => raw.trim())
    .filter(Boolean)
    .slice(0, maxSourceLinksPerBatch)
    .map((raw) => {
      const sourceValue =
        platform === "xiaopeng_bbs"
          ? normalizeXiaopengBbsInput(raw)
          : platform === "dongchedi"
            ? normalizeDongchediInput(raw)
            : extractFirstHttpUrl(raw);
      const normalizedUrl = normalizeSourceUrl(sourceValue);
      const duplicateInput = normalizedUrl ? seen.has(normalizedUrl) : false;
      if (normalizedUrl) seen.add(normalizedUrl);
      return {
        raw,
        url: normalizedUrl,
        platform: platform || detectSourceLinkPlatform(normalizedUrl),
        duplicateInput,
      };
    });
}

function resultFromItem(url: string, item: NormalizedSourceItem, status: SourceLinkImportStatus): SourceLinkImportResult {
  return {
    url,
    platform: item.platform,
    status,
    sourceId: item.sourceId,
    itemId: item.id,
    title: item.title,
  };
}

function summarizeLinkImport(
  total: number,
  results: SourceLinkImportResult[],
  importedItems: NormalizedSourceItem[],
): SourceLinkImportSummary {
  return {
    total,
    valid: results.filter((result) => result.status !== "unsupported" && result.status !== "failed").length,
    imported: results.filter((result) => result.status === "imported").length,
    filteredUnsafe: results.filter((result) => result.status === "filtered").length,
    duplicates: results.filter((result) => result.status === "duplicate").length,
    unsupported: results.filter((result) => result.status === "unsupported").length,
    failed: results.filter((result) => result.status === "failed").length,
    taggedContent: importedItems.filter((item) => item.contentTagging?.status === "success").length,
    taggedVisual: importedItems.reduce((sum, item) => sum + (item.visualTagging?.assets.length || 0), 0),
    localImages: importedItems.reduce((sum, item) => sum + (item.downloadedImages?.length || 0), 0),
    videoFrames: importedItems.reduce((sum, item) => sum + (item.videoFrames?.length || 0), 0),
  };
}

function extractFirstHttpUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return "";
  return stripTrailingUrlPunctuation(match[0]);
}

function normalizeSourceUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(stripTrailingUrlPunctuation(value));
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function stripTrailingUrlPunctuation(value: string) {
  return value.replace(/[),."'\u201C\u201D\u2018\u2019\uFF0C\u3002\uFF1B;]+$/u, "");
}

function normalizeXiaopengBbsInput(value: string) {
  const threadId = extractXiaopengBbsThreadId(value);
  return threadId ? buildXiaopengBbsThreadUrl(threadId) : extractFirstHttpUrl(value);
}

function normalizeDongchediInput(value: string) {
  const articleId = extractDongchediArticleId(value);
  return articleId ? buildDongchediArticleUrl(articleId) : extractFirstHttpUrl(value);
}

export function detectSourceLinkPlatform(value: string): SourceLinkPlatform | undefined {
  if (extractXiaopengBbsThreadId(value)) return "xiaopeng_bbs";
  if (extractDongchediArticleId(value)) return "dongchedi";
  return detectPlatformFromSourceUrl(value);
}
