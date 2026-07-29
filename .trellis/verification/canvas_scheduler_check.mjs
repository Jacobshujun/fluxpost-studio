import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-canvas-scheduler-"));
let edgeSequence = 0;

try {
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageRatios=['1:1'];exports.toApis4kImageRatios=['16:9'];", "utf8");
  for (const name of ["types", "node-utils", "registry", "graph", "scheduler-skeleton"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"');
    writeFileSync(path.join(temp, `${name}.js`), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: `${name}.ts`,
    }).outputText, "utf8");
  }
  const require = createRequire(import.meta.url);
  const registry = require(path.join(temp, "registry.js"));
  const graphModule = require(path.join(temp, "graph.js"));
  const skeletonModule = require(path.join(temp, "scheduler-skeleton.js"));
  const schedulerSource = read("src/lib/canvas/scheduler.ts");
  const schedulerOutput = ts.transpileModule(schedulerSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "scheduler.ts",
  }).outputText;
  const schedulerModule = { exports: {} };
  const emptyAsync = async () => undefined;
  const stubs = {
    "../copy-library": new Proxy({}, { get: () => emptyAsync }),
    "../database": new Proxy({}, { get: () => emptyAsync }),
    "../generated-posts": new Proxy({}, { get: () => emptyAsync }),
    "../library-assets": new Proxy({}, { get: () => emptyAsync }),
    "../workspace-ownership": {
      assertCanAccessWorkspaceRecord: () => undefined,
      canAccessWorkspaceOwner: () => true,
      filterWorkspaceOwnedRecords: (records) => records,
      scopeWorkspaceOwner: (account) => ({ ownerUserId: account.id, ownerDisplayName: account.displayName }),
    },
    "./graph": graphModule,
    "./registry": registry,
    "./runs": new Proxy({}, { get: () => emptyAsync }),
    "./types": require(path.join(temp, "types.js")),
    "./workflows": new Proxy({}, { get: () => emptyAsync }),
  };
  Function("require", "module", "exports", "structuredClone", "setTimeout", `${schedulerOutput}`)(
    (name) => {
      if (name === "node:crypto") return require("node:crypto");
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw new Error(`Unexpected scheduler import: ${name}`);
    },
    schedulerModule,
    schedulerModule.exports,
    structuredClone,
    setTimeout,
  );
  const scheduler = schedulerModule.exports;

  assert.match(
    schedulerSource,
    /preflightCanvasSchedule[\s\S]+requireScheduleWorkflow\(current, account, true\)[\s\S]+workflowRevision: workflow\.revision/,
    "preflight must adopt the latest saved workflow revision",
  );
  assert.match(
    schedulerSource,
    /launchCanvasSchedule[\s\S]+requireScheduleWorkflow\(current, account\);/,
    "launch must keep strict workflow revision validation",
  );

  const switchDefinition = registry.getCanvasNodeDefinition("utility.prompt-switch");
  assert.deepEqual(switchDefinition.inputs.map((input) => input.id), ["input1", "input2", "input3"]);
  assert.deepEqual(switchDefinition.inputs.map((input) => input.label), ["输入 1", "输入 2", "输入 3"]);
  assert.deepEqual(switchDefinition.defaultConfig, { selectedInput: "1" });

  const nodes = [
    node("scene", "input.images", "scene-input"),
    node("vehicle", "input.images", "vehicle-input"),
    node("prompt-scene", "input.text"),
    node("prompt-mod", "input.text"),
    node("prompt-person", "input.text"),
    node("switch", "utility.prompt-switch", "prompt-switch"),
    node("image", "model.gpt-image", "image-target"),
    node("body", "input.text"),
    node("content", "compose.social-post", "content-target"),
  ];
  const edges = [
    edge("prompt-scene", "text", "switch", "input1"),
    edge("prompt-mod", "text", "switch", "input2"),
    edge("prompt-person", "text", "switch", "input3"),
    edge("switch", "text", "image", "prompt"),
    edge("scene", "images", "image", "references"),
    edge("vehicle", "images", "image", "references"),
    edge("image", "images", "content", "images"),
    edge("body", "text", "content", "body"),
  ];
  const graph = { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
  const graphValidation = graphModule.validateCanvasGraph(graph);
  assert.equal(graphValidation.valid, true, graphValidation.errors.join(" "));
  const bindings = scheduler.validateCanvasSchedulerBindings(graph);
  assert.deepEqual(bindings, {
    "scene-input": "scene",
    "vehicle-input": "vehicle",
    "prompt-switch": "switch",
    "image-target": "image",
    "content-target": "content",
  });
  assert.throws(
    () => scheduler.validateCanvasSchedulerBindings(graph, true),
    "Copy-enabled schedules must reject the legacy five-role graph.",
  );
  const duplicateRole = structuredClone(graph);
  duplicateRole.nodes.find((item) => item.id === "body").schedulerRole = "scene-input";
  assert.equal(graphModule.validateCanvasGraph(duplicateRole).valid, false, "duplicate scheduler roles must fail graph validation");
  assert.throws(() => scheduler.validateCanvasSchedulerBindings(duplicateRole), /重复绑定“场景素材输入”/);
  const missingRoles = structuredClone(graph);
  for (const item of missingRoles.nodes) {
    if (item.schedulerRole !== "prompt-switch") delete item.schedulerRole;
  }
  assert.throws(
    () => scheduler.validateCanvasSchedulerBindings(missingRoles),
    /缺少“场景素材输入”、“车型素材输入”、“图片生成目标”、“最终内容目标”/,
  );

  const sampled = scheduler.sampleCanvasAssets(["a", "b", "c", "d"], 3, () => 0);
  assert.equal(sampled.length, 3);
  assert.equal(new Set(sampled).size, 3, "sampling must be without replacement");
  assert.throws(() => scheduler.sampleCanvasAssets(["a"], 2), /素材池只有 1 张/);

  const scene = { id: "scene-asset", url: "/scene.jpg", name: "scene" };
  const vehicle = { id: "vehicle-asset", url: "/vehicle.jpg", name: "vehicle" };
  const imageGraph = scheduler.createSchedulerImageGraph(graph, bindings, "input-3", scene, vehicle);
  assert.deepEqual(imageGraph.nodes.find((item) => item.id === "scene").config.urls, [scene.url]);
  assert.deepEqual(imageGraph.nodes.find((item) => item.id === "vehicle").config.urls, [vehicle.url]);
  assert.equal(imageGraph.nodes.find((item) => item.id === "switch").config.selectedInput, "3");
  assert.equal(imageGraph.nodes.find((item) => item.id === "image").config.count, 1);

  const finalGraph = scheduler.createSchedulerFinalizationGraph(graph, bindings, ["/one.png", "/two.png"]);
  const finalImageNode = finalGraph.nodes.find((item) => item.id === "image");
  assert.equal(finalImageNode.type, "input.images");
  assert.deepEqual(finalImageNode.config.urls, ["/one.png", "/two.png"]);
  assert.equal(finalGraph.edges.some((item) => item.target === "image"), false, "finalization must prune image-model ancestors");
  assert.equal(graphModule.buildCanvasRunPlan(finalGraph, ["content"]).blockers.length, 0);

  const copyGraph = structuredClone(graph);
  copyGraph.nodes.push(
    node("copy", "input.copy-library", "copy-input"),
    node("copy-title", "model.gpt-text"),
    node("copy-body", "model.gpt-text"),
  );
  copyGraph.edges = copyGraph.edges.filter((item) => !(item.source === "body" && item.target === "content"));
  copyGraph.edges.push(
    edge("copy", "title", "copy-title", "prompt"),
    edge("copy", "body", "copy-body", "prompt"),
    edge("copy-title", "text", "content", "title"),
    edge("copy-body", "text", "content", "body"),
  );
  const copyGraphValidation = graphModule.validateCanvasGraph(copyGraph);
  assert.equal(copyGraphValidation.valid, true, copyGraphValidation.errors.join(" "));
  const copyBindings = scheduler.validateCanvasSchedulerBindings(copyGraph, true);
  assert.equal(copyBindings["copy-input"], "copy");
  const copySnapshot = {
    id: "copy-entry",
    title: "Frozen title",
    body: "Frozen body",
    tags: ["launch", "ev"],
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  const copyFinalGraph = scheduler.createSchedulerFinalizationGraph(copyGraph, copyBindings, ["/final.png"], copySnapshot);
  assert.deepEqual(copyFinalGraph.nodes.find((item) => item.id === "copy").config, {
    entryId: copySnapshot.id,
    entryTitle: copySnapshot.title,
    snapshotTitle: copySnapshot.title,
    snapshotBody: copySnapshot.body,
    snapshotTags: copySnapshot.tags,
    snapshotAt: copySnapshot.updatedAt,
  });
  assert.equal(graphModule.buildCanvasRunPlan(copyFinalGraph, ["content"]).blockers.length, 0);
  assert.match(
    schedulerSource,
    /copyPool\?\.\[index % copyPool\.length\]/,
    "Copy snapshots must be assigned round-robin across content tasks.",
  );
  assert.match(
    schedulerSource,
    /left\.title\.localeCompare\(right\.title, "zh-CN"\) \|\| left\.id\.localeCompare\(right\.id\)/,
    "Copy pools must use stable title/id ordering.",
  );

  const skeleton = skeletonModule.createCanvasSchedulerSkeleton(
    { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    { x: 100, y: 200 },
    (kind, key) => `${kind}-${key}`,
  );
  assert.equal(skeleton.nodes.filter((item) => item.type === "input.text" && item.label?.startsWith("提示词 ")).length, 3);
  assert.deepEqual(skeleton.nodes.find((item) => item.schedulerRole === "prompt-switch").config, { selectedInput: "1" });
  for (const item of skeleton.nodes) {
    if (item.type === "input.text") item.config.text = `${item.label} 内容`;
  }
  const skeletonValidation = graphModule.validateCanvasGraph(skeleton);
  assert.equal(skeletonValidation.valid, true, skeletonValidation.errors.join(" "));
  const skeletonBindings = scheduler.validateCanvasSchedulerBindings(skeleton, true);
  assert.ok(skeletonBindings["copy-input"]);
  assert.equal(skeleton.nodes.filter((item) => item.type === "model.gpt-text").length, 2, "Scheduler skeleton must use two text-model calls.");
  const skeletonCopyNode = skeleton.nodes.find((item) => item.schedulerRole === "copy-input");
  const skeletonTitleNode = skeleton.nodes.find((item) => item.label?.includes("GPT") && item.label?.includes("标题"));
  const skeletonBodyNode = skeleton.nodes.find((item) => item.label?.includes("GPT") && item.label?.includes("正文"));
  const skeletonContentNode = skeleton.nodes.find((item) => item.schedulerRole === "content-target");
  assert.ok(skeleton.edges.some((item) => item.source === skeletonCopyNode.id && item.sourcePort === "title" && item.target === skeletonTitleNode.id));
  assert.ok(skeleton.edges.some((item) => item.source === skeletonCopyNode.id && item.sourcePort === "body" && item.target === skeletonBodyNode.id));
  assert.ok(skeleton.edges.some((item) => item.source === skeletonTitleNode.id && item.target === skeletonContentNode.id && item.targetPort === "title"));
  assert.ok(skeleton.edges.some((item) => item.source === skeletonBodyNode.id && item.target === skeletonContentNode.id && item.targetPort === "body"));
  assert.equal(skeleton.nodes.filter((item) => (item.schedulerRole === "scene-input" || item.schedulerRole === "vehicle-input") && !item.config.urls?.length).length, 2, "scheduler asset inputs must remain dynamically bound");
  assert.throws(() => skeletonModule.createCanvasSchedulerSkeleton(skeleton, { x: 0, y: 0 }), /已包含调度角色/);

  const database = read("src/lib/database.ts");
  for (const snippet of ["launchCanvasScheduleInDb", 'await client.query("BEGIN")', 'await client.query("ROLLBACK")', "deferCanvasRunQueueItems"]) {
    assert.ok(database.includes(snippet), `database is missing ${snippet}`);
  }
  const collectionRoute = read("src/app/api/canvas/schedules/route.ts");
  const detailRoute = read("src/app/api/canvas/schedules/[id]/route.ts");
  assert.ok(collectionRoute.includes("requireWorkspaceAccount(request)"));
  for (const action of ["preflight", "resample", "launch", "duplicate", "pause", "resume", "cancel", "retry", "accept-candidates"]) {
    assert.ok(detailRoute.includes(`\"${action}\"`), `detail route is missing ${action}`);
  }
  const page = read("src/app/canvas/page.tsx");
  const css = read("src/app/globals.css");
  for (const snippet of ["CanvasScheduleCenter", "ScheduleAssetFilterEditor", "多个标签，AND", "确认并启动", "接受新增候选图", "onSchedulerRoleChange", "insertSchedulerSkeleton", "Switch 输入", "画布绑定", "onSaveBindings", "saveQueueRef.current = saveQueueRef.current.then", "current?.id === schedule.id ? current.revision : schedule.revision"]) {
    assert.ok(page.includes(snippet), `Canvas UI is missing ${snippet}`);
  }
  assert.ok(css.includes(".canvas-schedule-panel"));
  assert.ok(css.includes(".canvas-scheduler-bindings"));
  assert.ok(css.includes("@media (max-width: 520px)"));
  assert.ok(css.includes(".canvas-schedule-body { display: grid; grid-template-columns: 1fr"));
  assert.ok(read("src/lib/canvas/executors.ts").includes("executePromptSwitch"));
  const runs = read("src/lib/canvas/runs.ts");
  assert.ok(runs.includes("prepareCanvasRunFromGraph"));
  assert.match(
    runs,
    /if \(batchRunTerminal && batchRun\?\.batchContext\) notifyCanvasScheduleRunTerminal\(batchRun\)/,
    "Each terminal batch child run must wake schedule reconciliation immediately.",
  );
  assert.match(
    runs,
    /function notifyCanvasScheduleRunTerminal[\s\S]*import\("\.\/scheduler"\)[\s\S]*kickCanvasSchedulerWorker/,
    "Canvas run completion must wake the scheduler without a static circular import.",
  );
  assert.match(
    schedulerSource,
    /for \(const content of batch\.contentTasks\)[\s\S]*const imagesTerminal = content\.imageTasks\.every[\s\S]*finalizationRequests\.push\(content\)/,
    "Each ready content task must enqueue finalization independently of sibling task completion.",
  );
  const instrumentation = read("src/instrumentation.ts");
  assert.match(instrumentation, /NEXT_RUNTIME !== "nodejs"/);
  assert.match(instrumentation, /NEXT_PHASE === "phase-production-build"/);
  assert.match(instrumentation, /FLUXPOST_DISABLE_BACKGROUND_WORKERS === "1"/);
  assert.match(instrumentation, /kickCanvasSchedulerWorker\(\)[\s\S]*ensureCanvasRunWorker\(\)/);
  const baseline = read(".trellis/verification/check.mjs");
  assert.match(
    baseline,
    /spawn\(nodeCommand[\s\S]*FLUXPOST_DISABLE_BACKGROUND_WORKERS: "1"/,
    "The baseline smoke server must not advance persisted background work.",
  );
  console.log("Canvas batch scheduler checks passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function node(id, type, schedulerRole) {
  const definition = type === "model.gpt-image"
    ? { ...registryNode(type), version: 2 }
    : registryNode(type);
  const config = structuredClone(definition.defaultConfig);
  if (type === "input.images") config.urls = [`/${id}.jpg`];
  if (type === "input.text") config.text = `${id} text`;
  return { id, type, version: definition.version, position: { x: 0, y: 0 }, config, ...(schedulerRole ? { schedulerRole } : {}) };
}

function registryNode(type) {
  const require = createRequire(import.meta.url);
  const registry = require(path.join(temp, "registry.js"));
  return registry.getCanvasNodeDefinition(type);
}

function edge(source, sourcePort, target, targetPort) {
  edgeSequence += 1;
  return { id: `edge-${edgeSequence}`, source, sourcePort, target, targetPort };
}
