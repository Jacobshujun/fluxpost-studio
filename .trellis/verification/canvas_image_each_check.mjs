import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const executorSource = read("src/lib/canvas/executors.ts");
const registrySource = read("src/lib/canvas/registry.ts");
const runsSource = read("src/lib/canvas/runs.ts");
const queueSource = read("src/lib/feishu-publish-queue.ts");

for (const snippet of [
  'type: "model.gpt-image-each"',
  'concurrency: 8',
  'min: 1, max: 20',
  'outputs: [',
  '{ id: "report", label: "处理报告", kind: "text" }',
]) assert.ok(registrySource.includes(snippet), `Registry contract is missing ${snippet}`);
assert.ok(runsSource.includes('status: result.pending ? "running" : result.partial ? "partial" : "completed"'), "Partial node results must persist distinctly.");
assert.ok(runsSource.includes("onInternalMetadataUpdate"), "Child metadata updates must be durably persisted by the Canvas runner.");
assert.ok(queueSource.includes('post.canvasImageBatch?.status === "partial"'), "Feishu preflight must reject partial Canvas image batches.");

let providerMode = "success";
let providerCalls = [];
let active = 0;
let maxActive = 0;
const pendingIds = new Map();

async function mockGenerate(_prompt, count, references, _options, asyncTask) {
  assert.equal(count, 1, "Every provider request must ask for one output.");
  assert.equal(references.length, 1, "Every provider request must contain exactly one reference image.");
  const source = references[0];
  providerCalls.push({ source, resumeTaskId: asyncTask?.resumeTaskId });
  active += 1;
  maxActive = Math.max(maxActive, active);
  try {
    await new Promise((resolve) => setTimeout(resolve, source.endsWith("1") ? 12 : 2));
    if (providerMode === "pending" && !asyncTask?.resumeTaskId) {
      const taskId = `task-${source.at(-1)}`;
      pendingIds.set(source, taskId);
      await asyncTask?.onTaskUpdate?.({ taskId, route: "primary", status: "processing" });
      return { status: "pending", imageUrls: [], providerTaskId: taskId, providerTaskRoute: "primary", providerStatus: "processing" };
    }
    if (providerMode === "fail-second" && source.endsWith("2")) throw new Error("mock image failure");
    return { status: "completed", imageUrls: [`out-${source}`] };
  } finally {
    active -= 1;
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(concurrency)), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

const transpiled = ts.transpileModule(executorSource, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: "executors.ts",
}).outputText;
const cjsModule = { exports: {} };
const noopAsync = async () => undefined;
const stubs = {
  "../concurrency": { mapWithConcurrency },
  "../feishu-publish-queue": { enqueueFeishuPublishJob: noopAsync, ensureFeishuPublishQueueWorker: () => undefined },
  "../feishu-publish-mode": { normalizeFeishuPublishMode: (value) => value || "full" },
  "../finished-body-policy": { FINISHED_BODY_POLICY_VERSION: 1, truncateFinishedBody: (value) => value },
  "../generated-posts": { getGeneratedPost: noopAsync, saveGeneratedPost: async (post) => post, updateGeneratedPost: async (_id, patch) => patch },
  "../image-generation": { generateCanvasGptImages: mockGenerate, generateImagesFromPrompt: noopAsync },
  "../openai": { callOpenAIForText: noopAsync, callOpenAIForVisionText: noopAsync },
  "./seedance": { ArkSeedanceNeedsConfigError: class extends Error {}, queryArkSeedanceVideo: noopAsync, submitArkSeedanceVideo: noopAsync },
  "./seedance-references": { resolveSeedanceInput: () => ({ prompt: "", images: [] }) },
  "./media-tools": { CanvasMediaNeedsConfigError: class extends Error {}, extractCanvasVideoFrames: noopAsync, reconstructCanvasVideo: noopAsync, transformCanvasImages: noopAsync },
  "./node-utils": { canvasVisionPresets: {}, concatenateCanvasText: () => "", parseCanvasImageSelection: () => [], renderCanvasPromptTemplate: () => "", splitCanvasText: () => ({ tail: "" }) },
  "./registry": { normalizeUrlList: (value) => Array.isArray(value) ? value : [] },
  "./save-images": { CANVAS_SAVE_IMAGE_MAX_ITEMS: 30 },
  "./source-video-contract": { canvasSourceVideoSnapshotFromConfig: () => undefined, isCanvasSourceVideoSnapshotCurrent: () => false },
  "./subtitle-style": { canvasSubtitleStyleFromConfig: () => ({}) },
  "./subtitle-editor": { decodeCanvasSubtitleRevisionSnapshot: () => undefined },
  "./video-subtitles": { addCanvasVideoSubtitles: noopAsync },
  "./video-loader": { selectedCanvasVideo: () => undefined },
};
const nativeRequire = createRequire(import.meta.url);
vm.runInNewContext(transpiled, {
  module: cjsModule,
  exports: cjsModule.exports,
  require: (name) => name.startsWith("node:") ? nativeRequire(name) : stubs[name] || {},
  console,
  process,
  structuredClone,
  setTimeout,
  clearTimeout,
}, { filename: "executors.ts" });
const { executeCanvasNode } = cjsModule.exports;

const node = {
  id: "each",
  type: "model.gpt-image-each",
  version: 1,
  position: { x: 0, y: 0 },
  config: { concurrency: 8, ratio: "1:1", resolution: "1k", quality: "medium", outputFormat: "png", outputCompression: 100 },
};
const context = (urls, previousNodeRun) => ({
  runId: "run",
  node,
  inputs: { images: [{ kind: "images", items: urls.map((url) => ({ url })) }], prompt: [{ kind: "text", value: "reconstruct" }] },
  account: { id: "owner", role: "operator" },
  previousNodeRun,
  onInternalMetadataUpdate: async () => undefined,
});

providerCalls = [];
maxActive = 0;
providerMode = "success";
const ordered = await executeCanvasNode(context(["img-1", "img-2", "img-3", "img-4"]));
assert.ok(maxActive >= 3, `Configured concurrency should exceed 2; observed ${maxActive}.`);
assert.deepEqual(Array.from(ordered.outputs.images.items, (item) => item.url), ["out-img-1", "out-img-2", "out-img-3", "out-img-4"], "Aggregation must preserve source order, not completion order.");
assert.equal(ordered.outputs.report.kind, "text");

providerCalls = [];
providerMode = "pending";
const pending = await executeCanvasNode(context(["img-1", "img-2", "img-3"]));
assert.equal(pending.pending, true);
assert.equal(providerCalls.filter((call) => !call.resumeTaskId).length, 3);
providerCalls = [];
providerMode = "success";
const resumed = await executeCanvasNode(context(["img-1", "img-2", "img-3"], {
  status: "running",
  internalMetadata: pending.internalMetadata,
}));
assert.equal(resumed.pending, undefined);
assert.equal(providerCalls.length, 3);
assert.ok(providerCalls.every((call) => call.resumeTaskId === pendingIds.get(call.source)), "Accepted tasks must resume with their original provider task ids.");

providerCalls = [];
providerMode = "fail-second";
const partial = await executeCanvasNode(context(["img-1", "img-2", "img-3"]));
assert.equal(partial.partial, true);
assert.deepEqual(Array.from(partial.outputs.images.imageBatch.failedIndices), [2]);
providerCalls = [];
providerMode = "success";
const retried = await executeCanvasNode(context(["img-1", "img-2", "img-3"], {
  status: "partial",
  outputs: partial.outputs,
  internalMetadata: partial.internalMetadata,
}));
assert.equal(providerCalls.length, 1, "Retry must submit only failed children.");
assert.equal(providerCalls[0].source, "img-2");
assert.deepEqual(Array.from(retried.outputs.images.items, (item) => item.url), ["out-img-1", "out-img-2", "out-img-3"]);

providerCalls = [];
await assert.rejects(() => executeCanvasNode(context(Array.from({ length: 19 }, (_, index) => `img-${index + 1}`))), /1 到 18 张图片/);
assert.equal(providerCalls.length, 0, "Over-limit groups must fail before provider submission.");

console.log("Canvas per-image GPT reconstruction check passed.");
