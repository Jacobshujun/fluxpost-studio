import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const typesSource = readFileSync(path.join(projectRoot, "src/lib/types.ts"), "utf8");
const sourceTaggingSource = readFileSync(path.join(projectRoot, "src/lib/source-tagging.ts"), "utf8");

if (!/visualTagOptions = \["APP", "内饰空间", "汽车外观", "车型美图", "带文字图", "人车美图"\]/.test(typesSource)) {
  throw new Error("Visual tag options must include APP and 车型美图 in the canonical allowed set.");
}

if (!typesSource.includes('"提车记录"')) {
  throw new Error("Content tag options must include 提车记录.");
}

for (const expected of [
  "提车记录：车主提车",
  "该标签用于归档，不进入后续内容生产",
  "提车作业",
  "美女车图：仅当标题或正文明确出现美女、小姐姐、女生、女车主、车模、女性出镜等语义时选择",
  "纯车外观、车型美图、汽车美图、车图合集、没有人物或无法确认人物时不要选择",
]) {
  if (!sourceTaggingSource.includes(expected)) {
    throw new Error(`Content tagging prompt must document strict content-tag boundaries: ${expected}`);
  }
}

if (!/const contentTagAliases:[\s\S]*提车作业:[\s\S]*"提车记录"/.test(sourceTaggingSource)) {
  throw new Error("Content tag aliases must normalize pickup-record synonyms to 提车记录.");
}

for (const expected of [
  "标签判定优先级：APP > 带文字图 > 人车美图 > 车型美图 > 汽车外观 > 内饰空间",
  "APP：手机 App 截图",
  "带文字图：海报、信息图、文字内容图",
  "只要图片存在显著标题、卖点、参数、说明文字、脚注或品牌海报文案",
  "即使整车或车型主体占画面核心，也优先选择带文字图",
  "车型美图：纯车外观美图",
  "且没有显著标题或说明文字",
  "人车美图：车外观和人物同时明显",
]) {
  if (!sourceTaggingSource.includes(expected)) {
    throw new Error(`Visual tagging prompt must document the new label boundary: ${expected}`);
  }
}

function loadTsModule(relativePath, requireMap = {}, sandboxExtras = {}) {
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
    module: cjsModule,
    exports: cjsModule.exports,
    setTimeout,
    clearTimeout,
    AbortController,
    ...sandboxExtras,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const mediaFilter = loadTsModule("src/lib/media-url-filter.ts");
const imageFormat = loadTsModule("src/lib/image-format.ts");
const videoFramePolicy = loadTsModule("src/lib/video-frame-policy.ts", {
  "./types": {},
});
const logs = [];
const modelImageUrls = [];
let remoteFetches = 0;

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const heicBytes = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
]);
const localReads = [];

function makeResponse({ ok = true, status = 200, body = Buffer.from("{}"), headers = {} }) {
  return {
    ok,
    status,
    headers: {
      get: (key) => headers[key.toLowerCase()] || null,
    },
    async arrayBuffer() {
      return Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    },
    async text() {
      return Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    },
    async json() {
      return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));
    },
  };
}

async function fetchMock(url, options = {}) {
  const href = String(url);
  if (href === "https://cdn.example.invalid/not-image") {
    remoteFetches += 1;
    return makeResponse({
      body: Buffer.from("<html>not an image</html>"),
      headers: {
        "content-type": "text/html",
        "content-length": "25",
      },
    });
  }
  if (href === "https://cdn.example.invalid/valid-image") {
    remoteFetches += 1;
    if (!options.headers?.Referer) {
      throw new Error("Remote image fetch should use media request headers.");
    }
    return makeResponse({
      body: pngBytes,
      headers: {
        "content-type": "image/png",
        "content-length": String(pngBytes.length),
      },
    });
  }
  if (href === "https://openai.example.invalid/chat/completions") {
    const payload = JSON.parse(String(options.body || "{}"));
    const userContent = payload.messages?.find((message) => message.role === "user")?.content;
    const promptText = Array.isArray(userContent)
      ? String(userContent.find((part) => part?.type === "text")?.text || "")
      : String(userContent || "");
    const images = Array.isArray(userContent)
      ? userContent.filter((part) => part?.type === "image_url").map((part) => part.image_url?.url)
      : [];
    modelImageUrls.push(...images);
    if (images.some((imageUrl) => /^https?:\/\//i.test(imageUrl || ""))) {
      return makeResponse({
        ok: false,
        status: 400,
        body: Buffer.from(JSON.stringify({ error: { message: "raw remote image URL reached model" } })),
      });
    }
    let content;
    if (images.length) {
      if (promptText.includes("car-only-regression")) {
        content = { visualTags: [{ id: "image-1", tag: "车型美图", confidence: 0.8, reason: "pure car image" }] };
      } else if (promptText.includes("visual-people-regression")) {
        content = { visualTags: [{ id: "image-1", tag: "人车美图", confidence: 0.8, reason: "person and car" }] };
      } else {
        content = { visualTags: [{ id: "image-2", tag: "汽车外观", confidence: 0.8, reason: "valid image" }] };
      }
    } else if (promptText.includes("car-only-regression") || promptText.includes("visual-people-regression")) {
      content = { contentTags: ["美女车图", "经验干货"], confidence: 0.8, reasons: ["model over-selected beauty-car tag"] };
    } else if (promptText.includes("people-text-regression")) {
      content = { contentTags: ["美女车图", "经验干货"], confidence: 0.8, reasons: ["title explicitly mentions female model"] };
    } else {
      content = { contentTags: ["提车作业", "经验干货"], confidence: 0.8, reasons: ["content"] };
    }
    return makeResponse({
      body: Buffer.from(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })),
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`Unexpected fetch URL: ${href}`);
}

const modelImageInput = loadTsModule(
  "src/lib/model-image-input.ts",
  {
    "node:fs/promises": {
      readFile: async (filePath) => {
        localReads.push(filePath);
        return String(filePath).includes("image-1.jpg") ? heicBytes : pngBytes;
      },
    },
    "node:path": path,
    "./image-format": imageFormat,
    "./media-request": {
      buildMediaRequestHeaders: () => ({
        Referer: "https://cdn.example.invalid/",
      }),
    },
  },
  {
    fetch: fetchMock,
  },
);

const sourceTagging = loadTsModule(
  "src/lib/source-tagging.ts",
  {
    "./activity-log": {
      compactError: (error) => (error instanceof Error ? error.message : String(error)),
      recordExecutionLog: async (entry) => logs.push(entry),
    },
    "./config": {
      appConfig: {
        openaiApiKey: "test-key",
        openaiTextEndpoint: "chat",
        openaiTextModel: "test-model",
      },
      openaiTextUrl: () => "https://openai.example.invalid/chat/completions",
    },
    "./concurrency": {
      concurrencyConfig: {
        gpt: 4,
      },
      mapWithConcurrency: async (items, _limit, mapper) => Promise.all(items.map(mapper)),
      runWithConcurrencyPool: async (_name, task) => task(),
    },
    "./media-url-filter": mediaFilter,
    "./model-image-input": modelImageInput,
    "./video-frame-policy": videoFramePolicy,
    "./types": {
      contentTagOptions: ["经验干货", "新车曝光", "美女车图", "提车记录"],
      visualTagOptions: ["APP", "内饰空间", "汽车外观", "车型美图", "带文字图", "人车美图"],
    },
  },
  {
    fetch: fetchMock,
  },
);

const tagged = await sourceTagging.tagSourceItem({
  id: "source-1",
  sourceId: "source-1",
  platform: "douyin",
  title: "test",
  contentText: "test",
  mediaType: "image",
  metrics: {},
  images: ["https://cdn.example.invalid/not-image", "https://cdn.example.invalid/valid-image"],
  mediaUrls: [],
  raw: {},
});

if (remoteFetches !== 2) {
  throw new Error(`Expected both remote image URLs to be preflighted, got ${remoteFetches}.`);
}
if (!tagged.contentTagging?.tags.includes("提车记录")) {
  throw new Error("Content tagging should normalize 提车作业 to the canonical 提车记录 tag.");
}
if (modelImageUrls.length !== 1) {
  throw new Error(`Expected one valid model image after skipping invalid remote assets, got ${modelImageUrls.length}.`);
}
if (!modelImageUrls[0]?.startsWith("data:image/png;base64,")) {
  throw new Error("Valid remote image should be converted to a supported inline data URL before model tagging.");
}
if (tagged.visualTagging?.status !== "success" || tagged.visualTagging.assets.length !== 1) {
  throw new Error("Visual tagging should succeed with the valid remote image instead of failing the whole batch.");
}
if (tagged.visualTagging.assets[0].id !== "image-2") {
  throw new Error("Visual tagging should preserve the original asset id for the valid remote image.");
}
if (!logs.some((entry) => entry.action === "视觉素材预处理跳过" && entry.details?.skippedAssets === 1)) {
  throw new Error("Skipped invalid visual assets should be recorded in the execution log.");
}

logs.length = 0;
modelImageUrls.length = 0;

const taggedCarOnly = await sourceTagging.tagSourceItem({
  id: "source-car-only",
  sourceId: "source-car-only",
  platform: "xiaohongshu",
  title: "car-only-regression 车型美图合集",
  contentText: "纯车外观壁纸和汽车美图，没有人物出镜。",
  mediaType: "image",
  metrics: {},
  images: [`data:image/png;base64,${pngBytes.toString("base64")}`],
  mediaUrls: [],
  raw: {},
});

if (taggedCarOnly.contentTagging?.tags.includes("美女车图")) {
  throw new Error("Content tagging must remove 美女车图 when text only indicates pure car beauty images.");
}
if (!taggedCarOnly.contentTagging?.tags.includes("经验干货")) {
  throw new Error("Strict 美女车图 filtering should preserve unrelated valid content tags.");
}
if (taggedCarOnly.visualTagging?.assets[0]?.tag !== "车型美图") {
  throw new Error("Car-only visual tagging should still keep the 车型美图 visual label.");
}

logs.length = 0;
modelImageUrls.length = 0;

const taggedVisualPeopleOnly = await sourceTagging.tagSourceItem({
  id: "source-visual-people",
  sourceId: "source-visual-people",
  platform: "xiaohongshu",
  title: "visual-people-regression 周末拍照",
  contentText: "新车图片分享。",
  mediaType: "image",
  metrics: {},
  images: [`data:image/png;base64,${pngBytes.toString("base64")}`],
  mediaUrls: [],
  raw: {},
});

if (taggedVisualPeopleOnly.contentTagging?.tags.includes("美女车图")) {
  throw new Error("Content tagging must not keep 美女车图 from visual people-car context without explicit text evidence.");
}
if (taggedVisualPeopleOnly.visualTagging?.assets[0]?.tag !== "人车美图") {
  throw new Error("Visual 人车美图 should remain available without forcing the 美女车图 content tag.");
}

logs.length = 0;
modelImageUrls.length = 0;

const taggedPeopleText = await sourceTagging.tagSourceItem({
  id: "source-people-text",
  sourceId: "source-people-text",
  platform: "xiaohongshu",
  title: "people-text-regression 小姐姐和新车拍照",
  contentText: "女车主出镜的人车写真。",
  mediaType: "text",
  metrics: {},
  images: [],
  mediaUrls: [],
  raw: {},
});

if (!taggedPeopleText.contentTagging?.tags.includes("美女车图")) {
  throw new Error("Content tagging should keep 美女车图 when title/body explicitly mention female people-car content.");
}

logs.length = 0;
modelImageUrls.length = 0;
localReads.length = 0;

const taggedLocal = await sourceTagging.tagSourceItem({
  id: "source-local",
  sourceId: "source-local",
  platform: "weibo",
  title: "local test",
  contentText: "local test",
  mediaType: "image",
  metrics: {},
  images: [],
  downloadedImages: [
    "/media/crawl/weibo/local-source/image-1.jpg",
    "/media/crawl/weibo/local-source/image-2.jpg",
  ],
  mediaUrls: [],
  raw: {},
});

if (localReads.length !== 2) {
  throw new Error(`Expected both local image files to be inspected, got ${localReads.length}.`);
}
if (modelImageUrls.length !== 1 || !modelImageUrls[0]?.startsWith("data:image/png;base64,")) {
  throw new Error("Unsupported local image bytes should be skipped instead of being sent by extension MIME.");
}
if (taggedLocal.visualTagging?.status !== "success" || taggedLocal.visualTagging.assets[0]?.id !== "image-2") {
  throw new Error("Visual tagging should continue with supported local images after skipping unsupported local bytes.");
}
if (!logs.some((entry) => entry.details?.skippedAssets === 1)) {
  throw new Error("Skipped unsupported local visual assets should be recorded in the execution log.");
}

console.log("Source tagging remote image preprocessing check passed.");
