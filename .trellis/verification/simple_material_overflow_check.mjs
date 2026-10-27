import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadTsModule(relativePath, requireMap = {}, sandboxExtras = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    transpiled.outputText,
    {
      Buffer,
      Error,
      URL,
      process: { env: {} },
      console,
      module: cjsModule,
      exports: cjsModule.exports,
      setTimeout,
      clearTimeout,
      ...sandboxExtras,
      require: (name) => {
        if (Object.hasOwn(requireMap, name)) return requireMap[name];
        throw new Error(`Unexpected import in ${relativePath}: ${name}`);
      },
    },
    { filename: sourcePath },
  );
  return cjsModule.exports;
}

const policy = loadTsModule("src/lib/finished-body-policy.ts");
const titleGuard = {
  clampGeneratedTitleMax: (value) => value,
  countVisibleTitleChars: (value) => Array.from(value).length,
  formatTitleStyleInstruction: () => "title-style-fixture",
  isGeneratedTitleLengthValid: () => true,
  normalizeGeneratedTitle: (value) => value,
  pickTitleLengthProfile: () => ({ label: "test", min: 1, max: 30 }),
};
const source = { id: "source-1", platform: "xiaohongshu", title: "SOURCE_TITLE_MARKER", contentText: "SOURCE_BODY_MARKER", images: [] };
const imageTasks = [{ id: "selected-image-task" }];
const largeInventory = Object.freeze(Array.from({ length: 24_197 }, (_, i) => `https://library-inventory.invalid/${i}.png`));
for (const endpoint of ["chat", "responses"]) {
  const requests = [];
  const openai = loadTsModule("src/lib/openai.ts", {
    "./activity-log": { compactError: String, recordExecutionLog: async () => undefined },
    "./config": { appConfig: { openaiApiKey: "fixture", openaiTextEndpoint: endpoint, openaiTextModel: "fixture" }, openaiTextUrl: () => "https://model.invalid" },
    "./text-reasoning": loadTsModule("src/lib/text-reasoning.ts"),
    "./concurrency": { runWithConcurrencyPool: async (_pool, fn) => fn() },
    "./creation-controls": { formatImageTasksForPrompt: (tasks) => { assert.equal(tasks, imageTasks); return "SELECTED_IMAGE_TASK_MARKER"; } },
    "./finished-body-policy": policy,
    "./mock-data": {},
    "./model-image-input": {},
    "./source-video-reference": { resolveSourceVideoUrls: () => ["source-video"] },
    "./title-guard": titleGuard,
  }, { fetch: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const text = JSON.stringify({ title: "fixture title", body: "fixture body", imagePrompts: ["selected image prompt"], aiNotes: [] });
    return { ok: true, status: 200, json: async () => endpoint === "chat" ? { choices: [{ message: { content: text } }] } : { output_text: text } };
  } });
  const original = loadTsModule("src/lib/original-creation.ts", {
    "./openai": openai, "./finished-body-policy": policy,
    "./title-guard": titleGuard, "./types": { contentTagOptions: [] },
  });
  let rewriteRequest;
  let originalRequest;
  for (const materials of [[], largeInventory.slice(0, 2), largeInventory]) {
    const post = await openai.generatePost({ source, instruction: "USER_INSTRUCTION_MARKER", materialPaths: materials, imageTasks, includeSourceVideo: true });
    const rewrite = JSON.stringify(requests.at(-1));
    assert(!rewrite.includes("library-inventory.invalid"), "Rewrite request must not contain the material inventory, including old snapshots");
    for (const marker of [source.title, source.contentText, "USER_INSTRUCTION_MARKER", "SELECTED_IMAGE_TASK_MARKER"]) assert(rewrite.includes(marker));
    if (rewriteRequest) assert.equal(rewrite, rewriteRequest, "Library size must not change the rewrite request");
    rewriteRequest = rewrite;
    assert.equal(post.materialPaths, materials, "Keep draft metadata without mutating old snapshots");
    assert.equal(post.imageTasks, imageTasks);
    assert.equal(post.videoUrls[0], "source-video");
    const draft = await original.buildOriginalGeneratedPost({ runId: "run-1", prompt: "ORIGINAL_PROMPT_MARKER", vehicleKeyword: "VEHICLE_MARKER", settings: { textInstruction: "USER_INSTRUCTION_MARKER" }, materialPaths: materials, useWebSearch: false });
    const request = JSON.stringify(requests.at(-1));
    assert(!request.includes("library-inventory.invalid"), "Original request must not contain material inventory");
    for (const marker of ["ORIGINAL_PROMPT_MARKER", "VEHICLE_MARKER", "USER_INSTRUCTION_MARKER"]) assert(request.includes(marker));
    if (originalRequest) assert.equal(request, originalRequest);
    originalRequest = request;
    assert.equal(draft.post.materialPaths, materials);
    assert.equal(draft.imagePrompts[0], "selected image prompt");
  }
  assert.equal(requests.length, 6, "No extra repair/provider calls");
}

// Execute the real page loader without importing React or touching live APIs.
const pageSource = read("src/app/page.tsx");
const loaderSource = pageSource.slice(pageSource.indexOf("  async function loadVehicleLibrary()"), pageSource.indexOf("  function applySimpleRunMediaSettings("));
assert(loaderSource.includes("loadVehicleLibrary"));
const loaderJs = ts.transpileModule(loaderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const hasRoot of [false, true]) {
  const urls = [];
  let library;
  let message;
  const load = vm.runInNewContext(`${loaderJs}; loadVehicleLibrary`, {
    URLSearchParams, Set,
    setLibraryNavigation: () => undefined,
    setVehicleLibrary: (value) => { library = value; },
    setSimpleViralMaterialAssetIds: (ids) => assert.equal(ids.length, 0),
    setMessage: (value) => { message = value; },
    fetch: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => url.endsWith("navigation")
        ? { collections: hasRoot ? [{ id: "vehicle-root", name: "车型库" }] : [] }
        : { assets: [{ id: urls.length }], total: 2, nextCursor: urls.length === 2 ? "next-page" : undefined } };
    },
  });
  await load();
  if (!hasRoot) {
    assert.equal(urls.length, 1, "Missing root must not query all library assets");
    assert.equal(library.assets.length, 0);
    assert(message.includes("未找到车型库"));
  } else {
    assert.equal(urls.length, 3);
    assert.equal(library.assets.length, 2);
    assert(urls.slice(1).every((url) => new URL(url, "https://fixture.invalid").searchParams.get("collectionId") === "vehicle-root"));
  }
}

const actor = { id: "fixture-owner" };
const starts = [];
const selections = [];
const route = loadTsModule("src/app/api/simple/runs/route.ts", {
  "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  "@/lib/activity-log": { compactError: String, recordExecutionLog: async () => undefined },
  "@/lib/config": { appConfig: { openaiTextEndpoint: "responses" } },
  "@/lib/workspace-accounts": { requireWorkspaceAccount: async () => actor },
  "@/lib/library-assets": { resolveLibraryAssetSelections: async (account, ids) => {
    assert.equal(account, actor);
    selections.push([...ids]);
    if (ids.includes("forbidden")) throw new Error("library asset forbidden");
    return ids.map((id) => ({ publicUrl: `https://selected.invalid/${id}` }));
  } },
  "@/lib/feishu-publish-mode": { normalizeFeishuPublishMode: () => "full" },
  "@/lib/simple-runs": { startSimpleRun: async (input) => { starts.push(input); return { id: "fixture" }; } },
});
for (const sourceMode of ["keyword", "links", "original", "viral"]) {
  const response = await route.POST({ json: async () => ({ sourceMode, viralMaterialAssetIds: sourceMode === "viral" ? ["b", "a"] : undefined }) });
  assert.equal(response.status, 200);
  assert.equal(starts.at(-1).materialPaths.length, 0);
  assert.deepEqual(Array.from(starts.at(-1).viralMaterialPaths), sourceMode === "viral" ? ["https://selected.invalid/b", "https://selected.invalid/a"] : []);
  assert.equal(starts.at(-1).ownerUserId, actor.id);
}
await route.POST({ json: async () => ({ materialAssetIds: ["explicit"] }) });
assert.equal(starts.at(-1).materialPaths[0], "https://selected.invalid/explicit");
const startCount = starts.length;
const denied = await route.POST({ json: async () => ({ materialAssetIds: ["forbidden"] }) });
assert.equal(denied.status, 400);
assert.equal(starts.length, startCount, "Denied selection must not create a run");
assert(selections.some((ids) => ids.join(",") === "b,a"));
console.log("Simple material overflow: Chat/Responses empty/small/24,197-URL requests, snapshots, scoped loader and authorized API selection checks passed.");
