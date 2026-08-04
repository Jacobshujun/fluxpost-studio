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
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    ...sandboxExtras,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const logs = [];
const modelPrompts = [];

const contentSafetyPolicy = loadTsModule(
  "src/lib/content-safety-policy.ts",
  {
    "./activity-log": {
      recordExecutionLog: async (entry) => logs.push(entry),
    },
    "./database": {
      compareAndSetAppMetaValue: async () => true,
      readAppMetaValue: async () => undefined,
    },
  },
  { Buffer },
);

function makeModelResponse(payload) {
  return makeRawModelResponse(JSON.stringify(payload));
}

function makeRawModelResponse(content) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content } }] };
    },
    async text() {
      return content;
    },
  };
}

async function fetchMock(url, options = {}) {
  const href = String(url);
  if (href !== "https://openai.example.invalid/chat/completions") {
    throw new Error(`Unexpected fetch URL: ${href}`);
  }
  const payload = JSON.parse(String(options.body || "{}"));
  const prompt = payload.messages?.find((message) => message.role === "user")?.content || "";
  modelPrompts.push(prompt);
  if (prompt.includes("Model request fails")) {
    return {
      ok: false,
      status: 502,
      async text() {
        return "mock upstream failure";
      },
    };
  }
  if (prompt.includes("Model invalid json")) return makeRawModelResponse("not-json");
  if (prompt.includes("Model invalid score")) {
    return makeModelResponse({ riskScore: 120, categoryIds: [], reasons: ["invalid"] });
  }
  if (prompt.includes("Model review fails")) {
    return {
      ok: false,
      status: 503,
      async text() {
        return "mock review failure";
      },
    };
  }
  if (prompt.includes("Model says attack")) {
    return makeModelResponse({
      riskScore: 92,
      categoryIds: ["competitor_bashing"],
      reasons: ["model detected hostile competitor bashing"],
    });
  }
  return makeModelResponse({
    riskScore: 10,
    categoryIds: [],
    reasons: ["objective comparison"],
  });
}

const sourceSafety = loadTsModule(
  "src/lib/source-safety.ts",
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
    "./content-safety-policy": contentSafetyPolicy,
  },
  {
    fetch: fetchMock,
  },
);

const disabledPolicy = contentSafetyPolicy.normalizeContentSafetyPolicy({
  ...contentSafetyPolicy.defaultContentSafetyPolicy,
  enabled: false,
});
const promptsBeforeDisabledCheck = modelPrompts.length;
const masterDisabled = await sourceSafety.assessSourceSafety(
  makeItem("disabled-policy", "垃圾产品", "滚出市场"),
  disabledPolicy,
);
if (masterDisabled.decision !== "allow" || modelPrompts.length !== promptsBeforeDisabledCheck) {
  throw new Error("A master-disabled policy must allow content without a model call.");
}

function makeItem(id, title, contentText) {
  return {
    id,
    sourceId: id,
    platform: "douyin",
    title,
    contentText,
    mediaType: "text",
    images: [],
    mediaUrls: [],
    metrics: {},
    raw: {},
  };
}

const localProfanity = await sourceSafety.assessSourceSafety(makeItem("bad-1", "垃圾竞品别来碰瓷", "这车太烂了，滚出车圈"));
if (localProfanity.decision !== "filter") {
  throw new Error("Local profanity and insult signals should filter the source item.");
}
if (!localProfanity.categories.includes("profanity")) {
  throw new Error("The first matching local rule should keep its configured category.");
}
if (modelPrompts.length !== 0) {
  throw new Error("High-confidence local hard filters should not spend a model call.");
}

const modelFiltered = await sourceSafety.assessSourceSafety(makeItem("bad-2", "Model says attack", "普通文本但模型会判定为恶意拉踩"));
if (modelFiltered.decision !== "filter" || !modelFiltered.categories.includes("competitor_bashing")) {
  throw new Error("Model safety judgement should be able to filter competitor bashing.");
}
if (!modelFiltered.model || modelFiltered.status !== "success") {
  throw new Error("Model-backed safety assessment should record model/status metadata.");
}
if (!modelPrompts.at(-1)?.includes('JSON Schema: {"type":"object","additionalProperties":false') || !modelPrompts.at(-1)?.includes('"riskScore"')) {
  throw new Error("The model prompt must append the immutable JSON output schema.");
}

const objective = await sourceSafety.assessSourceSafety(makeItem("ok-1", "客观对比续航", "对比竞品能耗和座舱空间，语气中性"));
if (objective.decision !== "allow") {
  throw new Error("Objective competitor comparison should not be filtered by default.");
}

const objectiveComparisonPromptCount = modelPrompts.length;
const objectiveComparison = await sourceSafety.assessSourceSafety(makeItem(
  "6a52fe8300000000060235f2",
  "小鹏 G9L 深度拆解",
  "主要对手理想 L7 和问界 M7。G9L 轴距 3100mm 碾压对手的 3005/3030mm，增程纯电 350km 远超理想和问界。",
));
if (objectiveComparison.decision !== "allow") {
  throw new Error("Objective competitor parameter comparisons must not be hard-filtered by keyword overlap.");
}
if (objectiveComparison.matchedRuleId !== "competitor-strong-comparison") {
  throw new Error("The objective note must enter local competitor review rather than a local hard filter.");
}
if (modelPrompts.length !== objectiveComparisonPromptCount + 1) {
  throw new Error("Ambiguous competitor comparison language should reach the model safety review.");
}

const modelFailure = await sourceSafety.assessSourceSafety(makeItem("model-failure", "Model request fails", "ordinary content"));
if (modelFailure.decision !== "allow" || modelFailure.status !== "failed" || !modelFailure.error) {
  throw new Error("Model request failures must preserve the local decision and expose failure metadata.");
}
for (const [id, title] of [["invalid-json", "Model invalid json"], ["invalid-score", "Model invalid score"]]) {
  const invalidOutput = await sourceSafety.assessSourceSafety(makeItem(id, title, "ordinary content"));
  if (invalidOutput.decision !== "allow" || invalidOutput.status !== "failed") {
    throw new Error("Invalid model JSON and out-of-range scores must preserve the local allow result.");
  }
}
const reviewFailure = await sourceSafety.assessSourceSafety(makeItem("review-failure", "Model review fails", "避雷"));
if (reviewFailure.decision !== "review" || reviewFailure.status !== "failed" || reviewFailure.matchedRuleId !== "negative-review") {
  throw new Error("A failed model review must preserve the matching local review result.");
}

const filtered = await sourceSafety.filterUnsafeSourceItems([
  makeItem("bad-3", "垃圾竞品别碰瓷", "滚出车圈"),
  makeItem("ok-2", "客观对比", "对比竞品能耗和座舱空间"),
]);
if (filtered.items.length !== 1 || filtered.filtered.length !== 1 || filtered.items[0].id !== "ok-2") {
  throw new Error("filterUnsafeSourceItems should return kept and filtered items separately.");
}
if (!filtered.items[0].safetyAssessment) {
  throw new Error("Kept source items should retain the safety assessment for auditability.");
}
if (!logs.some((entry) => entry.action === "Source safety filtered")) {
  throw new Error("Filtered source items should be observable in execution logs.");
}

const crawlRoute = read("src/app/api/crawl/jobs/route.ts");
assertContains(crawlRoute, /filterUnsafeSourceItems\(items/, "Advanced crawl route must apply source safety before tagging and ingest.");
assertContains(crawlRoute, /items = safetyResult\.items/, "Advanced crawl route must continue with kept source items only.");
assertContains(crawlRoute, /enableVideoTranscription\?:\s*boolean/, "Advanced crawl route must accept the video transcription switch.");
assertContains(crawlRoute, /enableVideoTranscription:\s*body\.enableVideoTranscription === true/, "Advanced crawl route must default video transcription off.");

const simpleRuns = read("src/lib/simple-runs.ts");
assertContains(simpleRuns, /filterUnsafeSourceItems\(crawledItems/, "Simple run workflow must apply source safety before tagging and ingest.");
assertContains(simpleRuns, /filteredUnsafe/, "Simple platform results must expose unsafe-filtered counts.");

const checkPs1 = read(".trellis/verification/check.mjs");
assertContains(checkPs1, /Source safety filter check/, "Trellis baseline must include the source safety filter check.");

console.log("Source safety filter check passed.");
