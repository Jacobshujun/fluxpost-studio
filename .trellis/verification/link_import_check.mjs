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
const tikhubSource = read("src/lib/tikhub.ts");
const linkImportSource = read("src/lib/source-link-import.ts");
const linkRouteSource = read("src/app/api/crawl/links/route.ts");
const contentPageSource = read("src/app/content/page.tsx");
const checkPs1 = read(".trellis/verification/check.ps1");
const requestedTikHubPaths = [];
const requestedTikHubUrls = [];
let failWeiboAppDetail = false;

function mockTikHubRequest(url, _options, callback) {
  requestedTikHubPaths.push(url.pathname);
  requestedTikHubUrls.push(url.toString());
  let statusCode = 200;
  let body;
  if (url.pathname.endsWith("fetch_status_detail")) {
    statusCode = failWeiboAppDetail ? 400 : 200;
    body = failWeiboAppDetail
      ? JSON.stringify({ code: 400, message: "fixture app detail failure" })
      : JSON.stringify({
          code: 200,
          data: {
            id: url.searchParams.get("status_id"),
            mid: url.searchParams.get("status_id"),
            text_raw: "Weibo App detail fixture",
            created_at: "Wed Jul 23 09:50:00 +0800 2026",
            attitudes_count: 1,
          },
        });
  } else if (url.pathname.endsWith("weibo/web_v2/fetch_post_detail")) {
    body = JSON.stringify({
      code: 200,
      data: {
        id: url.searchParams.get("id"),
        mid: url.searchParams.get("id"),
        text_raw: "Weibo Web V2 detail fixture",
        created_at: "Wed Jul 23 09:50:00 +0800 2026",
        attitudes_count: 1,
      },
    });
  } else if (url.pathname.endsWith("get_image_note_detail")) {
    body = JSON.stringify({ code: 200, data: { ok: false, status: 461, message: "fixture type mismatch" } });
  } else {
    body = JSON.stringify({
        code: 200,
        data: {
          ok: true,
          note_id: "6a0db7220000000006020fae",
          type: "video",
          title: "App V2 fallback video note",
          desc: "Video detail body",
          video_info_v2: {
            media: { stream: { h264: [{ master_url: "https://sns-video.example.invalid/fallback.mp4" }] } },
          },
        },
      });
  }
  return {
    on: () => undefined,
    write: () => undefined,
    end: () => callback({
      statusCode,
      on: (event, handler) => {
        if (event === "data") handler(Buffer.from(body));
        if (event === "end") handler();
      },
    }),
  };
}

assertContains(tikhubSource, /fetchTikHubItemBySourceLink/, "TikHub link import should be owned by src/lib/tikhub.ts.");
assertContains(tikhubSource, /fetch_one_video_by_share_url/, "Douyin link import must use the share-url detail endpoint.");
assertContains(tikhubSource, /fetch_one_video_v3/, "Douyin direct aweme-id links should use the single-video detail endpoint.");
assertContains(tikhubSource, /weibo\/app\/fetch_status_detail/, "Weibo link import must use the App post detail endpoint first.");
assertContains(tikhubSource, /weibo\/web_v2\/fetch_post_detail/, "Weibo link import must retain Web V2 as an explicit fallback.");
assertContains(tikhubSource, /fetch_video_by_share_url/, "WeChat Channels link import must use the share-url detail endpoint.");
assertContains(tikhubSource, /app_v2\/get_image_note_detail/, "Xiaohongshu image-note links must use App V2 detail.");
assertContains(tikhubSource, /app_v2\/get_video_note_detail/, "Xiaohongshu video-note links must use App V2 detail.");
if (/xiaohongshu\/(?:web\/get_note_info_v4|web\/extract_share_info|web_v3\/fetch_note_detail)/.test(tikhubSource)) {
  throw new Error("Removed Xiaohongshu Web detail endpoints must not remain in active TikHub source.");
}

assertContains(linkImportSource, /mapWithConcurrency<ParsedSourceLink,\s*FetchedSourceLink>\(candidates,\s*concurrencyConfig\.crawl/, "Link import fetch fan-out must be bounded by crawl concurrency.");
assertContains(linkImportSource, /filterUnsafeSourceItems\(dedupedItems/, "Link import must apply source safety before tagging and ingest.");
assertContains(linkImportSource, /tagSourceItems\(safetyResult\.items\)/, "Link import must reuse source tagging.");
assertContains(linkImportSource, /owner\?:\s*WorkspaceAccessActor/, "Link import must accept workspace owner context.");
assertContains(linkImportSource, /enableVideoTranscription\?:\s*boolean/, "Link import must accept the video transcription switch.");
assertContains(linkImportSource, /enableVideoTranscription:\s*input\.enableVideoTranscription === true/, "Link import must forward explicit video transcription opt-in.");
assertContains(linkImportSource, /ingestCrawlItems\(input\.query,\s*taggedItems,\s*input\.owner\)/, "Link import must persist through the owner-scoped content-pool ingest boundary.");
assertContains(linkRouteSource, /importSourceLinks/, "Link import API route must delegate to source-link-import domain logic.");
assertContains(linkRouteSource, /enableVideoTranscription\?:\s*boolean/, "Link import API route must accept the video transcription switch.");
assertContains(linkRouteSource, /enableVideoTranscription:\s*body\.enableVideoTranscription === true/, "Link import API route must default video transcription off.");
assertContains(linkRouteSource, /\/api\/crawl\/links|crawl\/links/, "Link import route must be isolated from keyword crawl route semantics.");
assertContains(contentPageSource, /crawlInputMode/, "/content must expose a crawl input mode state.");
assertContains(contentPageSource, /\/api\/crawl\/links/, "/content link import must call the dedicated link import API.");
assertContains(contentPageSource, /linkImportText/, "/content must keep controlled batch link input state.");
assertContains(contentPageSource, /linkImportEnableVideoTranscription/, "/content link import must keep video transcription switch state.");
assertContains(contentPageSource, /enableVideoTranscription:\s*linkImportEnableVideoTranscription/, "/content link import must send the video transcription switch.");
assertContains(checkPs1, /Link import check/, "Trellis baseline must include the link import check.");

const tikhub = loadTsModule("src/lib/tikhub.ts", {
  "node:http": {
    request: mockTikHubRequest,
  },
  "node:https": {
    request: mockTikHubRequest,
  },
  "./activity-log": {
    compactError: (error) => String(error?.message || error),
    recordExecutionLog: async () => undefined,
  },
  "./config": {
    appConfig: {
      tikhubApiKey: "test-key",
      tikhubBaseUrl: "https://example.invalid",
    },
  },
  "./concurrency": {
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
  },
  "./media-url-filter": {
    isLikelyNonContentImageUrl: () => false,
    normalizeContentImageUrls: (urls) => urls,
  },
  "./douyin-media": {
    extractDouyinCarouselImageUrls: () => [],
  },
  "./source-timestamps": {
    extractPublishedTime: () => ({}),
  },
  "./video-quality": videoQuality,
  "./media-cache": {
    cacheCrawledMedia: async (items) => items,
  },
});

const {
  fetchTikHubItemBySourceLink,
  detectPlatformFromSourceUrl,
  buildXiaohongshuImageNoteDetailPath,
  buildXiaohongshuVideoNoteDetailPath,
  buildDouyinShareVideoPath,
  buildDouyinSingleVideoPath,
  buildDouyinSourceLinkPath,
  buildWeiboAppPostDetailPath,
  buildWeiboPostDetailPath,
  buildWechatChannelsShareVideoPath,
  getTikHubBusinessError,
  normalizeWeiboStatusId,
  normalizeTikHubResponse,
} = tikhub;

if (detectPlatformFromSourceUrl("https://www.xiaohongshu.com/explore/6a0db7220000000006020fad?xsec_token=test") !== "xiaohongshu") {
  throw new Error("Xiaohongshu links should be auto-detected.");
}
if (detectPlatformFromSourceUrl("https://v.douyin.com/example/") !== "douyin") {
  throw new Error("Douyin short links should be auto-detected.");
}
if (detectPlatformFromSourceUrl("https://www.douyin.com/note/7630774012096674665") !== "douyin") {
  throw new Error("Douyin note links should be auto-detected.");
}
if (detectPlatformFromSourceUrl("https://m.weibo.cn/status/5300929016633658") !== "weibo") {
  throw new Error("Weibo status links should be auto-detected.");
}
if (detectPlatformFromSourceUrl("https://channels.weixin.qq.com/share/video?id=test") !== "wechat_channels") {
  throw new Error("WeChat Channels links should be auto-detected.");
}

const xhsImageUrl = new URL(
  buildXiaohongshuImageNoteDetailPath("6a0db7220000000006020fad", "https://xhslink.com/a/test"),
  "https://example.invalid",
);
if (
  xhsImageUrl.pathname !== "/api/v1/xiaohongshu/app_v2/get_image_note_detail" ||
  xhsImageUrl.searchParams.get("note_id") !== "6a0db7220000000006020fad" ||
  xhsImageUrl.searchParams.get("share_text") !== "https://xhslink.com/a/test"
) {
  throw new Error("Xiaohongshu App V2 image detail path should carry note_id and share_text.");
}

const xhsVideoUrl = new URL(
  buildXiaohongshuVideoNoteDetailPath(undefined, "https://xhslink.com/a/video-test"),
  "https://example.invalid",
);
if (
  xhsVideoUrl.pathname !== "/api/v1/xiaohongshu/app_v2/get_video_note_detail" ||
  xhsVideoUrl.searchParams.has("note_id") ||
  xhsVideoUrl.searchParams.get("share_text") !== "https://xhslink.com/a/video-test"
) {
  throw new Error("Xiaohongshu App V2 video detail path should support share_text without a local note id.");
}

const xhsImageItems = normalizeTikHubResponse({
  code: 200,
  data: {
    ok: true,
    note_id: "6a0db7220000000006020fad",
    type: "normal",
    title: "App V2 image note",
    desc: "Image note body",
    image_list: [{ url: "https://sns-img.example.invalid/image.webp" }],
    liked_count: 12,
  },
}, "xiaohongshu");
if (xhsImageItems[0]?.sourceId !== "6a0db7220000000006020fad" || xhsImageItems[0]?.images.length !== 1) {
  throw new Error("Xiaohongshu App V2 image detail fixture should normalize note identity and images.");
}

const xhsVideoItems = normalizeTikHubResponse({
  code: 200,
  data: {
    ok: true,
    note_id: "6a0db7220000000006020fae",
    type: "video",
    title: "App V2 video note",
    desc: "Video note body",
    video_info_v2: {
      media: { stream: { h264: [{ master_url: "https://sns-video.example.invalid/video.mp4", width: 1080, height: 1920 }] } },
    },
  },
}, "xiaohongshu");
if (xhsVideoItems[0]?.sourceId !== "6a0db7220000000006020fae" || xhsVideoItems[0]?.videoUrl !== "https://sns-video.example.invalid/video.mp4") {
  throw new Error("Xiaohongshu App V2 video detail fixture should normalize note identity and video media.");
}

const businessError = getTikHubBusinessError({
  code: 200,
  data: { ok: false, status: 461, message: "fixture business failure" },
}, "/api/v1/xiaohongshu/app_v2/get_image_note_detail");
if (!businessError || !businessError.includes("data.status=461") || !businessError.includes("get_image_note_detail")) {
  throw new Error("TikHub HTTP-200 business failures must be rejected with status and endpoint context.");
}
if (getTikHubBusinessError({ code: 200, data: { ok: true, status: 200 } }, "/success")) {
  throw new Error("TikHub success envelopes must not be classified as business failures.");
}

const xhsFallbackItems = await fetchTikHubItemBySourceLink({
  url: "https://www.xiaohongshu.com/explore/6a0db7220000000006020fae",
  platform: "xiaohongshu",
});
if (
  requestedTikHubPaths.join(",") !==
    "/api/v1/xiaohongshu/app_v2/get_image_note_detail,/api/v1/xiaohongshu/app_v2/get_video_note_detail"
) {
  throw new Error(`Xiaohongshu App V2 link fallback should try image then video detail, got ${requestedTikHubPaths.join(",")}`);
}
if (
  xhsFallbackItems[0]?.sourceId !== "6a0db7220000000006020fae" ||
  xhsFallbackItems[0]?.videoUrl !== "https://sns-video.example.invalid/fallback.mp4"
) {
  throw new Error("Xiaohongshu link import should return the App V2 video detail after an image business failure.");
}

const dyShareUrl = new URL(buildDouyinShareVideoPath("https://v.douyin.com/abc/"), "https://example.invalid");
if (dyShareUrl.pathname !== "/api/v1/douyin/web/fetch_one_video_by_share_url" || dyShareUrl.searchParams.get("share_url") !== "https://v.douyin.com/abc/") {
  throw new Error("Douyin share path should carry share_url.");
}

const dySingleUrl = new URL(buildDouyinSingleVideoPath("7647456408942589300"), "https://example.invalid");
if (dySingleUrl.pathname !== "/api/v1/douyin/web/fetch_one_video_v3" || dySingleUrl.searchParams.get("aweme_id") !== "7647456408942589300") {
  throw new Error("Douyin single-video path should carry aweme_id.");
}

const dyVideoSourceUrl = new URL(buildDouyinSourceLinkPath("https://www.douyin.com/video/7647456408942589300"), "https://example.invalid");
if (dyVideoSourceUrl.pathname !== "/api/v1/douyin/web/fetch_one_video_v3" || dyVideoSourceUrl.searchParams.get("aweme_id") !== "7647456408942589300") {
  throw new Error("Douyin /video links should use the single-video detail endpoint.");
}

const dySearchModalSourceUrl = new URL(buildDouyinSourceLinkPath("https://www.douyin.com/search/%E5%B0%8F%E9%B9%8Fgx?aid=32479e4d-091d-45cc-9757-8ac8e675e21c&modal_id=7657077050561938922&type=general"), "https://example.invalid");
if (dySearchModalSourceUrl.pathname !== "/api/v1/douyin/web/fetch_one_video_v3" || dySearchModalSourceUrl.searchParams.get("aweme_id") !== "7657077050561938922") {
  throw new Error("Douyin search modal links should use modal_id as the single-video aweme_id.");
}

const dyNoteSourceUrl = new URL(buildDouyinSourceLinkPath("https://www.douyin.com/note/7630774012096674665"), "https://example.invalid");
if (dyNoteSourceUrl.pathname !== "/api/v1/douyin/web/fetch_one_video_by_share_url" || dyNoteSourceUrl.searchParams.get("share_url") !== "https://www.douyin.com/note/7630774012096674665") {
  throw new Error("Douyin /note links should use the share-url endpoint, not the single-video detail endpoint.");
}

const dyQuotedSourceUrl = new URL(buildDouyinSourceLinkPath("https://www.douyin.com/search/%E5%B0%8F%E9%B9%8Fgx?modal_id=7657077050561938922&type=general”"), "https://example.invalid");
if (dyQuotedSourceUrl.pathname !== "/api/v1/douyin/web/fetch_one_video_v3" || dyQuotedSourceUrl.searchParams.get("aweme_id") !== "7657077050561938922") {
  throw new Error("Douyin search modal links should tolerate trailing smart quotes copied with the URL.");
}

const dyDetailItems = normalizeTikHubResponse({
  data: {
    aweme_detail: {
      aweme_id: "7630774012096674665",
      desc: "Douyin note fixture",
      aweme_type: 68,
      statistics: {
        digg_count: 12,
        comment_count: 3,
      },
    },
  },
}, "douyin");
if (
  dyDetailItems[0]?.sourceId !== "7630774012096674665" ||
  dyDetailItems[0]?.contentText !== "Douyin note fixture" ||
  dyDetailItems[0]?.title
) {
  throw new Error("Douyin source-link normalization should unwrap aweme_detail records without treating desc as title.");
}

const dyTitledItems = normalizeTikHubResponse({
  data: {
    aweme_detail: {
      aweme_id: "7630774012096674666",
      title: "Real Douyin title",
      desc: "Douyin body text",
      aweme_type: 68,
      statistics: {},
    },
  },
}, "douyin");
if (dyTitledItems[0]?.title !== "Real Douyin title" || dyTitledItems[0]?.contentText !== "Douyin body text") {
  throw new Error("Douyin source-link normalization should keep explicit title fields separate from desc body text.");
}

if (normalizeWeiboStatusId("R9IbHiG1a") !== "5323148134451424") {
  throw new Error("Weibo base62 status ids should convert to the documented numeric id format.");
}
if (normalizeWeiboStatusId("5300929016633658") !== "5300929016633658") {
  throw new Error("Numeric Weibo status ids should remain unchanged.");
}

const weiboAppUrl = new URL(buildWeiboAppPostDetailPath("5300929016633658"), "https://example.invalid");
if (weiboAppUrl.pathname !== "/api/v1/weibo/app/fetch_status_detail" || weiboAppUrl.searchParams.get("status_id") !== "5300929016633658") {
  throw new Error("Weibo App detail path should carry the numeric status_id.");
}

const weiboWebV2Url = new URL(buildWeiboPostDetailPath("5300929016633658"), "https://example.invalid");
if (weiboWebV2Url.pathname !== "/api/v1/weibo/web_v2/fetch_post_detail" || weiboWebV2Url.searchParams.get("id") !== "5300929016633658" || weiboWebV2Url.searchParams.get("is_get_long_text") !== "true") {
  throw new Error("Weibo Web V2 fallback path should carry id and long-text flag.");
}

requestedTikHubPaths.length = 0;
requestedTikHubUrls.length = 0;
failWeiboAppDetail = false;
const weiboAppItems = await fetchTikHubItemBySourceLink({
  url: "https://weibo.com/1192966660/R9IbHiG1a",
  platform: "weibo",
});
if (requestedTikHubPaths.join(",") !== "/api/v1/weibo/app/fetch_status_detail") {
  throw new Error(`Weibo link import should use App detail first, got ${requestedTikHubPaths.join(",")}`);
}
if (new URL(requestedTikHubUrls[0]).searchParams.get("status_id") !== "5323148134451424") {
  throw new Error("Weibo App detail should receive the numeric id converted from the URL short id.");
}
if (weiboAppItems[0]?.sourceId !== "5323148134451424") {
  throw new Error("Weibo App detail response should normalize the numeric source id.");
}

requestedTikHubPaths.length = 0;
requestedTikHubUrls.length = 0;
failWeiboAppDetail = true;
const weiboFallbackItems = await fetchTikHubItemBySourceLink({
  url: "https://weibo.com/1192966660/R9IbHiG1a",
  platform: "weibo",
});
if (requestedTikHubPaths.join(",") !== "/api/v1/weibo/app/fetch_status_detail,/api/v1/weibo/web_v2/fetch_post_detail") {
  throw new Error(`Weibo detail fallback should try App then Web V2, got ${requestedTikHubPaths.join(",")}`);
}
if (new URL(requestedTikHubUrls[1]).searchParams.get("id") !== "5323148134451424") {
  throw new Error("Weibo Web V2 fallback should receive the numeric id converted from the URL short id.");
}
if (weiboFallbackItems[0]?.sourceId !== "5323148134451424") {
  throw new Error("Weibo Web V2 fallback response should normalize the numeric source id.");
}

const channelsUrl = new URL(buildWechatChannelsShareVideoPath("https://channels.weixin.qq.com/share/video?id=test"), "https://example.invalid");
if (channelsUrl.pathname !== "/api/v1/wechat_channels/fetch_video_by_share_url" || channelsUrl.searchParams.get("share_url") !== "https://channels.weixin.qq.com/share/video?id=test") {
  throw new Error("WeChat Channels share path should carry share_url.");
}

console.log("Link import check passed.");
