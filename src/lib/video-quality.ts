export type VideoQualityCandidate = {
  url?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  quality?: string | number;
  keyHint?: string;
  sourcePriority?: number;
};

type RankedVideoCandidate = {
  url: string;
  area: number;
  explicitHeight: number;
  bitrate: number;
  hintScore: number;
  totalScore: number;
  hasQualitySignal: boolean;
  sourcePriority: number;
  index: number;
};

export function rankVideoUrlsByQuality(candidates: VideoQualityCandidate[]) {
  const seen = new Set<string>();
  const ranked: RankedVideoCandidate[] = [];

  candidates.forEach((candidate, index) => {
    const url = normalizeCandidateUrl(candidate.url);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const width = positiveNumber(candidate.width) || extractVideoWidth(candidate.quality, candidate.keyHint, url);
    const height = positiveNumber(candidate.height) || extractVideoHeight(candidate.quality, candidate.keyHint, url);
    const bitrate = positiveNumber(candidate.bitrate) || extractBitrate(candidate.quality, candidate.keyHint, url);
    const hintScore = scoreQualityHint(candidate.quality, candidate.keyHint, url);
    const area = width && height ? width * height : 0;
    ranked.push({
      url,
      area,
      explicitHeight: height,
      bitrate,
      hintScore,
      totalScore: scoreTotalQuality({ area, height, bitrate, hintScore }),
      hasQualitySignal: Boolean(area || height || bitrate || hintScore),
      sourcePriority: finiteNumber(candidate.sourcePriority),
      index,
    });
  });

  return ranked
    .sort((a, b) =>
      Number(b.hasQualitySignal) - Number(a.hasQualitySignal) ||
      b.totalScore - a.totalScore ||
      b.bitrate - a.bitrate ||
      b.explicitHeight - a.explicitHeight ||
      b.area - a.area ||
      b.explicitHeight - a.explicitHeight ||
      b.hintScore - a.hintScore ||
      b.sourcePriority - a.sourcePriority ||
      a.index - b.index,
    )
    .map((candidate) => candidate.url);
}

function normalizeCandidateUrl(value?: string) {
  const url = value?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return "";
  return url;
}

function positiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[, ]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[, ]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function extractVideoWidth(...values: unknown[]) {
  const text = values.map((value) => String(value || "")).join(" ").toLowerCase();
  const pairs = Array.from(text.matchAll(/(?:^|[^0-9])([1-9][0-9]{2,3})\s*[x*]\s*([1-9][0-9]{2,3})(?:[^0-9]|$)/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  if (pairs.length) return Math.max(...pairs);

  const params = extractUrlNumbers(["width", "w"], text);
  return params.length ? Math.max(...params) : 0;
}

function extractVideoHeight(...values: unknown[]) {
  const text = values.map((value) => String(value || "")).join(" ").toLowerCase();
  const matches = Array.from(text.matchAll(/(?:^|[^0-9])([1-9][0-9]{2,3})\s*p(?:[^0-9]|$)/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  if (matches.length) return Math.max(...matches);

  const pairs = Array.from(text.matchAll(/(?:^|[^0-9])([1-9][0-9]{2,3})\s*[x*]\s*([1-9][0-9]{2,3})(?:[^0-9]|$)/g))
    .map((match) => Number(match[2]))
    .filter((value) => Number.isFinite(value));
  if (pairs.length) return Math.max(...pairs);

  const params = extractUrlNumbers(["height", "h"], text);
  return params.length ? Math.max(...params) : 0;
}

function extractBitrate(...values: unknown[]) {
  const text = values.map((value) => String(value || "")).join(" ").toLowerCase();
  const kbps = text.match(/([1-9][0-9]{2,5})\s*kbps/);
  if (kbps) return Number(kbps[1]) * 1000;
  const mbps = text.match(/([1-9](?:\.\d+)?)\s*mbps/);
  if (mbps) return Number(mbps[1]) * 1000 * 1000;
  const params = extractUrlNumbers(["br", "bitrate", "bps", "vbitrate"], text);
  if (!params.length) return 0;
  const value = Math.max(...params);
  return value < 100_000 ? value * 1000 : value;
}

function scoreQualityHint(...values: unknown[]) {
  const text = values.map((value) => String(value || "")).join(" ").toLowerCase();
  let score = 0;
  if (/2160p|4k|uhd/.test(text)) score += 2160;
  if (/1440p|2k|qhd/.test(text)) score += 1440;
  if (/1080p|fullhd|fhd/.test(text)) score += 1080;
  if (/720p|hd/.test(text)) score += 720;
  if (/origin|original|source|master|main_url/.test(text)) score += 80;
  if (/download_addr|download|video\/tos|douyinvod|mime_type=video/.test(text)) score += 60;
  if (/play_addr_265|bytevc1|h265|hevc|265/.test(text)) score += 35;
  if (/h265|hevc|265/.test(text)) score += 20;
  if (/watermark|wm/.test(text)) score -= 180;
  if (/cover|thumb|preview/.test(text)) score -= 160;
  if (/sd|360p|480p/.test(text)) score -= 40;
  return score;
}

function scoreTotalQuality(input: { area: number; height: number; bitrate: number; hintScore: number }) {
  const megapixels = input.area ? input.area / 1_000_000 : 0;
  const bitrateMbps = input.bitrate ? input.bitrate / 1_000_000 : 0;
  return megapixels * 1200 + input.height * 2 + bitrateMbps * 650 + input.hintScore;
}

function extractUrlNumbers(keys: string[], text: string) {
  const values: number[] = [];
  keys.forEach((key) => {
    const pattern = new RegExp(`[?&;#]${key}=([1-9][0-9]{1,8})(?:[^0-9]|$)`, "gi");
    for (const match of text.matchAll(pattern)) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) values.push(parsed);
    }
  });
  return values;
}
