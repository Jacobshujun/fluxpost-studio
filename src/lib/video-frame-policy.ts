import type { VideoFrameAsset } from "./types";

export const maxVideoHighlightFrames = 5;

const minTimestampSpacingSeconds = 2;

export function selectBestVideoHighlightFrames(
  frames: VideoFrameAsset[] | undefined,
  maxFrames = maxVideoHighlightFrames,
): VideoFrameAsset[] {
  if (!frames?.length || maxFrames <= 0) return [];

  const ranked = dedupeFrames(frames)
    .map((frame, index) => ({ frame, index }))
    .sort((a, b) => compareFrameRank(a.frame, b.frame) || a.index - b.index);

  const selected: Array<{ frame: VideoFrameAsset; index: number }> = [];
  for (const candidate of ranked) {
    if (selected.length >= maxFrames) break;
    if (isTooCloseToSelected(candidate.frame, selected.map((item) => item.frame))) continue;
    selected.push(candidate);
  }

  for (const candidate of ranked) {
    if (selected.length >= maxFrames) break;
    if (selected.some((item) => frameKey(item.frame) === frameKey(candidate.frame))) continue;
    selected.push(candidate);
  }

  return selected.slice(0, maxFrames).map((item) => item.frame);
}

export function replaceVideoFrameUrlsInMediaUrls(
  mediaUrls: string[] | undefined,
  frames: VideoFrameAsset[] | undefined,
) {
  const selectedFrameUrls = new Set((frames || []).map((frame) => normalizeFrameUrlKey(frame.url)));
  return dedupeStrings([
    ...(mediaUrls || []).filter((url) => !isVideoFrameMediaUrl(url) || selectedFrameUrls.has(normalizeFrameUrlKey(url))),
    ...(frames || []).map((frame) => frame.url),
  ]);
}

export function isVideoFrameMediaUrl(url: string) {
  return /\/media\/crawl\/[^?#]+\/frames\/[^?#]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
}

function compareFrameRank(a: VideoFrameAsset, b: VideoFrameAsset) {
  return frameRankScore(b) - frameRankScore(a);
}

function frameRankScore(frame: VideoFrameAsset) {
  const score = Number.isFinite(frame.score) ? frame.score : defaultScoreForType(frame.type);
  return score + typeBonus(frame.type);
}

function typeBonus(type: VideoFrameAsset["type"]) {
  if (type === "highlight") return 40;
  if (type === "scene_change") return 30;
  if (type === "cover") return 18;
  return 0;
}

function defaultScoreForType(type: VideoFrameAsset["type"]) {
  if (type === "highlight") return 95;
  if (type === "scene_change") return 88;
  if (type === "cover") return 82;
  return 70;
}

function isTooCloseToSelected(frame: VideoFrameAsset, selected: VideoFrameAsset[]) {
  if (!Number.isFinite(frame.timestamp)) return false;
  return selected.some((item) => Number.isFinite(item.timestamp) && Math.abs((item.timestamp || 0) - (frame.timestamp || 0)) < minTimestampSpacingSeconds);
}

function dedupeFrames(frames: VideoFrameAsset[]) {
  const seen = new Set<string>();
  const result: VideoFrameAsset[] = [];
  for (const frame of frames) {
    const key = frameKey(frame);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(frame);
  }
  return result;
}

function frameKey(frame: VideoFrameAsset) {
  const urlKey = typeof frame.url === "string" ? normalizeFrameUrlKey(frame.url) : "";
  return urlKey || frame.id;
}

function normalizeFrameUrlKey(url: string) {
  return url.split(/[?#]/)[0];
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
