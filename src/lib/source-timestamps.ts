import type { NormalizedSourceItem } from "./types";

type JsonRecord = Record<string, unknown>;

const numericPublishKeys = [
  "create_time",
  "createTime",
  "created_time",
  "createdTime",
  "publish_time",
  "publishTime",
  "published_time",
  "publishedTime",
  "published_at",
  "publishedAt",
  "upload_time",
  "uploadTime",
  "post_time",
  "postTime",
  "timestamp",
];

const labelPublishKeys = [
  "publish_time",
  "publishTime",
  "published_at",
  "publishedAt",
  "created_at",
  "createdAt",
  "dateTime",
  "date_time",
  "display_time",
  "time_text",
  "timeText",
];

export function enrichSourceTimestamps(
  item: NormalizedSourceItem,
  observedAt = new Date().toISOString(),
): NormalizedSourceItem {
  const published = extractPublishedTime(item.raw, item.publishedLabel, observedAt);
  const lastSeenAt = item.lastSeenAt || item.crawledAt || observedAt;
  return {
    ...item,
    crawledAt: item.crawledAt || lastSeenAt,
    firstSeenAt: item.firstSeenAt || item.crawledAt || observedAt,
    lastSeenAt,
    publishedAt: item.publishedAt || published.publishedAt,
    publishedLabel: item.publishedLabel || published.publishedLabel,
  };
}

export function extractPublishedTime(
  raw: unknown,
  fallbackLabel?: string,
  observedAt = new Date().toISOString(),
) {
  const baseDate = new Date(observedAt);
  const record = isRecord(raw) ? raw : {};
  const embeddedUploadTime = extractEmbeddedUploadTime(record);
  const timestampCandidate = embeddedUploadTime ?? firstByKeys(record, numericPublishKeys);
  const labelCandidate = firstStringByKeys(record, labelPublishKeys) || fallbackLabel;
  const publishedAt =
    normalizeTimestamp(timestampCandidate, baseDate) ||
    (labelCandidate ? parsePublishLabel(labelCandidate, baseDate) : undefined);

  return {
    publishedAt,
    publishedLabel: labelCandidate,
  };
}

function normalizeTimestamp(value: unknown, baseDate: Date) {
  if (typeof value === "number" && Number.isFinite(value)) return timestampToIso(value);
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d{10,17}$/.test(trimmed)) return timestampToIso(Number(trimmed));
  return parsePublishLabel(trimmed, baseDate);
}

function timestampToIso(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  let ms = value;
  if (ms < 10_000_000_000) ms *= 1000;
  if (ms > 10_000_000_000_000) ms = Math.floor(ms / 1000);

  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parsePublishLabel(value: string, baseDate: Date) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (/刚刚|刚才/i.test(text)) return baseDate.toISOString();

  const relativeUnits: Array<[RegExp, number]> = [
    [/(\d+)\s*秒前/i, 1000],
    [/(\d+)\s*分钟前/i, 60 * 1000],
    [/(\d+)\s*小时前/i, 60 * 60 * 1000],
    [/(\d+)\s*天前/i, 24 * 60 * 60 * 1000],
    [/(\d+)\s*周前/i, 7 * 24 * 60 * 60 * 1000],
  ];

  for (const [pattern, unitMs] of relativeUnits) {
    const match = text.match(pattern);
    if (match) return new Date(baseDate.getTime() - Number(match[1]) * unitMs).toISOString();
  }

  const monthMatch = text.match(/(\d+)\s*个月前/i);
  if (monthMatch) {
    const date = new Date(baseDate);
    date.setMonth(date.getMonth() - Number(monthMatch[1]));
    return date.toISOString();
  }

  const yearMatch = text.match(/(\d+)\s*年前/i);
  if (yearMatch) {
    const date = new Date(baseDate);
    date.setFullYear(date.getFullYear() - Number(yearMatch[1]));
    return date.toISOString();
  }

  const dayOffset = text.includes("前天") ? 2 : text.includes("昨天") ? 1 : text.includes("今天") ? 0 : undefined;
  if (dayOffset !== undefined) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - dayOffset);
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      date.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return date.toISOString();
  }

  const chineseDateMatch = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?(?:\s*(\d{1,2}):(\d{2}))?/);
  if (chineseDateMatch) {
    const date = new Date(baseDate);
    date.setFullYear(chineseDateMatch[1] ? Number(chineseDateMatch[1]) : baseDate.getFullYear());
    date.setMonth(Number(chineseDateMatch[2]) - 1, Number(chineseDateMatch[3]));
    date.setHours(chineseDateMatch[4] ? Number(chineseDateMatch[4]) : 0, chineseDateMatch[5] ? Number(chineseDateMatch[5]) : 0, 0, 0);
    if (!chineseDateMatch[1] && date.getTime() - baseDate.getTime() > 24 * 60 * 60 * 1000) date.setFullYear(date.getFullYear() - 1);
    return date.toISOString();
  }

  const normalized = text.replace(/\./g, "-").replace(/\//g, "-");
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function extractEmbeddedUploadTime(record: JsonRecord) {
  const value = firstByKeys(record, ["report_extinfo_str", "reportExtinfoStr", "report_extinfo"]);
  if (typeof value !== "string" || !value.trim()) return undefined;

  const candidates = [value];
  try {
    candidates.push(decodeURIComponent(value));
  } catch {
    // Keep the original string if it is not URI encoded.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) {
        const uploadTime = firstByKeys(parsed, ["upload_time", "uploadTime", "create_time", "createTime"]);
        if (uploadTime) return uploadTime;
      }
    } catch {
      // Ignore malformed embedded payloads.
    }
  }

  return undefined;
}

function firstStringByKeys(record: JsonRecord, keys: string[]) {
  const value = firstByKeys(record, keys);
  return typeof value === "string" && value.trim() ? stripHtml(value.trim()) : undefined;
}

function firstByKeys(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const found = findByKey(record, key);
    if (found !== undefined && found !== null && found !== "") return found;
  }
  return undefined;
}

function findByKey(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findByKey(child, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
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

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
