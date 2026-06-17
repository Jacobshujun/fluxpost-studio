import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { extractDouyinCarouselImageUrls } from "./douyin-media";
import { isLikelyNonContentImageUrl, normalizeContentImageUrls } from "./media-url-filter";
import { extractPublishedTime } from "./source-timestamps";
import type { CrawlInput, CrawlPlatform, NormalizedSourceItem, Platform } from "./types";

type JsonRecord = Record<string, unknown>;

const xiaohongshuSearchEndpoint = "/api/v1/xiaohongshu/app_v2/search_notes";
const maxXiaohongshuSearchPages = 20;

const endpointByPlatform: Record<CrawlPlatform, string> = {
  wechat_channels: "/api/v1/wechat_channels/fetch_search_ordinary",
  xiaohongshu: xiaohongshuSearchEndpoint,
  douyin: "/api/v1/douyin/web/fetch_challenge_posts",
  weibo: "/api/v1/weibo/app/fetch_search_all",
};

const douyinKeywordSearchEndpoint = "/api/v1/douyin/search/fetch_general_search_v1";
const xiaohongshuWebNoteDetailEndpoint = "/api/v1/xiaohongshu/web_v3/fetch_note_detail";
const xiaohongshuNoteInfoV4Endpoint = "/api/v1/xiaohongshu/web/get_note_info_v4";
const xiaohongshuShareInfoEndpoint = "/api/v1/xiaohongshu/web/extract_share_info";
const douyinShareVideoEndpoint = "/api/v1/douyin/web/fetch_one_video_by_share_url";
const douyinSingleVideoEndpoint = "/api/v1/douyin/web/fetch_one_video_v3";
const weiboPostDetailEndpoint = "/api/v1/weibo/web_v2/fetch_post_detail";
const wechatChannelsShareVideoEndpoint = "/api/v1/wechat_channels/fetch_video_by_share_url";
const maxContentImages = 18;
const maxDouyinContentImages = 36;

export type TikHubSourceLinkInput = {
  url: string;
  platform?: CrawlPlatform;
  cookie?: string;
};

export async function crawlTikHub(input: CrawlInput): Promise<NormalizedSourceItem[]> {
  if (!appConfig.tikhubApiKey) {
    throw new Error("TIKHUB_API_KEY is not configured");
  }

  let items: NormalizedSourceItem[];
  switch (input.platform) {
    case "wechat_channels":
      items = await fetchWechatChannels(input);
      break;
    case "xiaohongshu":
      items = await fetchXiaohongshu(input);
      break;
    case "douyin":
      items = await fetchDouyin(input);
      break;
    case "weibo":
      items = await fetchWeibo(input);
      break;
    default:
      return [];
  }

  const filteredItems = dedupeItems(items).slice(0, input.targetCount);
  const { cacheCrawledMedia } = await import("./media-cache");
  return cacheCrawledMedia(filteredItems);
}

export async function fetchTikHubItemBySourceLink(input: TikHubSourceLinkInput): Promise<NormalizedSourceItem[]> {
  if (!appConfig.tikhubApiKey) {
    throw new Error("TIKHUB_API_KEY is not configured");
  }

  const platform = input.platform || detectPlatformFromSourceUrl(input.url);
  if (!platform) throw new Error("Unsupported source link platform");

  let items: NormalizedSourceItem[] = [];
  switch (platform) {
    case "xiaohongshu":
      items = await fetchXiaohongshuBySourceLink(input.url);
      break;
    case "douyin":
      items = await fetchDouyinBySourceLink(input.url, input.cookie);
      break;
    case "weibo":
      items = await fetchWeiboBySourceLink(input.url);
      break;
    case "wechat_channels":
      items = await fetchWechatChannelsBySourceLink(input.url);
      break;
    default:
      items = [];
  }

  const normalizedItems = dedupeItems(items)
    .slice(0, 1)
    .map((item) => ensureSourceUrlFromLink(item, input.url));
  const { cacheCrawledMedia } = await import("./media-cache");
  return cacheCrawledMedia(normalizedItems);
}

export function detectPlatformFromSourceUrl(value: string): CrawlPlatform | undefined {
  const url = extractFirstHttpUrl(value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (/(^|\.)xhslink\.com$|(^|\.)xiaohongshu\.com$|(^|\.)xhscdn\.com$/.test(host)) return "xiaohongshu";
    if (/(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)douyinvod\.com$/.test(host)) return "douyin";
    if (/(^|\.)weibo\.com$|(^|\.)weibo\.cn$|(^|\.)m\.weibo\.cn$|(^|\.)weibo\.com\.cn$/.test(host)) return "weibo";
    if (/(^|\.)weixin\.qq\.com$|(^|\.)channels\.weixin\.qq\.com$|(^|\.)finder\.video\.qq\.com$/.test(host)) {
      return "wechat_channels";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function buildXiaohongshuShareInfoPath(shareUrl: string) {
  const params = new URLSearchParams({ share_text: shareUrl });
  return `${xiaohongshuShareInfoEndpoint}?${params.toString()}`;
}

export function buildXiaohongshuNoteInfoV4Path(noteId: string, xsecToken?: string) {
  const params = new URLSearchParams({ note_id: noteId });
  if (xsecToken) params.set("xsec_token", xsecToken);
  return `${xiaohongshuNoteInfoV4Endpoint}?${params.toString()}`;
}

export function buildXiaohongshuWebNoteDetailPath(noteId: string, xsecToken: string) {
  const params = new URLSearchParams({
    note_id: noteId,
    xsec_token: xsecToken,
  });
  return `${xiaohongshuWebNoteDetailEndpoint}?${params.toString()}`;
}

export function buildDouyinShareVideoPath(shareUrl: string) {
  const params = new URLSearchParams({ share_url: shareUrl });
  return `${douyinShareVideoEndpoint}?${params.toString()}`;
}

export function buildDouyinSingleVideoPath(awemeId: string) {
  const params = new URLSearchParams({ aweme_id: awemeId });
  return `${douyinSingleVideoEndpoint}?${params.toString()}`;
}

export function buildDouyinSourceLinkPath(sourceUrl: string) {
  const awemeId = extractDouyinSingleVideoAwemeId(sourceUrl);
  return awemeId ? buildDouyinSingleVideoPath(awemeId) : buildDouyinShareVideoPath(sourceUrl);
}

export function buildWeiboPostDetailPath(sourceId: string) {
  const params = new URLSearchParams({
    id: sourceId,
    is_get_long_text: "true",
  });
  return `${weiboPostDetailEndpoint}?${params.toString()}`;
}

export function buildWechatChannelsShareVideoPath(shareUrl: string) {
  const params = new URLSearchParams({ share_url: shareUrl });
  return `${wechatChannelsShareVideoEndpoint}?${params.toString()}`;
}

function getCollectionTarget(targetCount: number) {
  return Math.min(Math.max(targetCount * 6, targetCount), 200);
}

async function fetchXiaohongshuBySourceLink(sourceUrl: string) {
  const localInfo = extractXiaohongshuLinkInfo(sourceUrl);
  let noteId = localInfo.noteId;
  let xsecToken = localInfo.xsecToken;
  let items: NormalizedSourceItem[] = [];

  if (!noteId || !xsecToken) {
    try {
      const shareRaw = await tikhubRequest(buildXiaohongshuShareInfoPath(sourceUrl));
      const shareInfo = extractXiaohongshuShareInfo(shareRaw);
      noteId ||= shareInfo.noteId;
      xsecToken ||= shareInfo.xsecToken;
      items = normalizeTikHubResponse(shareRaw, "xiaohongshu");
    } catch (error) {
      await recordExecutionLog({
        scope: "tikhub",
        action: "Xiaohongshu link share info failed",
        status: "info",
        message: compactError(error),
      });
    }
  }

  if (noteId) {
    try {
      const raw = await tikhubRequest(buildXiaohongshuNoteInfoV4Path(noteId, xsecToken));
      items = normalizeTikHubResponse(raw, "xiaohongshu");
    } catch (error) {
      await recordExecutionLog({
        scope: "tikhub",
        action: "Xiaohongshu link note info failed",
        status: "info",
        message: compactError(error),
        details: { sourceId: noteId },
      });
    }
  }

  if (noteId && xsecToken) {
    try {
      const raw = await tikhubRequest(buildXiaohongshuWebNoteDetailPath(noteId, xsecToken));
      const detail = normalizeTikHubResponse(raw, "xiaohongshu");
      const matchedDetail = items[0] ? pickMatchingDetail(items[0], detail) : detail[0];
      if (matchedDetail) {
        items = items[0] ? [mergeXiaohongshuDetail(items[0], matchedDetail)] : [matchedDetail];
      }
    } catch (error) {
      await recordExecutionLog({
        scope: "tikhub",
        action: "Xiaohongshu link Web detail failed",
        status: "info",
        message: compactError(error),
        details: { sourceId: noteId },
      });
    }
  }

  return items;
}

async function fetchDouyinBySourceLink(sourceUrl: string, cookie?: string) {
  const awemeId = extractDouyinSingleVideoAwemeId(sourceUrl);
  const path = buildDouyinSourceLinkPath(sourceUrl);
  if (cookie) {
    await recordExecutionLog({
      scope: "tikhub",
      action: "Douyin link import cookie ignored",
      status: "info",
      message: "Douyin single-link import uses the TikHub share/detail endpoint and does not persist request cookies.",
      details: { hasCookie: true },
    });
  }
  try {
    const raw = await tikhubRequest(path);
    return normalizeTikHubResponse(raw, "douyin");
  } catch (error) {
    if (!awemeId) throw error;
    await recordExecutionLog({
      scope: "tikhub",
      action: "Douyin single-video detail fallback",
      status: "info",
      message: "Douyin single-video detail failed; retrying with the share-url endpoint.",
      details: { sourceId: awemeId },
    });
    const raw = await tikhubRequest(buildDouyinShareVideoPath(sourceUrl));
    return normalizeTikHubResponse(raw, "douyin");
  }
}

async function fetchWeiboBySourceLink(sourceUrl: string) {
  const sourceId = extractWeiboStatusId(sourceUrl);
  if (!sourceId) throw new Error("Unsupported Weibo link shape");
  const raw = await tikhubRequest(buildWeiboPostDetailPath(sourceId));
  return normalizeTikHubResponse(raw, "weibo");
}

async function fetchWechatChannelsBySourceLink(sourceUrl: string) {
  const raw = await tikhubRequest(buildWechatChannelsShareVideoPath(sourceUrl));
  return normalizeTikHubResponse(raw, "wechat_channels");
}

async function fetchWechatChannels(input: CrawlInput) {
  const params = new URLSearchParams({ keywords: input.query });
  const raw = await tikhubRequest(`${endpointByPlatform.wechat_channels}?${params.toString()}`);
  return normalizeTikHubResponse(raw, input.platform);
}

async function fetchXiaohongshu(input: CrawlInput) {
  const items: NormalizedSourceItem[] = [];
  const attempts: XiaohongshuSearchAttempt[] = [];
  const collectionTarget = getCollectionTarget(input.targetCount);

  for (const noteTypeParam of getXiaohongshuSearchNoteTypeParams(input.noteType)) {
    const attempt = await collectXiaohongshuSearchPages(input, noteTypeParam, collectionTarget - items.length);
    attempts.push(attempt);
    items.push(...attempt.items);
    if (items.length >= collectionTarget) break;
  }

  const deduped = dedupeItems(items);
  if (input.sort === "time_descending") deduped.sort(comparePublishedAtDesc);
  const selected = deduped.slice(0, input.targetCount);
  const finalItems = await enrichXiaohongshuDetails(selected);
  await recordXiaohongshuSearchDiagnostics(input, attempts, finalItems.length);
  return finalItems;
}

type XiaohongshuSearchAttempt = {
  items: NormalizedSourceItem[];
  noteTypeParam: string;
  pages: number;
  normalizedCount: number;
  collectedCount: number;
  stoppedBecause?: string;
};

async function collectXiaohongshuSearchPages(
  input: CrawlInput,
  noteTypeParam: string,
  targetCount: number,
): Promise<XiaohongshuSearchAttempt> {
  const items: NormalizedSourceItem[] = [];
  let page = 1;
  let normalizedCount = 0;
  let collectedCount = 0;
  let pages = 0;
  let stoppedBecause: string | undefined;
  let paging: XiaohongshuSearchPaging = {};

  while (items.length < targetCount && page <= maxXiaohongshuSearchPages) {
    const raw = await tikhubRequest(buildXiaohongshuSearchPath(input, page, noteTypeParam, paging));
    pages += 1;
    const normalizedPageItems = normalizeTikHubResponse(raw, input.platform);
    if (normalizedPageItems.length === 0) {
      stoppedBecause = "empty_response";
      break;
    }

    normalizedCount += normalizedPageItems.length;
    const pageItems = normalizedPageItems;
    collectedCount += pageItems.length;
    items.push(...pageItems);
    paging = mergeXiaohongshuSearchPaging(paging, extractXiaohongshuSearchPaging(raw));

    page += 1;
  }

  return {
    items,
    noteTypeParam,
    pages,
    normalizedCount,
    collectedCount,
    stoppedBecause,
  };
}

type XiaohongshuSearchPaging = {
  searchId?: string;
  searchSessionId?: string;
};

export function buildXiaohongshuSearchPath(
  input: Pick<CrawlInput, "query" | "sort" | "noteType">,
  page: number,
  noteTypeParam?: string,
  paging: XiaohongshuSearchPaging = {},
) {
  const params = new URLSearchParams({
    keyword: input.query,
    page: String(page),
    sort_type: mapXiaohongshuSort(input.sort),
    note_type: noteTypeParam || mapXiaohongshuNoteType(input.noteType),
    time_filter: "不限",
    source: "explore_feed",
    ai_mode: "0",
  });
  if (paging.searchId) params.set("search_id", paging.searchId);
  if (paging.searchSessionId) params.set("search_session_id", paging.searchSessionId);
  return `${xiaohongshuSearchEndpoint}?${params.toString()}`;
}

export function getXiaohongshuSearchNoteTypeParams(noteType?: number) {
  const primary = mapXiaohongshuNoteType(noteType);
  return [primary];
}

async function recordXiaohongshuSearchDiagnostics(
  input: CrawlInput,
  attempts: XiaohongshuSearchAttempt[],
  finalCandidates: number,
) {
  const normalizedCount = attempts.reduce((sum, attempt) => sum + attempt.normalizedCount, 0);
  const collectedCount = attempts.reduce((sum, attempt) => sum + attempt.collectedCount, 0);
  await recordExecutionLog({
    scope: "tikhub",
    action: "Xiaohongshu App V2 search diagnostics",
    status: finalCandidates ? "success" : "info",
    message: `App V2 search_notes collected ${finalCandidates} Xiaohongshu candidates before media caching.`,
    details: {
      endpoint: xiaohongshuSearchEndpoint,
      query: input.query,
      sort: mapXiaohongshuSort(input.sort),
      requestedNoteType: input.noteType ?? 0,
      requestedNoteTypeParam: mapXiaohongshuNoteType(input.noteType),
      normalizedCount,
      collectedCount,
      finalCandidates,
      attemptCount: attempts.length,
      attempts: attempts
        .map((attempt) =>
          [
            `note_type=${attempt.noteTypeParam}`,
            `pages=${attempt.pages}`,
            `normalized=${attempt.normalizedCount}`,
            `collected=${attempt.collectedCount}`,
            attempt.stoppedBecause ? `stop=${attempt.stoppedBecause}` : "",
          ]
            .filter(Boolean)
            .join(":"),
        )
        .join(";"),
    },
  });
}

function mapXiaohongshuSort(sort?: string) {
  return sort === "time_descending" ||
    sort === "popularity_descending" ||
    sort === "comment_descending" ||
    sort === "collect_descending" ||
    sort === "english_preferred" ||
    sort === "general"
    ? sort
    : "general";
}

export function mapXiaohongshuNoteType(noteType?: number) {
  if (noteType === 1) return "视频笔记";
  if (noteType === 2) return "普通笔记";
  if (noteType === 3) return "直播笔记";
  return "不限";
}

function extractXiaohongshuSearchPaging(raw: unknown): XiaohongshuSearchPaging {
  const record = getRecord(raw) || {};
  const data = getRecord(record.data) || record;
  return {
    searchId: firstString(data, ["search_id", "searchId"]),
    searchSessionId: firstString(data, ["search_session_id", "searchSessionId", "session_id", "sessionId"]),
  };
}

function mergeXiaohongshuSearchPaging(
  current: XiaohongshuSearchPaging,
  next: XiaohongshuSearchPaging,
): XiaohongshuSearchPaging {
  return {
    searchId: next.searchId || current.searchId,
    searchSessionId: next.searchSessionId || current.searchSessionId,
  };
}

async function enrichXiaohongshuDetails(items: NormalizedSourceItem[]) {
  return mapWithConcurrency(items, concurrencyConfig.crawl, async (item) => {
    if (!item.sourceId) return item;
    if (isGeneratedXiaohongshuSourceId(item.sourceId)) return item;

    try {
      const xsecToken = firstString(getRecord(item.raw) || {}, ["xsec_token", "xsecToken"]);
      if (!xsecToken) return item;

      const webParams = new URLSearchParams({
        note_id: item.sourceId,
        xsec_token: xsecToken,
      });
      const webRaw = await tikhubRequest(`${xiaohongshuWebNoteDetailEndpoint}?${webParams.toString()}`);
      const webDetail = pickMatchingDetail(item, normalizeTikHubResponse(webRaw, item.platform));
      return webDetail ? mergeXiaohongshuDetail(item, webDetail) : item;
    } catch (error) {
      await recordExecutionLog({
        scope: "tikhub",
        action: "小红书 Web V3 详情补全失败",
        status: "info",
        message: compactError(error),
        details: {
          sourceId: item.sourceId,
        },
      });
      return item;
    }
  });
}

function isGeneratedXiaohongshuSourceId(sourceId: string) {
  return /^xiaohongshu-\d+$/.test(sourceId);
}

function pickMatchingDetail(item: NormalizedSourceItem, details: NormalizedSourceItem[]) {
  return details.find((candidate) => candidate.sourceId === item.sourceId) || details.find((candidate) => candidate.contentText || candidate.images.length || candidate.videoUrl);
}

function mergeXiaohongshuDetail(item: NormalizedSourceItem, detail: NormalizedSourceItem): NormalizedSourceItem {
  const contentText = chooseLongerText(item.contentText, detail.contentText);
  return {
    ...item,
    title: detail.title || item.title,
    contentText,
    images: detail.images.length ? detail.images : item.images,
    videoUrl: detail.videoUrl || item.videoUrl,
    mediaUrls: dedupeStrings([...item.mediaUrls, ...detail.mediaUrls]),
    publishedAt: detail.publishedAt || item.publishedAt,
    publishedLabel: detail.publishedLabel || item.publishedLabel,
    metrics: mergeMetrics(item.metrics, detail.metrics),
    raw: {
      search: item.raw,
      detail: detail.raw,
    },
  };
}

function chooseLongerText(current?: string, next?: string) {
  if (!next?.trim()) return current;
  if (!current?.trim()) return next;
  return stripHtml(next).length > stripHtml(current).length ? next : current;
}

function mergeMetrics(
  current: NormalizedSourceItem["metrics"],
  next: NormalizedSourceItem["metrics"],
): NormalizedSourceItem["metrics"] {
  return {
    views: next.views ?? current.views,
    reads: next.reads ?? current.reads,
    plays: next.plays ?? current.plays,
    likes: next.likes ?? current.likes,
    comments: next.comments ?? current.comments,
    shares: next.shares ?? current.shares,
    collects: next.collects ?? current.collects,
  };
}

async function fetchDouyin(input: CrawlInput) {
  return /^\d+$/.test(input.query.trim()) ? fetchDouyinChallengePosts(input) : fetchDouyinKeywordSearch(input);
}

async function fetchDouyinChallengePosts(input: CrawlInput) {
  const items: NormalizedSourceItem[] = [];
  let cursor = 0;
  const collectionTarget = getCollectionTarget(input.targetCount);
  const pageSize = Math.min(Math.max(input.targetCount, 1), 50);

  while (items.length < collectionTarget && cursor < 500) {
    const raw = await tikhubRequest(endpointByPlatform.douyin, {
      method: "POST",
      body: JSON.stringify({
        challenge_id: input.query,
        sort_type: Number(mapDouyinSort(input.sort)),
        cursor,
        count: pageSize,
        cookie: input.cookie || "",
      }),
    });
    const normalizedPageItems = normalizeTikHubResponse(raw, input.platform);
    const { items: pageItems, skipped } = filterDouyinItemsByRequestedContentType(input, normalizedPageItems);
    if (skipped) {
      await recordDouyinContentTypeMismatch(input, endpointByPlatform.douyin, skipped, pageItems.length);
    }
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    cursor += pageSize;
  }

  return dedupeItems(items);
}

async function fetchDouyinKeywordSearch(input: CrawlInput) {
  const items: NormalizedSourceItem[] = [];
  let cursor = 0;
  let searchId = "";
  let backtrace = "";
  const collectionTarget = Math.max(input.targetCount, 0);
  const pageSize = Math.min(Math.max(input.targetCount, 1), 50);

  while (dedupeItems(items).length < collectionTarget && cursor < 500) {
    let raw: unknown;
    try {
      raw = await tikhubRequest(douyinKeywordSearchEndpoint, {
        method: "POST",
        body: JSON.stringify(buildDouyinKeywordSearchPayload(input, cursor, searchId, backtrace)),
      });
    } catch (error) {
      const collected = dedupeItems(items).length;
      if (!collected) throw error;
      await recordExecutionLog({
        scope: "tikhub",
        action: "Douyin keyword pagination stopped",
        status: "info",
        message: `Kept ${collected} Douyin candidates after a later page failed.`,
        details: {
          endpoint: douyinKeywordSearchEndpoint,
          query: input.query,
          cursor,
          targetCount: input.targetCount,
          collected,
          error: compactError(error),
        },
      });
      break;
    }

    const normalizedPageItems = normalizeTikHubResponse(raw, input.platform);
    const { items: pageItems, skipped } = filterDouyinItemsByRequestedContentType(input, normalizedPageItems);
    if (skipped) {
      await recordDouyinContentTypeMismatch(input, douyinKeywordSearchEndpoint, skipped, pageItems.length);
    }
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    if (dedupeItems(items).length >= collectionTarget) break;

    const data = getRecord(raw)?.data;
    const nextCursor = firstNumber(getRecord(data) || getRecord(raw) || {}, ["cursor", "next_cursor", "max_cursor"]);
    searchId = firstString(getRecord(data) || getRecord(raw) || {}, ["search_id", "searchId"]) || searchId;
    backtrace = firstString(getRecord(data) || getRecord(raw) || {}, ["backtrace"]) || backtrace;
    cursor = nextCursor && nextCursor > cursor ? nextCursor : cursor + pageSize;
  }

  return dedupeItems(items);
}

export function buildDouyinKeywordSearchPayload(
  input: Pick<CrawlInput, "query" | "sort" | "contentType" | "cookie">,
  cursor: number,
  searchId = "",
  backtrace = "",
) {
  return {
    keyword: input.query,
    cursor,
    sort_type: mapDouyinSort(input.sort),
    publish_time: "0",
    filter_duration: "0",
    content_type: mapDouyinContentType(input.contentType),
    search_id: searchId,
    backtrace,
    cookie: input.cookie || "",
  };
}

export function mapDouyinSort(sort?: string) {
  const normalized = String(sort || "").trim().toLowerCase();
  const values: Record<string, string> = {
    "0": "0",
    general: "0",
    comprehensive: "0",
    relevance: "0",
    "1": "1",
    most_liked: "1",
    likes_desc: "1",
    like_desc: "1",
    "2": "2",
    latest: "2",
    latest_publish: "2",
    time_descending: "2",
    published_desc: "2",
  };
  return values[normalized] || "0";
}

export function mapDouyinContentType(contentType?: string) {
  const normalized = String(contentType || "").trim().toLowerCase();
  const values: Record<string, string> = {
    "0": "0",
    all: "0",
    any: "0",
    "1": "1",
    video: "1",
    "2": "2",
    image: "2",
    picture: "2",
    photo: "2",
    "3": "3",
    article: "3",
    text: "3",
  };
  return values[normalized] || "0";
}

function filterDouyinItemsByRequestedContentType(input: Pick<CrawlInput, "contentType">, items: NormalizedSourceItem[]) {
  if (mapDouyinContentType(input.contentType) !== "2") {
    return { items, skipped: 0 };
  }

  const filtered: NormalizedSourceItem[] = [];
  let skipped = 0;
  for (const item of items) {
    if (!extractDouyinCarouselImageUrls(item.raw, 1).length) {
      skipped += 1;
      continue;
    }
    filtered.push(stripDouyinVideoMediaFromImageResult(item));
  }

  return { items: filtered, skipped };
}

function stripDouyinVideoMediaFromImageResult(item: NormalizedSourceItem): NormalizedSourceItem {
  return {
    ...item,
    mediaType: "image",
    videoUrl: undefined,
    videoFrames: undefined,
    mediaUrls: item.mediaUrls.filter((url) => !isDownloadableVideoUrl(url)),
  };
}

async function recordDouyinContentTypeMismatch(
  input: Pick<CrawlInput, "query" | "contentType">,
  endpoint: string,
  skipped: number,
  kept: number,
) {
  await recordExecutionLog({
    scope: "tikhub",
    action: "Douyin image content-type mismatch skipped",
    status: "info",
    message: `Skipped ${skipped} Douyin video-like candidates returned for an image content_type request.`,
    details: {
      endpoint,
      query: input.query,
      requestedContentType: mapDouyinContentType(input.contentType),
      skipped,
      kept,
    },
  });
}

async function fetchWeibo(input: CrawlInput) {
  const items: NormalizedSourceItem[] = [];
  let page = 1;

  while (dedupeItems(items).length < input.targetCount && page <= 10) {
    const raw = await tikhubRequest(buildWeiboSearchPath(input, page));
    const pageItems = normalizeTikHubResponse(raw, input.platform);
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    page += 1;
  }

  return dedupeItems(items).slice(0, input.targetCount);
}

export function buildWeiboSearchPath(
  input: Pick<CrawlInput, "query" | "sort" | "searchType" | "includeType">,
  page: number,
) {
  const params = new URLSearchParams({
    query: input.query,
    page: String(Math.max(1, Math.floor(page))),
    search_type: mapWeiboSearchType(input.searchType || input.sort, input.includeType),
  });
  return `${endpointByPlatform.weibo}?${params.toString()}`;
}

export function mapWeiboSearchType(value?: string, includeType?: string) {
  const includeTypeSearch = mapWeiboIncludeType(includeType);
  if (includeTypeSearch) return includeTypeSearch;

  const normalized = String(value || "").trim().toLowerCase();
  const values: Record<string, string> = {
    "1": "1",
    all: "1",
    general: "1",
    comprehensive: "1",
    media: "1",
    viewpoint: "1",
    "3": "3",
    user: "3",
    users: "3",
    people: "3",
    verified: "3",
    "21": "21",
    network: "21",
    whole_network: "21",
    "38": "38",
    topic: "38",
    topics: "38",
    hashtag: "38",
    "60": "60",
    hot: "60",
    popularity: "60",
    "61": "61",
    realtime: "61",
    latest: "61",
    time_descending: "61",
    original: "61",
    "62": "62",
    following: "62",
    followed: "62",
    "63": "63",
    pic: "63",
    picture: "63",
    image: "63",
    photo: "63",
    "64": "64",
    video: "64",
    "92": "92",
    place: "92",
    places: "92",
    location: "92",
    locations: "92",
    "97": "97",
    product: "97",
    products: "97",
    goods: "97",
    "98": "98",
    super_topic: "98",
    supertopic: "98",
  };
  return values[normalized] || "1";
}

function mapWeiboIncludeType(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  const values: Record<string, string> = {
    "63": "63",
    pic: "63",
    picture: "63",
    image: "63",
    photo: "63",
    "64": "64",
    video: "64",
  };
  return values[normalized] || "";
}

async function tikhubRequest(path: string, init?: RequestInit): Promise<unknown> {
  const startedAt = Date.now();
  const url = new URL(path, appConfig.tikhubBaseUrl);
  const method = init?.method || "GET";
  const body = typeof init?.body === "string" ? init.body : undefined;
  await recordExecutionLog({
    scope: "tikhub",
    action: "请求 TikHub 接口",
    status: "running",
    message: `${method} ${url.pathname}`,
    details: {
      method,
      endpoint: url.pathname,
      hasBody: Boolean(body),
    },
  });
  const response = await runWithConcurrencyPool("crawl", () =>
    nodeRequest(url, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${appConfig.tikhubApiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...normalizeHeaders(init?.headers),
      },
    }),
  );

  if (response.status < 200 || response.status >= 300) {
    await recordExecutionLog({
      scope: "tikhub",
      action: "TikHub 接口失败",
      status: "error",
      message: compactError(formatTikHubError(response.status, path, response.body)),
      durationMs: Date.now() - startedAt,
      details: {
        method,
        endpoint: url.pathname,
        status: response.status,
      },
    });
    throw new Error(formatTikHubError(response.status, path, response.body));
  }

  await recordExecutionLog({
    scope: "tikhub",
    action: "TikHub 接口成功",
    status: "success",
    message: `${method} ${url.pathname} 返回 ${response.status}`,
    durationMs: Date.now() - startedAt,
    details: {
      method,
      endpoint: url.pathname,
      status: response.status,
      responseBytes: response.body.length,
    },
  });
  return JSON.parse(response.body);
}

function nodeRequest(
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(url, { method: init.method, headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

function normalizeHeaders(headers?: HeadersInit) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function formatTikHubError(status: number, path: string, body: string) {
  try {
    const parsed = JSON.parse(body) as unknown;
    const detail = getRecord(parsed)?.detail;
    const detailRecord = getRecord(detail);
    const messageZh = firstString(detailRecord || getRecord(parsed) || {}, ["message_zh", "msg_zh"]);
    const message = firstString(detailRecord || getRecord(parsed) || {}, ["message", "msg"]);
    const requestId = firstString(detailRecord || getRecord(parsed) || {}, ["request_id", "requestId"]);
    return [
      `TikHub request failed: ${status}`,
      messageZh || message || body.slice(0, 220),
      `endpoint=${path}`,
      requestId ? `request_id=${requestId}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  } catch {
    return `TikHub request failed: ${status} | endpoint=${path} | ${body.slice(0, 260)}`;
  }
}

export function normalizeTikHubResponse(raw: unknown, platform: Platform): NormalizedSourceItem[] {
  const data = getRecord(raw)?.data ?? raw;
  const records = platform === "xiaohongshu"
    ? extractXiaohongshuRecords(data)
    : platform === "weibo"
      ? extractWeiboRecords(data)
      : platform === "douyin"
        ? extractDouyinRecords(data)
        : extractLikelyRecords(data);
  const observedAt = new Date().toISOString();

  return records.map((record, index) => {
    const normalizedRecord = unwrapContentRecord(record);
    const sourceId = firstString(normalizedRecord, ["aweme_id", "awemeId", "note_id", "noteId", "weibo_id", "mid", "mblogid", "object_id", "id"]) || `${platform}-${index}`;
    const extractedMedia = extractContentMedia(normalizedRecord, platform);
    const extractedImages = normalizeContentImageUrls(extractedMedia.images);
    const fallbackImages = shouldUseGenericImageFallback(platform, extractedImages) ? collectUrls(normalizedRecord, "image") : [];
    const images = normalizeContentImageUrls(dedupeStrings([...extractedImages, ...fallbackImages]))
      .slice(0, getMaxContentImages(platform));
    const videos = dedupeStrings([...extractedMedia.videos, ...collectUrls(normalizedRecord, "video")]).slice(0, 8);
    const links = dedupeStrings([...extractedMedia.links, ...collectUrls(normalizedRecord, "link")]);
    const sourceUrl = normalizeUrl(firstString(normalizedRecord, [
      "share_url",
      "post_url",
      "url",
      "web_url",
      "note_url",
      "video_url",
      "schema_url",
      "display_url",
      "article_url",
      "page_url",
    ]));
    const published = extractPublishedTime(normalizedRecord, undefined, observedAt);
    return {
      id: `${platform}-${sourceId}`,
      platform,
      sourceId,
      mediaType: detectMediaType(normalizedRecord, images, videos),
      sourceUrl,
      authorName: firstString(normalizedRecord, ["nickname", "user_nick", "user_name", "author", "screen_name", "name"]),
      title: extractSourceTitle(normalizedRecord, platform),
      contentText: extractContentText(normalizedRecord, platform),
      images,
      videoUrl: videos[0],
      mediaUrls: dedupeStrings([sourceUrl, ...videos, ...images, ...links].filter((item): item is string => Boolean(item))),
      crawledAt: observedAt,
      publishedAt: published.publishedAt,
      publishedLabel: published.publishedLabel,
      metrics: {
        views: firstNumber(normalizedRecord, [
          "view_count",
          "views",
          "view_num",
          "read_count",
          "read_num",
          "play_count",
          "play_num",
          "playcnt",
          "watched_count",
          "exposure_count",
          "impression_count",
        ]),
        reads: firstNumber(normalizedRecord, ["read_count", "read_num", "reads", "view_count", "view_num"]),
        plays: firstNumber(normalizedRecord, ["play_count", "play_num", "playcnt", "video_play_count", "watched_count"]),
        likes: firstNumber(normalizedRecord, ["liked_count", "digg_count", "like_count", "likes", "attitudes_count", "attitude_count"]),
        comments: firstNumber(normalizedRecord, ["comment_count", "comments_count", "comments", "reply_count"]),
        shares: firstNumber(normalizedRecord, ["share_count", "shares", "reposts_count", "repost_count", "forward_count"]),
        collects: firstNumber(normalizedRecord, [
          "collected_count",
          "collect_count",
          "collects",
          "favorite_count",
          "favorites",
          "favourited_count",
          "fav_count",
        ]),
      },
      raw: normalizedRecord,
    };
  });
}

function extractDouyinRecords(value: unknown): JsonRecord[] {
  const records: JsonRecord[] = [];
  const seen = new Set<JsonRecord>();

  const push = (record: JsonRecord) => {
    if (!seen.has(record)) {
      seen.add(record);
      records.push(record);
    }
  };

  const visit = (node: unknown, depth = 0) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (!isRecord(node)) return;

    const data = getRecord(node.data);
    const content =
      getRecord(node.aweme_info) ||
      getRecord(node.aweme_detail) ||
      getRecord(node.awemeDetail) ||
      getRecord(node.aweme) ||
      (data
        ? getRecord(data.aweme_info) ||
          getRecord(data.aweme_detail) ||
          getRecord(data.awemeDetail) ||
          getRecord(data.aweme)
        : undefined);

    if (content) {
      push({ ...node, ...content });
    } else if (isDouyinAwemeRecord(node)) {
      push(node);
    }

    Object.entries(node).forEach(([key, child]) => {
      if (/^(aweme_info|aweme_detail|awemeDetail|aweme)$/i.test(key)) return;
      visit(child, depth + 1);
    });
  };

  visit(value);
  return dedupeDouyinRecords(records.length ? records : extractLikelyRecords(value));
}

function isDouyinAwemeRecord(record: JsonRecord) {
  const hasIdentity = ["aweme_id", "awemeId", "id"].some((key) => {
    const value = record[key];
    return (typeof value === "string" && value.trim()) || typeof value === "number";
  });
  const hasText = ["desc", "content", "text", "text_raw", "title"].some((key) => typeof record[key] === "string" && record[key].trim());
  const hasContentSignals =
    "aweme_type" in record ||
    "create_time" in record ||
    "statistics" in record ||
    "author" in record ||
    "video" in record ||
    "images" in record ||
    "image_infos" in record;
  return hasIdentity && (hasText || hasContentSignals) && hasContentSignals;
}

function dedupeDouyinRecords(records: JsonRecord[]) {
  const seen = new Set<string>();
  return records.filter((record, index) => {
    const normalizedRecord = unwrapContentRecord(record);
    const id = firstString(normalizedRecord, ["aweme_id", "awemeId", "id"]) || `record-${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function extractSourceTitle(record: JsonRecord, platform: Platform) {
  if (platform === "douyin") {
    return firstString(record, ["title", "display_title", "displayTitle"]);
  }
  return firstString(record, ["title", "display_title", "displayTitle", "desc", "content", "text_raw"]);
}

function extractContentText(record: JsonRecord, platform: Platform) {
  if (platform === "xiaohongshu") {
    return directString(record, ["desc", "content", "original_content", "text", "text_raw", "description", "caption"])
      || firstString(record, ["desc", "content", "original_content", "text", "text_raw", "description", "caption", "display_title", "displayTitle"]);
  }
  return firstString(record, ["content", "original_content", "desc", "text", "text_raw", "description", "caption"]);
}

function shouldUseGenericImageFallback(platform: Platform, extractedImages: string[]) {
  if (platform === "weibo") return false;
  if (!extractedImages.length) return true;
  return platform !== "xiaohongshu" && platform !== "douyin";
}

function getMaxContentImages(platform: Platform) {
  return platform === "douyin" ? maxDouyinContentImages : maxContentImages;
}

function directString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return stripHtml(value.trim());
  }
  return undefined;
}

function extractXiaohongshuRecords(value: unknown): JsonRecord[] {
  const records: JsonRecord[] = [];
  const seen = new Set<JsonRecord>();

  const push = (record: JsonRecord) => {
    if (!seen.has(record)) {
      seen.add(record);
      records.push(record);
    }
  };

  const visit = (node: unknown, depth: number) => {
    if (depth > 7) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!isRecord(node)) return;

    const note = getRecord(node.note);
    const noteCard = getRecord(node.note_card) || getRecord(node.noteCard);
    const noteList = Array.isArray(node.note_list) ? node.note_list.filter(isRecord) : [];
    if (note) push(mergeXiaohongshuWrapperRecord(node, note));
    if (noteCard) push(mergeXiaohongshuWrapperRecord(node, noteCard));
    noteList.forEach((item) => push(mergeXiaohongshuWrapperRecord(node, item)));
    if (!note && !noteCard && !noteList.length && isXiaohongshuNoteRecord(node)) push(node);

    Object.entries(node).forEach(([key, child]) => {
      if (key === "note" || key === "note_card" || key === "noteCard" || key === "note_list") return;
      visit(child, depth + 1);
    });
  };

  visit(value, 0);
  return dedupeRecordsBySource(records.length ? records : extractLikelyRecords(value));
}

function extractWeiboRecords(value: unknown): JsonRecord[] {
  const records: JsonRecord[] = [];
  const seen = new Set<JsonRecord>();

  const visit = (node: unknown, depth = 0) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (!isRecord(node) || seen.has(node)) return;
    seen.add(node);

    if (isWeiboWrapperRecord(node) || isWeiboMblogRecord(node)) {
      records.push(node);
      return;
    }

    Object.values(node).forEach((child) => visit(child, depth + 1));
  };

  visit(value);
  return dedupeWeiboRecords(records.length
    ? records
    : extractLikelyRecords(value).filter((record) => isWeiboWrapperRecord(record) || isWeiboMblogRecord(record)));
}

function isWeiboWrapperRecord(record: JsonRecord) {
  const data = getRecord(record.data);
  return Boolean(getRecord(record.mblog) || (data && getRecord(data.mblog)));
}

function isWeiboMblogRecord(record: JsonRecord) {
  const hasIdentity = ["id", "mid", "mblogid", "idstr"].some((key) => {
    const value = record[key];
    return (typeof value === "string" && value.trim()) || typeof value === "number";
  });
  const hasText = ["text", "text_raw", "content", "desc"].some((key) => typeof record[key] === "string" && record[key].trim());
  const hasContentSignals =
    "created_at" in record ||
    "attitudes_count" in record ||
    "comments_count" in record ||
    "reposts_count" in record ||
    "pic_infos" in record ||
    "pic_ids" in record ||
    "page_info" in record;
  return hasIdentity && hasText && hasContentSignals;
}

function dedupeWeiboRecords(records: JsonRecord[]) {
  const seen = new Set<string>();
  return records.filter((record, index) => {
    const normalizedRecord = unwrapContentRecord(record);
    const id = firstString(normalizedRecord, ["weibo_id", "mid", "mblogid", "id", "idstr"]) || `record-${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mergeXiaohongshuWrapperRecord(wrapper: JsonRecord, content: JsonRecord): JsonRecord {
  return { ...wrapper, ...content };
}

function isXiaohongshuNoteRecord(record: JsonRecord) {
  const hasIdentity = typeof record.id === "string" || typeof record.note_id === "string" || typeof record.noteId === "string";
  const hasText = typeof record.desc === "string" || typeof record.title === "string" || typeof record.display_title === "string";
  const hasContentSignals =
    Array.isArray(record.images_list) ||
    Array.isArray(record.image_list) ||
    isRecord(record.video_info_v2) ||
    isRecord(record.share_info) ||
    ["liked_count", "comments_count", "collected_count", "shared_count", "view_count"].some((key) => key in record);
  return hasIdentity && hasText && hasContentSignals;
}

function dedupeRecordsBySource(records: JsonRecord[]) {
  const seen = new Set<string>();
  return records.filter((record, index) => {
    const id = firstString(record, ["note_id", "noteId", "id"]) || `record-${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function unwrapContentRecord(record: JsonRecord): JsonRecord {
  const data = getRecord(record.data);
  const candidates = [
    getRecord(record.aweme_info),
    data ? getRecord(data.aweme_info) : undefined,
    getRecord(record.aweme_detail),
    getRecord(record.awemeDetail),
    data ? getRecord(data.aweme_detail) : undefined,
    data ? getRecord(data.awemeDetail) : undefined,
    getRecord(record.aweme),
    data ? getRecord(data.aweme) : undefined,
    getRecord(record.note),
    data ? getRecord(data.note) : undefined,
    getRecord(record.note_card),
    getRecord(record.noteCard),
    data ? getRecord(data.note_card) : undefined,
    data ? getRecord(data.noteCard) : undefined,
    getRecord(record.mblog),
    data ? getRecord(data.mblog) : undefined,
    getRecord(record.weibo),
    data ? getRecord(data.weibo) : undefined,
  ];
  const content = candidates.find(Boolean);
  return content ? { ...record, ...content } : record;
}

function extractContentMedia(record: JsonRecord, platform: Platform) {
  if (platform === "douyin") return extractDouyinMedia(record);
  if (platform === "weibo") return extractWeiboMedia(record);
  if (platform === "xiaohongshu") return extractXiaohongshuMedia(record);
  return { images: [] as string[], videos: [] as string[], links: [] as string[] };
}

function extractDouyinMedia(record: JsonRecord) {
  const images: string[] = [];
  const videos: string[] = [];
  const links: string[] = [];

  const carouselImages = extractDouyinCarouselImageUrls(record, maxDouyinContentImages);
  images.push(...carouselImages);

  const video = getRecord(record.video);
  if (video) {
    ["play_addr", "play_addr_265", "play_addr_h264", "download_addr"].forEach((key) => {
      const candidate = getRecord(video[key]);
      if (candidate) videos.push(...extractUrlList(candidate));
    });
    const bitRate = video.bit_rate;
    if (Array.isArray(bitRate)) {
      bitRate.filter(isRecord).forEach((entry) => {
        const playAddr = getRecord(entry.play_addr);
        if (playAddr) videos.push(...extractUrlList(playAddr));
      });
    }
    if (!carouselImages.length) {
      ["cover", "origin_cover", "dynamic_cover"].forEach((key) => {
        const candidate = getRecord(video[key]);
        if (candidate) images.push(...extractUrlList(candidate));
      });
    }
  }

  const shareUrl = firstString(record, ["share_url"]);
  if (shareUrl) links.push(shareUrl);

  return {
    images: normalizeContentImageUrls(dedupeStrings(images)).slice(0, maxDouyinContentImages),
    videos: dedupeStrings(videos).filter(isDownloadableVideoUrl).slice(0, 8),
    links: dedupeStrings(links),
  };
}


function extractWeiboMedia(record: JsonRecord) {
  const images: string[] = [];
  const videos: string[] = [];
  const links: string[] = [];

  const media = getRecord(record.media);
  const mediaImages = media?.images;
  if (Array.isArray(mediaImages)) {
    mediaImages.forEach((item) => {
      if (typeof item === "string") images.push(item);
      if (isRecord(item)) images.push(...extractWeiboImageUrls(item));
    });
  }

  const mediaVideos = media?.videos;
  if (Array.isArray(mediaVideos)) {
    mediaVideos.filter(isRecord).forEach((item) => {
      const src = firstString(item, ["src", "url"]);
      if (src) videos.push(src);
      const streams = item.streams;
      if (Array.isArray(streams)) videos.push(...streams.filter((url): url is string => typeof url === "string"));
      const pageUrl = firstString(item, ["page_url"]);
      if (pageUrl) links.push(pageUrl);
    });
  }

  const picInfos = getRecord(record.pic_infos) || getRecord(record.picInfos);
  const pics = Array.isArray(record.pics) ? record.pics : [];
  if (pics.length) {
    pics.forEach((pic) => {
      const pid = isRecord(pic) && typeof pic.pid === "string" ? pic.pid : undefined;
      const fromPicInfo = pid && picInfos ? picInfos[pid] : undefined;
      images.push(...extractWeiboImageUrls(fromPicInfo || pic));
    });
  } else if (picInfos) {
    Object.values(picInfos).forEach((item) => images.push(...extractWeiboImageUrls(item)));
  }
  images.push(...extractWeiboImageUrls(record.mix_media_info));

  [
    "thumbnail_pic",
    "bmiddle_pic",
    "original_pic",
    "page_pic",
    "cover_pic",
    "pic",
    "pic_url",
    "picUrl",
  ].forEach((key) => {
    const value = record[key];
    if (typeof value === "string") images.push(value);
    if (isRecord(value) || Array.isArray(value)) images.push(...extractWeiboImageUrls(value));
  });

  const pageInfo = getRecord(record.page_info) || getRecord(record.pageInfo);
  if (pageInfo) {
    const mediaInfo = getRecord(pageInfo.media_info) || getRecord(pageInfo.mediaInfo);
    if (mediaInfo) {
      [
        "stream_url",
        "stream_url_hd",
        "mp4_hd_url",
        "mp4_sd_url",
        "mp4_720p_mp4",
        "mp4_1080p_mp4",
      ].forEach((key) => {
        const value = mediaInfo[key];
        if (typeof value === "string") videos.push(value);
      });
    }
    const pageUrl = firstString(pageInfo, ["page_url", "pageUrl", "object_url", "objectUrl"]);
    if (pageUrl) links.push(pageUrl);
  }

  return {
    images: normalizeContentImageUrls(dedupeStrings(images)).slice(0, maxContentImages),
    videos: dedupeStrings(videos).filter(isDownloadableVideoUrl).slice(0, 8),
    links: dedupeStrings(links),
  };
}

function extractWeiboImageUrls(value: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown, depth = 0) => {
    if (depth > 5) return;
    if (typeof node === "string") {
      if (/^https?:\/\//i.test(node) && !isLikelyNonContentImageUrl(node)) urls.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (!isRecord(node)) return;

    const variantKeys = [
      "largest",
      "woriginal",
      "oslarge",
      "large",
      "mw2000",
      "mw1024",
      "cmw960",
      "wap360",
      "wap180",
      "original",
      "bmiddle",
      "middleplus",
      "orj360",
      "thumbnail",
      "pic_big",
      "pic_middle",
      "pic_small",
      "url",
      "src",
    ];
    variantKeys.forEach((key) => visit(node[key], depth + 1));

    Object.entries(node).forEach(([key, child]) => {
      if (/avatar|profile|author|user/i.test(key)) return;
      if (/pic|image|img|cover|large|middle|thumb|mw\d+|cmw\d+|wap\d+|oslarge|original|woriginal|url/i.test(key)) visit(child, depth + 1);
    });
  };

  visit(value);
  return dedupeStrings(urls);
}

function extractXiaohongshuMedia(record: JsonRecord) {
  const images: string[] = [];
  const videos: string[] = [];

  ["image_list", "images_list", "images", "imageList"].forEach((key) => {
    const value = findByKey(record, key);
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === "string") images.push(item);
        if (isRecord(item)) images.push(...extractUrlList(item));
      });
    }
  });

  const cover = getRecord(findByKey(record, "cover"));
  if (cover) images.push(...extractUrlList(cover));

  const video = getRecord(findByKey(record, "video"));
  if (video) videos.push(...extractUrlList(video).filter(isDownloadableVideoUrl));

  return {
    images: normalizeContentImageUrls(dedupeStrings(images)).slice(0, maxContentImages),
    videos: dedupeStrings(videos).slice(0, 8),
    links: [] as string[],
  };
}

function extractUrlList(record: JsonRecord): string[] {
  const urls: string[] = [];
  const directKeys = ["url", "src", "origin_url", "url_default", "url_pre", "url_size_large", "master_url"];
  directKeys.forEach((key) => {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.push(value);
  });

  const urlList = record.url_list;
  if (Array.isArray(urlList)) urls.push(...urlList.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)));

  Object.values(record).forEach((value) => {
    if (isRecord(value)) urls.push(...extractUrlList(value));
    if (Array.isArray(value)) {
      value.filter(isRecord).forEach((item) => urls.push(...extractUrlList(item)));
    }
  });

  return dedupeStrings(urls);
}

function extractLikelyRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value) && value.every(isRecord)) return value;

  const arrays: JsonRecord[][] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      const records = node.filter(isRecord);
      if (records.length) arrays.push(records);
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (isRecord(node)) {
      Object.values(node).forEach((child) => visit(child, depth + 1));
    }
  };

  visit(value, 0);
  arrays.sort((a, b) => scoreRecordArray(b) - scoreRecordArray(a));
  return arrays[0] || [];
}

function scoreRecordArray(records: JsonRecord[]) {
  const sample = records.slice(0, 5);
  const keyText = sample.map((record) => JSON.stringify(Object.keys(record))).join(" ");
  const sampleText = JSON.stringify(sample.slice(0, 2));
  const nestedText = sample
    .map((record) => ["aweme_info", "aweme_detail", "awemeDetail", "aweme", "note", "note_list", "note_card", "noteCard", "mblog", "weibo", "object", "video", "statistics"].filter((key) => key in record).join(" "))
    .join(" ");
  let score = records.length;
  if (/aweme_info|aweme_detail|awemeDetail|aweme\b|note\b|note_list|note_card|noteCard|mblog|weibo|statistics|interact_info|video|liked_count|collected_count|comments_count|shared_count|view_count/i.test(`${keyText} ${nestedText} ${sampleText}`)) score += 1000;
  if (/data_id|card_id/i.test(keyText) && /aweme_info|aweme_detail|awemeDetail|note_card|noteCard|mblog/i.test(sampleText)) score += 800;
  if (/url_list/i.test(keyText) && !/aweme_info|aweme_detail|awemeDetail|note|note_card|noteCard|mblog/i.test(sampleText)) score -= 700;
  if (/fileid|trace_id|url_size_large|need_load_original_image/i.test(keyText) && !/desc|title|liked_count|note/i.test(keyText)) score -= 900;
  if (/guide_search_words|query_id|attached_text/i.test(keyText)) score -= 500;
  if (/word/i.test(keyText) && !/aweme|note|mblog|video/i.test(keyText)) score -= 300;
  return score;
}

function dedupeItems(items: NormalizedSourceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${item.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function comparePublishedAtDesc(a: NormalizedSourceItem, b: NormalizedSourceItem) {
  const aTime = parseIsoTime(a.publishedAt);
  const bTime = parseIsoTime(b.publishedAt);
  if (aTime === bTime) return 0;
  if (!aTime) return 1;
  if (!bTime) return -1;
  return bTime - aTime;
}

function parseIsoTime(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = findByKey(record, key);
    if (typeof found === "string" && found.trim()) return stripHtml(found.trim());
    if (typeof found === "number") return String(found);
  }
  return undefined;
}

function firstNumber(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = findByKey(record, key);
    if (typeof found === "number") return found;
    if (typeof found === "string") {
      const parsed = Number(found.replace(/[, ]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function findByKey(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  if (key in value) return value[key];
  for (const child of Object.values(value)) {
    if (isRecord(child) || Array.isArray(child)) {
      const found = findByKey(child, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function collectUrls(record: JsonRecord, kind: "image" | "video" | "link") {
  const urls = new Set<string>();
  const imagePattern = /\.(png|jpe?g|webp|gif)(\?|$)/i;
  const videoPattern = /\.(mp4|mov|m3u8)(\?|$)/i;
  const keyPattern =
    kind === "image" ? /image|img|cover|pic/i : kind === "video" ? /video|play|mp4|stream/i : /url|link|share|schema/i;
  const urlPattern = kind === "image" ? imagePattern : kind === "video" ? videoPattern : /^https?:\/\//i;

  const visit = (node: unknown, keyHint = "", depth = 0) => {
    if (depth > 6) return;
    if (typeof node === "string") {
      if (kind === "image" && shouldExcludeImageUrl(node, keyHint)) return;
      if (kind === "video" && !isDownloadableVideoUrl(node)) return;
      if (/^https?:\/\//i.test(node) && (urlPattern.test(node) || keyPattern.test(keyHint))) {
        urls.add(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, keyHint, depth + 1));
      return;
    }
    if (isRecord(node)) {
      Object.entries(node).forEach(([key, child]) => visit(child, keyHint ? `${keyHint}.${key}` : key, depth + 1));
    }
  };

  visit(record);
  return Array.from(urls)
    .filter((url) => kind !== "video" || isDownloadableVideoUrl(url))
    .slice(0, kind === "image" ? maxContentImages : 12);
}

function detectMediaType(record: JsonRecord, images: string[], videos: string[]): NormalizedSourceItem["mediaType"] {
  const rawType = firstString(record, ["type", "note_type", "media_type", "aweme_type", "card_type", "object_type"])?.toLowerCase();
  if (rawType?.includes("video")) return "video";
  if (rawType?.includes("image") || rawType?.includes("note") || rawType?.includes("pic")) return videos.length ? "mixed" : "image";
  if (videos.length && images.length) return "mixed";
  if (videos.length) return "video";
  if (images.length) return "image";
  if (firstString(record, ["text", "text_raw", "content"])) return "text";
  return "unknown";
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
}

function ensureSourceUrlFromLink(item: NormalizedSourceItem, sourceUrl: string): NormalizedSourceItem {
  const normalizedSourceUrl = normalizeUrl(item.sourceUrl) || sourceUrl;
  return {
    ...item,
    sourceUrl: normalizedSourceUrl,
    mediaUrls: dedupeStrings([normalizedSourceUrl, ...item.mediaUrls].filter((value): value is string => Boolean(value))),
  };
}

function extractFirstHttpUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return "";
  return match[0].replace(/[),.，。；;]+$/u, "");
}

function extractXiaohongshuLinkInfo(value: string) {
  const url = extractFirstHttpUrl(value);
  if (!url) return {};
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    const noteId =
      parsed.searchParams.get("note_id") ||
      parsed.searchParams.get("noteId") ||
      pathParts.find((part) => /^[0-9a-f]{16,32}$/i.test(part));
    const xsecToken =
      parsed.searchParams.get("xsec_token") ||
      parsed.searchParams.get("xsecToken");
    return {
      noteId: noteId || undefined,
      xsecToken: xsecToken || undefined,
    };
  } catch {
    return {};
  }
}

function extractXiaohongshuShareInfo(raw: unknown) {
  const record = getRecord(raw) || {};
  return {
    noteId: firstString(record, ["note_id", "noteId", "id"]),
    xsecToken: firstString(record, ["xsec_token", "xsecToken"]),
  };
}

function extractDouyinSingleVideoAwemeId(value: string) {
  const url = extractFirstHttpUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    const paramCandidate = parsed.searchParams.get("aweme_id") || parsed.searchParams.get("awemeId") || parsed.searchParams.get("id");
    if (paramCandidate && /^\d{8,32}$/.test(paramCandidate)) return paramCandidate;
    const videoIndex = pathParts.findIndex((part) => part === "video");
    const afterVideo = videoIndex >= 0 ? pathParts[videoIndex + 1] : "";
    if (afterVideo && /^\d{8,32}$/.test(afterVideo)) return afterVideo;
    return "";
  } catch {
    return "";
  }
}

function extractWeiboStatusId(value: string) {
  const url = extractFirstHttpUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const paramCandidate = parsed.searchParams.get("id") || parsed.searchParams.get("mid") || parsed.searchParams.get("mblogid");
    if (paramCandidate) return paramCandidate;
    const pathParts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    const statusIndex = pathParts.findIndex((part) => /^(status|detail)$/i.test(part));
    const afterStatus = statusIndex >= 0 ? pathParts[statusIndex + 1] : "";
    if (afterStatus) return afterStatus;
    return pathParts
      .slice()
      .reverse()
      .find((part) => /^[0-9A-Za-z]{6,32}$/.test(part) && !/^(u|p|profile|status|detail)$/i.test(part)) || "";
  } catch {
    return "";
  }
}

function normalizeUrl(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function shouldExcludeImageUrl(url: string, keyHint: string) {
  return (
    /avatar|author|profile|user_avatar|avatar_larger|avatar_thumb|avatar_medium|music|cha_list|challenge|play_addr|download_addr|bit_rate/i.test(keyHint) ||
    isLikelyNonContentImageUrl(url, keyHint) ||
    isLikelyVideoUrl(url)
  );
}

function isDownloadableVideoUrl(url: string) {
  return /^https?:\/\//i.test(url) && isLikelyVideoUrl(url) && !/\.m3u8(\?|$)/i.test(url);
}

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|mov)(\?|$)/i.test(url) || /mime_type=video|douyinvod|\/video\/tos\/|aweme\/v1\/play|api-play/i.test(url);
}

function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
