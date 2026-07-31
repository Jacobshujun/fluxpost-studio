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
const types = read("src/lib/types.ts");
const dongchedi = read("src/lib/dongchedi.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const feishuCli = read("src/lib/feishu-cli.ts");
const reviewPage = read("src/app/review/page.tsx");
const mockData = read("src/lib/mock-data.ts");
const route = read("src/app/api/crawl/links/route.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const page = read("src/app/page.tsx");
const launcher = read("src/lib/lark-task-launcher.ts");
const checkPs1 = read(".trellis/verification/check.mjs");

assertContains(types, /export type SourceLinkPlatform = CrawlPlatform \| "xiaopeng_bbs" \| "dongchedi"/, "Dongchedi should be a source-link platform, not a keyword crawl platform.");
assertContains(types, /export type Platform = SourceLinkPlatform \| "feishu"/, "Platform union must include Dongchedi through SourceLinkPlatform.");
assertContains(dongchedi, /extractDongchediArticleId/, "Dongchedi importer must parse article ids.");
assertContains(dongchedi, /normalizeDongchediArticle/, "Dongchedi importer must normalize article HTML.");
assertContains(dongchedi, /enableVideoTranscription\?:\s*boolean;[\s\S]*cookie\?:\s*string/, "Dongchedi importer options must accept a request-only cookie.");
assertContains(dongchedi, /if \(options\.cookie\) headers\.Cookie = options\.cookie/, "Dongchedi importer must forward an explicit cookie to the article HTML request.");
assertContains(dongchedi, /anti-bot challenge/i, "Dongchedi importer should fail clearly on anti-bot challenge HTML.");
assertContains(sourceLinkImport, /fetchDongchediItemBySource/, "Source-link import must dispatch Dongchedi links to the local importer.");
assertContains(sourceLinkImport, /fetchDongchediItemBySource\(link\.url,\s*\{[\s\S]*cookie,[\s\S]*enableVideoTranscription/, "Source-link import must forward request-only cookies to Dongchedi.");
assertContains(sourceLinkImport, /platform === "dongchedi"[\s\S]*fetchDongchediItemBySource/, "Dongchedi link import must not call TikHub.");
assertContains(sourceLinkImport, /extractDongchediArticleId/, "Dongchedi links should auto-detect through source-link import.");
assertContains(route, /value === "dongchedi"/, "Advanced link import route must accept Dongchedi platform.");
assertContains(simpleRoute, /SourceLinkPlatform \| "auto"/, "Simple run route must accept Dongchedi link platform.");
assertContains(feishuCli, /dongchedi:\s*"\\u61c2\\u8f66\\u5e1d"/, "Generated-post Feishu publish should label Dongchedi records.");
assertContains(reviewPage, /dongchedi:\s*"\\u61c2\\u8f66\\u5e1d"/, "Review page should label Dongchedi posts.");
assertContains(mockData, /dongchedi:\s*"\\u61c2\\u8f66\\u5e1d"/, "Mock data should label Dongchedi posts.");
assertContains(page, /value: "dongchedi", label: "懂车帝"/, "Compact link import should expose Dongchedi.");
assertContains(page, /value: "dongchedi"/, "Content-pool platform filters should expose Dongchedi.");
assertContains(launcher, /isDongchediAlias/, "Lark task launcher should support Dongchedi link aliases.");
assertContains(checkPs1, /Dongchedi import check/, "Trellis baseline must include the Dongchedi import check.");

const dongchediModule = loadTsModule("src/lib/dongchedi.ts", {
  "node:http": {
    request: () => {
      throw new Error("Network request is disabled in Dongchedi import check.");
    },
  },
  "node:https": {
    request: () => {
      throw new Error("Network request is disabled in Dongchedi import check.");
    },
  },
  "./media-cache": {
    cacheCrawledMedia: async (items) => items,
  },
  "./video-quality": videoQuality,
});

const {
  buildDongchediArticleUrl,
  extractDongchediArticleId,
  isDongchediSource,
  normalizeDongchediArticle,
} = dongchediModule;

const articleId = "7643008384274546713";
const canonicalUrl = "https://www.dongchedi.com/ugc/article/7643008384274546713";

if (buildDongchediArticleUrl(articleId) !== canonicalUrl) {
  throw new Error("Dongchedi article URL should be canonical.");
}
if (extractDongchediArticleId(articleId) !== articleId) {
  throw new Error("Pure Dongchedi article ids should be accepted.");
}
if (extractDongchediArticleId(`${canonicalUrl}?aid=36`) !== articleId) {
  throw new Error("Dongchedi article URLs should be accepted.");
}
if (!isDongchediSource(canonicalUrl)) {
  throw new Error("Dongchedi article URLs should be detected.");
}

const pageData = {
  articleInfo: {
    groupId: articleId,
    title: "2026款新车实拍体验",
    content: "<p>车机响应很快，空间表现也比预期更好。</p><p>适合做真实用车素材。</p>",
    author: { name: "懂车帝作者" },
    publishTime: 1781593777,
    readCount: 1280,
    diggCount: 33,
    commentCount: 6,
    imageList: [
      { url: "https://p3.dcarimg.com/img/tos-cn-i-dcdx/one.jpeg~tplv-resize.webp" },
      { uri: "tos-cn-i-dcdx/two.jpeg", urlList: ["https://p3.dcarimg.com/img/tos-cn-i-dcdx/two.jpeg"] },
      "https://p3.dcarimg.com/img/tos-cn-i-dcdx/one.jpeg~tplv-resize.webp",
    ],
  },
};
const html = `<html><head><title>fallback title</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: pageData } })}</script></head><body></body></html>`;
const item = normalizeDongchediArticle(articleId, canonicalUrl, html);

if (item.platform !== "dongchedi" || item.sourceId !== articleId) {
  throw new Error("Dongchedi normalized item should use platform and source id.");
}
if (item.sourceUrl !== canonicalUrl) {
  throw new Error("Dongchedi normalized item should preserve canonical source URL.");
}
if (item.title !== "2026款新车实拍体验") {
  throw new Error("Dongchedi normalized item should parse title.");
}
if (!item.contentText?.includes("真实用车素材")) {
  throw new Error("Dongchedi normalized item should parse and strip content text.");
}
if (item.authorName !== "懂车帝作者") {
  throw new Error("Dongchedi normalized item should parse author name.");
}
if (item.images.length !== 2 || !item.images[0].includes("one.jpeg")) {
  throw new Error("Dongchedi normalized item should parse and dedupe content images.");
}
if (item.mediaType !== "image") {
  throw new Error(`Dongchedi media type should be image, got ${item.mediaType}.`);
}
if (item.metrics.reads !== 1280 || item.metrics.likes !== 33 || item.metrics.comments !== 6) {
  throw new Error("Dongchedi normalized item should map metrics.");
}
if (item.publishedAt !== "2026-06-16T07:09:37.000Z") {
  throw new Error(`Dongchedi publish time should map to ISO time, got ${item.publishedAt}.`);
}

const mixedHtml = `<html><head><title>GX and ES8 gap</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      comment: {
        comment_data: [
          {
            group_id: 7650456390460555000,
            group_id_str: "7650456390460555326",
            comment_id_str: "comment-1",
            text: "comment text should not become article content",
            image_urls: [],
            profile_info: { name: "wrong comment author" },
            create_time: 1781593777,
          },
        ],
      },
      articleData: {
        data: {
          group_id: 7650456390460555000,
          group_id_str: "7650456390460555326",
          article_type: 1,
          content: "<p>article body should be selected</p>",
          cover_list: [
            { url: "https://p11-sign.toutiaoimg.com/motor-img/f8ed4296cfed4211adae2bfe7646ab63~tplv-shrink:1024:1536.jpg" },
          ],
          motor_profile_info: { name: "main author" },
          content_publish_time: 1781593777,
        },
      },
    },
  },
})}</script></head><body></body></html>`;
const mixedItem = normalizeDongchediArticle("7650456390460555326", "https://www.dongchedi.com/ugc/article/7650456390460555326", mixedHtml);

if (mixedItem.title !== "GX and ES8 gap") {
  throw new Error(`Dongchedi mixed page should use article/fallback title, got ${mixedItem.title}.`);
}
if (!mixedItem.contentText?.includes("article body should be selected")) {
  throw new Error("Dongchedi mixed page should select article body instead of comment text.");
}
if (mixedItem.contentText?.includes("comment text should not become article content")) {
  throw new Error("Dongchedi mixed page should not select comment records as the article.");
}
if (mixedItem.images.length !== 1 || !mixedItem.images[0].includes("motor-img")) {
  throw new Error("Dongchedi mixed page should keep article cover/content images.");
}
if (mixedItem.authorName !== "main author") {
  throw new Error(`Dongchedi mixed page should use article author, got ${mixedItem.authorName}.`);
}

let antiBotFailed = false;
try {
  normalizeDongchediArticle(articleId, canonicalUrl, "<html><script>window.byted_acrawler.sign('x')</script></html>");
} catch (error) {
  antiBotFailed = /anti-bot challenge/i.test(String(error?.message || error));
}
if (!antiBotFailed) {
  throw new Error("Dongchedi anti-bot challenge HTML should fail clearly.");
}

let capturedDongchediCookie = "";
const cookieForwardingModule = loadTsModule("src/lib/dongchedi.ts", {
  "node:http": {
    request: () => {
      throw new Error("HTTP should not be used for HTTPS Dongchedi URLs.");
    },
  },
  "node:https": {
    request: (_url, options, callback) => {
      capturedDongchediCookie = String(options?.headers?.Cookie || "");
      const listeners = {};
      const res = {
        statusCode: 200,
        headers: {},
        setEncoding: () => undefined,
        resume: () => undefined,
        on: (event, handler) => {
          listeners[event] = handler;
          return res;
        },
      };
      return {
        setTimeout: () => undefined,
        on: () => undefined,
        destroy: () => undefined,
        end: () => {
          callback(res);
          listeners.data?.(html);
          listeners.end?.();
        },
      };
    },
  },
  "./media-cache": {
    cacheCrawledMedia: async (items) => items,
  },
  "./video-quality": videoQuality,
});

await cookieForwardingModule.fetchDongchediItemBySource(canonicalUrl, {
  cookie: "sessionid=dongchedi-test; s_v_web_id=test",
});

if (capturedDongchediCookie !== "sessionid=dongchedi-test; s_v_web_id=test") {
  throw new Error("Dongchedi article request should include the explicit request cookie.");
}

console.log("Dongchedi import check passed.");
