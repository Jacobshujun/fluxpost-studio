import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
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
assert.equal(policy.FINISHED_BODY_TARGET_CHARS, 800);
assert.equal(policy.FINISHED_BODY_MAX_CHARS, 1000);
assert.equal(policy.FINISHED_BODY_POLICY_VERSION, 1);
assert.equal(policy.countFinishedBodyChars(" 文\n字 😀 "), 5, "trimmed whitespace, line breaks, and emoji must count as Unicode code points");
assert.equal(policy.countFinishedBodyChars("😀"), 1, "emoji must count as one code point");
assert.equal(policy.clampFinishedBodyInput("😀".repeat(1001)).length, 2000, "manual clamping must retain 1000 surrogate-pair emoji");
assert.equal(Array.from(policy.clampFinishedBodyInput("😀".repeat(1001))).length, 1000);
assert.equal(policy.clampFinishedBodyInput(` ${"甲".repeat(1000)} `), ` ${"甲".repeat(1000)} `, "outer whitespace must not consume the trimmed-body allowance");
assert.equal(policy.truncateFinishedBody(`${"甲".repeat(990)}。${"乙".repeat(30)}`), `${"甲".repeat(990)}。`);
assert.equal(policy.truncateFinishedBody(`${"甲".repeat(989)}。”${"乙".repeat(30)}`), `${"甲".repeat(989)}。”`);
assert.equal(policy.truncateFinishedBody(`${"A".repeat(990)}.${"B".repeat(30)}`), `${"A".repeat(990)}.`);
assert.equal(policy.truncateFinishedBody(`${"甲".repeat(990)}…${"乙".repeat(30)}`), `${"甲".repeat(990)}…`);
assert.equal(Array.from(policy.truncateFinishedBody("甲".repeat(1001))).length, 1000, "text without a sentence boundary must hard-truncate");
assert.equal(policy.truncateFinishedBody("甲".repeat(1000)), "甲".repeat(1000));

const newRecord = policy.applyFinishedBodyPolicy({ body: `${"甲".repeat(990)}。${"乙".repeat(30)}` });
assert.equal(newRecord.bodyPolicyVersion, 1);
assert.equal(newRecord.body, `${"甲".repeat(990)}。`);
const legacyBody = "旧".repeat(1001);
assert.deepEqual(
  JSON.parse(JSON.stringify(policy.applyFinishedBodyPolicy({ body: legacyBody }, { body: legacyBody }))),
  { body: legacyBody },
  "unchanged legacy bodies must stay unmarked and unmodified",
);
const promoted = policy.applyFinishedBodyPolicy({ body: `${legacyBody}新` }, { body: legacyBody });
assert.equal(promoted.bodyPolicyVersion, 1);
assert.equal(Array.from(promoted.body).length, 1000);
const governed = policy.applyFinishedBodyPolicy({ body: "新".repeat(1002), bodyPolicyVersion: 1 }, { body: "旧", bodyPolicyVersion: 1 });
assert.equal(governed.bodyPolicyVersion, 1);
assert.equal(Array.from(governed.body).length, 1000);
assert.equal(policy.isFinishedBodyPolicyCompliant({ body: legacyBody }), true, "unmarked historical bodies remain publishable");
assert.equal(policy.isFinishedBodyPolicyCompliant({ body: legacyBody, bodyPolicyVersion: 1 }), false, "governed over-limit bodies must fail publishing preflight");

const modelRequests = [];
const logs = [];
let compressionResponses = 0;
const openaiModule = loadTsModule("src/lib/openai.ts", {
  "./activity-log": { compactError: (error) => error instanceof Error ? error.message : String(error), recordExecutionLog: async (entry) => { logs.push(entry); } },
  "./config": { appConfig: { openaiApiKey: "test-key", openaiTextEndpoint: "chat", openaiTextModel: "test-model" }, openaiTextUrl: () => "https://openai.example.invalid/chat/completions" },
  "./concurrency": { runWithConcurrencyPool: async (_pool, operation) => operation() },
  "./creation-controls": { formatImageTasksForPrompt: () => "" },
  "./finished-body-policy": policy,
  "./mock-data": {},
  "./model-image-input": {},
  "./source-video-reference": {},
  "./title-guard": {
    clampGeneratedTitleMax: (value) => value,
    countVisibleTitleChars: (value) => Array.from(value).length,
    fitTitleLength: (value) => value,
    formatTitleStyleInstruction: () => "title style",
    isGeneratedTitleLengthValid: () => true,
    normalizeGeneratedTitle: (value) => value.trim(),
    pickTitleLengthProfile: () => ({ label: "test", min: 1, max: 100 }),
  },
}, {
  fetch: async (_url, options) => {
    const payload = JSON.parse(String(options.body));
    modelRequests.push(payload);
    const prompt = payload.messages[1].content;
    const content = prompt.includes("待压缩正文")
      ? { body: ++compressionResponses === 1 ? "压".repeat(800) : "长".repeat(1100) }
      : { title: "合规标题", body: "合规正文", imagePrompt: "", aiNotes: [] };
    return {
      ok: true,
      status: 200,
      async json() { return { choices: [{ message: { content: JSON.stringify(content) } }] }; },
      async text() { return ""; },
    };
  },
});
const generated = await openaiModule.generatePost({
  source: { id: "source-1", platform: "dongchedi", title: "原始标题", contentText: "完整采集原文", images: [], mediaUrls: [] },
  materialPaths: [],
});
assert.equal(generated.body, "合规正文");
assert.equal(generated.bodyPolicyVersion, 1);
assert.match(modelRequests[0].messages[1].content, /约 800 个字符/);
assert.match(modelRequests[0].messages[1].content, /完整采集原文/);
const compressed = await openaiModule.finalizeAiFinishedBody("初".repeat(1001));
assert.equal(Array.from(compressed).length, 800);
assert.equal(modelRequests.length, 2);
assert.match(modelRequests[1].messages[1].content, /约 800 个字符/);
const locallyBounded = await openaiModule.finalizeAiFinishedBody("次".repeat(1001));
assert.equal(Array.from(locallyBounded).length, 1000);
assert.equal(modelRequests.length, 3, "each over-limit body must make at most one compression request");

let failedCompressionRequests = 0;
const failingOpenaiModule = loadTsModule("src/lib/openai.ts", {
  "./activity-log": { compactError: (error) => error instanceof Error ? error.message : String(error), recordExecutionLog: async (entry) => { logs.push(entry); } },
  "./config": { appConfig: { openaiApiKey: "test-key", openaiTextEndpoint: "chat", openaiTextModel: "test-model" }, openaiTextUrl: () => "https://openai.example.invalid/chat/completions" },
  "./concurrency": { runWithConcurrencyPool: async (_pool, operation) => operation() },
  "./creation-controls": { formatImageTasksForPrompt: () => "" },
  "./finished-body-policy": policy,
  "./mock-data": {},
  "./model-image-input": {},
  "./source-video-reference": {},
  "./title-guard": {},
}, {
  fetch: async () => {
    failedCompressionRequests += 1;
    throw new Error("mock compression failure");
  },
});
const failedCompressionFallback = await failingOpenaiModule.finalizeAiFinishedBody("失".repeat(1001));
assert.equal(Array.from(failedCompressionFallback).length, 1000);
assert.equal(failedCompressionRequests, 1, "failed compression must not retry");
assert.ok(logs.some((entry) => entry.action === "Finished body repair fallback used"));

const types = read("src/lib/types.ts");
const openai = read("src/lib/openai.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const originalCreation = read("src/lib/original-creation.ts");
const originalBatches = read("src/lib/original-batches.ts");
const viral = read("src/lib/viral-replication.ts");
const generatedPosts = read("src/lib/generated-posts.ts");
const store = read("src/lib/store.ts");
const copyLibrary = read("src/lib/copy-library.ts");
const reviewPage = read("src/app/review/page.tsx");
const copyPage = read("src/app/copy-library/page.tsx");
const canvasExecutors = read("src/lib/canvas/executors.ts");
const feishuQueue = read("src/lib/feishu-publish-queue.ts");
const reviewRoute = read("src/app/api/review/route.ts");

assert.match(types, /GeneratedPost[\s\S]*bodyPolicyVersion\?:\s*1/);
assert.match(types, /CopyLibraryEntry[\s\S]*bodyPolicyVersion\?:\s*1/);
assert.match(openai, /FINISHED_BODY_TARGET_INSTRUCTION/);
assert.match(openai, /finalizeAiFinishedBody/);
assert.match(simpleRuns, /generatePost/);
assert.match(originalCreation, /finalizeAiFinishedBody/);
assert.match(originalBatches, /finalizeAiFinishedBody/);
assert.match(viral, /generatePost/);
assert.match(generatedPosts, /applyFinishedBodyPolicy/);
assert.match(store, /applyFinishedBodyPolicy/);
assert.match(store, /previousPolicyRecord\?: GeneratedPost[\s\S]*applyFinishedBodyPolicy\(post, previous \|\| previousPolicyRecord\)/);
assert.match(copyLibrary, /applyFinishedBodyPolicy/);
assert.match(canvasExecutors, /truncateFinishedBody/);
assert.match(reviewPage, /clampFinishedBodyInput/);
assert.match(reviewPage, /countFinishedBodyChars/);
assert.match(copyPage, /clampFinishedBodyInput/);
assert.match(copyPage, /countFinishedBodyChars/);
assert.match(feishuQueue, /isFinishedBodyPolicyCompliant/);
assert.match(reviewRoute, /const savedPost = await saveGeneratedPost\(post, account\)[\s\S]*syncReviewSideEffects\(savedPost, account\)[\s\S]*\{ post: savedPost \}/);
assert.match(reviewRoute, /previousPost\.body !== savedPost\.body[\s\S]*savePost\(post, account, post\)/);

console.log("Finished body policy check passed.");
