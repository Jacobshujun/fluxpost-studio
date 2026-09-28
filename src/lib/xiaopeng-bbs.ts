import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { cacheCrawledMedia } from "./media-cache";
import { rankVideoUrlsByQuality, type VideoQualityCandidate } from "./video-quality";
import type { NormalizedSourceItem } from "./types";

type JsonRecord = Record<string, unknown>;

type SourceFetchOptions = {
  enableVideoTranscription?: boolean;
};

const xiaopengBbsBaseUrl = "https://bbs.xiaopeng.com";

export async function fetchXiaopengBbsItemBySource(value: string, options: SourceFetchOptions = {}): Promise<NormalizedSourceItem[]> {
  const sourceId = extractXiaopengBbsThreadId(value);
  if (!sourceId) throw new Error("Unsupported Xiaopeng BBS source id or URL");

  const sourceUrl = buildXiaopengBbsThreadUrl(sourceId);
  const html = await requestText(sourceUrl);
  const item = normalizeXiaopengBbsThread(sourceId, sourceUrl, html);
  return cacheCrawledMedia([item], { enableVideoTranscription: options.enableVideoTranscription === true });
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
  const { pageData, textRecords } = extractXiaopengPageData(html);
  const value = getRecord(pageData.value) || pageData;
  const thread = getRecord(value.value) || value;

  const title = firstString(thread, ["title", "subject"]);
  const content = extractThreadContent(thread, textRecords);
  const contentText = content.text;
  const images = dedupeStrings([...content.images, ...extractAttachmentImages(thread)]);
  const videos = extractAttachmentVideos(thread, content.videos);
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

function extractXiaopengPageData(html: string) {
  const stream = Array.from(html.matchAll(/self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)\s*;?\s*<\/script>/g))
    .map((match) => (JSON.parse(match[1]) as [number, string])[1])
    .join("");
  const { modelRows, textRecords } = readFlightRows(stream);
  const pageData = extractPageDataObject(modelRows) || extractPageDataObject(html);
  if (!pageData) throw new Error("Xiaopeng BBS page data not found");
  return { pageData, textRecords };
}

function readFlightRows(stream: string) {
  const bytes = Buffer.from(stream, "utf8");
  const textRecords = new Map<string, string>();
  const modelRows: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    // Flight T records use hexadecimal UTF-8 byte lengths, not JS character counts.
    const header = /^([\da-f]+):T([\da-f]+),/.exec(bytes.subarray(offset, offset + 64).toString("utf8"));
    if (header) {
      const start = offset + header[0].length;
      const end = start + Number.parseInt(header[2], 16);
      if (!Number.isSafeInteger(end) || end > bytes.length) throw new Error("Xiaopeng BBS truncated Flight text record");
      textRecords.set(header[1], bytes.subarray(start, end).toString("utf8"));
      offset = end;
    } else {
      const newline = bytes.indexOf(10, offset);
      const end = newline < 0 ? bytes.length : newline + 1;
      modelRows.push(bytes.subarray(offset, end).toString("utf8"));
      offset = end;
    }
  }
  return { modelRows: modelRows.join(""), textRecords };
}

function extractThreadContent(thread: JsonRecord, textRecords: Map<string, string>) {
  let content = typeof thread.content === "string" ? thread.content : "";
  const reference = /^\$([\da-f]+)$/.exec(content);
  if (reference) {
    const resolved = textRecords.get(reference[1]);
    if (resolved === undefined) throw new Error("Xiaopeng BBS unresolved body text reference");
    content = resolved;
  } else if (content.startsWith("$$")) {
    content = content.slice(1);
  }
  if (!content.trim() || thread.dataStruct !== "Json") {
    return { text: content.trim() ? stripHtml(content) : firstString(thread, ["summary", "description"]), images: [] as string[], videos: [] as string[] };
  }

  let inserts: unknown;
  try {
    inserts = JSON.parse(content);
  } catch {
    throw new Error("Xiaopeng BBS invalid rich-text JSON");
  }
  if (!Array.isArray(inserts)) throw new Error("Xiaopeng BBS invalid rich-text insert array");
  const text: string[] = [];
  const images: string[] = [];
  const videos: string[] = [];
  for (const operation of inserts) {
    const insert: unknown = getRecord(operation)?.insert;
    if (typeof insert === "string") {
      text.push(insert);
    } else if (isRecord(insert) && typeof insert.image === "string") {
      const url = normalizeUrl(insert.image);
      if (!url || !isLikelyImageUrl(url)) throw new Error("Xiaopeng BBS invalid rich-text image URL");
      images.push(url);
    } else if (isRecord(insert) && typeof insert.video === "string") {
      const url = normalizeUrl(insert.video);
      if (!url || !isLikelyVideoUrl(url)) throw new Error("Xiaopeng BBS invalid rich-text video URL");
      videos.push(url);
    } else if (isRecord(insert) && isRecord(insert.mention) && typeof insert.mention.value === "string") {
      text.push(`${typeof insert.mention.denotationChar === "string" ? insert.mention.denotationChar : ""}${insert.mention.value}`);
    } else {
      throw new Error("Xiaopeng BBS unsupported rich-text insert");
    }
  }
  return { text: text.join("").trim(), images, videos };
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

function extractAttachmentVideos(record: JsonRecord, inlineVideos: string[]) {
  const videos = Array.isArray(record.videos) ? record.videos : [];
  const attachments = Array.isArray(record.attach) ? record.attach : [];
  const candidates: VideoQualityCandidate[] = [];
  [...videos, ...attachments].filter(isRecord).forEach((item, index) => {
    const context: Partial<VideoQualityCandidate> = {
      width: firstNumber(item, ["width", "w"]),
      height: firstNumber(item, ["height", "h"]),
      bitrate: firstNumber(item, ["bit_rate", "bitrate"]),
      quality: firstString(item, ["quality", "definition", "format"]),
      keyHint: `attachment.${index}`,
    };
    ["url", "src", "attachment", "videoUrl", "playUrl"].forEach((key) => {
      const url = normalizeUrl(firstString(item, [key]));
      if (url && isLikelyVideoUrl(url)) candidates.push({ ...context, url, keyHint: `attachment.${index}.${key}` });
    });
  });
  // Keep attachment quality metadata ahead of duplicate inline URLs.
  candidates.push(...inlineVideos.map((url, index) => ({ url, keyHint: `inline.${index}` })));
  return rankVideoUrlsByQuality(candidates).filter(isLikelyVideoUrl);
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
