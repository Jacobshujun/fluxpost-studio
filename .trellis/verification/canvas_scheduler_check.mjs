import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-canvas-scheduler-"));
let edgeSequence = 0;
let storedSchedule;
let savedSchedule;
let workflowRecord;
let copyEntries = [];
let copyListCalls = 0;
let libraryAssetsByRole = { reference: [], vehicle: [] };
let generatedPosts = new Map();
let canvasRunFixture;
let retriedNode;
let createdSchedule;
let launchedSchedule;
let launchedRuns;

try {
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageRatios=['1:1'];exports.toApis4kImageRatios=['16:9'];", "utf8");
  for (const name of ["types", "node-utils", "registry", "graph", "scheduler-skeleton", "scheduler-v2"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"');
    writeFileSync(path.join(temp, `${name}.js`), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: `${name}.ts`,
    }).outputText, "utf8");
  }
  writeFileSync(path.join(temp, "list-selection.js"), ts.transpileModule(read("src/lib/list-selection.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "list-selection.ts",
  }).outputText, "utf8");
  const require = createRequire(import.meta.url);
  const selection = require(path.join(temp, "list-selection.js"));
  const registry = require(path.join(temp, "registry.js"));
  const graphModule = require(path.join(temp, "graph.js"));
  const skeletonModule = require(path.join(temp, "scheduler-skeleton.js"));
  const schedulerV2 = require(path.join(temp, "scheduler-v2.js"));
  const schedulerSource = read("src/lib/canvas/scheduler.ts");
  const schedulerOutput = ts.transpileModule(schedulerSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "scheduler.ts",
  }).outputText;
  const schedulerModule = { exports: {} };
  const emptyAsync = async () => undefined;
  const stubs = {
    "../copy-library": new Proxy({
      listCopyLibraryEntries: async () => {
        copyListCalls += 1;
        return { entries: structuredClone(copyEntries), tags: [] };
      },
    }, { get: (target, key) => target[key] || emptyAsync }),
    "../database": new Proxy({
      createCanvasScheduleInDb: async (schedule) => {
        createdSchedule = structuredClone(schedule);
        return structuredClone(schedule);
      },
      getCanvasScheduleFromDb: async () => structuredClone(storedSchedule),
      launchCanvasScheduleInDb: async (schedule, _expectedRevision, runs) => {
        launchedSchedule = structuredClone(schedule);
        launchedRuns = structuredClone(runs);
      },
      listCanvasSchedulesFromDb: async () => [],
      updateCanvasScheduleInDb: async (schedule, expectedRevision) => {
        if (!storedSchedule || storedSchedule.revision !== expectedRevision) return false;
        savedSchedule = structuredClone(schedule);
        storedSchedule = structuredClone(schedule);
        return true;
      },
    }, { get: (target, key) => target[key] || emptyAsync }),
    "../generated-posts": new Proxy({
      getGeneratedPost: async (id) => structuredClone(generatedPosts.get(id)),
      updateGeneratedPost: async (id, patch) => {
        const current = generatedPosts.get(id);
        if (!current) return undefined;
        const saved = { ...current, ...structuredClone(patch), updatedAt: "2026-07-29T03:00:00.000Z" };
        generatedPosts.set(id, saved);
        return structuredClone(saved);
      },
    }, { get: (target, key) => target[key] || emptyAsync }),
    "../library-assets": new Proxy({
      listLibraryAssets: async (_account, options) => ({ assets: structuredClone(libraryAssetsByRole[options.role] || []), nextCursor: undefined }),
    }, { get: (target, key) => target[key] || emptyAsync }),
    "../workspace-ownership": {
      assertCanAccessWorkspaceRecord: () => undefined,
      canAccessWorkspaceOwner: () => true,
      filterWorkspaceOwnedRecords: (records) => records,
      scopeWorkspaceOwner: (account) => ({ ownerUserId: account.id, ownerDisplayName: account.displayName }),
    },
    "./graph": graphModule,
    "./registry": registry,
    "./runs": new Proxy({
      getCanvasRun: async () => structuredClone(canvasRunFixture),
      prepareCanvasRunFromGraph: (input) => ({
        id: input.id,
        graph: structuredClone(input.graph),
        targetNodeIds: structuredClone(input.targetNodeIds),
        batchContext: structuredClone(input.batchContext),
        createdAt: input.createdAt,
      }),
      retryCanvasNode: async (runId, nodeId) => { retriedNode = { runId, nodeId }; },
    }, { get: (target, key) => target[key] || emptyAsync }),
    "./scheduler-v2": schedulerV2,
    "./types": require(path.join(temp, "types.js")),
    "./workflows": new Proxy({
      getCanvasWorkflow: async () => structuredClone(workflowRecord),
    }, { get: (target, key) => target[key] || emptyAsync }),
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

  assert.deepEqual(
    [...selection.selectIdRange(["asset-1", "asset-2", "asset-3", "asset-4"], new Set(["asset-1"]), "asset-2", "asset-4", false)],
    ["asset-2", "asset-3", "asset-4"],
    "scheduler image Shift selection must replace the selection with the ordered loaded range",
  );
  assert.deepEqual(
    [...selection.selectIdRange(["asset-1", "asset-2", "asset-3", "asset-4"], new Set(["asset-1"]), "asset-2", "asset-4", true)],
    ["asset-1", "asset-2", "asset-3", "asset-4"],
    "scheduler image Ctrl/Cmd+Shift selection must union the ordered range",
  );

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

  const v2Definition = {
    parameters: [
      {
        id: "person",
        name: "人物",
        scope: "main",
        valueType: "image",
        source: { mode: "fixed", values: [{ id: "person-1", url: "/person.jpg", name: "person" }] },
        expansion: "fixed",
        binding: { nodeId: "scene", fieldKey: "urls" },
      },
      {
        id: "angle",
        name: "车辆角度",
        scope: "child",
        valueType: "image",
        source: { mode: "manual-list", values: ["front", "side", "rear"].map((id) => ({ id, url: `/${id}.jpg`, name: id })) },
        expansion: "each",
        binding: { nodeId: "vehicle", fieldKey: "urls" },
      },
    ],
    expansion: { main: "cartesian", child: "cartesian" },
    childResult: { nodeId: "image", outputPort: "images", artifactKind: "images" },
    mainTargetNodeId: "content",
    aggregationPolicy: "at-least-one",
  };
  schedulerV2.validateCanvasScheduleV2Definition(graph, v2Definition);
  let v2Id = 0;
  const v2Expansion = schedulerV2.expandCanvasScheduleV2(v2Definition.parameters, v2Definition, createdAtForV2(), (level) => `${level}-${++v2Id}`);
  assert.equal(v2Expansion.totalMainTasks, 1, "fixed main parameters must create one main task");
  assert.equal(v2Expansion.totalChildTasks, 3, "each vehicle angle must create one child task");
  assert.equal(v2Expansion.mainTasks[0].childTasks.length, 3);
  assert.throws(
    () => schedulerV2.expandCanvasScheduleV2([
      v2Definition.parameters[0],
      { ...v2Definition.parameters[1], valueType: "text", source: { mode: "manual-list", values: Array.from({ length: 2_001 }, (_, index) => `value-${index}`) } },
    ], v2Definition),
    /exceeding the limit of 2000/,
    "the expanded child total must still enforce the 2,000-task limit",
  );
  assert.throws(
    () => schedulerV2.expandCanvasScheduleV2([
      { ...v2Definition.parameters[0], expansion: "each", source: { mode: "manual-list", values: [
        { id: "person-1", url: "/person-1.jpg", name: "person 1" },
        { id: "person-2", url: "/person-2.jpg", name: "person 2" },
      ] } },
      { ...v2Definition.parameters[1], valueType: "text", source: { mode: "manual-list", values: Array.from({ length: 1_001 }, (_, index) => `value-${index}`) } },
    ], v2Definition),
    /expands to 2002 child tasks, exceeding the limit of 2000/,
    "the 2,000-task limit must accumulate child counts across main tasks",
  );
  const injectedV2Graph = schedulerV2.applyCanvasScheduleV2Parameters(graph, v2Definition.parameters, {
    ...v2Expansion.mainTasks[0].parameterValues,
    ...v2Expansion.mainTasks[0].childTasks[1].parameterValues,
  });
  assert.deepEqual(injectedV2Graph.nodes.find((item) => item.id === "scene").config.urls, ["/person.jpg"]);
  assert.deepEqual(injectedV2Graph.nodes.find((item) => item.id === "vehicle").config.urls, ["/side.jpg"]);
  schedulerV2.validateCanvasScheduleV2ExpandedGraph(injectedV2Graph, v2Definition);
  const imageGroupParameter = {
    ...v2Definition.parameters[0],
    id: "reference-group",
    name: "参考图片组",
    valueType: "image-group",
    source: { mode: "manual-list", values: [[
      { id: "group-a", url: "/group-a.jpg", name: "group a" },
      { id: "group-b", url: "/group-b.jpg", name: "group b" },
    ]] },
  };
  const imageGroupGraph = schedulerV2.applyCanvasScheduleV2Parameters(graph, [imageGroupParameter], {
    "reference-group": imageGroupParameter.source.values[0],
  });
  assert.deepEqual(imageGroupGraph.nodes.find((item) => item.id === "scene").config.urls, ["/group-a.jpg", "/group-b.jpg"], "image groups must inject as one ordered value");
  const aggregateV2Graph = schedulerV2.createCanvasScheduleV2AggregateGraph(graph, v2Definition, [
    { kind: "images", items: [{ url: "/front-result.jpg" }] },
    { kind: "images", items: [{ url: "/side-result.jpg" }] },
  ]);
  assert.equal(aggregateV2Graph.nodes.find((item) => item.id === "image").type, "input.images");
  assert.deepEqual(aggregateV2Graph.nodes.find((item) => item.id === "image").config.urls, ["/front-result.jpg", "/side-result.jpg"]);
  assert.equal(aggregateV2Graph.edges.some((item) => item.target === "image"), false, "V2 aggregation must prune paid child-result ancestors");
  schedulerV2.validateCanvasScheduleV2AggregateGraph(graph, v2Definition);
  const blockedAggregateGraph = structuredClone(graph);
  blockedAggregateGraph.edges = blockedAggregateGraph.edges.filter((item) => !(item.source === "body" && item.target === "content"));
  assert.throws(() => schedulerV2.validateCanvasScheduleV2AggregateGraph(blockedAggregateGraph, v2Definition), /正文/);
  const zipParameters = [
    { ...v2Definition.parameters[0], id: "copy-a", name: "A", valueType: "text", binding: { nodeId: "prompt-scene", fieldKey: "text" }, expansion: "each", source: { mode: "manual-list", values: ["a1", "a2"] } },
    { ...v2Definition.parameters[0], id: "copy-b", name: "B", valueType: "text", binding: { nodeId: "prompt-mod", fieldKey: "text" }, expansion: "each", source: { mode: "manual-list", values: ["b1", "b2"] } },
  ];
  assert.deepEqual(schedulerV2.expandCanvasParameterAssignments(zipParameters, "main", "zip"), [{ "copy-a": "a1", "copy-b": "b1" }, { "copy-a": "a2", "copy-b": "b2" }]);
  assert.throws(() => schedulerV2.expandCanvasParameterAssignments([{ ...zipParameters[1], source: { mode: "manual-list", values: ["b1"] } }, zipParameters[0]], "main", "zip"), /equal value counts/);
  const zipRangeParameters = [
    { ...zipParameters[0], expansion: "random", sampleCount: { mode: "range", min: 2, max: 4 }, source: { mode: "manual-list", values: ["a1", "a2", "a3", "a4"] } },
    { ...zipParameters[1], expansion: "random", sampleCount: { mode: "range", min: 3, max: 4 }, source: { mode: "manual-list", values: ["b1", "b2", "b3", "b4"] } },
  ];
  const zippedRange = schedulerV2.expandCanvasParameterAssignments(zipRangeParameters, "main", "zip", () => 0);
  assert.equal(zippedRange.length, 3, "zip parameters must choose one shared count from the range intersection");
  assert.ok(zippedRange.every((assignment) => assignment["copy-a"] && assignment["copy-b"]));
  assert.equal(
    schedulerV2.expandCanvasParameterAssignments([
      { ...zipParameters[0], source: { mode: "manual-list", values: ["a1", "a2", "a3"] } },
      { ...zipRangeParameters[1], sampleCount: { mode: "range", min: 2, max: 4 } },
    ], "main", "zip", () => 0.99).length,
    3,
    "full expansion length must constrain a compatible random zip range",
  );
  const cartesianRandomValues = [0, 0, 0, 0, 1, 0, 0, 0];
  const cartesianRanges = schedulerV2.expandCanvasParameterAssignments([
    { ...zipRangeParameters[0], sampleCount: { mode: "range", min: 2, max: 3 } },
    { ...zipRangeParameters[1], sampleCount: { mode: "range", min: 3, max: 4 } },
  ], "main", "cartesian", () => cartesianRandomValues.shift() ?? 0);
  assert.equal(cartesianRanges.length, 8, "cartesian random parameters must choose their counts independently before multiplying");
  assert.equal(new Set(cartesianRanges.map((assignment) => assignment["copy-a"])).size, 2);
  assert.equal(new Set(cartesianRanges.map((assignment) => assignment["copy-b"])).size, 4);
  assert.throws(
    () => schedulerV2.expandCanvasParameterAssignments([
      { ...zipRangeParameters[0], sampleCount: { mode: "exact", value: 2 } },
      { ...zipRangeParameters[1], sampleCount: { mode: "exact", value: 3 } },
    ], "main", "zip"),
    /equal value counts or overlapping random ranges/,
    "conflicting exact zip counts must fail preflight expansion",
  );
  const randomCandidates = ["a", "a", "b", "c"];
  assert.deepEqual(
    schedulerV2.sampleUniqueCanvasScheduleParameterValues(randomCandidates, 2, "随机参数", () => 0),
    ["b", "c"],
    "random parameter sampling must deduplicate and use the injected random source",
  );
  assert.deepEqual(randomCandidates, ["a", "a", "b", "c"], "random parameter sampling must not mutate source values");
  assert.equal(schedulerV2.selectCanvasScheduleSampleCount({ mode: "exact", value: 3 }, "固定抽样", () => 0), 3);
  assert.equal(schedulerV2.selectCanvasScheduleSampleCount({ mode: "range", min: 2, max: 4 }, "范围抽样", () => 0), 2, "range sampling must include its minimum");
  assert.equal(schedulerV2.selectCanvasScheduleSampleCount({ mode: "range", min: 2, max: 4 }, "范围抽样", () => 1), 4, "range sampling must include its maximum");
  const duplicateAssetSnapshots = [
    { id: "asset-a", url: "/a.jpg", name: "first snapshot" },
    { id: "asset-a", url: "/a.jpg", name: "updated snapshot" },
    { id: "asset-b", url: "/b.jpg", name: "second asset" },
  ];
  const sampledAssets = schedulerV2.sampleUniqueCanvasScheduleParameterValues(duplicateAssetSnapshots, 2, "素材参数", () => 0);
  assert.deepEqual(sampledAssets.map((asset) => asset.id), ["asset-b", "asset-a"], "record snapshots must deduplicate by stable id");
  assert.equal(sampledAssets[1].name, "first snapshot", "deduplication must preserve the first ordered snapshot");
  const duplicateImageGroups = [
    [duplicateAssetSnapshots[0], duplicateAssetSnapshots[2]],
    [duplicateAssetSnapshots[1], duplicateAssetSnapshots[2]],
    [duplicateAssetSnapshots[2], duplicateAssetSnapshots[0]],
  ];
  const sampledImageGroups = schedulerV2.sampleUniqueCanvasScheduleParameterValues(duplicateImageGroups, 2, "图片组参数", () => 0);
  assert.deepEqual(sampledImageGroups.map((group) => group.map((asset) => asset.id)), [["asset-b", "asset-a"], ["asset-a", "asset-b"]], "image groups must deduplicate by their ordered stable asset ids");
  assert.equal(sampledImageGroups[1][0].name, "first snapshot", "image-group deduplication must preserve the first frozen group snapshot");
  assert.throws(
    () => schedulerV2.sampleUniqueCanvasScheduleParameterValues(duplicateImageGroups, 3, "图片组参数", () => 0),
    /only 2 unique candidate values are available/,
  );
  assert.throws(
    () => schedulerV2.sampleUniqueCanvasScheduleParameterValues(randomCandidates, 4, "随机参数", () => 0),
    /only 3 unique candidate values are available/,
  );
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2Definition(graph, {
      ...v2Definition,
      parameters: [{ ...v2Definition.parameters[1], expansion: "random" }],
    }),
    /random count must be a positive integer/,
  );
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2Definition(graph, {
      ...v2Definition,
      parameters: [{ ...v2Definition.parameters[1], expansion: "random", sampleCount: { mode: "range", min: 4, max: 2 } }],
    }),
    /minimum cannot exceed maximum/,
  );
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2Definition(graph, {
      ...v2Definition,
      parameters: [v2Definition.parameters[0], { ...v2Definition.parameters[1], binding: v2Definition.parameters[0].binding }],
    }),
    /another parameter already binds the same node field/,
    "duplicate field bindings must fail before expansion",
  );
  assert.throws(
    () => schedulerV2.expandCanvasParameterAssignments([{
      ...v2Definition.parameters[1],
      expansion: "random",
      sampleCount: { mode: "range", min: 2, max: 4 },
    }], "child", "cartesian", () => 0),
    /only 3 unique candidate values are available; cannot randomly select 4/,
    "range capacity must validate the configured maximum before sampling",
  );

  const perMainParameters = [
    {
      ...v2Definition.parameters[0],
      expansion: "each",
      source: { mode: "manual-list", values: ["person-1", "person-2", "person-3"].map((id) => ({ id, url: `/${id}.jpg`, name: id })) },
    },
    {
      ...v2Definition.parameters[1],
      expansion: "random",
      sampleCount: { mode: "range", min: 2, max: 4 },
      source: { mode: "manual-list", values: ["front", "side", "rear", "detail"].map((id) => ({ id, url: `/${id}.jpg`, name: id })) },
    },
  ];
  const perMainRandomValues = [0, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0];
  const perMainExpansion = schedulerV2.expandCanvasScheduleV2(
    perMainParameters,
    v2Definition,
    createdAtForV2(),
    (level) => `${level}-per-main-${++v2Id}`,
    () => perMainRandomValues.shift() ?? 0,
  );
  assert.deepEqual(perMainExpansion.mainTasks.map((main) => main.childTasks.length), [2, 3, 4], "each main task must independently choose a range count");
  for (const main of perMainExpansion.mainTasks) {
    const ids = main.childTasks.map((child) => child.parameterValues.angle.id);
    assert.equal(new Set(ids).size, ids.length, "one main task must sample child values without replacement");
  }
  const firstIds = new Set(perMainExpansion.mainTasks[0].childTasks.map((child) => child.parameterValues.angle.id));
  assert.ok(perMainExpansion.mainTasks[1].childTasks.some((child) => firstIds.has(child.parameterValues.angle.id)), "different main tasks may reuse child candidates");
  const mainRandomExpansion = schedulerV2.expandCanvasScheduleV2([
    {
      ...perMainParameters[0],
      expansion: "random",
      sampleCount: { mode: "exact", value: 2 },
    },
    v2Definition.parameters[1],
  ], v2Definition, createdAtForV2(), (level) => `${level}-main-random-${++v2Id}`, () => 0);
  assert.equal(mainRandomExpansion.mainTasks.length, 2, "main random parameters must be sampled once for the whole preview");
  assert.equal(new Set(mainRandomExpansion.mainTasks.map((main) => main.parameterValues.person.id)).size, 2, "main preview sampling must be without replacement");
  assert.ok(mainRandomExpansion.mainTasks.every((main) => main.childTasks.length === 3), "sampled main values must broadcast to their independently expanded children");
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
  const copyCandidates = ["a", "b", "c", "d"].map((id) => ({ id, title: id, body: `${id} body`, tags: [], updatedAt: `${id} updated` }));
  const sampledCopies = scheduler.assignCanvasScheduleCopies(copyCandidates, 3, "测试批次", () => 0);
  assert.deepEqual(sampledCopies.map((copy) => copy.id), ["b", "c", "d"], "copy assignment must use the injected random source");
  assert.equal(new Set(sampledCopies.map((copy) => copy.id)).size, 3, "copy sampling must be without replacement");
  assert.deepEqual(copyCandidates.map((copy) => copy.id), ["a", "b", "c", "d"], "copy sampling must not mutate the candidate pool");
  assert.throws(
    () => scheduler.assignCanvasScheduleCopies(copyCandidates.slice(0, 1), 2, "测试批次", () => 0),
    /测试批次: 文案池当前可用 1 篇，本批次需要 2 篇/,
  );

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
    /left\.title\.localeCompare\(right\.title, "zh-CN"\) \|\| left\.id\.localeCompare\(right\.id\)/,
    "Copy pools must use stable title/id ordering.",
  );

  const account = { id: "owner", displayName: "Owner", role: "operator" };
  const createdAt = "2026-07-29T00:00:00.000Z";
  libraryAssetsByRole = {
    reference: [
      { id: "scene-1", role: "reference", publicUrl: "/scene-1.jpg", name: "scene 1", mimeType: "image/jpeg" },
      { id: "scene-2", role: "reference", publicUrl: "/scene-2.jpg", name: "scene 2", mimeType: "image/jpeg" },
    ],
    vehicle: [{ id: "vehicle-1", role: "vehicle", publicUrl: "/vehicle-1.jpg", name: "vehicle 1", mimeType: "image/jpeg" }],
  };
  copyEntries = [{ id: "copy-1", title: "Only copy", body: "Only body", tags: ["ev"], updatedAt: createdAt }];
  workflowRecord = { id: "workflow-1", name: "Workflow", revision: 3, ownerUserId: account.id, ownerDisplayName: account.displayName, graph: copyGraph };
  storedSchedule = {
    id: "schedule-1",
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    name: "Schedule",
    revision: 1,
    workflowId: workflowRecord.id,
    workflowRevision: workflowRecord.revision,
    status: "draft",
    batches: [{
      id: "batch-1",
      name: "批次 1",
      strategy: "input-1",
      sceneFilter: { mode: "manual", assetIds: ["scene-1", "scene-2"], search: "", tags: [] },
      sceneCount: 2,
      vehicleFilter: { mode: "manual", assetIds: ["vehicle-1"], search: "", tags: [] },
      vehicleCountMin: 1,
      vehicleCountMax: 1,
      copyFilter: { mode: "manual", entryIds: ["copy-1"], search: "", tags: [] },
      status: "draft",
      contentTasks: [],
      createdAt,
      updatedAt: createdAt,
    }],
    totalContentTasks: 0,
    totalImageTasks: 0,
    createdAt,
    updatedAt: createdAt,
  };
  savedSchedule = undefined;
  await assert.rejects(
    scheduler.preflightCanvasSchedule(storedSchedule.id, account, storedSchedule.revision),
    /批次 1: 文案池当前可用 1 篇，本批次需要 2 篇/,
  );
  assert.equal(savedSchedule, undefined, "insufficient copy capacity must fail before saving a preview");

  copyEntries = ["1", "2", "3"].map((id) => ({ id: `copy-${id}`, title: `Copy ${id}`, body: `Body ${id}`, tags: ["ev"], updatedAt: createdAt }));
  storedSchedule.batches[0].copyFilter.entryIds = copyEntries.map((entry) => entry.id);
  const preview = await scheduler.preflightCanvasSchedule(storedSchedule.id, account, storedSchedule.revision);
  assert.equal(new Set(preview.batches[0].contentTasks.map((task) => task.copy.id)).size, 2, "preflight copies must be unique within the batch");

  copyEntries = copyEntries.map((entry) => ({ ...entry, title: `Resampled ${entry.title}`, updatedAt: "2026-07-29T01:00:00.000Z" }));
  const wholeBatch = await scheduler.resampleCanvasSchedule(preview.id, account, { revision: preview.revision, batchId: "batch-1" });
  const wholeCopies = wholeBatch.batches[0].contentTasks.map((task) => task.copy);
  assert.equal(new Set(wholeCopies.map((copy) => copy.id)).size, 2, "whole-batch resampling must keep copy ids unique");
  assert.ok(wholeCopies.every((copy) => copy.title.startsWith("Resampled ")), "whole-batch resampling must resolve fresh copy snapshots");

  const callsBeforeSingleResample = copyListCalls;
  copyEntries = copyEntries.map((entry) => ({ ...entry, title: `Changed ${entry.title}`, updatedAt: "2026-07-29T02:00:00.000Z" }));
  const singleContentId = wholeBatch.batches[0].contentTasks[0].id;
  const singleContent = await scheduler.resampleCanvasSchedule(wholeBatch.id, account, { revision: wholeBatch.revision, batchId: "batch-1", contentTaskId: singleContentId });
  assert.equal(copyListCalls, callsBeforeSingleResample, "single-content resampling must not reread the copy library");
  assert.deepEqual(
    singleContent.batches[0].contentTasks.map((task) => task.copy),
    wholeCopies,
    "single-content resampling must preserve every frozen copy snapshot",
  );
  createdSchedule = undefined;
  storedSchedule = singleContent;
  const convertedV2 = await scheduler.convertCanvasScheduleToV2(storedSchedule.id, account);
  assert.equal(convertedV2.definition.parameters.find((parameter) => parameter.name === "主任务图片").binding.fieldKey, "urls");
  assert.equal(convertedV2.definition.parameters.find((parameter) => parameter.name === "子任务图片").binding.fieldKey, "urls");
  assert.equal(createdSchedule.id, convertedV2.id, "V1 conversion must persist a separate V2 draft");

  const randomDefinition = structuredClone(v2Definition);
  randomDefinition.parameters[1].expansion = "random";
  randomDefinition.parameters[1].randomCount = 2;
  randomDefinition.parameters[1].source.values = [
    randomDefinition.parameters[1].source.values[0],
    ...randomDefinition.parameters[1].source.values,
  ];
  storedSchedule = {
    id: "schedule-v2-random",
    schemaVersion: 2,
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    name: "V2 random schedule",
    revision: 1,
    workflowId: workflowRecord.id,
    workflowRevision: workflowRecord.revision,
    status: "draft",
    batches: [],
    definition: randomDefinition,
    mainTasks: [],
    totalMainTasks: 0,
    totalChildTasks: 0,
    totalContentTasks: 0,
    totalImageTasks: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const randomPreview = await scheduler.preflightCanvasSchedule(storedSchedule.id, account, storedSchedule.revision);
  assert.deepEqual(randomPreview.mainTasks[0].childTasks.map((child) => Object.keys(child.parameterValues)), [["angle"], ["angle"]]);
  const randomAngleIds = randomPreview.mainTasks[0].childTasks.map((child) => child.parameterValues.angle.id);
  assert.equal(randomAngleIds.length, 2, "user random count must control expanded child task count");
  assert.equal(new Set(randomAngleIds).size, 2, "one V2 preview must sample parameter values without replacement");
  assert.deepEqual(randomPreview.definition.parameters[1].sampleCount, { mode: "exact", value: 2 }, "legacy randomCount must normalize to exact sampleCount on a new preview");
  assert.equal("randomCount" in randomPreview.definition.parameters[1], false, "newly frozen definitions must not persist the legacy randomCount field");
  const legacyReady = {
    ...randomPreview,
    status: "ready",
    definition: structuredClone(randomDefinition),
    mainTasks: structuredClone(randomPreview.mainTasks),
  };
  legacyReady.previewRevision = v2PreviewFingerprint(legacyReady.definition, legacyReady.mainTasks);
  storedSchedule = legacyReady;
  launchedSchedule = undefined;
  launchedRuns = undefined;
  const legacyLaunch = await scheduler.launchCanvasSchedule(storedSchedule.id, account, {
    revision: storedSchedule.revision,
    previewRevision: storedSchedule.previewRevision,
  });
  assert.equal(legacyLaunch.status, "queued", "a frozen legacy randomCount preview must launch without resampling");
  assert.equal(launchedRuns.length, 2, "legacy launch must use the already frozen child assignments");
  assert.equal(launchedSchedule.definition.parameters[1].randomCount, 2, "launch must not rewrite an existing frozen definition");
  assert.equal("sampleCount" in launchedSchedule.definition.parameters[1], false, "launch must preserve the legacy preview fingerprint shape");

  storedSchedule = legacyReady;
  createdSchedule = undefined;
  const duplicatedLegacyV2 = await scheduler.duplicateCanvasSchedule(storedSchedule.id, account);
  const duplicatedRandomParameter = duplicatedLegacyV2.definition.parameters.find((parameter) => parameter.id === "angle");
  assert.deepEqual(duplicatedRandomParameter.sampleCount, { mode: "exact", value: 2 }, "new V2 copies must normalize legacy randomCount");
  assert.equal("randomCount" in duplicatedRandomParameter, false, "new V2 copies must persist only sampleCount");
  storedSchedule = {
    ...randomPreview,
    status: "draft",
    definition: { ...randomDefinition, parameters: randomDefinition.parameters.map((parameter) => parameter.id === "angle" ? { ...parameter, randomCount: undefined, sampleCount: { mode: "range", min: 2, max: 4 } } : parameter) },
    mainTasks: [],
  };
  savedSchedule = undefined;
  await assert.rejects(
    scheduler.preflightCanvasSchedule(storedSchedule.id, account, storedSchedule.revision),
    /only 3 unique candidate values are available; cannot randomly select 4/,
  );
  assert.equal(savedSchedule, undefined, "insufficient random parameter capacity must fail before saving a preview");

  const postId = "generated-post-1";
  generatedPosts = new Map([[postId, {
    id: postId,
    ownerUserId: account.id,
    status: "reviewed",
    imageUrls: ["/old-result.jpg"],
    updatedAt: "2026-07-29T02:30:00.000Z",
  }]]);
  canvasRunFixture = {
    run: { id: "child-run-1", steps: [{ nodeId: "failed-node" }] },
    nodeRuns: [{ nodeId: "failed-node", attempt: 1, status: "failed" }],
  };
  storedSchedule = {
    id: "schedule-v2",
    schemaVersion: 2,
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    name: "V2 schedule",
    revision: 1,
    workflowId: workflowRecord.id,
    workflowRevision: workflowRecord.revision,
    workflowSnapshot: graph,
    status: "partial",
    batches: [],
    definition: v2Definition,
    mainTasks: [{
      id: "main-1",
      parameterValues: {},
      status: "partial",
      mainRunId: "aggregate-run-1",
      generatedPostId: postId,
      generatedPostUpdatedAt: "2026-07-29T02:00:00.000Z",
      candidateFingerprint: "old-fingerprint",
      pendingCandidateSync: true,
      resultArtifacts: [{ kind: "socialPost", postId, post: structuredClone(generatedPosts.get(postId)) }],
      childTasks: [{
        id: "child-1",
        parameterValues: {},
        status: "failed",
        runId: "child-run-1",
        resultArtifacts: [{ kind: "images", items: [{ url: "/new-result.jpg" }] }],
        createdAt,
        updatedAt: createdAt,
      }],
      createdAt,
      updatedAt: createdAt,
    }],
    totalMainTasks: 1,
    totalChildTasks: 1,
    totalContentTasks: 1,
    totalImageTasks: 1,
    createdAt,
    updatedAt: createdAt,
  };
  const retriedV2 = await scheduler.retryCanvasScheduleV2ChildTask(storedSchedule.id, account, { mainTaskId: "main-1", childTaskId: "child-1" });
  assert.deepEqual(retriedNode, { runId: "child-run-1", nodeId: "failed-node" });
  assert.equal(retriedV2.mainTasks[0].mainRunId, "aggregate-run-1", "image-result retries must preserve an existing generated-post run");
  assert.equal(retriedV2.mainTasks[0].resultArtifacts[0].postId, postId, "image-result retries must preserve the existing review draft artifact");
  retriedV2.mainTasks[0].childTasks[0].resultArtifacts = [{ kind: "images", items: [{ url: "/new-result.jpg" }] }];
  retriedV2.mainTasks[0].pendingCandidateSync = true;
  storedSchedule = retriedV2;
  const acceptedV2 = await scheduler.acceptCanvasScheduleV2Candidates(storedSchedule.id, account, { mainTaskId: "main-1" });
  assert.deepEqual(generatedPosts.get(postId).imageUrls, ["/new-result.jpg"], "accepting V2 candidates must update the existing review draft");
  assert.equal(acceptedV2.mainTasks[0].pendingCandidateSync, false);
  assert.ok(acceptedV2.mainTasks[0].candidateFingerprint);
  assert.match(
    schedulerSource,
    /\(run\.run\.steps \|\| \[\]\)\.map\(\(step\) => latest\.get\(step\.nodeId\)\)/,
    "Image-child retry must prefer the earliest failed node in execution order instead of a downstream display failure.",
  );
  assert.match(
    schedulerSource,
    /const error = terminalRunStatuses\.has\(run\.status\) \? run\.error : undefined/,
    "Active image children must not expose stale terminal errors.",
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
  for (const action of ["preflight", "resample", "launch", "duplicate", "convert-v2", "pause", "resume", "cancel", "retry", "accept-candidates"]) {
    assert.ok(detailRoute.includes(`\"${action}\"`), `detail route is missing ${action}`);
  }
  const page = read("src/app/canvas/page.tsx");
  const css = read("src/app/globals.css");
  for (const snippet of ["CanvasScheduleCenter", "CanvasScheduleV2Editor", "CanvasScheduleParameterEditor", "ScheduleV2RuntimeTree", "节点名称", "人物场景预设", "ScheduleAssetFilterEditor", "多个标签，AND", "条件随机", "条件匹配", "批次内随机去重", "随机抽取", "固定个数", "随机范围", "每个主任务随机抽取", "确认并启动", "接受新增候选图", "onBlur={commitLabel}", "onSchedulerRoleChange", "insertSchedulerSkeleton", "Switch 输入", "画布绑定", "onSaveBindings", "saveQueueRef.current = saveQueueRef.current.then", "current?.id === schedule.id ? current.revision : schedule.revision"]) {
    assert.ok(page.includes(snippet), `Canvas UI is missing ${snippet}`);
  }
  for (const snippet of ["requestGenerationRef", "queryStringRef", "filterRef", "IntersectionObserver", "seenCursors", "selectIdRange", "全选当前筛选结果", "清空已选", "加载更多", "预览图片", "上一张图片", "下一张图片"]) {
    assert.ok(page.includes(snippet), `Canvas scheduler image source UI is missing ${snippet}`);
  }
  assert.ok(!page.includes("data.assets.slice(0, 30)"), "scheduler image sources must render the complete loaded page");
  assert.match(page, /while \(cursor\)[\s\S]*seenCursors\.has\(cursor\)/, "select-all must consume every cursor and reject repeats");
  assert.match(page, /latestFilter\.mode !== "manual"[\s\S]*onChange\(\{ \.\.\.latestFilter, assetIds: assets\.map\(\(asset\) => asset\.id\) \}\)/, "select-all must commit all matching ids once without restoring stale filter state");
  assert.match(page, /onChange\(\{ \.\.\.filter, assetIds: \[\] \}\)/, "bulk clear must update only asset ids");
  assert.match(page, /sequence: data\.assets\.map/, "preview navigation must use the ordered loaded image sequence");
  assert.match(page, /function canvasScheduleParameterImages\([\s\S]*"url" in value[\s\S]*seen\.has\(key\)/, "V2 preview must extract and deduplicate frozen image snapshots");
  assert.match(page, /function ScheduleV2PreviewImages\([\s\S]*onPreview\(\{ kind: "image"[\s\S]*sequence \}\)[\s\S]*<Image src=\{image\.url\}/, "V2 preview must render frozen images and open the existing sequence viewer");
  assert.match(page, /<ScheduleV2Preview schedule=\{schedule\} onPreview=\{onPreview\}/, "V2 schedule preview must receive the image preview command");
  assert.ok(css.includes(".canvas-schedule-panel"));
  assert.ok(css.includes(".canvas-scheduler-bindings"));
  assert.match(css, /\.canvas-schedule-asset-results \{[^}]*max-block-size:[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/, "scheduler image results must use a bounded independent scroll viewport");
  assert.ok(css.includes(".canvas-schedule-asset-preview"));
  assert.ok(css.includes(".canvas-schedule-v2-preview-images"));
  assert.ok(css.includes(".canvas-image-viewer-sequence-button"));
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
  assert.ok(
    /FLUXPOST_DISABLE_BACKGROUND_WORKERS = "1"[\s\S]*Start-Process/.test(baseline)
      || /\.trellis\/verification\/check\.mjs/.test(baseline.replaceAll("\\", "/")),
    "The baseline must keep the isolated smoke contract or delegate to the cross-platform baseline.",
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

function createdAtForV2() {
  return "2026-07-29T00:00:00.000Z";
}

function v2PreviewFingerprint(definition, mainTasks) {
  return createHash("sha256").update(JSON.stringify(canonicalize(definition, mainTasks))).digest("hex");
}

function canonicalize(definition, mainTasks) {
  return canonicalizeValue({ definition, mainTasks });
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalizeValue(item)]));
}
