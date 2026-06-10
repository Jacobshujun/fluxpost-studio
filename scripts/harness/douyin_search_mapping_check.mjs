import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src/lib/tikhub.ts");
const source = readFileSync(sourcePath, "utf8");

if (!/\/api\/v1\/douyin\/search\/fetch_general_search_v1/.test(source)) {
  throw new Error("Douyin keyword search must use /api/v1/douyin/search/fetch_general_search_v1.");
}

if (/fetch_video_search_v2/.test(source)) {
  throw new Error("Douyin keyword search must not use the old fetch_video_search_v2 endpoint.");
}

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
});

const cjsModule = { exports: {} };
let fakeResponses = [];
const requestBodies = [];
const executionLogs = [];

function fakeNodeRequest(_url, _options, callback) {
  let requestBody = "";
  const req = {
    on() {
      return req;
    },
    write(chunk) {
      requestBody += String(chunk);
    },
    end() {
      if (!fakeResponses.length) {
        throw new Error("Unexpected network request in Douyin search mapping check.");
      }
      requestBodies.push(requestBody ? JSON.parse(requestBody) : undefined);
      const response = fakeResponses.shift();
      const handlers = {};
      const res = {
        statusCode: response.status,
        on(event, handler) {
          handlers[event] = handler;
          return res;
        },
      };
      callback(res);
      if (response.body) handlers.data?.(Buffer.from(response.body));
      handlers.end?.();
    },
  };
  return req;
}

const sandbox = {
  Buffer,
  URL,
  URLSearchParams,
  console,
  module: cjsModule,
  exports: cjsModule.exports,
  require: (name) => {
    if (name === "node:http" || name === "node:https") {
      return {
        request: fakeNodeRequest,
      };
    }
    if (name === "./activity-log") {
      return {
        compactError: (error) => String(error?.message || error),
        recordExecutionLog: async (entry) => {
          executionLogs.push(entry);
        },
      };
    }
    if (name === "./config") {
      return {
        appConfig: {
          tikhubApiKey: "test-key",
          tikhubBaseUrl: "https://example.invalid",
        },
      };
    }
    if (name === "./concurrency") {
      return {
        concurrencyConfig: {
          crawl: 12,
          media: 30,
          gpt: 50,
          image: 100,
          feishu: 50,
          production: 30,
        },
        mapWithConcurrency: async (items, _concurrency, mapper) => Promise.all(items.map(mapper)),
        runWithConcurrencyPool: async (_name, task) => task(),
      };
    }
    if (name === "./media-url-filter") {
      return {
        isLikelyNonContentImageUrl: () => false,
        normalizeContentImageUrls: (urls) => urls,
      };
    }
    if (name === "./douyin-media") {
      return {
        extractDouyinCarouselImageUrls: (raw, maxImages = 36) => {
          const images = Array.isArray(raw?.images) ? raw.images : [];
          return images
            .map((item) => {
              if (typeof item === "string") return item;
              if (Array.isArray(item?.url_list)) return item.url_list.find((url) => typeof url === "string");
              return undefined;
            })
            .filter(Boolean)
            .slice(0, maxImages);
        },
      };
    }
    if (name === "./source-timestamps") {
      return {
        extractPublishedTime: () => ({}),
      };
    }
    if (name === "./media-cache") {
      return {
        cacheCrawledMedia: async (items) => items,
      };
    }
    throw new Error(`Unexpected import in Douyin search mapping check: ${name}`);
  },
};

vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });

const {
  crawlTikHub,
  buildDouyinKeywordSearchPayload,
  mapDouyinContentType,
  mapDouyinSort,
} = cjsModule.exports;

if (typeof crawlTikHub !== "function") {
  throw new Error("crawlTikHub must be exported from src/lib/tikhub.ts.");
}
if (typeof mapDouyinSort !== "function") {
  throw new Error("mapDouyinSort must be exported from src/lib/tikhub.ts.");
}
if (typeof mapDouyinContentType !== "function") {
  throw new Error("mapDouyinContentType must be exported from src/lib/tikhub.ts.");
}
if (typeof buildDouyinKeywordSearchPayload !== "function") {
  throw new Error("buildDouyinKeywordSearchPayload must be exported from src/lib/tikhub.ts.");
}

const sortCases = new Map([
  [undefined, "0"],
  ["0", "0"],
  ["general", "0"],
  ["relevance", "0"],
  ["1", "1"],
  ["most_liked", "1"],
  ["likes_desc", "1"],
  ["2", "2"],
  ["latest", "2"],
  ["time_descending", "2"],
  ["published_desc", "2"],
  ["unknown", "0"],
]);

for (const [input, expected] of sortCases) {
  const actual = mapDouyinSort(input);
  if (actual !== expected) {
    throw new Error(`Douyin sort ${String(input)} should map to ${expected}, got ${actual}.`);
  }
}

const contentTypeCases = new Map([
  [undefined, "0"],
  ["0", "0"],
  ["all", "0"],
  ["1", "1"],
  ["video", "1"],
  ["2", "2"],
  ["image", "2"],
  ["picture", "2"],
  ["3", "3"],
  ["article", "3"],
  ["text", "3"],
  ["unknown", "0"],
]);

for (const [input, expected] of contentTypeCases) {
  const actual = mapDouyinContentType(input);
  if (actual !== expected) {
    throw new Error(`Douyin content type ${String(input)} should map to ${expected}, got ${actual}.`);
  }
}

const payload = buildDouyinKeywordSearchPayload(
  {
    query: "Xiaopeng P7",
    sort: "time_descending",
    contentType: "article",
    cookie: "test-cookie",
  },
  24,
  "search-id",
  "trace-token",
);

if (payload.keyword !== "Xiaopeng P7") {
  throw new Error("Douyin general search payload should include keyword.");
}
if (payload.cursor !== 24) {
  throw new Error(`Douyin general search payload should use cursor pagination, got ${payload.cursor}.`);
}
if ("offset" in payload) {
  throw new Error("Douyin general search payload must not use the old offset pagination field.");
}
if (payload.sort_type !== "2") {
  throw new Error(`Douyin latest sort should request sort_type=2, got ${payload.sort_type}.`);
}
if (payload.publish_time !== "0") {
  throw new Error("Douyin general search payload should include publish_time=0.");
}
if (payload.filter_duration !== "0") {
  throw new Error("Douyin general search payload should include filter_duration=0.");
}
if (payload.content_type !== "3") {
  throw new Error(`Douyin article content type should request content_type=3, got ${payload.content_type}.`);
}
if (payload.search_id !== "search-id") {
  throw new Error("Douyin general search payload should carry search_id between pages.");
}
if (payload.backtrace !== "trace-token") {
  throw new Error("Douyin general search payload should carry backtrace between pages.");
}
if (payload.cookie !== "test-cookie") {
  throw new Error("Douyin general search payload should preserve the optional per-request cookie.");
}

function douyinResponse(count, start = 0) {
  const records = Array.from({ length: count }, (_value, index) => {
    const itemNumber = start + index;
    return {
      aweme_id: `douyin-${itemNumber}`,
      desc: `Douyin candidate ${itemNumber}`,
      video: {
        cover: {
          url_list: [
            `https://p3-sign.douyinpic.com/tos-cn-i-0813/douyinasset${itemNumber}abcdef~tplv-dy-aweme-images-v2:1920:1440:q80.jpeg?sc=image`,
          ],
        },
      },
    };
  });
  return JSON.stringify({
    data: {
      data: records,
      cursor: start + count,
      search_id: "search-id-next",
      backtrace: "trace-token-next",
    },
  });
}

function douyinFailureResponse() {
  return JSON.stringify({
    detail: {
      message: "bad pagination request",
      request_id: "page-2",
    },
  });
}

fakeResponses = [
  { status: 200, body: douyinResponse(5) },
  { status: 400, body: douyinFailureResponse() },
];
requestBodies.length = 0;
executionLogs.length = 0;
const enoughItems = await crawlTikHub({
  platform: "douyin",
  query: "Xiaopeng GX",
  targetCount: 5,
});
if (enoughItems.length !== 5) {
  throw new Error(`Douyin keyword search should keep the first ${5} requested items, got ${enoughItems.length}.`);
}
if (requestBodies.length !== 1) {
  throw new Error(`Douyin keyword search should stop once targetCount is collected, made ${requestBodies.length} requests.`);
}

fakeResponses = [
  { status: 200, body: douyinResponse(3, 20) },
  { status: 400, body: douyinFailureResponse() },
];
requestBodies.length = 0;
executionLogs.length = 0;
const partialItems = await crawlTikHub({
  platform: "douyin",
  query: "Xiaopeng GX",
  targetCount: 5,
});
if (partialItems.length !== 3) {
  throw new Error(`Douyin keyword search should keep partial candidates after later page failure, got ${partialItems.length}.`);
}
if (requestBodies.length !== 2) {
  throw new Error(`Douyin partial pagination regression should make two requests, made ${requestBodies.length}.`);
}
if (requestBodies[1]?.search_id !== "search-id-next" || requestBodies[1]?.backtrace !== "trace-token-next") {
  throw new Error("Douyin pagination should carry search_id and backtrace to the next page.");
}
if (!executionLogs.some((entry) => entry.action === "Douyin keyword pagination stopped" && entry.details?.collected === 3)) {
  throw new Error("Douyin later-page failure should be recorded while preserving collected candidates.");
}

function douyinImageTypeMixedResponse() {
  return JSON.stringify({
    data: {
      data: [
        {
          aweme_id: "video-card",
          desc: "Video card returned by image request",
          video: {
            cover: {
              url_list: ["https://p3-sign.douyinpic.com/tos-cn-p-video-cover~noop.webp?biz_tag=aweme_video&sc=cover"],
            },
            play_addr: {
              url_list: ["https://example.invalid/video-card.mp4"],
            },
          },
        },
        {
          aweme_id: "image-card",
          desc: "Image carousel card",
          images: [
            {
              url_list: ["https://p3-sign.douyinpic.com/tos-cn-i-0813/imagecardabcdef~tplv-dy-aweme-images-v2:1920:1440:q80.jpeg?sc=image"],
            },
          ],
          video: {
            play_addr: {
              url_list: ["https://example.invalid/image-card-shadow-video.mp4"],
            },
          },
        },
      ],
      cursor: 2,
    },
  });
}

fakeResponses = [{ status: 200, body: douyinImageTypeMixedResponse() }];
requestBodies.length = 0;
executionLogs.length = 0;
const imageOnlyItems = await crawlTikHub({
  platform: "douyin",
  query: "Xiaopeng X9",
  targetCount: 1,
  contentType: "2",
});
if (requestBodies[0]?.content_type !== "2") {
  throw new Error(`Douyin image request should send content_type=2, got ${requestBodies[0]?.content_type}.`);
}
if (imageOnlyItems.length !== 1 || imageOnlyItems[0]?.sourceId !== "image-card") {
  throw new Error("Douyin image content_type=2 should keep true carousel image cards and skip video-cover cards.");
}
if (imageOnlyItems[0].mediaType !== "image") {
  throw new Error(`Douyin image content_type=2 result should be normalized as image, got ${imageOnlyItems[0].mediaType}.`);
}
if (imageOnlyItems[0].videoUrl || imageOnlyItems[0].mediaUrls.some((url) => /\.mp4(?:[?#]|$)/i.test(url))) {
  throw new Error("Douyin image content_type=2 result should not carry video URLs into media caching.");
}
if (!executionLogs.some((entry) => entry.action === "Douyin image content-type mismatch skipped" && entry.details?.skipped === 1 && entry.details?.kept === 1)) {
  throw new Error("Douyin image content_type=2 should log skipped video-like candidates.");
}

console.log("Douyin general search endpoint and mapping check passed.");
