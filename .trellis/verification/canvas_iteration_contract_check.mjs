import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-iteration-contract-"));
const require = createRequire(import.meta.url);
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
try {
  const pageSource = read("src/app/canvas/page.tsx");
  assert.match(pageSource, /deleteKeyCode=\{isMobile \|\| iterationEditorId \? null : \["Backspace", "Delete"\]\}/, "outer deletion must pause while the iteration editor owns keyboard input");
  assert.match(pageSource, /const outputPortIds = getCanvasIterationOutputPorts\(node\)\.map\(\(port\) => port\.id\)\.join\(","\)/, "port identity changes must invalidate handle geometry even at the same node size");
  assert.match(pageSource, /updateNodeInternals\(node\.id\);\s*\}, \[node\.id, outputPortIds, updateNodeInternals\]\)/);
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageResolutions=['1k','2k','4k'];exports.toApisImageRatios=['1:1'];exports.toApis4kImageRatios=['16:9'];");
  writeFileSync(path.join(temp, "feishu-publish-mode.js"), "exports.feishuPublishModeOptions=[{value:'full',label:'full'}];exports.normalizeFeishuPublishMode=(value)=>value||'full';");
  for (const name of ["types", "node-utils", "source-video-contract", "video-loader", "content-collection", "content-collection-schedule", "save-images", "seedance-references", "subtitle-style", "subtitle-editor", "registry", "graph", "iteration", "serialization", "clipboard", "workflow-file", "scheduler-v2"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"').replace('"../feishu-publish-mode"', '"./feishu-publish-mode"');
    writeFileSync(path.join(temp, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const registry = require(path.join(temp, "registry.js"));
  const iteration = require(path.join(temp, "iteration.js"));
  const validation = require(path.join(temp, "graph.js"));
  const serialization = require(path.join(temp, "serialization.js"));
  const clipboard = require(path.join(temp, "clipboard.js"));
  const files = require(path.join(temp, "workflow-file.js"));
  const scheduler = require(path.join(temp, "scheduler-v2.js"));
  const preset = require(path.join(temp, "content-collection-schedule.js"));
  const create = (type, id) => registry.createCanvasNode(type, id, { x: 0, y: 0 });
  const graphOf = (nodes, edges = []) => ({ nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } });
  const source = create("input.images", "source");
  source.config.urls = ["https://fixture.invalid/source.png"];
  const region = create("utility.image-iterate", "region");
  const root = region.iteration.graph.nodes.find((node) => node.type === "input.iteration-item");
  const vision = region.iteration.graph.nodes.find((node) => node.type === "model.gpt-vision");
  const entry = { id: "entry", source: source.id, sourcePort: "images", target: region.id, targetPort: "images" };
  const graph = graphOf([source, region], [entry]);
  assert.deepEqual(region.config, { concurrency: 4, failurePolicy: "all" });
  assert.deepEqual(root.config, {});
  assert.deepEqual(registry.getCanvasNodeDefinition(root.type).inputs, []);
  assert.deepEqual(registry.getCanvasNodeDefinition(root.type).outputs.map((port) => port.id), ["images", "index", "text", "references"]);
  assert.deepEqual(registry.getCanvasNodeDefinition(region.type).inputs.map((port) => port.id), ["images", "text", "references"]);
  assert.deepEqual(iteration.validateCanvasIteration(region), []);
  assert.equal(validation.validateCanvasGraph(graph).valid, true);
  assert.deepEqual(iteration.getCanvasIterationOutputPorts(region).map((port) => port.id), ["text"]);
  assert.deepEqual(serialization.decodeCanvasGraph(graph), graph);
  assert.throws(() => serialization.decodeCanvasGraph(root && graphOf([root])), /only allowed inside/);
  assert.equal(validation.validateCanvasGraph(region.iteration.graph).valid, true, "runtime accepts separately injected root graphs");
  assert.deepEqual(validation.buildCanvasRunPlan(graph).confirmationNodeIds, [region.id]);
  assert.deepEqual(validation.buildCanvasRunPlan(graph).capabilities, ["text_model"]);
  const independent = iteration.createCanvasIterationDefinition();
  independent.graph.nodes[0].position.x = 900;
  assert.notEqual(root.position.x, 900, "default inner graphs do not share mutable state");

  for (const concurrency of [0, 21, 1.5, "4", NaN]) {
    assert.match(iteration.validateCanvasIteration({ ...region, config: { ...region.config, concurrency } }).join(" "), /concurrency/);
  }
  for (const concurrency of [1, 4, 20]) assert.deepEqual(iteration.validateCanvasIteration({ ...region, config: { concurrency, failurePolicy: "at-least-one" } }), []);
  assert.match(iteration.validateCanvasIteration({ ...region, config: { ...region.config, failurePolicy: "ignore" } }).join(" "), /failure policy/);
  const mutate = (change) => { const copy = structuredClone(region); change(copy); return copy; };
  for (const type of ["utility.image-iterate", "input.videos", "input.video-loader", "input.content-collection", "model.seedance", "publish.feishu", "utility.save-images", "model.gpt-image-each"]) {
    const bad = mutate((node) => node.iteration.graph.nodes.push(create(type, "forbidden")));
    assert.match(iteration.validateCanvasIteration(bad, false).join(" "), /not allowed/);
    assert.throws(() => serialization.decodeCanvasGraph(graphOf([bad])), /not allowed/);
  }
  assert.match(iteration.validateCanvasIteration(mutate((node) => node.iteration.graph.nodes.push({ ...structuredClone(root), id: "another-root" }))).join(" "), /exactly one/);
  assert.match(iteration.validateCanvasIteration(mutate((node) => { node.iteration.graph.nodes[0].executionMode = "disabled"; })).join(" "), /root must be enabled/);
  assert.match(iteration.validateCanvasIteration(mutate((node) => { node.iteration.graph.nodes[0].config.index = 2; })).join(" "), /empty config/);
  assert.match(iteration.validateCanvasIteration(mutate((node) => { node.iteration.graph.nodes[1].schedulerRole = "image-target"; })).join(" "), /scheduler roles/);
  for (const selector of [{ nodeId: "missing", outputPort: "text" }, { nodeId: root.id, outputPort: "images" }]) {
    const bad = mutate((node) => { node.iteration.outputs.text = selector; });
    assert.match(iteration.validateCanvasIteration(bad).join(" "), /matching inner node port/);
    assert.throws(() => serialization.decodeCanvasGraph(graphOf([bad])), /matching inner node port/);
  }
  const draft = mutate((node) => { node.iteration.outputs = {}; });
  assert.equal(validation.validateCanvasGraphForPersistence(graphOf([draft])).valid, true);
  assert.match(iteration.validateCanvasIteration(draft).join(" "), /at least one selected output/);
  const disabledOutput = mutate((node) => { node.iteration.graph.nodes[1].executionMode = "disabled"; });
  assert.match(iteration.validateCanvasIteration(disabledOutput).join(" "), /disabled/);
  const preview = create("utility.image-preview", "preview");
  const unconfiguredEdge = { id: "unconfigured", source: region.id, sourcePort: "images", target: preview.id, targetPort: "images" };
  assert.equal(validation.validateCanvasGraphForPersistence(graphOf([region, preview], [unconfiguredEdge])).valid, false);
  assert.throws(() => serialization.decodeCanvasGraph(graphOf([region, preview], [unconfiguredEdge])), /missing port/);
  const cycle = mutate((node) => node.iteration.graph.edges.push({ id: "cycle", source: vision.id, sourcePort: "text", target: vision.id, targetPort: "instruction" }));
  assert.throws(() => serialization.decodeCanvasGraph(graphOf([cycle])), /cycles/);
  const manyRegions = graphOf(Array.from({ length: 67 }, (_, index) => create("utility.image-iterate", `region-${index}`)));
  assert.equal(iteration.getCanvasGraphBudget(manyRegions).nodes, 201);
  assert.equal(validation.validateCanvasGraphForPersistence(manyRegions).valid, false);
  assert.throws(() => serialization.decodeCanvasGraph(manyRegions), /budget/);
  const manyEdges = mutate((node) => { node.iteration.graph.edges = Array.from({ length: 599 }, (_, index) => ({ ...node.iteration.graph.edges[0], id: `inner-${index}` })); });
  const edgeOverflow = graphOf([source, manyEdges], [entry, { ...entry, id: "entry-2" }]);
  assert.equal(iteration.getCanvasGraphBudget(edgeOverflow).edges, 601);
  assert.equal(validation.validateCanvasGraphForPersistence(edgeOverflow).valid, false);
  assert.throws(() => serialization.decodeCanvasGraph(edgeOverflow), /budget/);

  region.iteration.outputs.images = { nodeId: root.id, outputPort: "images" };
  const artifacts = { text: { kind: "text", value: "first\nsecond" }, images: { kind: "images", items: [{ url: "https://fixture.invalid/first.png" }, { url: "https://fixture.invalid/second.png" }] } };
  const aggregateDefinition = { childResult: { nodeId: region.id, outputPort: "images", artifactKind: "images" } };
  const aggregate = scheduler.createCanvasScheduleV2AggregateGraph(graphOf([region]), aggregateDefinition, [artifacts.images], artifacts);
  assert.equal(aggregate.nodes[0].type, "utility.image-iterate");
  assert.equal(validation.validateCanvasGraph(aggregate).valid, true);
  assert.deepEqual(aggregate.nodes[0].frozenOutputs, artifacts, "aggregation preserves both region outputs without reexecution");
  const frozen = iteration.freezeCanvasIterationOutputs(region, artifacts);
  assert.equal(validation.validateCanvasGraph(graphOf([frozen])).valid, true, "frozen regions need no incoming image edge");
  assert.deepEqual(validation.buildCanvasRunPlan(graphOf([frozen])).capabilities, []);
  assert.deepEqual(validation.buildCanvasRunPlan(graphOf([frozen])).confirmationNodeIds, []);
  assert.deepEqual(serialization.decodeCanvasGraph(graphOf([frozen])).nodes[0].frozenOutputs, artifacts);
  assert.throws(() => iteration.freezeCanvasIterationOutputs(region, { text: artifacts.text }), /images is missing/);
  assert.throws(() => iteration.freezeCanvasIterationOutputs(region, { ...artifacts, images: artifacts.text }), /Invalid frozen/);
  assert.throws(() => serialization.decodeCanvasGraph(graphOf([{ ...source, frozenOutputs: artifacts }])), /Only image iteration/);
  frozen.frozenOutputs.images.items[0].url = "changed";
  assert.notEqual(artifacts.images.items[0].url, "changed");
  const dirty = structuredClone(region);
  dirty.config.apiKey = "outer-secret";
  dirty.iteration.graph.nodes[1].config.access_token = "inner-secret";
  const decoded = serialization.decodeCanvasGraph(graphOf([dirty]));
  assert.equal(decoded.nodes[0].config.apiKey, undefined);
  assert.equal(decoded.nodes[0].iteration.graph.nodes[1].config.access_token, undefined);
  const portable = files.createCanvasWorkflowFile("Iteration", graphOf([dirty]));
  assert.ok(!JSON.stringify(portable).includes("secret"));
  const restored = files.parseCanvasWorkflowFile(JSON.stringify(portable));
  assert.deepEqual(restored.graph.nodes[0].iteration, region.iteration);
  assert.equal(files.createCanvasWorkflowFile("Frozen", graphOf([frozen])).graph.nodes[0].frozenOutputs, undefined);
  const payload = clipboard.createCanvasClipboardPayload([dirty], [], [dirty.id]);
  assert.ok(!JSON.stringify(payload).includes("secret"));
  assert.ok(clipboard.parseCanvasClipboardPayload(JSON.stringify(payload)));
  const copied = clipboard.instantiateCanvasClipboardPayload(payload, { x: 200, y: 300 }, (kind, index) => `copy-${kind}-${index}`);
  const copiedRegion = copied.nodes[0];
  assert.notEqual(copiedRegion.iteration.outputs.text.nodeId, vision.id);
  assert.equal(copiedRegion.iteration.outputs.text.nodeId, copiedRegion.iteration.graph.nodes[1].id);
  assert.equal(copiedRegion.iteration.graph.edges[0].source, copiedRegion.iteration.graph.nodes[0].id);
  assert.deepEqual(iteration.validateCanvasIteration(copiedRegion), []);
  assert.equal(region.iteration.outputs.text.nodeId, vision.id);
  const almostFull = graphOf(Array.from({ length: 198 }, (_, index) => create("input.text", `existing-${index}`)));
  assert.throws(() => clipboard.prepareCanvasClipboardPaste(almostFull, payload, { x: 0, y: 0 }, (kind, index) => `pasted-${kind}-${index}`), /at most 200/);
  const generated = create("model.gpt-image", "generated");
  const billing = mutate((node) => {
    node.iteration.graph.nodes.push(generated);
    node.iteration.graph.edges.push({ id: "generate", source: root.id, sourcePort: "text", target: generated.id, targetPort: "prompt" });
    node.iteration.outputs.images = { nodeId: generated.id, outputPort: "images" };
  });
  assert.deepEqual(new Set(validation.buildCanvasRunPlan(graphOf([source, billing], [entry])).capabilities), new Set(["text_model", "image_model"]));
  assert.deepEqual(validation.buildCanvasRunPlan(graphOf([source, billing], [entry])).confirmationNodeIds, [region.id]);
  billing.iteration.outputs = { text: { nodeId: vision.id, outputPort: "text" } };
  assert.deepEqual(validation.buildCanvasRunPlan(graphOf([source, billing], [entry])).capabilities, ["text_model"], "unselected inner image model is not billed");

  const downstream = create("model.gpt-vision", "downstream");
  const scheduleEdges = [entry,
    { id: "result-images", source: region.id, sourcePort: "images", target: downstream.id, targetPort: "images" },
    { id: "result-text", source: region.id, sourcePort: "text", target: downstream.id, targetPort: "instruction" },
  ];
  const scheduleGraph = graphOf([source, region, downstream], scheduleEdges);
  const definition = {
    parameters: [{ id: "source", name: "Source", scope: "main", valueType: "image-group", source: { mode: "fixed", values: [[{ id: "image", url: source.config.urls[0] }]] }, expansion: "fixed", binding: { nodeId: source.id, fieldKey: "urls" } }],
    expansion: { main: "cartesian", child: "cartesian" },
    sharedOutputs: ["text", "images"].map((kind) => ({ nodeId: region.id, outputPort: kind, artifactKind: kind })),
    childResult: { nodeId: downstream.id, outputPort: "text", artifactKind: "text" }, aggregationPolicy: "all",
  };
  scheduler.validateCanvasScheduleV2Definition(scheduleGraph, definition);
  assert.throws(() => scheduler.validateCanvasScheduleV2Definition(scheduleGraph, { ...definition, sharedOutputs: definition.sharedOutputs.slice(0, 1) }), /all configured/);
  const childDependency = structuredClone(definition);
  childDependency.parameters[0].scope = "child";
  assert.throws(() => scheduler.validateCanvasScheduleV2Definition(scheduleGraph, childDependency), /child-scoped/);
  const selected = scheduler.extractCanvasScheduleV2SharedArtifacts({ [region.id]: artifacts }, definition.sharedOutputs);
  const childGraph = scheduler.createCanvasScheduleV2ChildGraph(scheduleGraph, selected);
  const childRegion = childGraph.nodes.find((node) => node.id === region.id);
  assert.equal(childRegion.type, region.type);
  assert.deepEqual(childRegion.frozenOutputs, artifacts);
  assert.deepEqual(childGraph.edges, scheduleEdges.slice(1), "freezing preserves distinct text and images output ports");
  assert.equal(validation.validateCanvasGraph(childGraph).valid, true);
  assert.deepEqual(validation.buildCanvasRunPlan(childGraph, [downstream.id]).confirmationNodeIds, [downstream.id]);
  assert.equal(region.frozenOutputs, undefined);
  childRegion.frozenOutputs.images.items.reverse();
  assert.deepEqual(selected[1].artifact.items, artifacts.images.items, "child graph snapshots are isolated");
  const unconfiguredResult = structuredClone(definition);
  unconfiguredResult.sharedOutputs = [];
  unconfiguredResult.childResult = { nodeId: region.id, outputPort: "videos", artifactKind: "videos" };
  assert.throws(() => scheduler.validateCanvasScheduleV2Definition(scheduleGraph, unconfiguredResult), /no longer exists/);
  const collection = create("input.content-collection", "collection");
  collection.config.links = "https://fixture.invalid/post";
  const imagesOnly = mutate((node) => { node.iteration.outputs = { images: { nodeId: root.id, outputPort: "images" } }; });
  const collectionPreset = preset.canvasCollectionScheduleDefinition(graphOf([collection, imagesOnly], [{ ...entry, source: collection.id }]));
  assert.equal(collectionPreset.childResult.outputPort, "images", "collection preset skips unconfigured text output");
  console.log("Canvas iteration contract checks passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
