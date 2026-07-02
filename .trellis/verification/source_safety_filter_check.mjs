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

function makeModelResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content: JSON.stringify(payload) } }] };
    },
    async text() {
      return JSON.stringify(payload);
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
  if (prompt.includes("Model says attack")) {
    return makeModelResponse({
      decision: "filter",
      categories: ["competitor_bashing"],
      severity: "high",
      confidence: 0.92,
      reasons: ["model detected hostile competitor bashing"],
    });
  }
  return makeModelResponse({
    decision: "allow",
    categories: [],
    severity: "low",
    confidence: 0.8,
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
  },
  {
    fetch: fetchMock,
  },
);

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
if (!localProfanity.categories.includes("profanity") || !localProfanity.categories.includes("competitor_bashing")) {
  throw new Error("Local assessment should keep explicit safety categories.");
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

const objective = await sourceSafety.assessSourceSafety(makeItem("ok-1", "客观对比续航", "对比竞品能耗和座舱空间，语气中性"));
if (objective.decision !== "allow") {
  throw new Error("Objective competitor comparison should not be filtered by default.");
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

const checkPs1 = read(".trellis/verification/check.ps1");
assertContains(checkPs1, /Source safety filter check/, "Trellis baseline must include the source safety filter check.");

console.log("Source safety filter check passed.");
