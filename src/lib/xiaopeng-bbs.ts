import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { cacheCrawledMedia } from "./media-cache";
import type { NormalizedSourceItem } from "./types";

type JsonRecord = Record<string, unknown>;

const xiaopengBbsBaseUrl = "https://bbs.xiaopeng.com";

export async function fetchXiaopengBbsItemBySource(value: string): Promise<NormalizedSourceItem[]> {
  const sourceId = extractXiaopengBbsThreadId(value);
  if (!sourceId) throw new Error("Unsupported Xiaopeng BBS source id or URL");

  const sourceUrl = buildXiaopengBbsThreadUrl(sourceId);
  const html = await requestText(sourceUrl);
  const item = normalizeXiaopengBbsThread(sourceId, sourceUrl, html);
  return cacheCrawledMedia([item]);
}

export function buildXiaopengBbsThreadUrl(sourceId: string) {
  return `${xiaopengBbsBaseUrl}/thread/${sourceId}?tidType=1`;
}

export function extractXiaopengBbsThreadId(value: string) {
  const text = value.trim();
  if (/^\d{4,20}$/.test(text)) return text;

  const url = extractFirstHttpUrl(text);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!/(^|\.)xiaopeng\.com$/i.test(parsed.hostname)) return "";
    const parts = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    const threadIndex = parts.findIndex((part) => /^thread(?:\.html)?$/i.test(part));
    const afterThread = threadIndex >= 0 ? parts[threadIndex + 1] : "";
    if (afterThread && /^\d{4,20}$/.test(afterThread)) return afterThread;
    const queryId = parsed.searchParams.get("tid") || parsed.searchParams.get("threadId") || parsed.searchParams.get("id");
    return queryId && /^\d{4,20}$/.test(queryId) ? queryId : "";
  } catch {
    return "";
  }
}

export function isXiaopengBbsSource(value: string) {
  return Boolean(extractXiaopengBbsThreadId(value));
}

export function normalizeXiaopengBbsThread(sourceId: string, sourceUrl: string, html: string): NormalizedSourceItem {
  const pageData = extractXiaopengPageData(html);
  const value = getRecord(pageData.value) || pageData;
  const thread = getRecord(value.value) || value;

  const title = firstString(thread, ["title", "subject"]);
  const contentText = firstString(thread, ["content", "summary", "description"]);
  const images = extractAttachmentImages(thread);
  const videos = extractAttachmentVideos(thread);
  const publishedAt = unixSecondsToIso(firstNumber(thread, ["dateline", "createTime", "createdAt"]));
  const topicTitle = extractTopicTitle(thread);
  const resolvedTitle = cleanTitle(title) || topicTitle;

  return {
    id: `xiaopeng_bbs-${sourceId}`,
    platform: "xiaopeng_bbs",
    sourceId,
    mediaType: videos.length ? (images.length ? "mixed" : "video") : images.length ? "image" : contentText ? "text" : "unknown",
    sourceUrl,
    authorName: firstString(thread, ["username", "authorName", "nickname"]),
    title: resolvedTitle || undefined,
    contentText: contentText || resolvedTitle || undefined,
    images,
    videoUrl: videos[0],
    mediaUrls: dedupeStrings([sourceUrl, ...images, ...videos]),
    publishedAt,
    publishedLabel: publishedAt,
    crawledAt: new Date().toISOString(),
    metrics: {
      views: firstNumber(thread, ["views", "viewCount"]),
      comments: firstNumber(thread, ["replies", "comments", "commentCount"]),
      likes: firstNumber(thread, ["liked", "likes", "likeCount"]),
      collects: firstNumber(thread, ["collectNums", "collects", "collectCount"]),
    },
    raw: thread,
  };
}

function extractXiaopengPageData(html: string): JsonRecord {
  const direct = extractPageDataObject(html);
  if (direct) return direct;

  const decodedFragments = Array.from(html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g))
    .map((match) => decodeScriptStringFragment(match[1]))
    .join("\n");
  const fromFragments = extractPageDataObject(decodedFragments);
  if (fromFragments) return fromFragments;

  throw new Error("Xiaopeng BBS page data not found");
}

function extractPageDataObject(text: string): JsonRecord | undefined {
  const marker = '"pageData":';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const objectStart = text.indexOf("{", markerIndex + marker.length);
  if (objectStart < 0) return undefined;
  const objectText = readBalancedJsonObject(text, objectStart);
  if (!objectText) return undefined;
  const parsed = JSON.parse(objectText);
  return isRecord(parsed) ? parsed : undefined;
}

function readBalancedJsonObject(text: string, start: number) {
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
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function decodeScriptStringFragment(value: string) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function extractAttachmentImages(record: JsonRecord) {
  const attachments = Array.isArray(record.attach) ? record.attach : [];
  return dedupeStrings(
    attachments
      .filter(isRecord)
      .filter((item) => String(item.type || "").toUpperCase() === "IMAGE" || typeof item.attachment === "string")
      .map((item) => normalizeUrl(firstString(item, ["attachment", "url", "src"])))
      .filter((url): url is string => Boolean(url) && isLikelyImageUrl(url)),
  );
}

function extractAttachmentVideos(record: JsonRecord) {
  const videos = Array.isArray(record.videos) ? record.videos : [];
  const attachments = Array.isArray(record.attach) ? record.attach : [];
  return dedupeStrings(
    [...videos, ...attachments]
      .filter(isRecord)
      .flatMap((item) => [firstString(item, ["url", "src", "attachment", "videoUrl", "playUrl"]), firstString(item, ["cover"])])
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => Boolean(url) && isLikelyVideoUrl(url)),
  );
}

function extractTopicTitle(record: JsonRecord) {
  const topics = Array.isArray(record.topics) ? record.topics.filter(isRecord) : [];
  const topic = topics.map((item) => firstString(item, ["name", "speciesBindTopicName"])).find(Boolean);
  return topic ? `#${topic}#` : "";
}

function cleanTitle(value?: string) {
  const text = value?.replace(/\s+/g, " ").trim() || "";
  return text || undefined;
}

function requestText(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 4) {
      reject(new Error("too many redirects"));
      return;
    }
    const parsedUrl = new URL(url);
    const request = parsedUrl.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(
      parsedUrl,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();
          requestText(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
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
          if (body.length > 8 * 1024 * 1024) req.destroy(new Error("response too large"));
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

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return stripHtml(value.trim());
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function firstNumber(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[, ]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function unixSecondsToIso(value?: number) {
  if (!value) return undefined;
  const millis = value > 10_000_000_000 ? value : value * 1000;
  return new Date(millis).toISOString();
}

function extractFirstHttpUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.，。；;]+$/u, "") : "";
}

function normalizeUrl(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function isLikelyImageUrl(url?: string) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(new URL(url).pathname);
}

function isLikelyVideoUrl(url?: string) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && /\.(mp4|mov)(?:[?#]|$)/i.test(new URL(url).pathname);
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
