import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-content-collection-"));
const require = createRequire(import.meta.url);
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function loadMocked(relative, modules) {
  const loadedModule = { exports: {} };
  Function("require", "module", "exports", transpile(read(relative)))((name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name.startsWith("node:")) return require(name);
    throw new Error(`Unexpected import ${name} in ${relative}`);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

try {
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageResolutions=['1k','2k','4k'];exports.toApisImageRatios=['1:1'];exports.toApis4kImageRatios=['16:9'];");
  writeFileSync(path.join(temp, "feishu-publish-mode.js"), "exports.feishuPublishModeOptions=[{value:'full',label:'full'}];exports.normalizeFeishuPublishMode=(value)=>value||'full';");
  for (const name of ["types", "node-utils", "source-video-contract", "video-loader", "content-collection", "content-collection-schedule", "save-images", "seedance-references", "subtitle-style", "subtitle-editor", "registry", "graph", "serialization", "workflow-file", "scheduler-v2"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"').replace('"../feishu-publish-mode"', '"./feishu-publish-mode"');
    writeFileSync(path.join(temp, `${name}.js`), transpile(source));
  }
  const registry = require(path.join(temp, "registry.js"));
  const graphModule = require(path.join(temp, "graph.js"));
  const contract = require(path.join(temp, "content-collection.js"));
  const preset = require(path.join(temp, "content-collection-schedule.js"));
  const scheduler = require(path.join(temp, "scheduler-v2.js"));
  const source = registry.createCanvasNode("input.content-collection", "source", { x: 0, y: 0 });
  source.config.links = Array.from({ length: 20 }, (_, index) => `https://www.xiaohongshu.com/explore/source-${index}`).join("\n");
  assert.equal(source.config.automaticTagging, false);
  assert.equal(registry.getCanvasNodeDefinition(source.type).outputs.length, 5);
  assert.match(contract.validateCanvasCollectionConfig(source.config).join(" "), /请选择单条测试链接/);
  assert.equal(contract.canvasCollectionLinks(" link \nlink\r\n other ").length, 2);
  const vision = registry.createCanvasNode("model.gpt-vision", "vision", { x: 300, y: 0 });
  const edge = { id: "edge", source: source.id, sourcePort: "images", target: vision.id, targetPort: "images" };
  const graph = { nodes: [source, vision], edges: [edge], viewport: { x: 0, y: 0, zoom: 1 } };
  assert.equal(graphModule.validateCanvasGraphForPersistence(graph).valid, true, "incomplete multi-link test selection can still be saved");
  const files = require(path.join(temp, "workflow-file.js"));
  const portable = files.createCanvasWorkflowFile("Collection", graph);
  const restored = files.parseCanvasWorkflowFile(JSON.stringify(portable));
  assert.deepEqual(restored.graph.nodes[0].config, source.config);
  const definition = preset.canvasCollectionScheduleDefinition(graph);
  assert.equal(definition.childResult.nodeId, vision.id);
  assert.equal(definition.childResult.artifactKind, "text");
  assert.equal(definition.sharedOutputs.length, 5);
  scheduler.validateCanvasScheduleV2Definition(graph, definition);
  const expansion = scheduler.expandCanvasScheduleV2(definition.parameters, definition);
  assert.equal(expansion.totalMainTasks, 20);
  assert.equal(expansion.totalChildTasks, 20);
  assert.throws(() => scheduler.validateCanvasScheduleV2Definition(graph, { ...definition, sharedOutputs: definition.sharedOutputs.slice(0, 1) }), /共享全部/);
  const wrongScope = structuredClone(definition);
  wrongScope.parameters[0].scope = "child";
  assert.throws(() => scheduler.validateCanvasScheduleV2Definition(graph, wrongScope), /任务组参数/);
  const duplicates = structuredClone(definition);
  duplicates.parameters[0].source.values[1] = duplicates.parameters[0].source.values[0];
  assert.throws(() => scheduler.validateCanvasScheduleV2Definition(graph, duplicates), /重复/);

  const requests = [];
  let failLink;
  const service = loadMocked("src/lib/canvas/content-collection-service.ts", {
    "../content-safety-policy": { getContentSafetyPolicy: async () => ({ revision: 1 }), normalizeContentSafetyPolicySnapshot: (value) => value },
    "./content-collection": contract,
    "../source-link-import": { importSourceLinks: async (input) => {
      requests.push(structuredClone(input));
      assert.equal(input.links.length, 1);
      assert.equal(input.owner.id, "owner-a");
      const link = input.links[0];
      if (link === failLink) return { items: [], results: [{ status: "failed", error: "mock provider failure" }] };
      const index = Number(link.split("-").at(-1));
      return { items: [{ id: `item-${index}`, title: `title-${index}`, contentText: `body-${index}`, sourceUrl: link, images: ["https://unused.example/remote.jpg"], downloadedImages: Array.from({ length: index % 3 + 1 }, (_, imageIndex) => `/media/${index}-${imageIndex}.jpg`), downloadedVideoUrl: index === 0 ? "/media/video.mp4" : undefined }], results: [{ status: "imported" }] };
    } },
  });
  const account = { id: "owner-a", role: "member", displayName: "Owner A" };
  const executorSource = read("src/lib/canvas/executors.ts");
  const imports = [...executorSource.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
  const modules = Object.fromEntries(imports.filter((name) => !name.startsWith("node:")).map((name) => [name, {}]));
  const visionCalls = [];
  const imageCalls = [];
  let failedImage;
  modules["../gpt-image-dimensions"] = { pixelSizeForRatio: () => "1024x1024" };
  modules["./registry"] = registry;
  modules["./node-utils"] = require(path.join(temp, "node-utils.js"));
  modules["./content-collection-service"] = service;
  modules["../concurrency"] = { mapWithConcurrency: async (items, _limit, action) => Promise.all(items.map(action)) };
  modules["../config"] = { getConfig: () => ({}) };
  modules["../activity-log"] = { recordExecutionLog: async () => undefined };
  modules["../openai"] = { callOpenAIForVisionText: async (_instruction, urls) => { visionCalls.push(urls); return `vision:${urls.join(",")}`; } };
  modules["../image-transport"] = { isImageNetworkUnavailableError: () => false };
  modules["../image-generation"] = { generateCanvasGptImages: async (_prompt, _count, references) => {
    imageCalls.push(references);
    if (references.includes(failedImage)) throw new Error("mock image failure");
    return { status: "completed", imageUrls: ["/generated/rebuilt.png"] };
  } };
  const executors = loadMocked("src/lib/canvas/executors.ts", modules);
  let firstFrozenGraph;
  for (const [index, main] of expansion.mainTasks.entries()) {
    const injected = scheduler.applyCanvasScheduleV2Parameters(graph, definition.parameters, main.parameterValues);
    scheduler.validateCanvasScheduleV2SharedGraph(injected, definition);
    const outputs = await service.collectCanvasContent(injected.nodes[0], account);
    assert.equal(outputs.title.value, `title-${index}`);
    assert.equal(outputs.images.items.length, index % 3 + 1);
    const artifacts = scheduler.extractCanvasScheduleV2SharedArtifacts({ source: outputs }, definition.sharedOutputs);
    const frozen = scheduler.createCanvasScheduleV2ChildGraph(injected, artifacts);
    assert.equal(frozen.nodes[0].type, "input.content-pool");
    assert.deepEqual(frozen.edges, graph.edges);
    scheduler.validateCanvasScheduleV2ExpandedGraph(frozen, definition);
    const literal = executors.resolveCanvasLiteralOutputs(frozen.nodes[0]);
    assert.deepEqual(literal.images.items, outputs.images.items);
    const result = await executors.executeCanvasNode({ node: vision, inputs: { images: [literal.images], instruction: [literal.body] }, account, runId: `run-${index}` });
    assert.match(result.outputs.text.value, new RegExp(`/media/${index}-`));
    if (!firstFrozenGraph) firstFrozenGraph = frozen;
  }
  assert.equal(requests.length, 20);
  assert.ok(requests.every((request) => request.skipTagging === true));
  assert.equal(visionCalls.length, 20);
  const enabled = structuredClone(source);
  enabled.config.sourceLink = definition.parameters[0].source.values[0];
  enabled.config.automaticTagging = true;
  await service.collectCanvasContent(enabled, account);
  assert.equal(requests.at(-1).skipTagging, false);
  delete enabled.config.automaticTagging;
  await service.collectCanvasContent(enabled, account);
  assert.equal(requests.at(-1).skipTagging, true);
  assert.equal(contract.validateCanvasCollectionConfig(enabled.config).length, 0);
  failLink = enabled.config.sourceLink;
  await assert.rejects(service.collectCanvasContent(enabled, account), /mock provider failure/);
  enabled.config.sourceLink = definition.parameters[0].source.values[1];
  await service.collectCanvasContent(enabled, account);
  assert.equal(requests.at(-1).links[0], enabled.config.sourceLink);

  const imageNode = registry.createCanvasNode("model.gpt-image-each", "each", { x: 300, y: 0 });
  const prompt = registry.createCanvasNode("input.text", "prompt", { x: 0, y: 200 });
  prompt.config.text = "Rebuild";
  const imageGraph = { nodes: [source, imageNode, prompt], edges: [{ ...edge, target: imageNode.id }, { id: "prompt-edge", source: prompt.id, sourcePort: "text", target: imageNode.id, targetPort: "prompt" }] };
  const imageDefinition = preset.canvasCollectionScheduleDefinition(imageGraph);
  assert.equal(imageDefinition.childResult.artifactKind, "images");
  assert.equal(imageDefinition.childResult.nodeId, imageNode.id);
  scheduler.validateCanvasScheduleV2Definition(imageGraph, imageDefinition);
  const beforeDownstream = requests.length;
  const images = { kind: "images", items: [{ url: "/media/a.jpg" }, { url: "/media/b.jpg" }] };
  const inputs = { images: [images], prompt: [{ kind: "text", value: "Rebuild" }] };
  failedImage = "/media/b.jpg";
  const partial = await executors.executeCanvasNode({ node: imageNode, inputs, account, runId: "image-run" });
  assert.equal(partial.partial, true);
  assert.equal(partial.internalMetadata.imageEach.succeeded, 1);
  failedImage = undefined;
  const retried = await executors.executeCanvasNode({ node: imageNode, inputs, account, runId: "image-run", previousNodeRun: { status: "partial", internalMetadata: partial.internalMetadata } });
  assert.equal(retried.internalMetadata.imageEach.succeeded, 2);
  assert.equal(imageCalls.length, 3, "only the failed image is retried");
  assert.equal(requests.length, beforeDownstream, "downstream execution/retry must not recollect");
  await assert.rejects(executors.executeCanvasNode({ node: imageNode, inputs: { ...inputs, images: [{ kind: "images", items: Array.from({ length: 19 }, () => ({ url: "/media/image.jpg" })) }] }, account }), /1 到 18/);
  await assert.rejects(executors.executeCanvasNode({ node: vision, inputs: { images: [{ kind: "images", items: [] }] }, account }), /Vision analysis accepts/);
  const aggregate = scheduler.createCanvasScheduleV2AggregateGraph(firstFrozenGraph, definition, [{ kind: "text", value: "complete" }]);
  assert.equal(aggregate.nodes.find((node) => node.id === source.id).type, "input.content-pool");
  assert.equal(graph.nodes[0].type, "input.content-collection", "frozen child graphs must not mutate the saved Canvas");
  assert.match(read("src/lib/canvas/scheduler.ts"), /createCanvasScheduleV2AggregateGraph\(createCanvasScheduleV2ChildGraph\(/);
  assert.match(read("src/lib/canvas/runs.ts"), /node\.type !== "input.content-collection"/);
  console.log("Canvas collection: 20 isolated sources, vision/image outputs, tagging defaults, failures and retry contracts passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
