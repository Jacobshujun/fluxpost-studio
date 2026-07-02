import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

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
    URLSearchParams,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const videoQuality = loadTsModule("src/lib/video-quality.ts");
const tikhub = loadTsModule("src/lib/tikhub.ts", {
  "node:http": { request: () => { throw new Error("Network request is disabled in video quality selection check."); } },
  "node:https": { request: () => { throw new Error("Network request is disabled in video quality selection check."); } },
  "./activity-log": {
    compactError: (error) => String(error?.message || error),
    recordExecutionLog: async () => undefined,
  },
  "./config": {
    appConfig: { tikhubApiKey: "test-key", tikhubBaseUrl: "https://example.invalid" },
  },
  "./concurrency": {
    concurrencyConfig: { crawl: 12, media: 30, gpt: 50, image: 100, feishu: 50, production: 30 },
    mapWithConcurrency: async (items, _concurrency, mapper) => Promise.all(items.map(mapper)),
    runWithConcurrencyPool: async (_name, task) => task(),
  },
  "./douyin-media": { extractDouyinCarouselImageUrls: () => [] },
  "./media-url-filter": {
    isLikelyNonContentImageUrl: () => false,
    normalizeContentImageUrls: (urls) => urls,
  },
  "./source-timestamps": { extractPublishedTime: () => ({}) },
  "./video-quality": videoQuality,
});
const dongchedi = loadTsModule("src/lib/dongchedi.ts", {
  "node:http": { request: () => { throw new Error("Network request is disabled in video quality selection check."); } },
  "node:https": { request: () => { throw new Error("Network request is disabled in video quality selection check."); } },
  "./media-cache": { cacheCrawledMedia: async (items) => items },
  "./video-quality": videoQuality,
});
const xiaopeng = loadTsModule("src/lib/xiaopeng-bbs.ts", {
  "node:http": { request: () => { throw new Error("Network request is disabled in video quality selection check."); } },
  "node:https": { request: () => { throw new Error("Network request is disabled in video quality selection check."); } },
  "./media-cache": { cacheCrawledMedia: async (items) => items },
  "./video-quality": videoQuality,
});

assertContains(read("scripts/harness/check.ps1"), /Video quality selection check/, "Harness baseline must include the video quality selection check.");

const orderedNoMetadata = videoQuality.rankVideoUrlsByQuality([
  { url: "https://cdn.example.invalid/video-first.mp4" },
  { url: "https://cdn.example.invalid/video-second.mp4" },
]);
if (orderedNoMetadata.join("|") !== "https://cdn.example.invalid/video-first.mp4|https://cdn.example.invalid/video-second.mp4") {
  throw new Error("No-metadata video candidates should preserve original order.");
}

const orderedByUrlBitrate = videoQuality.rankVideoUrlsByQuality([
  { url: "https://v3-dy-o.zjcdn.com/video/tos/cn/sample-low/?mime_type=video_mp4&br=800" },
  { url: "https://v3-dy-o.zjcdn.com/video/tos/cn/sample-best/?mime_type=video_mp4&br=4500" },
]);
if (orderedByUrlBitrate[0] !== "https://v3-dy-o.zjcdn.com/video/tos/cn/sample-best/?mime_type=video_mp4&br=4500") {
  throw new Error(`URL bitrate hints should rank br=4500 ahead of br=800, got ${orderedByUrlBitrate[0]}.`);
}

const { normalizeTikHubResponse } = tikhub;

const douyinItems = normalizeTikHubResponse({
  data: {
    aweme_detail: {
      aweme_id: "douyin-quality-1",
      desc: "Douyin quality fixture",
      aweme_type: 4,
      video: {
        play_addr: { url_list: ["https://v.douyin.example.invalid/play-low-360p.mp4"], width: 640, height: 360 },
        bit_rate: [
          { bit_rate: 1200000, play_addr: { url_list: ["https://v.douyin.example.invalid/play-mid-720p.mp4"], width: 1280, height: 720 } },
          { bit_rate: 4200000, play_addr: { url_list: ["https://v.douyin.example.invalid/play-best-1080p.mp4"], width: 1920, height: 1080 } },
        ],
      },
    },
  },
}, "douyin");
if (douyinItems[0]?.videoUrl !== "https://v.douyin.example.invalid/play-best-1080p.mp4") {
  throw new Error(`Douyin should select the highest-resolution bit_rate video, got ${douyinItems[0]?.videoUrl}.`);
}

const douyinEntryLevelItems = normalizeTikHubResponse({
  data: {
    aweme_detail: {
      aweme_id: "douyin-entry-level-quality",
      desc: "Douyin entry-level quality fixture",
      aweme_type: 4,
      video: {
        bit_rate: [
          {
            bit_rate: 1800000,
            width: 720,
            height: 1280,
            play_addr: { url_list: ["https://v.douyin.example.invalid/entry-low-720p.mp4"] },
          },
          {
            bit_rate: 1600000,
            width: 1080,
            height: 1920,
            play_addr_h264: { url_list: ["https://v.douyin.example.invalid/entry-best-1080p.mp4"] },
          },
        ],
      },
    },
  },
}, "douyin");
if (douyinEntryLevelItems[0]?.videoUrl !== "https://v.douyin.example.invalid/entry-best-1080p.mp4") {
  throw new Error(`Douyin should inherit bit_rate entry dimensions and inspect play_addr_h264, got ${douyinEntryLevelItems[0]?.videoUrl}.`);
}

const douyinDownloadAddrItems = normalizeTikHubResponse({
  data: {
    aweme_detail: {
      aweme_id: "douyin-download-addr-quality",
      desc: "Douyin download_addr quality fixture",
      aweme_type: 4,
      video: {
        bit_rate: [
          {
            bit_rate: 1200000,
            quality_type: "720p",
            play_addr: { url_list: ["https://v.douyin.example.invalid/download-low-720p.mp4"] },
          },
          {
            bit_rate: 5200000,
            quality_type: "1080p",
            download_addr: { url_list: ["https://v.douyin.example.invalid/download-best-1080p.mp4"] },
          },
        ],
      },
    },
  },
}, "douyin");
if (douyinDownloadAddrItems[0]?.videoUrl !== "https://v.douyin.example.invalid/download-best-1080p.mp4") {
  throw new Error(`Douyin should inspect high-quality bit_rate download_addr candidates, got ${douyinDownloadAddrItems[0]?.videoUrl}.`);
}

const douyinV3ModalItems = normalizeTikHubResponse({
  data: {
    aweme_detail: {
      aweme_id: "7657077050561938922",
      desc: "Douyin search modal v3 fixture",
      aweme_type: 4,
      video: {
        play_addr: { url_list: ["https://v.douyin.example.invalid/modal-low-360p.mp4"], width: 640, height: 360, bit_rate: 600000 },
        bit_rate: [
          {
            bit_rate: 900000,
            quality_type: "540p",
            play_addr: { url_list: ["https://v.douyin.example.invalid/modal-mid-540p.mp4"] },
          },
          {
            bit_rate: 4800000,
            width: 1080,
            height: 1920,
            quality_type: "1080p",
            play_addr_265: { url_list: ["https://v.douyin.example.invalid/modal-best-1080p-h265.mp4"] },
            download_addr: { url_list: ["https://v.douyin.example.invalid/modal-best-1080p-download.mp4"] },
          },
        ],
      },
    },
  },
}, "douyin");
if (![
  "https://v.douyin.example.invalid/modal-best-1080p-h265.mp4",
  "https://v.douyin.example.invalid/modal-best-1080p-download.mp4",
].includes(douyinV3ModalItems[0]?.videoUrl)) {
  throw new Error(`Douyin v3 modal detail should select the high-quality bit_rate candidate, got ${douyinV3ModalItems[0]?.videoUrl}.`);
}

const weiboItems = normalizeTikHubResponse({
  data: {
    mblog: {
      id: "weibo-quality-1",
      text: "Weibo quality fixture",
      page_info: {
        media_info: {
          stream_url: "https://weibo.example.invalid/video-sd.mp4",
          mp4_720p_mp4: "https://weibo.example.invalid/video-720p.mp4",
          mp4_1080p_mp4: "https://weibo.example.invalid/video-1080p.mp4",
        },
      },
    },
  },
}, "weibo");
if (weiboItems[0]?.videoUrl !== "https://weibo.example.invalid/video-1080p.mp4") {
  throw new Error(`Weibo should select the 1080p video, got ${weiboItems[0]?.videoUrl}.`);
}

const xiaohongshuItems = normalizeTikHubResponse({
  data: {
    id: "xhs-quality-1",
    note_id: "xhs-quality-1",
    title: "Xiaohongshu quality fixture",
    desc: "Body",
    video_info_v2: {
      media: { stream: { master_url: "https://xhs.example.invalid/video-large.mp4", width: 1440, height: 1920, avg_bitrate: 3800000 } },
    },
    video: { url: "https://xhs.example.invalid/video-small.mp4", width: 720, height: 960, bitrate: 900000 },
  },
}, "xiaohongshu");
if (xiaohongshuItems[0]?.videoUrl !== "https://xhs.example.invalid/video-large.mp4") {
  throw new Error(`Xiaohongshu should select the largest pixel-area video, got ${xiaohongshuItems[0]?.videoUrl}.`);
}

const dongchediHtml = `<html><head><title>Video article</title><script>${JSON.stringify({
  articleInfo: {
    groupId: "7643008384274546713",
    title: "Video article",
    content: "body",
    video_list: [
      { main_url: "https://dongchedi.example.invalid/video-first.mp4" },
      { main_url: "https://dongchedi.example.invalid/video-4k.mp4", width: 3840, height: 2160 },
    ],
  },
})}</script></head></html>`;
const dongchediItem = dongchedi.normalizeDongchediArticle("7643008384274546713", "https://www.dongchedi.com/ugc/article/7643008384274546713", dongchediHtml);
if (dongchediItem.videoUrl !== "https://dongchedi.example.invalid/video-4k.mp4") {
  throw new Error(`Dongchedi should select the highest-resolution article video, got ${dongchediItem.videoUrl}.`);
}

const xiaopengPageData = {
  value: {
    tid: 3776077,
    subject: "Video thread",
    content: "body",
    videos: [
      { url: "https://s.xiaopeng.example.invalid/video-first.mp4" },
      { url: "https://s.xiaopeng.example.invalid/video-1080p.mp4" },
    ],
  },
};
const xiaopengHtml = `<script>self.__next_f.push([1,"5:${JSON.stringify({ pageData: xiaopengPageData }).replace(/"/g, '\\"')}\\n"])</script>`;
const xiaopengItem = xiaopeng.normalizeXiaopengBbsThread("3776077", "https://bbs.xiaopeng.com/thread/3776077?tidType=1", xiaopengHtml);
if (xiaopengItem.videoUrl !== "https://s.xiaopeng.example.invalid/video-1080p.mp4") {
  throw new Error(`Xiaopeng BBS should select the quality-hinted video, got ${xiaopengItem.videoUrl}.`);
}

console.log("Video quality selection check passed.");
