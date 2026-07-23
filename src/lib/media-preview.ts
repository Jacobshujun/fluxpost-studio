export function toRemoteImagePreviewSrc(url: string) {
  if (!/^https?:\/\//i.test(url)) return url;
  return isNativeVolcengineTosPublicUrl(url) ? url : `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

export function isNativeVolcengineTosPublicUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return /(^|\.)tos-cn-[a-z0-9-]+\.volces\.com$/i.test(hostname);
  } catch {
    return false;
  }
}
