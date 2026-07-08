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
const xiaopeng = read("src/lib/xiaopeng-bbs.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const route = read("src/app/api/crawl/links/route.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const contentPage = read("src/app/content/page.tsx");
const checkPs1 = read(".trellis/verification/check.ps1");

assertContains(types, /export type SourceLinkPlatform = CrawlPlatform \| "xiaopeng_bbs" \| "dongchedi"/, "Xiaopeng BBS should be a source-link platform, not a keyword crawl platform.");
assertContains(types, /export type Platform = SourceLinkPlatform \| "feishu" \| "original"/, "Platform union must include Xiaopeng BBS through SourceLinkPlatform.");
assertContains(xiaopeng, /extractXiaopengBbsThreadId/, "Xiaopeng BBS importer must parse thread ids.");
assertContains(xiaopeng, /pageData/, "Xiaopeng BBS importer must parse Next pageData.");
assertContains(sourceLinkImport, /fetchXiaopengBbsItemBySource/, "Source-link import must dispatch Xiaopeng BBS links to the local importer.");
assertContains(sourceLinkImport, /platform === "xiaopeng_bbs"[\s\S]*fetchXiaopengBbsItemBySource/, "Xiaopeng BBS link import must not call TikHub.");
assertContains(sourceLinkImport, /normalizeXiaopengBbsInput/, "Pure Xiaopeng BBS ids should normalize to thread URLs when platform is selected.");
assertContains(route, /SourceLinkPlatform \| "auto"/, "Advanced link import route must accept source-link platforms.");
assertContains(simpleRoute, /SourceLinkPlatform \| "auto"/, "Simple run route must accept Xiaopeng BBS link platform.");
assertContains(simpleRuns, /isSourceLinkPlatform\(normalizedInput\.linkPlatform\)/, "Simple link mode must forward Xiaopeng BBS platform to the resolver.");
assertContains(contentPage, /linkImportPlatforms/, "/content should use a dedicated link-import platform list.");
assertContains(contentPage, /xiaopeng_bbs", label: "小鹏社区"/, "/content link import should expose Xiaopeng BBS.");
assertContains(contentPage, /小鹏社区帖子 ID/, "/content should hint that pure Xiaopeng BBS ids are accepted.");
assertContains(checkPs1, /Xiaopeng BBS import check/, "Trellis baseline must include the Xiaopeng BBS import check.");

const xiaopengModule = loadTsModule("src/lib/xiaopeng-bbs.ts", {
  "node:http": {
    request: () => {
      throw new Error("Network request is disabled in Xiaopeng BBS import check.");
    },
  },
  "node:https": {
    request: () => {
      throw new Error("Network request is disabled in Xiaopeng BBS import check.");
    },
  },
  "./media-cache": {
    cacheCrawledMedia: async (items) => items,
  },
  "./video-quality": videoQuality,
});

const {
  buildXiaopengBbsThreadUrl,
  extractXiaopengBbsThreadId,
  isXiaopengBbsSource,
  normalizeXiaopengBbsThread,
} = xiaopengModule;

if (buildXiaopengBbsThreadUrl("3776077") !== "https://bbs.xiaopeng.com/thread/3776077?tidType=1") {
  throw new Error("Xiaopeng BBS thread URL should be canonical.");
}
if (extractXiaopengBbsThreadId("3776077") !== "3776077") {
  throw new Error("Pure Xiaopeng BBS ids should be accepted.");
}
if (extractXiaopengBbsThreadId("https://bbs.xiaopeng.com/thread/3776077?tidType=1") !== "3776077") {
  throw new Error("Xiaopeng BBS thread URLs should be accepted.");
}
if (!isXiaopengBbsSource("https://bbs.xiaopeng.com/thread/3776077?tidType=1")) {
  throw new Error("Xiaopeng BBS URLs should be detected.");
}

const pageData = {
  value: {
    tid: 3776077,
    subject: "#城市智能出行# \n",
    title: "",
    content: "#城市智能出行# \n\n从汕头到汕尾，智能出行，有小鹏就行",
    summary: "#城市智能出行# 从汕头到汕尾，智能出行，有小鹏就行",
    username: "鹏友16920410",
    dateline: 1778583949,
    views: 47,
    replies: 0,
    liked: 1,
    topics: [{ name: "城市智能出行" }],
    attach: [
      { type: "IMAGE", attachment: "https://s.xiaopeng.com/bbs/uploaded/v2/orig/20260512/a.jpeg" },
      { type: "IMAGE", attachment: "https://s.xiaopeng.com/bbs/uploaded/v2/orig/20260512/b.jpeg" },
      { type: "IMAGE", attachment: "https://s.xiaopeng.com/bbs/uploaded/v2/orig/20260512/a.jpeg" },
    ],
    videos: [],
  },
};
const fixtureHtml = `<script nonce="test">self.__next_f.push([1,"5:${JSON.stringify({ pageData }).replace(/"/g, '\\"')}\\n"])</script>`;
const item = normalizeXiaopengBbsThread("3776077", "https://bbs.xiaopeng.com/thread/3776077?tidType=1", fixtureHtml);

if (item.platform !== "xiaopeng_bbs" || item.sourceId !== "3776077") {
  throw new Error("Xiaopeng BBS normalized item should use platform and source id.");
}
if (item.sourceUrl !== "https://bbs.xiaopeng.com/thread/3776077?tidType=1") {
  throw new Error("Xiaopeng BBS normalized item should preserve canonical source URL.");
}
if (item.authorName !== "鹏友16920410") {
  throw new Error("Xiaopeng BBS normalized item should parse author name.");
}
if (!item.contentText?.includes("智能出行")) {
  throw new Error("Xiaopeng BBS normalized item should parse content text.");
}
if (item.images.length !== 2 || !item.images[0].endsWith("/a.jpeg")) {
  throw new Error("Xiaopeng BBS normalized item should parse and dedupe attachment images.");
}
if (item.metrics.views !== 47 || item.metrics.likes !== 1 || item.metrics.comments !== 0) {
  throw new Error("Xiaopeng BBS normalized item should map metrics.");
}
if (item.publishedAt !== "2026-05-12T11:05:49.000Z") {
  throw new Error(`Xiaopeng BBS dateline should map to ISO time, got ${item.publishedAt}.`);
}

console.log("Xiaopeng BBS import check passed.");
