import type { VideoFrameAsset } from "./types";

export const maxVideoHighlightFrames = 5;

const minTimestampSpacingSeconds = 2;
const similarFrameHashDistanceRatio = 0.08;

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
    if (isVisuallySimilarToSelected(candidate.frame, selected.map((item) => item.frame))) continue;
    selected.push(candidate);
  }

  for (const candidate of ranked) {
    if (selected.length >= maxFrames) break;
    if (selected.some((item) => frameKey(item.frame) === frameKey(candidate.frame))) continue;
    if (isVisuallySimilarToSelected(candidate.frame, selected.map((item) => item.frame))) continue;
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
  const qualityScore = Number.isFinite(frame.qualityScore) ? Number(frame.qualityScore) : 70;
  const aiScore = Number.isFinite(frame.aiScore) ? frame.aiScore : undefined;
  const aestheticScore = Number.isFinite(frame.aestheticScore) ? frame.aestheticScore : undefined;
  const modelScore = aiScore ?? aestheticScore;
  if (modelScore !== undefined) return modelScore * 4 + qualityScore + score * 0.1 + typeBonus(frame.type) * 0.25;
  return score + qualityScore * 0.8 + typeBonus(frame.type);
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

function isVisuallySimilarToSelected(frame: VideoFrameAsset, selected: VideoFrameAsset[]) {
  return selected.some((item) => areFramesVisuallySimilar(frame, item));
}

function areFramesVisuallySimilar(a: VideoFrameAsset, b: VideoFrameAsset) {
  const hashA = normalizePerceptualHash(a.perceptualHash);
  const hashB = normalizePerceptualHash(b.perceptualHash);
  if (!hashA || !hashB || hashA.length !== hashB.length) return false;

  const distance = hammingDistance(hashA, hashB);
  return distance / hashA.length <= similarFrameHashDistanceRatio;
}

function normalizePerceptualHash(hash: string | undefined) {
  if (typeof hash !== "string") return undefined;
  const normalized = hash.trim();
  if (!/^[01]{16,}$/.test(normalized)) return undefined;
  return normalized;
}

function hammingDistance(a: string, b: string) {
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) distance += 1;
  }
  return distance;
}

function dedupeFrames(frames: VideoFrameAsset[]) {
  const seen = new Set<string>();
  const result: VideoFrameAsset[] = [];
  for (const frame of frames) {
    if (isClearlyBadFrame(frame)) continue;
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

function isClearlyBadFrame(frame: VideoFrameAsset) {
  if (Number.isFinite(frame.qualityScore) && (frame.qualityScore || 0) < 25) return true;
  if (Number.isFinite(frame.aiScore) && (frame.aiScore || 0) < 25) return true;
  return /(?:black|white|blank|blur|motion blur|overexposed|underexposed|too dark|too bright|empty)/i.test(
    [frame.reason, frame.selectionReason].filter(Boolean).join(" "),
  );
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
