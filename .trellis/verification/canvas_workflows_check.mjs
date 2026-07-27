import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const requireText = (text, snippets, label) => {
  for (const snippet of snippets) assert.ok(text.includes(snippet), `${label} is missing ${snippet}`);
};
const compileFunctions = (source, names, returnName, scope = {}) => {
  const ast = ts.createSourceFile("canvas-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = names.map((name) => {
    const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `source is missing function ${name}`);
    return declaration.getText(ast).replace(/^export\s+/, "");
  });
  const output = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    fileName: "canvas-page.tsx",
  }).outputText;
  const keys = Object.keys(scope);
  return Function(...keys, `${output}\nreturn ${returnName};`)(...keys.map((key) => scope[key]));
};
const compileFunction = (source, name, scope = {}) => compileFunctions(source, [name], name, scope);
const loadTsModule = (relativePath, requireMap = {}, sandboxExtras = {}) => {
  const sourcePath = path.join(root, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
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
    structuredClone,
    ...sandboxExtras,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(output, sandbox, { filename: sourcePath });
  return cjsModule.exports;
};

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.dependencies["@xyflow/react"], "^12.11.2");

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-canvas-check-"));
try {
  writeFileSync(path.join(temp, "toapis-image-api.js"), `exports.toApisImageRatios = ${JSON.stringify(["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])}; exports.toApis4kImageRatios = ${JSON.stringify(["16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])};`, "utf8");
  for (const name of ["node-utils", "registry", "graph", "clipboard"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: `${name}.ts`,
    }).outputText;
    writeFileSync(path.join(temp, `${name}.js`), output, "utf8");
  }
  const require = createRequire(import.meta.url);
  const { getCanvasNodeDefinition, getCanvasNodeExecutionMode, upgradeCanvasNode, validateCanvasNodeConfig, normalizeUrlList } = require(path.join(temp, "registry.js"));
  const { validateCanvasGraph, buildCanvasRunPlan } = require(path.join(temp, "graph.js"));
  const { createCanvasClipboardPayload, instantiateCanvasClipboardPayload, parseCanvasClipboardPayload } = require(path.join(temp, "clipboard.js"));
  const nodeUtils = require(path.join(temp, "node-utils.js"));
  assert.equal(getCanvasNodeDefinition("input.images")?.label, "图片", "image input node should use the concise label");
  assert.equal(getCanvasNodeDefinition("model.gpt-image")?.version, 2, "new GPT image nodes must use v2");
  assert.equal(getCanvasNodeDefinition("model.gpt-image", 1)?.version, 1, "legacy GPT image snapshots must remain resolvable");
  assert.deepEqual(getCanvasNodeDefinition("utility.image-preview")?.bypass, { inputPort: "images", outputPort: "images" }, "image preview must declare explicit image passthrough");
  const commonNodeContracts = {
    "input.content-pool": { inputs: [], outputs: ["title:text", "body:text", "source:text", "images:images", "videos:videos"] },
    "input.library-images": { inputs: [], outputs: ["images:images"] },
    "utility.prompt-template": { inputs: ["values:text"], outputs: ["text:text"] },
    "utility.text-split": { inputs: ["text:text"], outputs: ["head:text", "tail:text"] },
    "model.gpt-vision": { inputs: ["images:images", "instruction:text"], outputs: ["text:text"] },
    "utility.image-select": { inputs: ["images:images"], outputs: ["images:images"] },
    "utility.image-transform": { inputs: ["images:images"], outputs: ["images:images"] },
    "utility.video-frames": { inputs: ["videos:videos"], outputs: ["images:images"] },
  };
  for (const [type, contract] of Object.entries(commonNodeContracts)) {
    const definition = getCanvasNodeDefinition(type);
    assert.ok(definition, `${type} must be registered`);
    assert.equal(definition.version, 1, `${type} must start at version 1`);
    assert.deepEqual(definition.inputs.map((port) => `${port.id}:${port.kind}`), contract.inputs, `${type} inputs changed`);
    assert.deepEqual(definition.outputs.map((port) => `${port.id}:${port.kind}`), contract.outputs, `${type} outputs changed`);
  }
  assert.equal(getCanvasNodeDefinition("model.gpt-vision")?.capability, "text_model", "vision must use paid text-model confirmation");
  assert.deepEqual(getCanvasNodeDefinition("utility.image-select")?.bypass, { inputPort: "images", outputPort: "images" });
  assert.deepEqual(getCanvasNodeDefinition("utility.image-transform")?.bypass, { inputPort: "images", outputPort: "images" });
  for (const type of ["model.gpt-vision", "utility.text-split", "utility.video-frames"]) {
    assert.equal(getCanvasNodeDefinition(type)?.bypass, undefined, `${type} must not allow cross-kind bypass`);
  }
  assert.match(validateCanvasNodeConfig("input.content-pool", {}, 1).join(" "), /selected source item.*snapshot is empty/i);
  assert.match(validateCanvasNodeConfig("input.library-images", { urls: Array.from({ length: 31 }, (_, index) => `https://example.test/${index}.jpg`) }, 1).join(" "), /at most 30/i);
  assert.match(validateCanvasNodeConfig("model.gpt-vision", { preset: "describe", maxImages: 9 }, 1).join(" "), /at most 8/i);
  assert.match(validateCanvasNodeConfig("utility.image-transform", { preset: "custom", width: 10, height: 1080, fit: "cover", format: "jpeg", quality: 90 }, 1).join(" "), /64 to 4096/i);
  assert.match(validateCanvasNodeConfig("utility.video-frames", { mode: "timestamps", timestamps: "bad", maxEdge: 1920, quality: 90 }, 1).join(" "), /comma-separated seconds/i);
  assert.equal(validateCanvasNodeConfig("utility.image-select", { indices: "1,3,2" }, 1).length, 0);

  assert.equal(nodeUtils.renderCanvasPromptTemplate({ preset: "custom", template: "二={{input2}}\n一={{input1}}\n全部={{input}}" }, ["A", "B"]), "二=B\n一=A\n全部=A\n\nB");
  assert.throws(() => nodeUtils.renderCanvasPromptTemplate({ preset: "custom", template: "{{input3}}" }, ["A", "B"]), /missing input3/i);
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "first-line" }, "标题\n正文第一行\n正文第二行"), { head: "标题", tail: "正文第一行\n正文第二行" });
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---" }, "标题---正文"), { head: "标题", tail: "正文" });
  assert.throws(() => nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---" }, "没有分隔符"), /does not contain/i);
  assert.deepEqual(nodeUtils.parseCanvasImageSelection("1,3,2,3"), [1, 3, 2], "image indices must keep first-position order and dedupe repeats");
  assert.throws(() => nodeUtils.parseCanvasImageSelection("1,0"), /between 1 and 100/i);
  assert.deepEqual(nodeUtils.resolveCanvasImageDimensions({ preset: "xiaohongshu" }), { width: 1080, height: 1440 });
  assert.deepEqual(nodeUtils.resolveCanvasImageDimensions({ preset: "custom", width: 1200, height: 628 }), { width: 1200, height: 628 });
  assert.deepEqual(nodeUtils.parseCanvasVideoTimestamps({ mode: "even", count: 3 }, 8), [2, 4, 6]);
  assert.deepEqual(nodeUtils.parseCanvasVideoTimestamps({ mode: "timestamps", timestamps: "0.5,2,0.5" }, 4), [0.5, 2]);
  assert.throws(() => nodeUtils.parseCanvasVideoTimestamps({ mode: "timestamps", timestamps: "4" }, 4), /exceeds the video duration/i);
  const upgradedImageNode = upgradeCanvasNode({ id: "legacy-image", type: "model.gpt-image", version: 1, position: { x: 0, y: 0 }, config: { size: "1024x1536", count: 2, quality: "high" } });
  assert.equal(upgradedImageNode.version, 2, "editable legacy GPT image nodes must upgrade to v2");
  assert.equal(upgradedImageNode.config.ratio, "2:3", "legacy portrait size must map to a v2 ratio");
  assert.equal(upgradedImageNode.config.resolution, "1k", "legacy portrait size must map to a v2 resolution");

  const textNode = { id: "text", type: "input.text", version: 1, position: { x: 0, y: 0 }, config: { text: "source" } };
  assert.equal(getCanvasNodeExecutionMode(textNode), "enabled", "legacy nodes without a mode must remain enabled");
  const gptNode = { id: "gpt", type: "model.gpt-text", version: 1, position: { x: 200, y: 0 }, config: { instruction: "rewrite" } };
  const validGraph = {
    nodes: [textNode, gptNode],
    edges: [{ id: "e1", source: "text", sourcePort: "text", target: "gpt", targetPort: "prompt" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.equal(validateCanvasGraph(validGraph).valid, true, "valid typed graph should pass");
  assert.deepEqual(buildCanvasRunPlan(validGraph, ["gpt"]).includedNodeIds, ["text", "gpt"], "selected-node plan should include ancestors");
  assert.deepEqual(buildCanvasRunPlan(validGraph, ["gpt"]).capabilities, ["text_model"]);
  const bypassGraph = structuredClone(validGraph);
  bypassGraph.nodes[1].executionMode = "bypass";
  assert.deepEqual(buildCanvasRunPlan(bypassGraph, ["gpt"]).capabilities, [], "bypassed models must not require paid confirmation");
  assert.equal(buildCanvasRunPlan(bypassGraph, ["gpt"]).steps.find((step) => step.nodeId === "gpt")?.action, "bypass");
  const disabledGraph = structuredClone(validGraph);
  disabledGraph.nodes[1].executionMode = "disabled";
  assert.equal(validateCanvasGraph(disabledGraph).valid, true, "disabled nodes must remain structurally valid without executable config checks");
  const disabledUpstreamGraph = structuredClone(validGraph);
  disabledUpstreamGraph.nodes[0].executionMode = "disabled";
  const disabledUpstreamPlan = buildCanvasRunPlan(disabledUpstreamGraph, ["gpt"]);
  assert.equal(disabledUpstreamPlan.steps.find((step) => step.nodeId === "gpt")?.action, "blocked", "required dependents of disabled nodes must be blocked during planning");
  assert.deepEqual(disabledUpstreamPlan.capabilities, [], "preflight-blocked paid nodes must not require confirmation");
  assert.equal(disabledUpstreamPlan.preflightBlocked, false, "branch blockers must not prevent unrelated with-upstream branches from running");
  const optionalDisabledGraph = {
    nodes: [
      textNode,
      { id: "images", type: "input.images", version: 1, position: { x: 0, y: 100 }, config: {}, executionMode: "disabled" },
      { id: "compose", type: "compose.social-post", version: 1, position: { x: 240, y: 50 }, config: {} },
    ],
    edges: [
      { id: "body", source: "text", sourcePort: "text", target: "compose", targetPort: "body" },
      { id: "optional-images", source: "images", sourcePort: "images", target: "compose", targetPort: "images" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.equal(buildCanvasRunPlan(optionalDisabledGraph, ["compose"]).steps.find((step) => step.nodeId === "compose")?.action, "execute", "missing optional input must not block a dependent node");
  const imageNode = { id: "image", type: "input.images", version: 1, position: { x: 0, y: 100 }, config: { urls: ["https://example.test/result.jpg"] } };
  const previewNode = { id: "preview", type: "utility.image-preview", version: 1, position: { x: 220, y: 100 }, config: {} };
  const previewGraph = {
    nodes: [imageNode, previewNode],
    edges: [{ id: "preview-edge", source: "image", sourcePort: "images", target: "preview", targetPort: "images" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.deepEqual(buildCanvasRunPlan(previewGraph, ["image"]).includedNodeIds, ["image", "preview"], "selected image producers must include passive preview sinks");
  const unsupportedBypass = structuredClone(previewGraph);
  unsupportedBypass.nodes[0].executionMode = "bypass";
  assert.match(validateCanvasGraph(unsupportedBypass).errors.join(" "), /does not support bypass/i, "nodes without explicit mappings must reject bypass");

  const cyclic = structuredClone(validGraph);
  cyclic.edges.push({ id: "e2", source: "gpt", sourcePort: "text", target: "text", targetPort: "missing" });
  assert.match(validateCanvasGraph(cyclic).errors.join(" "), /cycles/i);
  const dangling = structuredClone(validGraph);
  dangling.edges[0].source = "missing";
  assert.match(validateCanvasGraph(dangling).errors.join(" "), /missing node/i);
  const duplicate = structuredClone(validGraph);
  duplicate.nodes.push(structuredClone(textNode));
  assert.match(validateCanvasGraph(duplicate).errors.join(" "), /Duplicate canvas node id/i);
  const wrongType = structuredClone(validGraph);
  wrongType.nodes[0] = { id: "images", type: "input.images", version: 1, position: { x: 0, y: 0 }, config: { urls: ["https://example.test/a.jpg"] } };
  wrongType.edges[0].source = "images";
  wrongType.edges[0].sourcePort = "images";
  assert.match(validateCanvasGraph(wrongType).errors.join(" "), /incompatible/i);

  const clipboardPayload = createCanvasClipboardPayload(validGraph.nodes, validGraph.edges, ["text", "gpt"]);
  assert.equal(clipboardPayload.nodes.length, 2, "clipboard should include selected nodes");
  assert.equal(clipboardPayload.edges.length, 1, "clipboard should preserve internal edges");
  const parsedClipboard = parseCanvasClipboardPayload(JSON.stringify(clipboardPayload));
  assert.ok(parsedClipboard, "valid canvas clipboard JSON should parse");
  const pasted = instantiateCanvasClipboardPayload(parsedClipboard, { x: 40, y: 60 }, (kind, index) => `${kind}-${index}`);
  assert.deepEqual(pasted.nodes[0].position, { x: 40, y: 60 }, "pasted selection should anchor at the requested canvas position");
  assert.equal(pasted.edges[0].source, "node-0", "pasted edge should use the cloned source id");
  assert.equal(pasted.edges[0].target, "node-1", "pasted edge should use the cloned target id");
  const modeClipboard = structuredClone(clipboardPayload);
  modeClipboard.nodes[1].executionMode = "bypass";
  assert.equal(parseCanvasClipboardPayload(JSON.stringify(modeClipboard))?.nodes[1].executionMode, "bypass", "clipboard must preserve execution mode");
  const invalidClipboard = structuredClone(clipboardPayload);
  invalidClipboard.edges[0].targetPort = "missing";
  assert.equal(parseCanvasClipboardPayload(JSON.stringify(invalidClipboard)), undefined, "invalid clipboard ports must be rejected");
  const nestedClipboard = structuredClone(clipboardPayload);
  nestedClipboard.nodes[0].config = { text: { nested: true } };
  assert.equal(parseCanvasClipboardPayload(JSON.stringify(nestedClipboard)), undefined, "nested clipboard config must be rejected");
  const cyclicClipboard = structuredClone(clipboardPayload);
  cyclicClipboard.edges.push({ id: "cycle", source: "gpt", sourcePort: "text", target: "gpt", targetPort: "prompt" });
  assert.equal(parseCanvasClipboardPayload(JSON.stringify(cyclicClipboard)), undefined, "cyclic clipboard graph must be rejected");
  const commonClipboard = createCanvasClipboardPayload([{
    id: "library",
    type: "input.library-images",
    version: 1,
    position: { x: 10, y: 20 },
    config: { assetIds: ["asset-1", "asset-2"], assetNames: ["封面", "内页"], urls: ["https://example.test/1.jpg", "https://example.test/2.jpg"], snapshotAt: "2026-07-27T00:00:00.000Z" },
  }], [], ["library"]);
  assert.deepEqual(parseCanvasClipboardPayload(JSON.stringify(commonClipboard))?.nodes[0].config.urls, ["https://example.test/1.jpg", "https://example.test/2.jpg"], "new flat snapshot arrays must round-trip through clipboard validation");

  const executorSource = read("src/lib/canvas/executors.ts");
  const resolveCanvasLiteralOutputs = compileFunctions(
    executorSource,
    ["resolveCanvasLiteralOutputs", "imageArtifact", "videoArtifact", "stringList"],
    "resolveCanvasLiteralOutputs",
    { normalizeUrlList },
  );
  const frozenContentNode = {
    id: "content",
    type: "input.content-pool",
    version: 1,
    position: { x: 0, y: 0 },
    config: {
      sourceItemId: "source-1",
      snapshotTitle: "冻结标题",
      snapshotBody: "冻结正文",
      snapshotSourceUrl: "https://example.test/source-1",
      snapshotImageUrls: ["https://example.test/frozen.jpg"],
      snapshotVideoUrls: ["https://example.test/frozen.mp4"],
    },
  };
  assert.deepEqual(resolveCanvasLiteralOutputs(frozenContentNode), {
    title: { kind: "text", value: "冻结标题" },
    body: { kind: "text", value: "冻结正文" },
    source: { kind: "text", value: "https://example.test/source-1" },
    images: { kind: "images", items: [{ url: "https://example.test/frozen.jpg" }] },
    videos: { kind: "videos", items: [{ url: "https://example.test/frozen.mp4" }] },
  }, "content-pool execution must project only the stored snapshot");
  assert.ok(!executorSource.includes("/api/content-pool"), "snapshot executors must not read live content-pool state");
  assert.ok(!executorSource.includes("/api/library/assets"), "snapshot executors must not read live library state");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const schema = `${read("db/migrations/002_canvas_workflows.sql")}\n${read("src/lib/database.ts")}`;
for (const table of ["canvas_workflows", "canvas_runs", "canvas_node_runs", "canvas_run_queue"]) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing ${table} schema`);
}
requireText(schema, ["revision = $8", "FOR UPDATE SKIP LOCKED", "requeueCanvasRunQueueItem", "listCanvasSuccessfulNodeRunsForWorkflowFromDb", "JOIN canvas_runs"], "canvas persistence");

const workflows = read("src/lib/canvas/workflows.ts");
requireText(workflows, ["filterWorkspaceOwnedRecords", "assertCanAccessWorkspaceRecord", "CanvasRevisionConflictError", "structuredClone(graph)"], "workflow service");

const runs = read("src/lib/canvas/runs.ts");
requireText(runs, ["structuredClone(workflow.graph)", "runMode", "isolated", "inputFingerprint", "reusedFrom", "bypassed", "disabled", "Missing required input", "cancelRequestedAt", "collectDescendants", "previousNodeRun: latest.get(node.id)", "finalRun.status === \"running\"", "requeueCanvasRunQueueItem(finalRun.id, 30_000)", "listCanvasRunHistory", "listCanvasSuccessfulNodeRunsForWorkflowFromDb", "latestSuccessfulNodeRuns", "workflowRevision", "nodeConfig"], "DAG scheduler and latest-success projection");

const dreamina = read("src/lib/canvas/dreamina.ts");
requireText(dreamina, ["user_credit", "totalCredit < 100", "query_result", "--submit_id=", "if (!singleImage) args.push", "Dreamina did not return submit_id", "execFileAsync"], "Dreamina adapter");
assert.ok(!dreamina.includes("exec("), "Dreamina adapter must not use a shell command string");

const executors = read("src/lib/canvas/executors.ts");
requireText(executors, ["callOpenAIForText", "callOpenAIForVisionText", "generateCanvasGptImages", "directReferences", "resolveCanvasGptImageReferences", "references.length > 16", "resolvedInputs", "utility.image-preview", "executeImagePreview", "executePromptTemplate", "executeTextSplit", "executeGptVision", "executeImageSelect", "executeImageTransform", "executeVideoFrames", "CanvasMediaNeedsConfigError", "generateImagesFromPrompt", "saveGeneratedPost", "enqueueFeishuPublishJob", "queryDreaminaVideo(previousSubmitId)"], "node executors");
const resolveCanvasGptImageReferences = compileFunction(executors, "resolveCanvasGptImageReferences");
assert.deepEqual(resolveCanvasGptImageReferences([], []), [], "zero references must remain text-to-image mode");
assert.deepEqual(resolveCanvasGptImageReferences(["direct-1"], []), ["direct-1"], "one direct reference must be retained");
assert.deepEqual(
  resolveCanvasGptImageReferences(["direct-1", "shared"], [
    { kind: "images", items: [{ url: "upstream-a" }, { url: "shared" }] },
    { kind: "images", items: [{ url: "upstream-b" }, { url: "upstream-c" }] },
  ]),
  ["direct-1", "shared", "upstream-a", "upstream-b", "upstream-c"],
  "direct references, edge artifacts, artifact item order, and first-position dedupe must remain stable",
);
assert.equal(resolveCanvasGptImageReferences(Array.from({ length: 16 }, (_, index) => `image-${index + 1}`), []).length, 16, "sixteen references must be accepted");
assert.throws(() => resolveCanvasGptImageReferences(Array.from({ length: 17 }, (_, index) => `image-${index + 1}`), []), /at most 16/, "the seventeenth reference must fail");
const executeImageSelect = compileFunctions(executors, ["executeImageSelect", "imageItems"], "executeImageSelect", {
  parseCanvasImageSelection: loadTsModule("src/lib/canvas/node-utils.ts").parseCanvasImageSelection,
});
const selectedImages = await executeImageSelect({
  node: { config: { indices: "3,1,2,3" } },
  inputs: { images: [{ kind: "images", items: [{ url: "one" }, { url: "two" }] }, { kind: "images", items: [{ url: "three" }] }] },
});
assert.deepEqual(JSON.parse(JSON.stringify(selectedImages.outputs.images.items.map((item) => item.url))), ["three", "one", "two"], "image selection must preserve requested ordering across multiple incoming artifacts");
await assert.rejects(() => executeImageSelect({ node: { config: { indices: "4" } }, inputs: { images: [{ kind: "images", items: [{ url: "one" }] }] } }), /exceeds the 1 available images/i);

const makeJsonResponse = (body, ok = true, status = 200) => ({
  ok,
  status,
  async json() { return body; },
  async text() { return JSON.stringify(body); },
});
const loadVisionModule = (endpoint, apiKey, requests) => loadTsModule("src/lib/openai.ts", {
  "./activity-log": { compactError: (value) => String(value), recordExecutionLog: async () => undefined },
  "./config": {
    appConfig: { openaiApiKey: apiKey, openaiTextEndpoint: endpoint, openaiTextModel: "vision-test-model" },
    openaiTextUrl: (suffix) => `https://openai.example.invalid/${suffix}`,
  },
  "./concurrency": { runWithConcurrencyPool: async (pool, task) => { assert.equal(pool, "gpt"); return task(); } },
  "./creation-controls": {},
  "./mock-data": {},
  "./model-image-input": { toModelImageUrl: async (url) => `prepared:${url}` },
  "./production-plan": {},
  "./source-video-reference": {},
  "./title-guard": {},
  "./types": {},
}, {
  fetch: async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return endpoint === "chat"
      ? makeJsonResponse({ choices: [{ message: { content: "聊天视觉结果" } }] })
      : makeJsonResponse({ output: [{ content: [{ type: "output_text", text: "响应视觉结果" }] }] });
  },
});
const responseRequests = [];
const responsesVision = loadVisionModule("responses", "test-key", responseRequests);
assert.equal(await responsesVision.callOpenAIForVisionText("分析图片", ["one", "two"]), "响应视觉结果");
assert.equal(responseRequests[0].url, "https://openai.example.invalid/responses");
assert.deepEqual(JSON.parse(JSON.stringify(responseRequests[0].body.input[0].content.map((part) => part.type))), ["input_text", "input_image", "input_image"]);
assert.deepEqual(JSON.parse(JSON.stringify(responseRequests[0].body.input[0].content.slice(1).map((part) => part.image_url))), ["prepared:one", "prepared:two"]);
const chatRequests = [];
const chatVision = loadVisionModule("chat", "test-key", chatRequests);
assert.equal(await chatVision.callOpenAIForVisionText("识别文字", ["one"]), "聊天视觉结果");
assert.equal(chatRequests[0].url, "https://openai.example.invalid/chat/completions");
assert.deepEqual(JSON.parse(JSON.stringify(chatRequests[0].body.messages[0].content.map((part) => part.type))), ["text", "image_url"]);
assert.equal(chatRequests[0].body.messages[0].content[1].image_url.url, "prepared:one");
await assert.rejects(() => responsesVision.callOpenAIForVisionText("too many", Array.from({ length: 9 }, (_, index) => String(index))), /1 to 8 images/i);
await assert.rejects(() => loadVisionModule("responses", "", []).callOpenAIForVisionText("missing config", ["one"]), /OPENAI_API_KEY is not configured/i);

const mediaCommands = [];
const persistedMedia = [];
const materializedMedia = [];
const cleanupCalls = [];
const nodeUtilsModule = loadTsModule("src/lib/canvas/node-utils.ts");
const mediaTools = loadTsModule("src/lib/canvas/media-tools.ts", {
  "node:child_process": {
    execFile: (command, args, _options, callback) => {
      mediaCommands.push({ command, args });
      callback(null, command === "ffprobe" ? JSON.stringify({ format: { duration: "8" }, streams: [{ width: 3840, height: 2160 }] }) : "", "");
      return { on: () => undefined };
    },
  },
  "node:fs/promises": { mkdir: async () => undefined, stat: async () => { throw new Error("missing"); } },
  "../runtime-media-materializer": {
    materializeRuntimeMedia: async (url, options) => {
      materializedMedia.push({ url, options });
      return { filePath: `C:/tmp/${path.basename(url)}`, cleanup: async () => { cleanupCalls.push(url); } };
    },
  },
  "../runtime-media-storage": {
    findExistingRuntimeMedia: async () => undefined,
    persistRuntimeMedia: async (options) => { persistedMedia.push(options); return `https://media.example.invalid${options.publicPath}`; },
  },
  "./node-utils": nodeUtilsModule,
  "./types": {},
});
const transformed = await mediaTools.transformCanvasImages([{ url: "https://source.example.invalid/a.jpg", name: "A" }], { preset: "square", fit: "contain", format: "webp", quality: 82 });
assert.equal(transformed[0].width, 1080);
assert.equal(transformed[0].height, 1080);
assert.equal(transformed[0].mimeType, "image/webp");
assert.ok(mediaCommands.find((entry) => entry.command === "ffmpeg")?.args.includes("scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=white"), "image transform must use bounded contain arguments");
assert.equal(materializedMedia[0].options.maxBytes, 30 * 1024 * 1024, "image transform must enforce the 30 MB input boundary");
assert.equal(persistedMedia[0].contentType, "image/webp", "transformed media must use runtime persistence");
assert.deepEqual(cleanupCalls, ["https://source.example.invalid/a.jpg"], "materialized image inputs must be cleaned up");
await assert.rejects(() => mediaTools.transformCanvasImages(Array.from({ length: 21 }, (_, index) => ({ url: `image-${index}` })), { preset: "square" }), /at most 20 images/i);
const frames = await mediaTools.extractCanvasVideoFrames([{ url: "https://source.example.invalid/a.mp4" }], { mode: "even", count: 3, maxEdge: 1280, quality: 90 });
assert.equal(frames.length, 3);
assert.deepEqual({ width: frames[0].width, height: frames[0].height }, { width: 1280, height: 720 }, "video frame artifacts must include fitted dimensions");
assert.deepEqual(mediaCommands.filter((entry) => entry.command === "ffmpeg").slice(-3).map((entry) => entry.args[entry.args.indexOf("-ss") + 1]), ["2", "4", "6"], "video frame timestamps must follow deterministic even planning");
assert.equal(materializedMedia.at(-1).options.maxBytes, 512 * 1024 * 1024, "video frames must enforce the bounded materialization limit");
await assert.rejects(() => mediaTools.extractCanvasVideoFrames(Array.from({ length: 5 }, (_, index) => ({ url: `video-${index}` })), { mode: "cover" }), /at most 4 videos/i);
await assert.rejects(() => mediaTools.extractCanvasVideoFrames(Array.from({ length: 4 }, (_, index) => ({ url: `video-${index}` })), { mode: "even", count: 6 }), /between 1 and 20 total frames/i);
const missingMediaTools = loadTsModule("src/lib/canvas/media-tools.ts", {
  "node:child_process": {
    execFile: (_command, _args, _options, callback) => {
      const error = Object.assign(new Error("missing binary"), { code: "ENOENT" });
      callback(error, "", "");
      return { on: () => undefined };
    },
  },
  "node:fs/promises": { mkdir: async () => undefined, stat: async () => { throw new Error("missing"); } },
  "../runtime-media-materializer": { materializeRuntimeMedia: async () => ({ filePath: "C:/tmp/a.jpg", cleanup: async () => undefined }) },
  "../runtime-media-storage": { findExistingRuntimeMedia: async () => undefined, persistRuntimeMedia: async () => "unused" },
  "./node-utils": nodeUtilsModule,
  "./types": {},
});
await assert.rejects(() => missingMediaTools.transformCanvasImages([{ url: "one" }], { preset: "square" }), (error) => error?.name === "CanvasMediaNeedsConfigError" && /ffmpeg is not installed/i.test(error.message));

for (const route of [
  "src/app/api/canvas/workflows/route.ts",
  "src/app/api/canvas/workflows/[id]/route.ts",
  "src/app/api/canvas/runs/route.ts",
  "src/app/api/canvas/runs/[id]/route.ts",
  "src/app/api/canvas/media/route.ts",
]) {
  requireText(read(route), ["requireWorkspaceAccount"], route);
}

const page = read("src/app/canvas/page.tsx");
requireText(page, ["ReactFlow", "onConnect", "wouldCreateCycle", "NodeInspector", "ConfirmationDialog", "panOnDrag", "nodesDraggable={!isMobile}", "RunSummary", "FlowingCanvasEdge", "canvas-port-row", "colorMode={flowColorMode}", "subscribeTheme", "CANVAS_CLIPBOARD_MIME", "clipboardDataImageFiles", "isEditableClipboardTarget", "pasteFromSystemClipboard", "canvas-image-file-input", "CanvasNodeInteractionContext", "latestNodeRuns", "latestSuccessfulNodeRuns", "useMemo(() => latestAttempts", "(result.get(nodeRun.nodeId)?.attempt || 0) < nodeRun.attempt", "const selectedRun = explicitRun || data.runs[0]", "await refreshRun(selectedRun.id, workflowId)", "runSelectionIsExplicitRef", "focusCanvasNode", "selectedNodeId", "if (selectedNode) setSelectedNodeId(selectedNode.id)", "interaction?.selectedNodeId === node.id", "canvas-node-text-editor nodrag nopan nowheel", "event.currentTarget.focus({ preventScroll: true })", "interaction?.onNodeFocus(node.id)", "onClick={(event) => {", "onKeyDown={(event) => event.stopPropagation()}", "CanvasModelNodeResult", "CanvasImagePreviewNodeResult", "updateNodeExecutionMode", "仅运行此节点", "运行到此节点", 'requestRun([selectedNodeId], "isolated")', "打开评审", "历史版本 r", "最近成功结果 · r", "definition?.outputs", "isPreviewableModelArtifact", "artifact.value.trim()", "artifact.items.length > 0", "showArtifact", "运行完成，但没有可预览内容", "CanvasTextPreviewDialog", "CanvasVideoPreviewDialog", "CanvasImagePreviewDialog", "canvas-node-result-gallery", "canvas-node-result-gallery-open", "canvas-node-result-gallery-meta", "canvas-image-preview-open", "图片{index + 1}", "imageUrls.length}/16", "moveListItem", 'form.append("mode", "gpt-reference")', "edgeAnimationDelay", "pathLength={100}", "canvas-flow-edge-glow", "canvas-flow-edge-highlight", "打开原图", "缩小图片", "放大图片", "重置图片缩放"], "canvas UI");
requireText(page, ["ContentPoolSnapshotPicker", "LibraryImageSnapshotPicker", "contentPoolSnapshotConfig", "刷新快照", "刷新所选素材", "CanvasQuickAdd", "resolveQuickAddConnection", "quickAddChoices", "isQuickAddTargetOccupied", "eventPoint", "stageCenter", 'event.key === "Tab"', 'event.key === "ArrowDown"', 'event.key === "ArrowUp"', 'event.key === "Enter"', 'event.key === "Escape"', '.closest(".react-flow__pane")', "screenToFlowPosition", "connection.kind !== port.kind", "该输入端口已连接"], "snapshot pickers and ComfyUI quick add");
assert.ok(!page.includes("width={1600}"), "image preview must not impose a fixed 4:3 intrinsic width");
assert.ok(!page.includes("height={1200}"), "image preview must not impose a fixed 4:3 intrinsic height");
assert.ok(!page.includes("style={{ top:"), "canvas handles must be positioned by their port rows, not node-level pixel offsets");
const latestAttempts = compileFunction(page, "latestAttempts");
const projectedAttempts = latestAttempts([
  { id: "first", nodeId: "model", attempt: 1 },
  { id: "other", nodeId: "other", attempt: 1 },
  { id: "retry", nodeId: "model", attempt: 3 },
  { id: "middle", nodeId: "model", attempt: 2 },
]);
assert.equal(projectedAttempts.get("model")?.id, "retry", "inline results must use the highest attempt even when attempts are unordered");
assert.equal(projectedAttempts.get("other")?.id, "other", "latest-attempt projection must retain each node");
const mergeRunHistory = compileFunction(page, "mergeRunHistory");
const newestRun = { id: "new", workflowId: "workflow", createdAt: "2026-07-24T02:00:00.000Z", status: "completed" };
const olderRun = { id: "old", workflowId: "workflow", createdAt: "2026-07-24T01:00:00.000Z", status: "running" };
assert.deepEqual(
  mergeRunHistory([newestRun, olderRun], { ...olderRun, status: "completed" }).map((run) => run.id),
  ["new", "old"],
  "refreshing a historical run must not move it ahead of the newest run",
);
const quickAddDefinitions = [
  { type: "input.content-pool", label: "内容池", description: "快照", category: "input", inputs: [], outputs: [{ id: "title", label: "标题", kind: "text" }, { id: "body", label: "正文", kind: "text" }] },
  { type: "compose.social-post", label: "内容组装", description: "组装", category: "compose", inputs: [{ id: "title", label: "标题", kind: "text" }, { id: "body", label: "正文", kind: "text" }], outputs: [{ id: "post", label: "内容", kind: "socialPost" }] },
  { type: "utility.image-select", label: "图片选择", description: "筛选", category: "utility", inputs: [{ id: "images", label: "图片", kind: "images", multiple: true }], outputs: [{ id: "images", label: "图片", kind: "images" }] },
];
const quickAddChoices = compileFunctions(page, ["quickAddChoices", "isQuickAddTargetOccupied"], "quickAddChoices", { canvasNodeDefinitions: quickAddDefinitions });
assert.deepEqual(
  quickAddChoices({ nodeId: "source", portId: "text", handleType: "source", kind: "text" }, []).map((choice) => `${choice.definition.type}:${choice.port.id}`),
  ["compose.social-post:title", "compose.social-post:body"],
  "dragging from a text output must expose ambiguous compatible input ports",
);
assert.deepEqual(
  quickAddChoices({ nodeId: "compose", portId: "body", handleType: "target", kind: "text" }, []).map((choice) => `${choice.definition.type}:${choice.port.id}`),
  ["input.content-pool:title", "input.content-pool:body"],
  "reverse dragging from a text input must filter compatible output ports",
);
assert.deepEqual(
  quickAddChoices({ nodeId: "compose", portId: "body", handleType: "target", kind: "text" }, [{ target: "compose", targetHandle: "body" }]),
  [],
  "occupied single inputs must not offer quick-add candidates",
);
const edgeFunction = page.slice(page.indexOf("function FlowingCanvasEdge"), page.indexOf("function CanvasModelNodeResult"));
assert.equal((edgeFunction.match(/<BaseEdge\b/g) || []).length, 1, "each edge must render exactly one continuous base path");
assert.equal((edgeFunction.match(/className="canvas-flow-edge-glow"/g) || []).length, 1, "each edge must render one soft layer for the moving beam");
assert.equal((edgeFunction.match(/className="canvas-flow-edge-highlight"/g) || []).length, 1, "each edge must render exactly one moving highlight");
const uploadRoute = read("src/app/api/canvas/media/route.ts");
requireText(uploadRoute, ["requireWorkspaceAccount", "request.formData()", "form.getAll(\"files\")", "maxCanvasUploadFiles", "maxCanvasUploadBytes", "saveRuntimeImageUpload"], "canvas media route");
const runtimeUpload = read("src/lib/runtime-image-upload.ts");
requireText(runtimeUpload, ["sniffImageFormat(buffer)", "format?.browserSupported", "persistRuntimeMedia", 'directory: "review-uploads" | "canvas-uploads"'], "runtime image upload");
const styles = read("src/app/globals.css");
requireText(styles, ["--canvas-stage:", ".canvas-port-input .react-flow__handle-left", ".canvas-port-output .react-flow__handle-right", ".canvas-flow-edge-base", ".canvas-flow-edge-glow", ".canvas-flow-edge-highlight", "--canvas-edge-peak-opacity", "stroke-width: 3.6", "stroke-width: 4.4", "stroke-width: 1.8", "stroke-width: 2.4", "animation: canvas-edge-beam 2.3s", "--canvas-edge-delay", "@keyframes canvas-edge-beam", "prefers-reduced-motion", ".canvas-flow-edge-glow, .canvas-flow-edge-highlight { display: none;", ".canvas-selection-actions", ".canvas-node-text-editor", ".canvas-node-result", ".canvas-node-result-gallery", ".canvas-node-result-gallery-open", ".canvas-node-result-gallery-meta", ".canvas-node-video-result", ".canvas-node-bypassed", ".canvas-node-disabled", ".canvas-node-mode-menu", ".canvas-result-viewer-backdrop", ".canvas-image-preview-list", ".canvas-image-preview-list.is-ordered", "background-size: contain", ".canvas-image-viewer-backdrop", ".canvas-image-viewer-stage", ".canvas-image-viewer-image", ".canvas-snapshot-picker", ".canvas-picker-results", ".canvas-picker-selected", ".canvas-quick-add", ".canvas-quick-add-search", ".canvas-quick-add-list", ".canvas-quick-add-group", ".canvas-quick-add-empty"], "canvas theme, edge, result preview, picker, and quick-add styles");
requireText(styles, [".canvas-stage .react-flow__pane.draggable { cursor: grab; }", ".canvas-stage .react-flow__pane.dragging { cursor: grabbing; }"], "canvas hand cursor");
assert.ok(!/canvas-flow-edge-glow[^}]*stroke-width:\s*(?:9|11)/.test(styles), "canvas glow must not restore the old thick beam");
assert.ok(!styles.includes("stroke-dasharray: 2 12"), "canvas edges must not use the old repeated short-dash treatment");
assert.ok(read("src/app/page.tsx").includes('href="/canvas"'), "home navigation should link to canvas");

console.log("Canvas workflow checks passed.");
