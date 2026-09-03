import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const require = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function loadTsModule(relativePath, requireMap = {}, globals = {}) {
  const sourcePath = path.join(root, relativePath);
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(transpiled.outputText, {
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => Object.hasOwn(requireMap, name) ? requireMap[name] : require(name),
    ...globals,
  }, { filename: sourcePath });
  return cjsModule.exports;
}

const policy = loadTsModule("src/lib/finished-body-policy.ts");
const requests = [];
const openai = loadTsModule("src/lib/openai.ts", {
  "./activity-log": { compactError: (error) => String(error?.message || error), recordExecutionLog: async () => {} },
  "./config": { appConfig: { openaiApiKey: "test-key", openaiTextEndpoint: "chat", openaiTextModel: "test-model" }, openaiTextUrl: () => "https://openai.invalid/chat" },
  "./concurrency": { runWithConcurrencyPool: async (_pool, operation) => operation() },
  "./creation-controls": { formatImageTasksForPrompt: () => "" },
  "./finished-body-policy": policy,
  "./mock-data": { makeDemoPost: () => { throw new Error("no-key fallback should not be used"); } },
  "./model-image-input": {},
  "./source-video-reference": { resolveSourceVideoUrls: () => [] },
  "./title-guard": {
    clampGeneratedTitleMax: (value, fallback = "未命名图文草稿") => String(value || fallback).slice(0, 20),
    countVisibleTitleChars: (value) => Array.from(value).length,
    formatTitleStyleInstruction: () => "title style",
    isGeneratedTitleLengthValid: () => true,
    normalizeGeneratedTitle: (value) => String(value || "").trim(),
    pickTitleLengthProfile: () => ({ label: "test", min: 1, max: 20 }),
  },
}, {
  fetch: async (_url, options) => {
    const payload = JSON.parse(String(options.body));
    requests.push(payload.messages[1].content);
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: JSON.stringify({ title: "模型标题", body: "模型正文", imagePrompt: "", aiNotes: [] }) } }] };
      },
      async text() { return ""; },
    };
  },
});

const base = { id: "source", platform: "weibo", images: [], mediaUrls: [], metrics: {}, raw: {} };
const bodyOnly = await openai.generatePost({ source: { ...base, contentText: "微博正文" }, materialPaths: [] });
assert.equal(bodyOnly.title, "", "body-only source must keep title empty even if model returns one");
assert.equal(bodyOnly.body, "模型正文");
assert.match(requests[0], /title 必须返回空字符串/);

const titleOnly = await openai.generatePost({ source: { ...base, id: "title-source", title: "明确标题" }, materialPaths: [] });
assert.equal(titleOnly.title, "模型标题");
assert.equal(titleOnly.body, "", "title-only source must keep body empty even if model returns one");
assert.match(requests[1], /body 必须返回空字符串/);

const textless = await openai.generatePost({ source: { ...base, id: "empty-source" }, materialPaths: [] });
assert.equal(textless.title, "");
assert.equal(textless.body, "");
assert.equal(requests.length, 2, "textless source must not call the text model");
assert.ok(textless.aiNotes.some((note) => note.includes("缺少可确认的标题和正文")));

const tikhub = read("src/lib/tikhub.ts");
assert.match(tikhub, /const title = firstString\(record, \["title", "display_title", "displayTitle"\]\);[\s\S]*return title;/);
assert.doesNotMatch(tikhub, /return firstString\(record, \["title", "display_title", "displayTitle", "desc", "content", "text_raw"\]\)/);

const mockData = read("src/lib/mock-data.ts");
assert.match(mockData, /title,\s*body,/);
assert.doesNotMatch(mockData, /把普通素材做成高点击图文/);

const simpleRuns = read("src/lib/simple-runs.ts");
assert.doesNotMatch(simpleRuns, /为这篇汽车社交媒体图文/);
assert.doesNotMatch(simpleRuns, /突出智能电动车话题/);

const generatedPosts = read("src/lib/generated-posts.ts");
assert.match(generatedPosts, /title: clampGeneratedTitleMax\(post\.title,\s*""\)/);

console.log("Source content generation checks passed.");
