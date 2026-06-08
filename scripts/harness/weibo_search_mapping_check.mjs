import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src/lib/tikhub.ts");
const mediaUrlFilterPath = path.join(projectRoot, "src/lib/media-url-filter.ts");
const source = readFileSync(sourcePath, "utf8");

if (!/\/api\/v1\/weibo\/app\/fetch_search_all/.test(source)) {
  throw new Error("Weibo keyword search must use /api/v1/weibo/app/fetch_search_all.");
}

if (/\/api\/v1\/weibo\/web_v2\/fetch_advanced_search/.test(source)) {
  throw new Error("Weibo keyword search must not use the old web_v2/fetch_advanced_search endpoint.");
}

if (/include_type|timescope|\bq: input\.query/.test(source)) {
  throw new Error("Weibo App search must not send old Web V2 include_type/timescope/q parameters.");
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
const mediaUrlFilterModule = { exports: {} };
let fakeResponses = [];
const requests = [];
const executionLogs = [];

function fakeNodeRequest(url, _options, callback) {
  const req = {
    on() {
      return req;
    },
    write() {},
    end() {
      if (!fakeResponses.length) {
        throw new Error("Unexpected network request in Weibo search mapping check.");
      }
      const requestUrl = new URL(String(url));
      requests.push({
        pathname: requestUrl.pathname,
        params: Object.fromEntries(requestUrl.searchParams.entries()),
      });

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

const mediaUrlFilterSource = readFileSync(mediaUrlFilterPath, "utf8");
const mediaUrlFilterTranspiled = ts.transpileModule(mediaUrlFilterSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: mediaUrlFilterPath,
});

vm.runInNewContext(
  mediaUrlFilterTranspiled.outputText,
  {
    URL,
    console,
    module: mediaUrlFilterModule,
    exports: mediaUrlFilterModule.exports,
    require: (name) => {
      throw new Error(`Unexpected import in media URL filter check dependency: ${name}`);
    },
  },
  { filename: mediaUrlFilterPath },
);

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
          crawl: 8,
          media: 20,
          gpt: 50,
          image: 100,
          feishu: 50,
          production: 20,
        },
        mapWithConcurrency: async (items, _concurrency, mapper) => Promise.all(items.map(mapper)),
        runWithConcurrencyPool: async (_name, task) => task(),
      };
    }
    if (name === "./media-url-filter") {
      return mediaUrlFilterModule.exports;
    }
    if (name === "./douyin-media") {
      return {
        extractDouyinCarouselImageUrls: () => [],
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
    throw new Error(`Unexpected import in Weibo search mapping check: ${name}`);
  },
};

vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });

const {
  buildWeiboSearchPath,
  crawlTikHub,
  mapWeiboSearchType,
  normalizeTikHubResponse,
} = cjsModule.exports;

if (typeof crawlTikHub !== "function") {
  throw new Error("crawlTikHub must be exported from src/lib/tikhub.ts.");
}
if (typeof buildWeiboSearchPath !== "function") {
  throw new Error("buildWeiboSearchPath must be exported from src/lib/tikhub.ts.");
}
if (typeof mapWeiboSearchType !== "function") {
  throw new Error("mapWeiboSearchType must be exported from src/lib/tikhub.ts.");
}
if (typeof normalizeTikHubResponse !== "function") {
  throw new Error("normalizeTikHubResponse must be exported from src/lib/tikhub.ts.");
}

const searchTypeCases = [
  [undefined, undefined, "1"],
  ["all", "all", "1"],
  ["hot", "all", "60"],
  ["60", undefined, "60"],
  ["realtime", undefined, "61"],
  ["original", undefined, "61"],
  ["verified", undefined, "3"],
  ["topic", undefined, "38"],
  ["super_topic", undefined, "98"],
  ["place", undefined, "92"],
  ["product", undefined, "97"],
  ["hot", "pic", "63"],
  ["hot", "video", "64"],
  ["hot", "music", "60"],
];

for (const [searchType, includeType, expected] of searchTypeCases) {
  const actual = mapWeiboSearchType(searchType, includeType);
  if (actual !== expected) {
    throw new Error(`Weibo search type ${String(searchType)} / ${String(includeType)} should map to ${expected}, got ${actual}.`);
  }
}

const pathForPic = buildWeiboSearchPath(
  {
    query: "Xiaopeng GX",
    searchType: "hot",
    includeType: "pic",
  },
  3,
);
const picUrl = new URL(pathForPic, "https://example.invalid");
if (picUrl.pathname !== "/api/v1/weibo/app/fetch_search_all") {
  throw new Error(`Weibo path should use the App search endpoint, got ${picUrl.pathname}.`);
}
if (picUrl.searchParams.get("query") !== "Xiaopeng GX") {
  throw new Error("Weibo App search path should send query=keyword.");
}
if (picUrl.searchParams.get("search_type") !== "63") {
  throw new Error(`Weibo includeType=pic should request search_type=63, got ${picUrl.searchParams.get("search_type")}.`);
}
if (picUrl.searchParams.get("page") !== "3") {
  throw new Error("Weibo App search path should send page pagination.");
}
if (picUrl.searchParams.has("q") || picUrl.searchParams.has("include_type") || picUrl.searchParams.has("timescope")) {
  throw new Error("Weibo App search path should not contain old Web V2 query parameters.");
}

function weiboCard(id, overrides = {}) {
  return {
    card_type: 9,
    mblog: {
      id,
      mid: id,
      mblogid: id,
      text_raw: `Weibo candidate ${id}`,
      pic_infos: {
        [`${id}-pic-1`]: {
          large: {
            url: `https://wx1.sinaimg.cn/large/${id}-image-1.jpg`,
          },
          hmw2000: {
            url: `https://wx1.sinaimg.cn/hmw2000/${id}-image-1.jpg`,
          },
          orh1080: {
            url: `https://wx1.sinaimg.cn/orh1080/${id}-image-1.jpg`,
          },
          crop: {
            url: `https://wx1.sinaimg.cn/crop.0.0.920.300/${id}-image-1.jpg`,
          },
          thumbnail: {
            url: `https://wx1.sinaimg.cn/thumbnail/${id}-image-1.jpg`,
          },
        },
      },
      pics: [
        {
          pid: `${id}-pic-1`,
          large: {
            url: `https://wx1.sinaimg.cn/large/${id}-image-1.jpg`,
          },
        },
      ],
      attitudes_count: 12,
      comments_count: 3,
      reposts_count: 4,
      ad_tag_nature: {
        url_type_pic: "https://h5.sinaimg.cn/upload/100/1569/2021/04/14/timeline_icon_car.png",
      },
      ...overrides,
    },
  };
}

function weiboResponse(cards) {
  return JSON.stringify({
    data: {
      cards,
    },
  });
}

fakeResponses = [weiboResponse([weiboCard("wb-pic-1")])].map((body) => ({ status: 200, body }));
requests.length = 0;
const picItems = await crawlTikHub({
  platform: "weibo",
  query: "Xiaopeng GX",
  targetCount: 1,
  searchType: "hot",
  includeType: "pic",
});
if (requests.length !== 1) {
  throw new Error(`Weibo image crawl should make one request for targetCount=1, made ${requests.length}.`);
}
if (requests[0].pathname !== "/api/v1/weibo/app/fetch_search_all") {
  throw new Error(`Weibo request should use App endpoint, got ${requests[0].pathname}.`);
}
if (requests[0].params.query !== "Xiaopeng GX") {
  throw new Error("Weibo request should send the keyword as query.");
}
if (requests[0].params.search_type !== "63") {
  throw new Error(`Weibo image crawl should send search_type=63, got ${requests[0].params.search_type}.`);
}
if ("q" in requests[0].params || "include_type" in requests[0].params || "timescope" in requests[0].params) {
  throw new Error("Weibo image crawl should not send old Web V2 parameters.");
}
if (picItems.length !== 1 || picItems[0].sourceId !== "wb-pic-1") {
  throw new Error("Weibo App cards[].mblog response should normalize into one Weibo item.");
}
if (!picItems[0].images.some((url) => /sinaimg\.cn\/large\/wb-pic-1-image-1\.jpg/.test(url))) {
  throw new Error("Weibo App image response should extract content images from pic_infos/pics.");
}
if (picItems[0].images.length !== 1) {
  throw new Error(`Weibo App image response should collapse content-image variants to one asset, got ${picItems[0].images.length}.`);
}
if (picItems[0].images.some((url) => /h5\.sinaimg|timeline_icon|thumbnail|orh1080|hmw2000|crop\./i.test(url))) {
  throw new Error("Weibo App image response should not keep decorative icons or duplicate preview variants.");
}

const textOnly = normalizeTikHubResponse(
  {
    data: {
      cards: [
        {
          card_type: 9,
          mblog: {
            id: "wb-text-only",
            text_raw: "Text-only Weibo candidate",
            user: {
              profile_image_url: "https://tvax1.sinaimg.cn/crop.0.0.1080.1080.180/avatar.jpg",
            },
            ad_tag_nature: {
              url_type_pic: "https://h5.sinaimg.cn/upload/100/1569/2021/04/14/timeline_icon_car.png",
            },
          },
        },
      ],
    },
  },
  "weibo",
);
if (textOnly.length !== 1 || textOnly[0].images.length !== 0) {
  throw new Error("Weibo text-only responses should not use avatars or UI icons as content images.");
}

const nestedMblogWithLayoutNoise = normalizeTikHubResponse(
  {
    data: {
      modules: [
        {
          name: "feed_header",
          layout: "grid",
        },
        {
          data: {
            mblog: weiboCard("wb-nested-1").mblog,
          },
        },
      ],
    },
  },
  "weibo",
);
if (nestedMblogWithLayoutNoise.length !== 1 || nestedMblogWithLayoutNoise[0].sourceId !== "wb-nested-1") {
  throw new Error("Weibo record extraction should prefer nested data.mblog records over App layout objects.");
}
if (nestedMblogWithLayoutNoise[0].images.length !== 1) {
  throw new Error("Weibo nested data.mblog records should keep normalized content images.");
}

const normalizedVideo = normalizeTikHubResponse(
  {
    data: {
      cards: [
        weiboCard("wb-video-1", {
          page_info: {
            page_pic: "https://wx1.sinaimg.cn/large/wb-video-cover.jpg",
            media_info: {
              stream_url_hd: "https://example.invalid/weibo-video-hd.mp4",
            },
          },
        }),
      ],
    },
  },
  "weibo",
);
if (normalizedVideo.length !== 1 || normalizedVideo[0].videoUrl !== "https://example.invalid/weibo-video-hd.mp4") {
  throw new Error("Weibo App video response should extract direct video media_info URLs.");
}

fakeResponses = [weiboResponse([weiboCard("wb-video-2")])].map((body) => ({ status: 200, body }));
requests.length = 0;
await crawlTikHub({
  platform: "weibo",
  query: "Xiaopeng P7",
  targetCount: 1,
  searchType: "hot",
  includeType: "video",
});
if (requests[0].params.search_type !== "64") {
  throw new Error(`Weibo video crawl should send search_type=64, got ${requests[0].params.search_type}.`);
}

fakeResponses = [
  { status: 200, body: weiboResponse([weiboCard("wb-page-1"), weiboCard("wb-page-2")]) },
  { status: 200, body: weiboResponse([weiboCard("wb-page-3")]) },
];
requests.length = 0;
const pagedItems = await crawlTikHub({
  platform: "weibo",
  query: "Xiaopeng G6",
  targetCount: 3,
  searchType: "hot",
  includeType: "all",
});
if (pagedItems.length !== 3) {
  throw new Error(`Weibo crawl should paginate until targetCount, got ${pagedItems.length} items.`);
}
if (requests.length !== 2 || requests[0].params.page !== "1" || requests[1].params.page !== "2") {
  throw new Error("Weibo crawl should paginate with page=1, page=2, ...");
}
if (requests.some((request) => request.params.search_type !== "60")) {
  throw new Error("Weibo hot crawl should keep search_type=60 on every page.");
}

console.log("Weibo App search endpoint and mapping check passed.");
