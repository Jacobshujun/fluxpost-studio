export function buildMediaRequestHeaders(url: string) {
  const parsedUrl = new URL(url);
  const likelyVideo = isLikelyVideoUrl(url);
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    Accept: likelyVideo
      ? "video/mp4,video/*;q=0.9,*/*;q=0.8"
      : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  };

  if (likelyVideo) {
    headers["Accept-Encoding"] = "identity";
  }

  if (/xhscdn\.com|rednotecdn\.com|xiaohongshu\.com/i.test(parsedUrl.hostname)) {
    headers.Referer = "https://www.xiaohongshu.com/";
    headers.Origin = "https://www.xiaohongshu.com";
  } else if (isDouyinMediaHost(parsedUrl.hostname) || (likelyVideo && isByteDanceVideoCdnHost(parsedUrl.hostname))) {
    headers.Referer = "https://www.douyin.com/";
    headers.Origin = "https://www.douyin.com";
  } else {
    headers.Referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;
  }

  return headers;
}

export function isProxyableRemoteMediaUrl(value: string) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|mov)(\?|$)/i.test(url) || /mime_type=video|douyinvod|\/video\/tos\/|aweme\/v1\/play|api-play/i.test(url);
}

function isDouyinMediaHost(hostname: string) {
  return /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)douyinvod\.com$|(^|\.)douyinpic\.com$/i.test(hostname);
}

function isByteDanceVideoCdnHost(hostname: string) {
  return /(^|\.)zjcdn\.com$/i.test(hostname);
}
