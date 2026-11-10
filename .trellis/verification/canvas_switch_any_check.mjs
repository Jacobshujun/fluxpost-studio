import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { loadCanvasContract as load } from "./canvas-test-modules.mjs";

const nativeRequire = createRequire(import.meta.url);
const registry = load("src/lib/canvas/registry.ts");
const graphLib = load("src/lib/canvas/graph.ts");
const selection = load("src/lib/canvas/switch-any.ts");
const inputValidation = load("src/lib/canvas/input-validation.ts");
const types = load("src/lib/canvas/types.ts");
const node = (type, id, config = {}) => ({ ...registry.createCanvasNode(type, id, { x: 0, y: 0 }), config: { ...registry.getCanvasNodeDefinition(type).defaultConfig, ...config } });
const switchNode = node("utility.switch-any", "switch");
const text = (value) => ({ kind: "text", value });
const image = { kind: "images", items: [{ url: "/fixture.png", width: 20, height: 10, name: "original" }], imageBatch: { fixture: "preserve all metadata" } };
const edge = (source, sourcePort, target, targetPort) => ({ id: `${source}-${sourcePort}-${target}-${targetPort}`, source, sourcePort, target, targetPort });
const visible = (ports) => registry.getCanvasVisibleInputPorts(switchNode, ports).map((port) => port.id);
assert.deepEqual(visible([]), ["value0", "index"]);
assert.deepEqual(visible(["value0"]), ["value0", "value1", "index"]);
assert.equal(visible(["value24"]).length, 27, "25 connected slots plus one spare and index");
assert.deepEqual(visible(["value0", "value2"]), ["value0", "value1", "value2", "value3", "index"]);
assert.deepEqual(visible(["value0", "index"]), ["value0", "value1", "index"]);
assert.equal(visible(["value599"]).at(-2), "value600");
for (const invalid of ["", " ", "-1", "1.0", "1e2", "0x1", "+1", "abc", 1.5, -1, Infinity, NaN, null, 601]) assert.equal(selection.parseCanvasSwitchIndex(invalid), undefined, String(invalid));
for (const [value, expected] of [[0, 0], [" 2 ", 2], ["002", 2], [600, 600]]) assert.equal(selection.parseCanvasSwitchIndex(value), expected);
for (const artifact of [text(""), image, { kind: "videos", items: [{ url: "/video.mp4" }], providerTaskId: "preserved" }, { kind: "audios", items: [{ url: "/audio.wav" }] }, { kind: "socialPost", postId: "post", post: { title: "fixture" } }, { kind: "publishJobRef", jobId: "job", status: "queued" }]) {
  const selected = selection.resolveCanvasSwitchValue(switchNode, { value0: [artifact] });
  assert.deepEqual(selected.artifact, artifact);
  assert.notEqual(selected.artifact, artifact, "downstream cannot mutate the saved upstream artifact");
}
assert.deepEqual(selection.resolveCanvasSwitchValue(switchNode, { value0: [text("zero")], value2: [image], index: [text(" 2 ")] }).artifact, image);
assert.match(selection.resolveCanvasSwitchValue(switchNode, { value0: [image], index: [] }).error, /index/);
assert.match(selection.resolveCanvasSwitchValue(switchNode, { value0: [image], index: [image] }).error, /index/);
assert.match(selection.resolveCanvasSwitchValue(switchNode, { value0: [image], index: [text("1")] }).error, /value1/);
assert.equal(types.areCanvasPortKindsCompatible("any", "text"), true);
assert.equal(types.areCanvasPortKindsCompatible("images", "text"), false);
assert.equal(types.areCanvasPortKindsCompatible("visual", "text"), false);

const source = node("input.text", "source", { text: "selected" });
const other = node("input.text", "other", { text: "not selected, still executed" });
const index = node("input.text", "index", { text: "0" });
const chained = node("utility.switch-any", "chained");
const display = node("utility.display-any", "display");
const graph = { nodes: [source, other, index, switchNode, chained, display], edges: [edge("source", "text", "switch", "value0"), edge("other", "text", "switch", "value24"), edge("index", "text", "switch", "index"), edge("switch", "value", "chained", "value0"), edge("chained", "value", "display", "value")], viewport: { x: 0, y: 0, zoom: 1 } };
assert.equal(graphLib.validateCanvasGraph(graph).valid, true);
const invalidManual = cloneForValidation(graph);
invalidManual.nodes.find((entry) => entry.id === "switch").config.index = "";
assert.equal(graphLib.validateCanvasGraph(invalidManual).valid, true, "connected index overrides an unfinished manual draft");
invalidManual.edges = invalidManual.edges.filter((entry) => entry.targetPort !== "index");
assert.equal(graphLib.validateCanvasGraph(invalidManual).valid, false, "invalid disconnected manual index is rejected");
function cloneForValidation(value) { return structuredClone(value); }
assert.ok(graphLib.buildCanvasRunPlan(graph, ["display"]).includedNodeIds.includes("other"), "unselected upstream remains scheduled");
const workflowFile = load("src/lib/canvas/workflow-file.ts");
assert.deepEqual(workflowFile.parseCanvasWorkflowFile(JSON.stringify(workflowFile.createCanvasWorkflowFile("Switch fixture", graph))).graph, graph);
const clipboard = load("src/lib/canvas/clipboard.ts");
const payload = clipboard.parseCanvasClipboardPayload(JSON.stringify(clipboard.createCanvasClipboardPayload(graph.nodes, graph.edges, graph.nodes.map((entry) => entry.id))));
assert.deepEqual(payload.edges, graph.edges);
assert.equal(clipboard.instantiateCanvasClipboardPayload(payload, { x: 500, y: 0 }, (kind, i) => `${kind}-${i}`).edges.find((entry) => entry.targetPort === "value24").targetPort, "value24");
const region = registry.createCanvasNode("utility.image-iterate", "region", { x: 0, y: 0 });
region.iteration.graph.nodes.push(switchNode);
region.iteration.graph.edges.push(edge("iteration-item", "images", "switch", "value0"));
region.iteration.outputs = { images: { nodeId: "switch", outputPort: "value" } };
assert.deepEqual(load("src/lib/canvas/iteration.ts").validateCanvasIteration(region, true), []);

function compiled(relative, imports, extra = "") {
  const loadedModule = { exports: {} };
  const source = readFileSync(relative, "utf8") + extra;
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  Function("require", "module", "exports", output)((name) => {
    if (name.startsWith("node:")) return nativeRequire(name);
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
let externalCalls = 0;
const forbidden = new Proxy({}, { get: () => () => { externalCalls += 1; throw new Error("External side effect forbidden in fixture"); } });
const executorSource = readFileSync("src/lib/canvas/executors.ts", "utf8");
const executorImports = Object.fromEntries([...executorSource.matchAll(/from "([^"\n]+)"/g)].map((match) => [match[1], forbidden]));
Object.assign(executorImports, { "./registry": registry, "./switch-any": selection, "./input-validation": inputValidation, "./node-utils": load("src/lib/canvas/node-utils.ts") });
const executors = compiled("src/lib/canvas/executors.ts", executorImports);
const records = new Map(), attempts = new Map();
const clone = (value) => value === undefined ? value : structuredClone(value);
const database = {
  saveCancelledCanvasNodeReceiptInDb: async () => {},
  getCanvasRunFromDb: async (id) => clone(records.get(id)),
  saveCanvasRunToDb: async (run) => { records.set(run.id, clone(run)); return clone(run); },
  listCanvasNodeRunsFromDb: async (id) => clone([...attempts.values()].filter((attempt) => attempt.runId === id)),
  saveCanvasNodeRunToDb: async (attempt) => { attempts.set(attempt.id, clone(attempt)); return clone(attempt); },
  getCanvasNodeRunFromDb: async (id) => clone(attempts.get(id)),
  iterateCanvasSuccessfulNodeRunsForNodeFromDb: async function* (_workflow, nodeId) {
    for (const attempt of attempts.values()) if (attempt.nodeId === nodeId && attempt.status === "completed") yield { run: clone(records.get(attempt.runId)), nodeRun: clone(attempt) };
  },
};
const runtime = compiled("src/lib/canvas/runs.ts", {
  "./input-validation": inputValidation, "./switch-any": selection, "../database": database, "../activity-log": {},
  "../workspace-ownership": { canAccessWorkspaceOwner: (account, owner) => account.id === owner }, "../concurrency": { concurrencyConfig: { canvasRun: 0 } },
  "../image-transport": { isImageNetworkUnavailableError: () => false }, "./executors": executors,
  "./layer-compose-contract": load("src/lib/canvas/layer-compose-contract.ts"), "./iteration": load("src/lib/canvas/iteration.ts"),
  "./seedance": {}, "./graph": graphLib, "./registry": registry, "./workflows": {}, "./iteration-runtime": {},
}, "\nexport { executeCanvasRun as executeForTest, resolveCanvasRunPlan as planForTest };\n");
async function runGraph(id, current, extra = {}) {
  const run = { id, ownerUserId: "fixture-owner", ownerDisplayName: "Fixture", workflowId: "fixture-workflow", workflowRevision: 1, graphSnapshot: clone(current), status: "queued", confirmation: {}, ...extra };
  records.set(id, clone(run));
  const result = await runtime.executeForTest(run);
  return { result, nodes: new Map((await database.listCanvasNodeRunsFromDb(id)).map((attempt) => [attempt.nodeId, attempt])) };
}
const successful = await runGraph("normal", graph);
assert.equal(successful.result.status, "completed");
assert.equal(successful.nodes.get("other").status, "completed");
assert.deepEqual(successful.nodes.get("display").outputs.preview, text("selected"));
const childGraph = { nodes: [node("input.iteration-item", "item"), switchNode, display], edges: [edge("item", "images", "switch", "value0"), edge("switch", "value", "display", "value")] };
const child = await runGraph("iteration-child", childGraph, { iterationContext: { parentRunId: "normal", regionNodeId: "region", itemId: "item", index: 0 }, iterationInputs: { images: image } });
assert.equal(child.result.status, "completed");
assert.deepEqual(child.nodes.get("display").outputs.preview, image);
for (const mode of ["bypass", "disabled"]) {
  const current = clone(graph); current.nodes.find((entry) => entry.id === "switch").executionMode = mode;
  const execution = await runGraph(mode, current);
  assert.equal(execution.nodes.get("switch").status, mode === "bypass" ? "bypassed" : "disabled");
  if (mode === "bypass") assert.deepEqual(execution.nodes.get("display").outputs.preview, text("selected"));
  else assert.deepEqual(execution.nodes.get("switch").outputs, {});
}
const missing = clone(graph); missing.nodes.find((entry) => entry.id === "index").executionMode = "disabled";
for (const mode of ["enabled", "bypass"]) {
  missing.nodes.find((entry) => entry.id === "switch").executionMode = mode;
  const execution = await runGraph(`missing-${mode}`, missing);
  assert.match(execution.nodes.get("switch").error, /index/);
  assert.deepEqual(execution.nodes.get("switch").outputs, {}, "missing connected index cannot fall back to manual zero");
}
const images = node("input.images", "images", { urls: ["/fixture.png"] });
const typed = node("model.gpt-text", "typed");
const mismatch = { nodes: [images, switchNode, typed], edges: [edge("images", "images", "switch", "value0"), edge("switch", "value", "typed", "prompt")] };
const badRun = await runGraph("mismatch", mismatch);
assert.equal(badRun.nodes.get("typed").status, "blocked");
assert.match(badRun.nodes.get("typed").error, /prompt|提示词/);
assert.match(badRun.nodes.get("typed").error, /images/);
for (const mode of ["enabled", "bypass"]) {
  const publish = { ...node("publish.feishu", "publish"), executionMode: mode };
  const rejected = await runGraph(`publish-${mode}`, { nodes: [source, switchNode, publish], edges: [edge("source", "text", "switch", "value0"), edge("switch", "value", "publish", "post")] });
  assert.equal(rejected.nodes.get("publish").status, "blocked");
  assert.match(rejected.nodes.get("publish").error, mode === "enabled" ? /socialPost.*text/ : /cannot bypass/);
}
const bypassMismatch = clone(mismatch);
bypassMismatch.nodes.find((entry) => entry.id === "typed").executionMode = "bypass";
const blockedBypass = await runGraph("typed-bypass-mismatch", bypassMismatch);
assert.equal(blockedBypass.nodes.get("typed").status, "blocked");
assert.match(blockedBypass.nodes.get("typed").error, /text.*images/);
await assert.rejects(executors.executeCanvasNode({ node: typed, inputs: { prompt: [image] }, account: { id: "fixture-owner" }, runId: "direct" }), /images/);
const isolated = await runtime.planForTest(graph, "fixture-workflow", ["display"], "isolated", { id: "fixture-owner" });
assert.equal(isolated.blockers.length, 0);
assert.equal(isolated.steps.find((step) => step.nodeId === "switch").action, "reuse");
const reused = await runGraph("reused", graph, { steps: isolated.steps });
assert.equal(reused.nodes.get("switch").status, "reused");
assert.deepEqual(reused.nodes.get("display").outputs.preview, text("selected"));
const changed = clone(graph); changed.nodes.find((entry) => entry.id === "index").config.text = "24";
assert.ok((await runtime.planForTest(changed, "fixture-workflow", ["display"], "isolated", { id: "fixture-owner" })).blockers.some((blocker) => blocker.nodeId === "switch"), "changed index invalidates reuse");
assert.equal(externalCalls, 0);
console.log("Switch Any: ports, strict index, metadata, portable/clipboard/iteration, durable execution, modes, actual type safety and reuse passed.");
