import { isLikelyNonContentImageUrl, normalizeContentImageUrls } from "./media-url-filter";

type JsonRecord = Record<string, unknown>;

export function extractDouyinCarouselImageUrls(raw: unknown, maxImages = 36) {
  const record = getRecord(raw);
  if (!record) return [];

  const images: string[] = [];
  ["images", "image_infos", "image_list", "imageList"].forEach((key) => {
    const value = record[key];
    if (!Array.isArray(value)) return;
    value.forEach((item) => {
      if (typeof item === "string") {
        images.push(item);
        return;
      }
      if (!isRecord(item)) return;
      const selected = selectDouyinCarouselImageUrl(item);
      if (selected) images.push(selected);
    });
  });

  return normalizeContentImageUrls(images).slice(0, maxImages);
}

function selectDouyinCarouselImageUrl(record: JsonRecord) {
  const candidates: Array<{ url: string; score: number; index: number }> = [];
  const addUrls = (value: unknown, baseScore: number) => {
    if (!Array.isArray(value)) return;
    value.forEach((url, index) => {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
      if (isLikelyNonContentImageUrl(url) || isLikelyVideoUrl(url)) return;
      candidates.push({ url, score: baseScore + scoreDouyinCarouselImageUrl(url), index });
    });
  };

  addUrls(record.watermark_free_download_url_list, 90);
  addUrls(record.url_list, 80);
  addUrls(record.download_url_list, 30);
  addUrls(record.mask_url_list, 10);

  ["url", "src", "origin_url", "url_default", "urlDefault", "url_pre", "urlPre"].forEach((key, index) => {
    const value = record[key];
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
    if (isLikelyNonContentImageUrl(value) || isLikelyVideoUrl(value)) return;
    candidates.push({ url: value, score: 40 + scoreDouyinCarouselImageUrl(value), index });
  });

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.url;
}

function scoreDouyinCarouselImageUrl(url: string) {
  const decoded = safeDecode(url).toLowerCase();
  let score = 0;
  if (/tplv-dy-aweme-images-v2/.test(decoded)) score += 140;
  if (/watermark_free/.test(decoded)) score += 30;
  if (/\.(?:jpe?g|png|webp)(?:[?#]|$)|:q80\.(?:jpe?g|png|webp)(?:[?#]|$)/.test(decoded)) score += 40;
  if (/\.heic(?:[?#]|$)|:q80\.heic(?:[?#]|$)/.test(decoded)) score -= 180;
  if (/water-v|watermark/.test(decoded)) score -= 90;
  if (/sc=(?:cover|origin_cover)|~noop|tplv-dy-360p/.test(decoded)) score -= 120;
  return score;
}

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|mov|m3u8)(\?|$)/i.test(url) || /mime_type=video|douyinvod|\/video\/tos\/|aweme\/v1\/play|api-play/i.test(url);
}

function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
