export function filterContentImageUrls(urls: string[]) {
  return urls.filter((url) => !isLikelyNonContentImageUrl(url) && !isLikelyVideoUrl(url));
}

export function normalizeContentImageUrls(urls: string[]) {
  const bestByAsset = new Map<string, { url: string; score: number; index: number }>();

  filterContentImageUrls(urls).forEach((url, index) => {
    const assetKey = getImageAssetKey(url);
    const score = scoreImageUrl(url);
    const previous = bestByAsset.get(assetKey);
    if (!previous || score > previous.score) {
      bestByAsset.set(assetKey, { url, score, index: previous?.index ?? index });
    }
  });

  return Array.from(bestByAsset.values())
    .sort((a, b) => a.index - b.index)
    .map((item) => item.url);
}

type MergeImageOptions = {
  preferDownloaded?: boolean;
};

export function mergeDownloadedAndRemoteImages(downloadedImages?: string[], sourceImages?: string[], options: MergeImageOptions = {}) {
  const normalizedSourceImages = normalizeContentImageUrls(sourceImages || []);
  if (!normalizedSourceImages.length) return Array.from(new Set(downloadedImages || []));

  const alignedDownloads = filterAlignedDownloadedImages(downloadedImages, normalizedSourceImages) || [];
  const localBySourceIndex = new Map<number, { url: string; fallbackIndex: number }>();
  const unindexedDownloads: string[] = [];

  alignedDownloads.forEach((url, fallbackIndex) => {
    const sourceIndex = getCachedImageIndex(url) ?? fallbackIndex;
    if (sourceIndex >= 0 && sourceIndex < normalizedSourceImages.length) {
      localBySourceIndex.set(sourceIndex, { url, fallbackIndex });
    } else {
      unindexedDownloads.push(url);
    }
  });

  const mergedBySourceOrder = normalizedSourceImages.map((url, index) => localBySourceIndex.get(index)?.url || url);
  if (!options.preferDownloaded) return Array.from(new Set([...mergedBySourceOrder, ...unindexedDownloads]));

  const downloadedBySourceOrder = Array.from(localBySourceIndex.entries())
    .sort(([aIndex, aValue], [bIndex, bValue]) => aIndex - bIndex || aValue.fallbackIndex - bValue.fallbackIndex)
    .map(([, value]) => value.url);

  return Array.from(new Set([...downloadedBySourceOrder, ...unindexedDownloads, ...mergedBySourceOrder]));
}

export function filterAlignedDownloadedImages(downloadedImages?: string[], sourceImages?: string[]) {
  if (!downloadedImages?.length) return undefined;
  if (!sourceImages?.length) return downloadedImages;
  if (downloadedImages.length > sourceImages.length) return undefined;

  const filtered = downloadedImages
    .map((url, fallbackIndex) => ({ url, sourceIndex: getCachedImageIndex(url) ?? fallbackIndex, fallbackIndex }))
    .filter(({ sourceIndex }) => {
      const sourceUrl = sourceImages[sourceIndex];
      return Boolean(sourceUrl) && !isLikelyNonContentImageUrl(sourceUrl);
    })
    .sort((a, b) => a.sourceIndex - b.sourceIndex || a.fallbackIndex - b.fallbackIndex)
    .map((item) => item.url);
  return filtered.length ? filtered : undefined;
}

export function isLikelyNonContentImageUrl(url: string, keyHint = "") {
  const normalizedUrl = safeDecode(url).toLowerCase();
  const normalizedHint = keyHint.toLowerCase();
  return (
    isLikelyAvatarUrl(normalizedUrl) ||
    isLikelyStaticUiAssetUrl(normalizedUrl) ||
    /avatar|author|profile|user_avatar|avatar_larger|avatar_thumb|avatar_medium|headimg|iconurl/i.test(normalizedHint) ||
    /music|cha_list|challenge|auth_icon|icons_filled|checkresupdate|sprite|placeholder|loading/i.test(normalizedHint)
  );
}

function isLikelyStaticUiAssetUrl(url: string) {
  return (
    /picasso-static\.xiaohongshu\.com\/fe-platform/i.test(url) ||
    /picasso-static\.xiaohongshu\.com\/.*(?:icon|clock|sprite|placeholder|loading)/i.test(url) ||
    /dldir1v6\.qq\.com\/weixin\/checkresupdate/i.test(url) ||
    /auth_icon|icons_filled|\/fe-platform\//i.test(url) ||
    /user_declaration|safelight|badge|\/icon/i.test(url)
  );
}

function isLikelyAvatarUrl(url: string) {
  return /aweme-avatar|avatar|user[_-]?avatar|\/tva\d?\.sinaimg|\/tvax\d?\.sinaimg|profile|headimg|sns-avatar|qlogo\.cn|finderhead/i.test(url);
}

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|mov|m3u8)(\?|$)/i.test(url) || /mime_type=video|douyinvod|\/video\/tos\/|aweme\/v1\/play|api-play/i.test(url);
}

function getImageAssetKey(url: string) {
  const decoded = safeDecode(url).toLowerCase();
  try {
    const parsed = new URL(decoded);
    const xiaohongshuAssetKey = getXiaohongshuImageAssetKey(parsed.hostname, parsed.pathname);
    if (xiaohongshuAssetKey) return xiaohongshuAssetKey;
    const douyinAssetKey = getDouyinImageAssetKey(parsed.hostname, parsed.pathname);
    if (douyinAssetKey) return douyinAssetKey;
    const weiboAssetKey = getWeiboImageAssetKey(parsed.hostname, parsed.pathname);
    if (weiboAssetKey) return weiboAssetKey;
    return parsed.pathname
      .toLowerCase()
      .replace(/^\/crop\.[^/]+\//, "/")
      .replace(/^\/(large|mw\d+|orj\d+|or\d+|orh\d+|hlarge|hmw\d+|chmw\d+|bmiddle|middleplus|thumbnail|thumb\d+|small|square)\//, "/")
      .replace(/^\/frame\/110\/0\//, "/")
      .replace(/^\/spectrum\//, "/")
      .replace(/^\/notes_pre_post\//, "/");
  } catch {
    const fallbackPath = decoded.split("?")[0];
    return getXiaohongshuImageAssetKey("", fallbackPath) || getDouyinImageAssetKey("", fallbackPath) || getWeiboImageAssetKey("", fallbackPath) || fallbackPath;
  }
}

function getXiaohongshuImageAssetKey(hostname: string, pathname: string) {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPath = pathname.toLowerCase();
  if (normalizedHost && !/xhscdn|rednotecdn|xiaohongshu/.test(normalizedHost)) return undefined;

  const segments = normalizedPath.split("/").filter(Boolean);
  const filename = segments[segments.length - 1];
  if (!filename) return undefined;

  const assetId = filename
    .replace(/!(?:nd|nc)_[^/]+$/, "")
    .replace(/\.(?:jpe?g|png|webp|gif)$/, "");
  if (!/^[a-z0-9]{16,}$/.test(assetId)) return undefined;

  const hasXiaohongshuImageSignal =
    /\/(?:notes?|note)_(?:pre_post|uhdr|post_uhdr)\//.test(normalizedPath) ||
    /\/notes_uhdr\//.test(normalizedPath) ||
    /!(?:nd|nc)_(?:prv|dft)_/.test(filename) ||
    /^1040[a-z0-9]+/.test(assetId);
  if (!hasXiaohongshuImageSignal) return undefined;

  return `xiaohongshu:${assetId}`;
}

function getDouyinImageAssetKey(hostname: string, pathname: string) {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPath = pathname.toLowerCase();
  if (normalizedHost && !/douyinpic\.com$/.test(normalizedHost)) return undefined;
  if (!/tos-cn-i-|aweme_images|tplv-dy-aweme-images|tplv-dy-360p|~noop/.test(normalizedPath)) return undefined;

  const filename = normalizedPath.split("/").filter(Boolean).pop();
  if (!filename) return undefined;
  const assetId = filename
    .split("~")[0]
    .replace(/\.(?:jpe?g|png|webp|gif|heic)$/, "");
  if (!/^[a-z0-9]{16,}$/.test(assetId)) return undefined;
  return `douyin:${assetId}`;
}

function getWeiboImageAssetKey(hostname: string, pathname: string) {
  const normalizedHost = hostname.toLowerCase();
  if (normalizedHost && !/sinaimg\.cn$/.test(normalizedHost)) return undefined;

  const segments = pathname.toLowerCase().split("/").filter(Boolean);
  if (segments.length < 2) return undefined;

  const sizeSegment = segments[0];
  const filename = segments[segments.length - 1];
  if (!filename || !isWeiboImageSizeSegment(sizeSegment)) return undefined;
  if (!/\.(?:jpe?g|png|webp|gif)$/.test(filename)) return undefined;

  return `weibo:${filename.replace(/\.(?:jpe?g|png|webp|gif)$/, "")}`;
}

function isWeiboImageSizeSegment(segment: string) {
  return /^(?:crop\.[^/]+|woriginal|oslarge|large|mw\d+|hmw\d+|cmw\d+|chmw\d+|orj\d+|orh\d+|or\d+|hlarge|bmiddle|middleplus|wap\d+|thumbnail|thumb\d+|small|square)$/.test(segment);
}

function scoreImageUrl(url: string) {
  const decoded = safeDecode(url).toLowerCase();
  const widthMatch = decoded.match(/\/w\/(\d+)/);
  const heightMatch = decoded.match(/\/h\/(\d+)/);
  const widthScore = widthMatch ? Math.min(Number(widthMatch[1]) / 10, 500) : 0;
  const heightScore = heightMatch ? Math.min(Number(heightMatch[1]) / 10, 500) : 0;
  const qualityScore = /srh_org|sc=org|sc=detail|srh_dtl|w\/1440|w\/5000/.test(decoded) ? 120 : 0;
  const xiaohongshuDefaultScore = /!(?:nd|nc)_dft_/.test(decoded) ? 160 : 0;
  const xiaohongshuPreviewPenalty = /!(?:nd|nc)_prv_/.test(decoded) ? -120 : 0;
  const douyinFullImageScore = /tplv-dy-aweme-images-v2/.test(decoded) ? 180 : 0;
  const douyinSupportedFormatScore = /\.(?:jpe?g|png|webp)(?:[?#]|$)|:q80\.(?:jpe?g|png|webp)(?:[?#]|$)/.test(decoded) ? 60 : 0;
  const douyinHeicPenalty = /\.heic(?:[?#]|$)|:q80\.heic(?:[?#]|$)/.test(decoded) ? -180 : 0;
  const douyinWatermarkPenalty = /water-v|watermark/.test(decoded) ? -100 : 0;
  const douyinCoverPenalty = /sc=(?:cover|origin_cover)|~noop|tplv-dy-360p/.test(decoded) ? -140 : 0;
  const weiboQualityScore = scoreWeiboImageUrl(decoded);
  const weiboPreviewPenalty = /sinaimg\.cn\/(?:wap\d+|thumbnail|thumb\d+|small|square)\//.test(decoded) ? -80 : 0;
  const previewPenalty = /preview|srh_prv|redimage\/frame|w\/576/.test(decoded) ? -80 : 0;
  return (
    widthScore +
    heightScore +
    qualityScore +
    xiaohongshuDefaultScore +
    xiaohongshuPreviewPenalty +
    douyinFullImageScore +
    douyinSupportedFormatScore +
    douyinHeicPenalty +
    douyinWatermarkPenalty +
    douyinCoverPenalty +
    weiboQualityScore +
    previewPenalty +
    weiboPreviewPenalty
  );
}

function scoreWeiboImageUrl(decodedUrl: string) {
  const sizeMatch = decodedUrl.match(/sinaimg\.cn\/([^/]+)\//);
  const size = sizeMatch?.[1];
  if (!size) return 0;
  if (size === "woriginal") return 240;
  if (size === "oslarge") return 230;
  if (size === "large") return 220;
  if (size === "mw2000") return 190;
  if (/^(?:mw1024|orj\d+|orh\d+|hlarge|hmw\d+)$/.test(size)) return 160;
  if (/^(?:bmiddle|middleplus|or\d+|cmw\d+|chmw\d+)$/.test(size)) return 80;
  if (/^wap\d+$/.test(size)) return 20;
  return 0;
}

export function getCachedImageIndex(url: string) {
  const match = safeDecode(url).match(/(?:^|\/)image-(\d+)(?:[.-]|$)/i);
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
