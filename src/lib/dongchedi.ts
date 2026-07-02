import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { cacheCrawledMedia } from "./media-cache";
import { rankVideoUrlsByQuality, type VideoQualityCandidate } from "./video-quality";
import type { NormalizedSourceItem } from "./types";

type JsonRecord = Record<string, unknown>;

type SourceFetchOptions = {
  enableVideoTranscription?: boolean;
  cookie?: string;
};

const dongchediBaseUrl = "https://www.dongchedi.com";

export async function fetchDongchediItemBySource(value: string, options: SourceFetchOptions = {}): Promise<NormalizedSourceItem[]> {
  const sourceId = extractDongchediArticleId(value);
  if (!sourceId) throw new Error("Unsupported Dongchedi article id or URL");

  const sourceUrl = buildDongchediArticleUrl(sourceId);
  const html = await requestText(sourceUrl, { cookie: options.cookie });
  const item = normalizeDongchediArticle(sourceId, sourceUrl, html);
  return cacheCrawledMedia([item], { enableVideoTranscription: options.enableVideoTranscription === true });
}

export function buildDongchediArticleUrl(sourceId: string) {
  return `${dongchediBaseUrl}/ugc/article/${sourceId}`;
}

export function extractDongchediArticleId(value: string) {
  const text = value.trim();
  if (/^\d{8,24}$/.test(text)) return text;

  const url = extractFirstHttpUrl(text);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!/(^|\.)dongchedi\.com$/i.test(parsed.hostname) && !/(^|\.)dcarapi\.com$/i.test(parsed.hostname)) return "";
    const pathParts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    const articleIndex = pathParts.findIndex((part) => /^(article|ugc\/article)$/i.test(part));
    const afterArticle = articleIndex >= 0 ? pathParts[articleIndex + 1] : "";
    if (afterArticle && /^\d{8,24}$/.test(afterArticle)) return afterArticle;
    const pathId = pathParts.find((part) => /^\d{8,24}$/.test(part));
    if (pathId) return pathId;
    const queryId =
      parsed.searchParams.get("group_id") ||
      parsed.searchParams.get("groupId") ||
      parsed.searchParams.get("article_id") ||
      parsed.searchParams.get("articleId") ||
      parsed.searchParams.get("id");
    return queryId && /^\d{8,24}$/.test(queryId) ? queryId : "";
  } catch {
    return "";
  }
}

export function isDongchediSource(value: string) {
  return Boolean(extractDongchediArticleId(value));
}

export function normalizeDongchediArticle(sourceId: string, sourceUrl: string, html: string): NormalizedSourceItem {
  const jsonRoots = extractEmbeddedJsonRoots(html);
  const article = findBestArticleRecord(jsonRoots, sourceId);
  if (!article) {
    if (isDongchediAntiBotChallenge(html)) {
      throw new Error("Dongchedi anti-bot challenge page returned; article data was not available. Provide a valid Dongchedi Cookie in link import or one-click link mode, then retry.");
    }
    throw new Error("Dongchedi article data not found");
  }

  const title = cleanText(directString(article, ["title", "articleTitle", "displayTitle", "headline", "name"])) || extractTitleFromHtml(html);
  const contentText = cleanText(directString(article, ["content", "articleContent", "abstract", "description", "summary", "text", "body"]));
  const images = extractArticleImages(article);
  const videos = extractArticleVideos(article);
  const publishedAt = resolvePublishedAt(article);

  if (!title && !contentText && !images.length && !videos.length) {
    throw new Error("Dongchedi article data is empty");
  }

  return {
    id: `dongchedi-${sourceId}`,
    platform: "dongchedi",
    sourceId,
    mediaType: videos.length ? (images.length ? "mixed" : "video") : images.length ? "image" : contentText ? "text" : "unknown",
    sourceUrl,
    authorName: resolveAuthorName(article),
    title: title || undefined,
    contentText: contentText || title || undefined,
    images,
    videoUrl: videos[0],
    mediaUrls: dedupeStrings([sourceUrl, ...images, ...videos]),
    publishedAt,
    publishedLabel: publishedAt,
    crawledAt: new Date().toISOString(),
    metrics: {
      reads: firstNumber(article, ["readCount", "read_count", "read", "viewCount", "view_count"]),
      views: firstNumber(article, ["views", "view", "impressionCount"]),
      likes: firstNumber(article, ["diggCount", "digg_count", "likeCount", "like_count", "likes"]),
      comments: firstNumber(article, ["commentCount", "comment_count", "comments"]),
      shares: firstNumber(article, ["shareCount", "share_count", "shares"]),
      collects: firstNumber(article, ["collectCount", "collect_count", "favorites"]),
    },
    raw: article,
  };
}

function extractEmbeddedJsonRoots(html: string): unknown[] {
  const roots: unknown[] = [];

  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = htmlDecode(match[1]).trim();
    if (!body) continue;
    const directJson = parseJsonMaybe(body);
    if (directJson !== undefined) roots.push(directJson);
    for (const marker of ['"articleInfo"', '"article_info"', '"article"', '"detail"', '"pageData"']) {
      const fromMarker = extractJsonAfterMarker(body, marker);
      if (fromMarker !== undefined) roots.push(fromMarker);
    }
  }

  return roots;
}

function extractJsonAfterMarker(text: string, marker: string): unknown {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const colon = text.indexOf(":", markerIndex + marker.length);
  if (colon < 0) return undefined;
  const start = findJsonStart(text, colon + 1);
  if (start < 0) return undefined;
  const jsonText = readBalancedJson(text, start);
  return jsonText ? parseJsonMaybe(jsonText) : undefined;
}

function findJsonStart(text: string, start: number) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{" || text[index] === "[") return index;
    if (!/\s/.test(text[index])) return -1;
  }
  return -1;
}

function readBalancedJson(text: string, start: number) {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function findBestArticleRecord(roots: unknown[], sourceId: string): JsonRecord | undefined {
  const candidates: JsonRecord[] = [];
  const visit = (node: unknown, depth = 0) => {
    if (depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    candidates.push(node);
    Object.values(node).forEach((child) => visit(child, depth + 1));
  };
  roots.forEach((root) => visit(root));
  return candidates
    .map((record) => ({ record, score: scoreArticleRecord(record, sourceId) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.record;
}

function scoreArticleRecord(record: JsonRecord, sourceId: string) {
  if (isDongchediCommentRecord(record)) return 0;

  let score = 0;
  const id = directString(record, [
    "groupIdStr",
    "group_id_str",
    "articleIdStr",
    "article_id_str",
    "itemIdStr",
    "item_id_str",
    "idStr",
    "id_str",
    "groupId",
    "group_id",
    "articleId",
    "article_id",
    "itemId",
    "item_id",
    "id",
  ]);
  if (id === sourceId) score += 100;
  if (hasAnyKey(record, ["articleData", "articleInfo", "article_type", "article_sub_type", "content_publish_time", "cover_list"])) score += 40;
  if (directString(record, ["title", "articleTitle", "displayTitle", "headline", "name"])) score += 20;
  if (directString(record, ["content", "articleContent", "abstract", "description", "summary", "text", "body"])) score += 30;
  if (extractArticleImages(record).length) score += 20;
  if (resolveAuthorName(record)) score += 8;
  if (firstNumber(record, ["publishTime", "publish_time", "createTime", "create_time"])) score += 8;
  return score;
}

function isDongchediCommentRecord(record: JsonRecord) {
  return hasAnyKey(record, [
    "comment_id",
    "comment_id_str",
    "reply_id",
    "reply_id_str",
    "reply_to_comment_id",
    "reply_to_comment_id_str",
    "reply_to_reply_id",
    "reply_to_reply_id_str",
  ]);
}

function extractArticleImages(record: JsonRecord) {
  const urls = new Set<string>();
  const visit = (node: unknown, keyHint = "", depth = 0) => {
    if (depth > 6) return;
    if (typeof node === "string") {
      const normalized = normalizeUrl(node);
      if (normalized && isLikelyContentImageUrl(normalized, keyHint)) urls.add(normalized);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, keyHint, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    Object.entries(node).forEach(([key, child]) => {
      if (/avatar|user|profile|icon|logo/i.test(key)) return;
      if (/image|img|pic|cover|thumb|url|uri|list|content/i.test(key)) visit(child, keyHint ? `${keyHint}.${key}` : key, depth + 1);
    });
  };
  visit(record);
  return Array.from(urls).slice(0, 18);
}

function extractArticleVideos(record: JsonRecord) {
  const candidates: VideoQualityCandidate[] = [];
  const visit = (node: unknown, keyHint = "", context: Partial<VideoQualityCandidate> = {}, depth = 0) => {
    if (depth > 6) return;
    if (typeof node === "string") {
      const normalized = normalizeUrl(node);
      if (normalized && isLikelyVideoUrl(normalized)) candidates.push({ ...context, url: normalized, keyHint });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${keyHint}.${index}`, context, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    const nextContext: Partial<VideoQualityCandidate> = {
      ...context,
      width: firstNumber(node, ["width", "w"]) || context.width,
      height: firstNumber(node, ["height", "h"]) || context.height,
      bitrate: firstNumber(node, ["bit_rate", "bitrate", "avg_bitrate", "video_bitrate"]) || context.bitrate,
      quality: firstString(node, ["quality", "quality_type", "definition", "format"]) || context.quality,
      keyHint,
    };
    Object.entries(node).forEach(([key, child]) => {
      if (/video|play|mp4|stream|url|src|main/i.test(key)) visit(child, keyHint ? `${keyHint}.${key}` : key, nextContext, depth + 1);
    });
  };
  visit(record);
  return rankVideoUrlsByQuality(candidates).filter(isLikelyVideoUrl).slice(0, 8);
}

function resolveAuthorName(record: JsonRecord) {
  const direct = firstString(record, ["authorName", "author_name", "name", "userName", "user_name", "nickname"]);
  if (direct) return direct;
  const author = getRecord(record.author) || getRecord(record.user) || getRecord(record.creator);
  return author ? firstString(author, ["name", "nickname", "userName", "screenName"]) : undefined;
}

function resolvePublishedAt(record: JsonRecord) {
  const numberValue = firstNumber(record, ["publishTime", "publish_time", "createTime", "create_time", "createdAt", "created_at"]);
  if (numberValue) return unixSecondsToIso(numberValue);
  const stringValue = firstString(record, ["publishDate", "publish_date", "createdAt", "created_at"]);
  if (!stringValue) return undefined;
  const parsed = Date.parse(stringValue);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function requestText(url: string, options: { cookie?: string } = {}, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 4) {
      reject(new Error("too many redirects"));
      return;
    }
    const parsedUrl = new URL(url);
    const request = parsedUrl.protocol === "http:" ? httpRequest : httpsRequest;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: "https://www.dongchedi.com/",
    };
    if (options.cookie) headers.Cookie = options.cookie;
    const req = request(
      parsedUrl,
      {
        headers,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();
          requestText(redirectUrl, options, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        res.setEncoding("utf8");
        let body = "";
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 12 * 1024 * 1024) req.destroy(new Error("response too large"));
        });
        res.on("end", () => resolve(body));
        res.on("error", reject);
      },
    );
    req.setTimeout(45000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

function parseJsonMaybe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractTitleFromHtml(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : "";
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = findByKey(record, key);
    if (typeof found === "string" && found.trim()) return stripHtml(found.trim());
    if (typeof found === "number") return String(found);
  }
  return undefined;
}

function directString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = record[key];
    if (typeof found === "string" && found.trim()) return stripHtml(found.trim());
    if (typeof found === "number" && Number.isSafeInteger(found)) return String(found);
  }
  return undefined;
}

function firstNumber(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = findByKey(record, key);
    if (typeof found === "number" && Number.isFinite(found)) return found;
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

function hasAnyKey(record: JsonRecord, keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function unixSecondsToIso(value: number) {
  const millis = value > 10_000_000_000 ? value : value * 1000;
  return new Date(millis).toISOString();
}

function extractFirstHttpUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/u, "") : "";
}

function normalizeUrl(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (text.startsWith("//")) return `https:${text}`;
  if (/^tos-cn-/i.test(text)) return `https://p3.dcarimg.com/img/${text}`;
  return text;
}

function isLikelyContentImageUrl(url: string, keyHint: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/avatar|profile|user|icon|logo/i.test(keyHint)) return false;
  try {
    const parsed = new URL(url);
    const text = `${parsed.hostname}${parsed.pathname}`;
    return /\.(png|jpe?g|webp|gif)(?:[~?/#]|$)/i.test(text) || /dcarimg|byteimg|pstatp|toutiaoimg/i.test(text);
  } catch {
    return false;
  }
}

function isLikelyVideoUrl(url: string) {
  return /^https?:\/\//i.test(url) && (/\.(mp4|mov)(?:[?#]|$)/i.test(url) || /mime_type=video|video\/tos\//i.test(url));
}

function isDongchediAntiBotChallenge(html: string) {
  return /byted_acrawler|__ac_signature|window\.location\.reload/i.test(html);
}

function htmlDecode(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string) {
  return htmlDecode(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanText(value?: string) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
