import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  const sandbox = {
    Buffer,
    URL,
    console,
    process,
    setTimeout,
    clearTimeout,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const videoQuality = loadTsModule("src/lib/video-quality.ts");
const mediaCache = loadTsModule("src/lib/media-cache.ts", {
  "./activity-log": {
    compactError: (error) => (error instanceof Error ? error.message : String(error)),
    recordExecutionLog: async () => undefined,
  },
  "./concurrency": {
    concurrencyConfig: { media: 1 },
    mapWithConcurrency: async (items, _concurrency, mapper) => Promise.all(items.map(mapper)),
  },
  "./image-format": {
    sniffImageFormat: () => ({ browserSupported: true, mimeType: "image/jpeg" }),
  },
  "./media-cache-status": {
    buildMediaCacheStatus: () => ({ status: "local_complete" }),
  },
  "./media-request": {
    buildMediaRequestHeaders: () => ({}),
  },
  "./source-image-cleanup": {
    cleanCachedSourceImage: async () => undefined,
    shouldCleanCachedSourceImage: () => false,
  },
  "./video-frame-review": {
    isVideoFrameAiReviewConfigured: () => false,
    reviewVideoFramesWithAi: async (frames) => frames,
  },
  "./video-frame-policy": {
    replaceVideoFrameUrlsInMediaUrls: (urls) => urls,
    selectBestVideoHighlightFrames: (frames) => frames || [],
  },
  "./video-quality": videoQuality,
  "./video-transcription": {
    isArkVideoTranscriptionConfigured: () => false,
    mergeTranscriptIntoContentText: (contentText) => contentText,
    transcribeVideoContent: async () => ({ status: "skipped" }),
  },
});

const { buildVideoDownloadCandidates } = mediaCache;
if (typeof buildVideoDownloadCandidates !== "function") {
  throw new Error("media-cache should export buildVideoDownloadCandidates for deterministic video fallback ordering.");
}
const { shouldRefreshVideoCacheForItem } = mediaCache;
if (typeof shouldRefreshVideoCacheForItem !== "function") {
  throw new Error("media-cache should export shouldRefreshVideoCacheForItem for deterministic video refresh policy checks.");
}

const primaryPlayUrl = "https://www.douyin.com/aweme/v1/play/?video_id=primary&line=0&sign=abc&is_play_url=1";
const bestCdnUrl = "https://v3-dy-o.zjcdn.com/video/tos/cn/tos-cn-ve-15c001/sample-best/?mime_type=video_mp4&br=4500";
const lowCdnUrl = "https://v3-dy-o.zjcdn.com/video/tos/cn/tos-cn-ve-15c001/sample-low/?mime_type=video_mp4&br=800";

const candidates = buildVideoDownloadCandidates({
  id: "douyin-fixture",
  platform: "douyin",
  sourceId: "douyin-fixture",
  title: "fixture",
  contentText: "fixture",
  sourceUrl: "https://www.iesdouyin.com/share/video/123",
  images: [],
  mediaUrls: [primaryPlayUrl, bestCdnUrl, "https://p3-pc-sign.douyinpic.com/cover.jpeg"],
  metrics: {},
  raw: {
    video: {
      bit_rate: [
        {
          bit_rate: 800000,
          play_addr: { url_list: [lowCdnUrl, primaryPlayUrl], width: 720, height: 1280 },
        },
        {
          bit_rate: 4500000,
          play_addr: { url_list: [bestCdnUrl, primaryPlayUrl], width: 1080, height: 1920 },
        },
      ],
      play_addr: { url_list: [primaryPlayUrl] },
    },
  },
  videoUrl: primaryPlayUrl,
});

if (candidates[0] !== primaryPlayUrl) {
  throw new Error("Video download candidates should try the normalized primary video URL first.");
}
if (candidates[1] !== bestCdnUrl) {
  throw new Error("A direct high-quality CDN video URL should be the first fallback after a primary play URL.");
}
if (!candidates.includes(lowCdnUrl)) {
  throw new Error("Lower-quality CDN video URLs should remain available as later fallbacks.");
}
if (new Set(candidates).size !== candidates.length) {
  throw new Error("Video download candidates should be de-duplicated.");
}
if (candidates.some((url) => /douyinpic\.com|\.jpeg/i.test(url))) {
  throw new Error("Video download candidates should not include image URLs.");
}

const cachedItem = {
  ...candidates.length && {
    id: "cached-douyin-fixture",
    platform: "douyin",
    sourceId: "cached-douyin-fixture",
    title: "fixture",
    contentText: "fixture",
    images: [],
    mediaUrls: [bestCdnUrl],
    metrics: {},
    raw: {},
    videoUrl: bestCdnUrl,
    downloadedVideoUrl: "/media/crawl/douyin/cached-douyin-fixture/video-1.mp4",
  },
};
if (shouldRefreshVideoCacheForItem(cachedItem, {}) !== false) {
  throw new Error("Existing local cached videos should be reused when forceVideoRefresh is not enabled.");
}
if (shouldRefreshVideoCacheForItem(cachedItem, { forceVideoRefresh: true }) !== true) {
  throw new Error("forceVideoRefresh should bypass an existing local cached video.");
}
if (shouldRefreshVideoCacheForItem({ ...cachedItem, downloadedVideoUrl: undefined }, {}) !== true) {
  throw new Error("Items without a cached video should still attempt video caching.");
}

console.log("Video download fallback check passed.");
