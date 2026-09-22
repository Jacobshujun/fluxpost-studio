import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function loadTsModule(relativePath, requireMap = {}, globals = {}) {
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
    ...globals,
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const videoQuality = loadTsModule("src/lib/video-quality.ts");
const cacheDependencies = {
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
  "./image-normalization": {
    normalizeHeicFileToJpeg: async () => false,
  },
  "./media-cache-status": {
    buildMediaCacheStatus: () => ({ status: "local_complete" }),
  },
  "./media-request": {
    buildMediaRequestHeaders: () => ({}),
  },
  "./runtime-media-materializer": {
    materializeRuntimeMedia: async () => {
      throw new Error("materializer should not run in fallback ordering checks");
    },
  },
  "./runtime-media-storage": {
    findExistingRuntimeMedia: async () => undefined,
    isManagedRuntimeMediaUrl: () => false,
    persistRuntimeMedia: async ({ publicPath }) => publicPath,
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
};
const mediaCache = loadTsModule("src/lib/media-cache.ts", cacheDependencies);

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

const dash = "https://www.douyin.com/aweme/v1/play/dash/?video_id=fixture";
const filtered = buildVideoDownloadCandidates({ ...cachedItem, videoUrl: dash, mediaUrls: [dash, bestCdnUrl] });
assert.equal(filtered[0], bestCdnUrl, "An invalid primary must not bypass shared candidate filtering");
assert.equal(filtered.includes(dash), false);

const fixtureRoot = await mkdtemp(path.join(tmpdir(), "fluxpost-video-stream-"));
const audioPath = path.join(fixtureRoot, "audio.mp4");
const videoPath = path.join(fixtureRoot, "video.mp4");
let server;
try {
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", "-c:a", "aac", audioPath], { windowsHide: true });
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath], { windowsHide: true });
  const audioBytes = readFileSync(audioPath);
  const videoBytes = readFileSync(videoPath);
  const requests = [];
  server = createServer((req, res) => {
    requests.push(req.url);
    const body = req.url === "/audio.mp4" ? audioBytes : videoBytes;
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": body.length });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let existingObject;
  const writes = [];
  const isolated = loadTsModule("src/lib/media-cache.ts", {
    ...cacheDependencies,
    "./runtime-media-storage": {
      findExistingRuntimeMedia: async () => existingObject,
      isManagedRuntimeMediaUrl: () => false,
      persistRuntimeMedia: async (input) => {
        const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", input.filePath], { encoding: "utf8", windowsHide: true }));
        assert(probe.streams.some((stream) => stream.codec_type === "video"), "Never persist audio-only media");
        writes.push(input);
        return input.publicPath;
      },
    },
    "./runtime-media-materializer": {
      materializeRuntimeMedia: async () => ({ filePath: audioPath, cleanup: async () => {} }),
    },
  }, { process: { cwd: () => fixtureRoot } });
  const fixture = (id, primary, extra = []) => ({
    id, sourceId: id, platform: "douyin", title: "fixture", contentText: "", images: [], metrics: {}, raw: {},
    videoUrl: `${origin}/${primary}.mp4`, mediaUrls: extra.map((name) => `${origin}/${name}.mp4`),
    videoFrames: [{ url: "/frame.jpg" }],
  });
  const [rejected] = await isolated.cacheCrawledMedia([fixture("reject", "audio")]);
  assert.equal(rejected.downloadedVideoUrl, undefined);
  assert.match(rejected.downloadErrors[0], /no valid video stream/);
  assert.equal(writes.length, 0);
  const [recovered] = await isolated.cacheCrawledMedia([fixture("fallback", "audio", ["video"])]);
  assert(recovered.downloadedVideoUrl);
  assert.equal(recovered.downloadErrors, undefined);
  assert.equal(writes.length, 1, "A real silent video remains valid");
  const staleDir = path.join(fixtureRoot, "public/media/crawl/douyin/stale");
  await mkdir(staleDir, { recursive: true });
  await writeFile(path.join(staleDir, "video-1.mp4"), audioBytes);
  await isolated.cacheCrawledMedia([fixture("stale", "video")]);
  assert.equal(writes.length, 2, "Re-import replaces audio-only local cache");
  existingObject = "https://storage.example.invalid/stale.mp4";
  await isolated.cacheCrawledMedia([fixture("durable", "video")]);
  assert.equal(writes.length, 3, "Re-import replaces audio-only durable cache");
  assert.equal(writes[2].overwrite, true);
  assert.deepEqual(requests, ["/audio.mp4", "/audio.mp4", "/video.mp4", "/video.mp4", "/video.mp4"]);
  console.log("Real video stream validation and stale-cache repair checks passed.");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(fixtureRoot, { recursive: true, force: true });
}
