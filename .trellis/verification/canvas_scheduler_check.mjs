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
let listedSchedules = [];
let canvasRunsById = new Map();
let nodeRunsByRunId = new Map();
let fannedOutRuns;
let sourceVideoResolveCalls = 0;
let sourceVideoSnapshots = [];
let visibleSourceVideoIds;

try {
  writeFileSync(path.join(temp, "toapis-image-api.js"), "exports.toApisImageRatios=['1:1'];exports.toApis4kImageRatios=['16:9'];", "utf8");
  writeFileSync(path.join(temp, "feishu-publish-mode.js"), "exports.feishuPublishModeOptions=[{value:'full',label:'full'},{value:'text',label:'text'},{value:'media',label:'media'}];exports.normalizeFeishuPublishMode=(value)=>value===undefined?'full':['full','text','media'].includes(value)?value:(()=>{throw new Error('invalid mode')})();", "utf8");
  for (const name of ["types", "node-utils", "source-video-contract", "video-loader", "save-images", "seedance-references", "subtitle-style", "subtitle-editor", "registry", "graph", "scheduler-skeleton", "scheduler-v2"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"').replace('"../feishu-publish-mode"', '"./feishu-publish-mode"');
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
    "../competitor-workbook": {
      freezeCompetitorWorkbook: async () => { throw new Error("Unexpected workbook read in generic scheduler checks."); },
    },
    "../database": new Proxy({
      createCanvasScheduleInDb: async (schedule) => {
        createdSchedule = structuredClone(schedule);
        return structuredClone(schedule);
      },
      getCanvasScheduleFromDb: async () => structuredClone(storedSchedule),
      getCanvasRunFromDb: async (runId) => {
        const run = canvasRunsById.get(runId);
        return run ? structuredClone(run) : undefined;
      },
      listCanvasNodeRunsFromDb: async (runId) => structuredClone(nodeRunsByRunId.get(runId) || []),
      launchCanvasScheduleInDb: async (schedule, _expectedRevision, runs) => {
        launchedSchedule = structuredClone(schedule);
        launchedRuns = structuredClone(runs);
      },
      fanOutCanvasScheduleV2ChildrenInDb: async (schedule, expectedRevision, runs) => {
        if (!storedSchedule || storedSchedule.revision !== expectedRevision) throw new Error("Canvas schedule revision conflict");
        fannedOutRuns = structuredClone(runs);
        storedSchedule = structuredClone(schedule);
        listedSchedules = [structuredClone(schedule)];
        return structuredClone(schedule);
      },
      listCanvasSchedulesFromDb: async () => structuredClone(listedSchedules),
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
    "../content-pool": new Proxy({
      getSourceItemsByIds: async (ids) => ids.filter((id) => !visibleSourceVideoIds || visibleSourceVideoIds.has(id)).map((id) => ({ id })),
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
        workflowRevision: input.workflow.revision,
        graph: structuredClone(input.graph),
        targetNodeIds: structuredClone(input.targetNodeIds),
        batchContext: structuredClone(input.batchContext),
        createdAt: input.createdAt,
      }),
      retryCanvasNode: async (runId, nodeId) => { retriedNode = { runId, nodeId }; },
    }, { get: (target, key) => target[key] || emptyAsync }),
    "./scheduler-v2": schedulerV2,
    "./source-video-contract": require(path.join(temp, "source-video-contract.js")),
    "./video-loader": require(path.join(temp, "video-loader.js")),
    "./source-video-service": {
      resolveCanvasSourceVideos: async () => {
        sourceVideoResolveCalls += 1;
        return structuredClone(sourceVideoSnapshots);
      },
    },
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
  const sharedGraph = {
    nodes: [
      node("shared-main", "input.images"),
      node("shared-child", "input.images"),
      node("shared-vision", "model.gpt-vision"),
      node("shared-select", "utility.image-select"),
      node("shared-result", "model.gpt-image"),
    ],
    edges: [
      edge("shared-main", "images", "shared-vision", "images"),
      edge("shared-main", "images", "shared-select", "images"),
      edge("shared-vision", "text", "shared-result", "prompt"),
      edge("shared-select", "images", "shared-result", "references"),
      edge("shared-child", "images", "shared-result", "references"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const sharedDefinition = {
    parameters: [
      {
        id: "shared-main-parameter",
        name: "Shared main image",
        scope: "main",
        valueType: "image",
        source: { mode: "fixed", values: [{ id: "shared-main-asset", url: "/shared-main.jpg", name: "shared main" }] },
        expansion: "fixed",
        binding: { nodeId: "shared-main", fieldKey: "urls" },
      },
      {
        id: "shared-child-parameter",
        name: "Shared child image",
        scope: "child",
        valueType: "image",
        source: { mode: "manual-list", values: ["front", "side", "rear"].map((id) => ({ id: `shared-child-${id}`, url: `/shared-child-${id}.jpg`, name: id })) },
        expansion: "each",
        binding: { nodeId: "shared-child", fieldKey: "urls" },
      },
    ],
    expansion: { main: "cartesian", child: "cartesian" },
    sharedOutputs: [
      { nodeId: "shared-vision", outputPort: "text", artifactKind: "text" },
      { nodeId: "shared-select", outputPort: "images", artifactKind: "images" },
    ],
    childResult: { nodeId: "shared-result", outputPort: "images", artifactKind: "images" },
    aggregationPolicy: "at-least-one",
  };
  schedulerV2.validateCanvasScheduleV2Definition(sharedGraph, sharedDefinition);
  schedulerV2.validateCanvasScheduleV2SharedGraph(sharedGraph, sharedDefinition);
  schedulerV2.validateCanvasScheduleV2Definition(sharedGraph, { ...sharedDefinition, sharedOutputs: undefined });
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2Definition(sharedGraph, { ...sharedDefinition, sharedOutputs: [sharedDefinition.sharedOutputs[0], sharedDefinition.sharedOutputs[0]] }),
    /duplicate node ports/,
    "the same shared node port must not be selected twice",
  );
  for (const [selection, message, label, extraNode] of [
    [{ nodeId: "shared-result", outputPort: "images", artifactKind: "images" }, /strictly upstream/, "child-result nodes"],
    [{ nodeId: "shared-orphan", outputPort: "text", artifactKind: "text" }, /strictly upstream/, "non-upstream nodes", node("shared-orphan", "model.gpt-text")],
    [{ nodeId: "shared-main", outputPort: "images", artifactKind: "images" }, /Input nodes/, "input nodes"],
    [{ nodeId: "shared-display", outputPort: "preview", artifactKind: "text" }, /Passive display nodes/, "passive display nodes", node("shared-display", "utility.display-any")],
    [{ nodeId: "shared-split", outputPort: "head", artifactKind: "text" }, /exactly one output/, "multi-output nodes", node("shared-split", "utility.text-split")],
    [{ nodeId: "shared-publish", outputPort: "job", artifactKind: "text" }, /External-write nodes/, "external-write nodes", node("shared-publish", "publish.feishu")],
    [{ nodeId: "shared-compose", outputPort: "post", artifactKind: "images" }, /must produce text, images, or videos/, "unsupported artifact nodes", node("shared-compose", "compose.social-post")],
  ]) {
    const validationGraph = extraNode ? { ...sharedGraph, nodes: [...sharedGraph.nodes, extraNode] } : sharedGraph;
    assert.throws(
      () => schedulerV2.validateCanvasScheduleV2Definition(validationGraph, { ...sharedDefinition, sharedOutputs: [selection] }),
      message,
      `${label} must not be accepted as shared outputs`,
    );
  }
  const childDependentSharedGraph = structuredClone(sharedGraph);
  childDependentSharedGraph.edges.push(edge("shared-child", "images", "shared-vision", "images"));
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2Definition(childDependentSharedGraph, sharedDefinition),
    /cannot include child-scoped parameter bindings/,
    "shared ancestors must not depend on child-scoped parameter bindings",
  );
  const disabledSharedGraph = structuredClone(sharedGraph);
  disabledSharedGraph.nodes.find((item) => item.id === "shared-vision").executionMode = "disabled";
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2Definition(disabledSharedGraph, sharedDefinition),
    /Disabled nodes cannot be shared outputs/,
    "disabled targets must fail validation before a shared run can complete without an artifact",
  );
  const blockedSharedGraph = structuredClone(sharedGraph);
  blockedSharedGraph.edges = blockedSharedGraph.edges.filter((item) => item.target !== "shared-vision");
  assert.throws(
    () => schedulerV2.validateCanvasScheduleV2SharedGraph(blockedSharedGraph, sharedDefinition),
    /requires input/,
    "shared-stage planning must fail before provider execution when a selected branch is blocked",
  );
  const sharedOutputArtifacts = {
    "shared-vision": { text: { kind: "text", value: "frozen visual analysis" } },
    "shared-select": { images: { kind: "images", items: [{ url: "/frozen-reference.jpg", width: 1200, height: 800 }] } },
  };
  const frozenSharedArtifacts = schedulerV2.extractCanvasScheduleV2SharedArtifacts(sharedOutputArtifacts, sharedDefinition.sharedOutputs);
  assert.deepEqual(frozenSharedArtifacts, [
    { ...sharedDefinition.sharedOutputs[0], artifact: sharedOutputArtifacts["shared-vision"].text },
    { ...sharedDefinition.sharedOutputs[1], artifact: sharedOutputArtifacts["shared-select"].images },
  ], "multiple shared outputs must retain their node, port, kind, and complete artifact identity");
  assert.throws(
    () => schedulerV2.extractCanvasScheduleV2SharedArtifacts({ ...sharedOutputArtifacts, "shared-select": {} }, sharedDefinition.sharedOutputs),
    /shared-select:images did not produce images/,
    "a missing selected output must fail shared-stage freezing",
  );
  assert.throws(
    () => schedulerV2.extractCanvasScheduleV2SharedArtifacts({ ...sharedOutputArtifacts, "shared-vision": { text: { kind: "images", items: [] } } }, sharedDefinition.sharedOutputs),
    /shared-vision:text did not produce text/,
    "a selected output with the wrong artifact kind must fail shared-stage freezing",
  );
  const childGraphWithSharedLiterals = schedulerV2.createCanvasScheduleV2ChildGraph(sharedGraph, frozenSharedArtifacts);
  assert.deepEqual(
    { type: childGraphWithSharedLiterals.nodes.find((item) => item.id === "shared-vision").type, config: childGraphWithSharedLiterals.nodes.find((item) => item.id === "shared-vision").config },
    { type: "input.text", config: { text: "frozen visual analysis" } },
    "text shared outputs must become literal text inputs in every child graph",
  );
  assert.deepEqual(
    { type: childGraphWithSharedLiterals.nodes.find((item) => item.id === "shared-select").type, config: childGraphWithSharedLiterals.nodes.find((item) => item.id === "shared-select").config },
    { type: "input.images", config: { urls: ["/frozen-reference.jpg"] } },
    "image shared outputs must become literal image inputs in every child graph",
  );
  assert.equal(childGraphWithSharedLiterals.edges.some((item) => item.target === "shared-vision" || item.target === "shared-select"), false, "literal replacement must prune every shared node incoming edge");
  assert.equal(childGraphWithSharedLiterals.edges.find((item) => item.source === "shared-vision")?.sourcePort, "text", "text consumers must be rewired to the literal output port");
  assert.equal(childGraphWithSharedLiterals.edges.find((item) => item.source === "shared-select")?.sourcePort, "images", "image consumers must be rewired to the literal output port");
  assert.deepEqual(schedulerV2.createCanvasScheduleV2ChildGraph(sharedGraph, []), sharedGraph, "an empty shared-output list must preserve historical child graphs");
  assert.equal(sharedGraph.nodes.find((item) => item.id === "shared-vision").type, "model.gpt-vision", "shared literalization must not mutate the workflow snapshot");
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
  const sourceVideoGraph = {
    nodes: [
      { ...node("source-video", "input.source-video"), executionMode: "disabled" },
      node("replacement-prompt", "input.text"),
      node("replacement-image", "model.gpt-image"),
      node("video-reconstruct", "utility.video-reconstruct"),
    ],
    edges: [
      edge("source-video", "videos", "video-reconstruct", "source"),
      edge("replacement-prompt", "text", "replacement-image", "prompt"),
      edge("replacement-image", "images", "video-reconstruct", "replacement"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const sourceVideoDefinition = {
    parameters: [
      {
        id: "source-video-parameter",
        name: "Source video",
        scope: "main",
        valueType: "source-video",
        source: { mode: "source-video-links", links: ["https://video.example/one.mp4", "https://video.example/two.mp4"], projectName: "Video rebuild" },
        expansion: "each",
        binding: { nodeId: "source-video", fieldKey: "sourceUrl" },
      },
      {
        id: "replacement-prompt-parameter",
        name: "Replacement prompt",
        scope: "main",
        valueType: "text",
        source: { mode: "manual-list", values: ["Prompt one", "Prompt two"] },
        expansion: "each",
        binding: { nodeId: "replacement-prompt", fieldKey: "text" },
      },
    ],
    expansion: { main: "zip", child: "cartesian" },
    sharedOutputs: [],
    childResult: { nodeId: "video-reconstruct", outputPort: "videos", artifactKind: "videos" },
    aggregationPolicy: "all",
  };
  sourceVideoSnapshots = sourceVideoDefinition.parameters[0].source.links.map((sourceUrl, index) => ({
    id: `source-video-${index + 1}`,
    projectName: "Video rebuild",
    sourceUrl,
    platform: "original",
    title: `Source ${index + 1}`,
    url: `/generated/canvas-tools/source-${index + 1}.mp4`,
    durationSeconds: 8 + index,
    width: 1280,
    height: 720,
    resolvedAt: "2026-08-11T00:00:00.000Z",
  }));
  sourceVideoResolveCalls = 0;
  visibleSourceVideoIds = new Set(sourceVideoSnapshots.map((snapshot) => snapshot.id));
  workflowRecord = { id: "workflow-source-video", name: "Video rebuild", revision: 1, ownerUserId: account.id, ownerDisplayName: account.displayName, graph: sourceVideoGraph };
  storedSchedule = {
    id: "schedule-source-video",
    schemaVersion: 2,
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    name: "Video rebuild batch",
    revision: 1,
    workflowId: workflowRecord.id,
    workflowRevision: workflowRecord.revision,
    status: "draft",
    batches: [],
    definition: sourceVideoDefinition,
    mainTasks: [],
    totalMainTasks: 0,
    totalChildTasks: 0,
    totalContentTasks: 0,
    totalImageTasks: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const sourceVideoPreview = await scheduler.preflightCanvasSchedule(storedSchedule.id, account, storedSchedule.revision);
  assert.equal(sourceVideoResolveCalls, 1, "source links must resolve exactly once during explicit preflight");
  assert.equal(sourceVideoPreview.mainTasks.length, 2, "default zip must pair two source videos with two prompts");
  assert.deepEqual(sourceVideoPreview.mainTasks.map((main) => main.parameterValues["replacement-prompt-parameter"]), ["Prompt one", "Prompt two"]);
  assert.deepEqual(sourceVideoPreview.mainTasks.map((main) => main.parameterValues["source-video-parameter"].id), ["source-video-1", "source-video-2"]);
  storedSchedule = structuredClone(sourceVideoPreview);
  launchedRuns = undefined;
  const sourceVideoLaunch = await scheduler.launchCanvasSchedule(storedSchedule.id, account, {
    revision: storedSchedule.revision,
    previewRevision: storedSchedule.previewRevision,
  });
  assert.equal(sourceVideoResolveCalls, 1, "launch must consume frozen source snapshots without resolving links again");
  assert.equal(launchedRuns.length, 2);
  assert.deepEqual(launchedRuns.map((run) => run.graph.nodes.find((item) => item.id === "source-video").config.sourceItemId), ["source-video-1", "source-video-2"]);
  assert.ok(launchedRuns.every((run) => run.graph.nodes.find((item) => item.id === "source-video").executionMode === "enabled"));
  assert.equal(sourceVideoLaunch.status, "queued");

  storedSchedule = structuredClone(sourceVideoPreview);
  visibleSourceVideoIds = new Set(["source-video-1"]);
  launchedRuns = undefined;
  await assert.rejects(
    scheduler.launchCanvasSchedule(storedSchedule.id, account, { revision: storedSchedule.revision, previewRevision: storedSchedule.previewRevision }),
    /Frozen source video was deleted or is no longer accessible: source-video-2/,
  );
  assert.equal(launchedRuns, undefined, "owner visibility failure must reject before creating any Canvas runs");
  visibleSourceVideoIds = undefined;

  const loaderVideos = [
    { id: "sha256:video-one", filename: "one.mp4", url: "/generated/canvas-video-uploads/one.mp4", mimeType: "video/mp4", bytes: 1024, durationSeconds: 4, width: 720, height: 1280, hasAudio: true, uploadedAt: "2026-08-20T00:00:00.000Z" },
    { id: "sha256:video-two", filename: "two.webm", url: "/generated/canvas-video-uploads/two.webm", mimeType: "video/webm", bytes: 2048, durationSeconds: 7, width: 1280, height: 720, hasAudio: false, uploadedAt: "2026-08-20T00:00:01.000Z" },
  ];
  const videoLoaderNode = { ...node("video-loader", "input.video-loader"), config: { videos: loaderVideos, selectedVideoId: loaderVideos[1].id } };
  const videoLoaderGraph = {
    nodes: [videoLoaderNode, node("video-frames", "utility.video-frames")],
    edges: [edge("video-loader", "videos", "video-frames", "videos")],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const videoLoaderDefinition = {
    parameters: [{
      id: "video-parameter",
      name: "Loaded video",
      scope: "main",
      valueType: "video",
      source: { mode: "video-loader-queue", nodeId: "video-loader" },
      expansion: "each",
      binding: { nodeId: "video-loader", fieldKey: "videos" },
    }],
    expansion: { main: "cartesian", child: "cartesian" },
    sharedOutputs: [],
    childResult: { nodeId: "video-frames", outputPort: "images", artifactKind: "images" },
    aggregationPolicy: "all",
  };
  workflowRecord = { id: "workflow-video-loader", name: "Video loader", revision: 1, ownerUserId: account.id, ownerDisplayName: account.displayName, graph: videoLoaderGraph };
  storedSchedule = {
    id: "schedule-video-loader", schemaVersion: 2, ownerUserId: account.id, ownerDisplayName: account.displayName,
    name: "Video loader batch", revision: 1, workflowId: workflowRecord.id, workflowRevision: 1, status: "draft",
    batches: [], definition: videoLoaderDefinition, mainTasks: [], totalMainTasks: 0, totalChildTasks: 0,
    totalContentTasks: 0, totalImageTasks: 0, createdAt, updatedAt: createdAt,
  };
  const videoLoaderPreview = await scheduler.preflightCanvasSchedule(storedSchedule.id, account, storedSchedule.revision);
  assert.deepEqual(videoLoaderPreview.mainTasks.map((main) => main.parameterValues["video-parameter"].id), loaderVideos.map((video) => video.id), "preflight must freeze the ordered loader queue, independent of the selected normal-run video");
  assert.deepEqual(videoLoaderPreview.workflowSnapshot.nodes.find((item) => item.id === "video-loader").config.videos.map((video) => video.id), loaderVideos.map((video) => video.id));
  storedSchedule = structuredClone(videoLoaderPreview);
  workflowRecord = { ...workflowRecord, revision: 2, graph: structuredClone(videoLoaderGraph) };
  workflowRecord.graph.nodes.find((item) => item.id === "video-loader").config = { videos: [], selectedVideoId: "" };
  launchedRuns = undefined;
  await scheduler.launchCanvasSchedule(storedSchedule.id, account, { revision: storedSchedule.revision, previewRevision: storedSchedule.previewRevision });
  assert.equal(launchedRuns.length, 2, "one frozen video must produce one task");
  assert.deepEqual(launchedRuns.map((run) => run.graph.nodes.find((item) => item.id === "video-loader").config.videos.map((video) => video.id)), [[loaderVideos[0].id], [loaderVideos[1].id]], "each task graph must contain exactly its frozen video");
  assert.ok(launchedRuns.every((run) => run.workflowRevision === 1), "runs must retain the preflight workflow revision after later edits");

  libraryAssetsByRole = {
    reference: [
      { id: "scene-1", role: "reference", publicUrl: "/scene-1.jpg", name: "scene 1", mimeType: "image/jpeg" },
      { id: "scene-2", role: "reference", publicUrl: "/scene-2.jpg", name: "scene 2", mimeType: "image/jpeg" },
    ],
    vehicle: [{ id: "vehicle-1", role: "vehicle", publicUrl: "/vehicle-1.jpg", name: "vehicle 1", mimeType: "image/jpeg" }],
  };
  copyEntries = [{ id: "copy-1", title: "Only copy", body: "Only body", tags: ["ev"], updatedAt: createdAt }];
  const sharedRuntimeExpansion = schedulerV2.expandCanvasScheduleV2(
    sharedDefinition.parameters,
    sharedDefinition,
    createdAt,
    (level) => `${level}-shared-runtime-${++v2Id}`,
  );
  workflowRecord = { id: "workflow-shared", name: "Shared workflow", revision: 1, ownerUserId: account.id, ownerDisplayName: account.displayName, graph: sharedGraph };
  storedSchedule = {
    id: "schedule-v2-shared",
    schemaVersion: 2,
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    name: "V2 shared schedule",
    revision: 1,
    workflowId: workflowRecord.id,
    workflowRevision: workflowRecord.revision,
    status: "ready",
    batches: [],
    definition: structuredClone(sharedDefinition),
    mainTasks: structuredClone(sharedRuntimeExpansion.mainTasks),
    totalMainTasks: sharedRuntimeExpansion.totalMainTasks,
    totalChildTasks: sharedRuntimeExpansion.totalChildTasks,
    totalContentTasks: sharedRuntimeExpansion.totalChildTasks,
    totalImageTasks: sharedRuntimeExpansion.totalChildTasks,
    createdAt,
    updatedAt: createdAt,
  };
  storedSchedule.previewRevision = v2PreviewFingerprint(storedSchedule.definition, storedSchedule.mainTasks);
  launchedRuns = undefined;
  const sharedLaunch = await scheduler.launchCanvasSchedule(storedSchedule.id, account, {
    revision: storedSchedule.revision,
    previewRevision: storedSchedule.previewRevision,
  });
  assert.equal(sharedLaunch.mainTasks[0].childTasks.length, 3, "the shared-stage fixture must retain all three child tasks");
  assert.equal(launchedRuns.length, 1, "one main task with multiple shared outputs must launch one shared run and no child runs");
  assert.equal(launchedRuns[0].id, `canvas-scheduler-v2-shared-${sharedLaunch.mainTasks[0].id}`);
  assert.deepEqual(launchedRuns[0].targetNodeIds, ["shared-vision", "shared-select"], "one shared run must target every selected output");
  assert.equal(launchedRuns[0].batchContext.phase, "shared");
  assert.equal(sharedLaunch.mainTasks[0].sharedStatus, "queued");
  assert.deepEqual(sharedLaunch.mainTasks[0].sharedArtifacts, []);
  assert.ok(sharedLaunch.mainTasks[0].childTasks.every((child) => child.status === "pending" && !child.runId), "child runs must stay unlaunched until shared artifacts freeze");
  storedSchedule = structuredClone(sharedLaunch);
  listedSchedules = [structuredClone(sharedLaunch)];
  const completedSharedRunId = sharedLaunch.mainTasks[0].sharedRunId;
  canvasRunsById.set(completedSharedRunId, { id: completedSharedRunId, status: "completed" });
  nodeRunsByRunId.set(completedSharedRunId, [
    { id: "shared-vision-attempt", nodeId: "shared-vision", attempt: 1, outputs: structuredClone(sharedOutputArtifacts) ["shared-vision"] },
    { id: "shared-select-attempt", nodeId: "shared-select", attempt: 1, outputs: structuredClone(sharedOutputArtifacts) ["shared-select"] },
  ]);
  const reconciledShared = await scheduler.getCanvasSchedule(storedSchedule.id, account);
  assert.equal(fannedOutRuns.length, 3, "shared completion must fan out every eligible child run");
  assert.equal(reconciledShared.mainTasks[0].childTasks.filter((child) => child.status === "queued" && child.runId).length, 3, "atomic fan-out must persist every eligible child run id");
  assert.equal(reconciledShared.mainTasks[0].childTasks.filter((child) => child.status === "pending" && !child.runId).length, 0, "eligible child work must not remain pending behind a schedule gate");
  assert.deepEqual(reconciledShared.mainTasks[0].sharedArtifacts, frozenSharedArtifacts, "reconciliation must persist the complete frozen shared artifact records");
  for (const childRun of fannedOutRuns) {
    assert.equal(childRun.batchContext.phase, "child");
    assert.deepEqual(
      { type: childRun.graph.nodes.find((item) => item.id === "shared-vision").type, config: childRun.graph.nodes.find((item) => item.id === "shared-vision").config },
      { type: "input.text", config: { text: "frozen visual analysis" } },
      "every fanned-out child must consume the frozen shared text literal",
    );
    assert.deepEqual(
      { type: childRun.graph.nodes.find((item) => item.id === "shared-select").type, config: childRun.graph.nodes.find((item) => item.id === "shared-select").config },
      { type: "input.images", config: { urls: ["/frozen-reference.jpg"] } },
      "every fanned-out child must consume the frozen shared image literal",
    );
  }
  listedSchedules = [];
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

  storedSchedule = { ...legacyReady, taskConcurrency: 1 };
  launchedRuns = undefined;
  await scheduler.launchCanvasSchedule(storedSchedule.id, account, {
    revision: storedSchedule.revision,
    previewRevision: storedSchedule.previewRevision,
  });
  assert.equal(launchedRuns.length, 2, "legacy task concurrency must not limit child admission");

  const fiveSlotReady = {
    ...legacyReady,
    id: "schedule-v2-five-slots",
    definition: structuredClone(v2Definition),
    mainTasks: structuredClone(v2Expansion.mainTasks),
    workflowSnapshot: structuredClone(graph),
    taskConcurrency: 5,
  };
  fiveSlotReady.previewRevision = v2PreviewFingerprint(fiveSlotReady.definition, fiveSlotReady.mainTasks);
  storedSchedule = fiveSlotReady;
  launchedRuns = undefined;
  await scheduler.launchCanvasSchedule(storedSchedule.id, account, {
    revision: storedSchedule.revision,
    previewRevision: storedSchedule.previewRevision,
  });
  assert.equal(launchedRuns.length, 3, "all available children must be admitted regardless of legacy task concurrency");

  storedSchedule = legacyReady;
  createdSchedule = undefined;
  const copyNameSources = [
    "V2 random schedule",
    "V2 random schedule 副本",
    "V2 random schedule 副本 副本",
    "V2 random schedule 副本 20260814-153045",
  ];
  const duplicatedNames = [];
  for (const name of copyNameSources) {
    storedSchedule = { ...legacyReady, name };
    const duplicated = await scheduler.duplicateCanvasSchedule(storedSchedule.id, account);
    const beijing = new Date(Date.parse(duplicated.createdAt) + 8 * 60 * 60 * 1000).toISOString();
    const taskNumber = `${beijing.slice(0, 10).replaceAll("-", "")}-${beijing.slice(11, 19).replaceAll(":", "")}`;
    assert.equal(duplicated.name, `V2 random schedule 副本 ${taskNumber}`, `duplicate name must normalize ${name}`);
    assert.equal(duplicated.name.match(/副本/g)?.length, 1, "duplicate name must contain one copy marker");
    duplicatedNames.push(duplicated);
  }
  storedSchedule = duplicatedNames[0];
  const duplicatedLegacyV2 = await scheduler.duplicateCanvasSchedule(storedSchedule.id, account);
  assert.match(duplicatedLegacyV2.name, /^V2 random schedule 副本 \d{8}-\d{6}$/);
  assert.equal(duplicatedLegacyV2.name.match(/副本/g)?.length, 1, "copying a new-style duplicate must not stack copy markers");
  storedSchedule = { ...legacyReady, name: "A".repeat(80) };
  const duplicatedLongName = await scheduler.duplicateCanvasSchedule(storedSchedule.id, account);
  assert.equal(duplicatedLongName.name.length, 80, "copy suffix must fit without rejecting a valid 80-character source name");
  assert.match(duplicatedLongName.name, /^A+ 副本 \d{8}-\d{6}$/);
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

  for (const sourceKind of ["generic", "excel"]) {
    const resultArtifact = { kind: "images", items: [{ url: `/${sourceKind}-success.jpg` }] };
    const policySchedule = {
      id: `schedule-policy-${sourceKind}`,
      schemaVersion: 2,
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
      name: `${sourceKind} aggregation policy`,
      revision: 1,
      workflowId: workflowRecord.id,
      workflowRevision: workflowRecord.revision,
      workflowSnapshot: graph,
      status: "running",
      batches: [],
      definition: { ...v2Definition, mainTargetNodeId: undefined, aggregationPolicy: "at-least-one" },
      mainTasks: [{
        id: `main-policy-${sourceKind}`,
        parameterValues: {},
        status: "running",
        resultArtifacts: [],
        ...(sourceKind === "excel" ? { workbookRow: { excelRowNumber: 2, title: "Workbook title", body: "Workbook body" } } : {}),
        childTasks: [
          { id: `child-${sourceKind}-success`, parameterValues: {}, status: "running", runId: `run-${sourceKind}-success`, resultArtifacts: [], ...(sourceKind === "excel" ? { workbookCard: { cardIndex: 1, text: "Card one" } } : {}), createdAt, updatedAt: createdAt },
          { id: `child-${sourceKind}-failed`, parameterValues: {}, status: "running", runId: `run-${sourceKind}-failed`, resultArtifacts: [], ...(sourceKind === "excel" ? { workbookCard: { cardIndex: 2, text: "Card two" } } : {}), createdAt, updatedAt: createdAt },
        ],
        createdAt,
        updatedAt: createdAt,
      }],
      totalMainTasks: 1,
      totalChildTasks: 2,
      totalContentTasks: 2,
      totalImageTasks: 2,
      createdAt,
      updatedAt: createdAt,
    };
    storedSchedule = structuredClone(policySchedule);
    listedSchedules = [structuredClone(storedSchedule)];
    canvasRunsById.set(`run-${sourceKind}-success`, { id: `run-${sourceKind}-success`, status: "completed" });
    canvasRunsById.set(`run-${sourceKind}-failed`, { id: `run-${sourceKind}-failed`, status: "failed", error: "expected failure" });
    nodeRunsByRunId.set(`run-${sourceKind}-success`, [{ nodeId: "image", attempt: 1, outputs: { images: structuredClone(resultArtifact) } }]);
    nodeRunsByRunId.set(`run-${sourceKind}-failed`, [{ nodeId: "image", attempt: 1, outputs: {} }]);
    const atLeastOne = await scheduler.getCanvasSchedule(storedSchedule.id, account);
    assert.equal(atLeastOne.mainTasks[0].status, "partial", `${sourceKind} at-least-one must produce a partial operational result`);
    assert.deepEqual(atLeastOne.mainTasks[0].resultArtifacts, [resultArtifact], `${sourceKind} at-least-one must retain successful child artifacts`);
    assert.equal(atLeastOne.mainTasks[0].resultArtifacts.some((artifact) => "imageBatch" in artifact), false, `${sourceKind} aggregation must not synthesize review policy metadata`);

    storedSchedule = { ...structuredClone(policySchedule), definition: { ...structuredClone(policySchedule.definition), aggregationPolicy: "all" } };
    listedSchedules = [structuredClone(storedSchedule)];
    const allRequired = await scheduler.getCanvasSchedule(storedSchedule.id, account);
    assert.equal(allRequired.mainTasks[0].status, "failed", `${sourceKind} all policy must reject a failed child`);
    assert.match(allRequired.mainTasks[0].error, /Not every child task completed successfully/);
  }
  assert.doesNotMatch(schedulerSource, /firstImage\.imageBatch\s*=/, "V2 reconciliation must not synthesize aggregate partial image batches");

  const postId = "generated-post-1";
  generatedPosts = new Map([[postId, {
    id: postId,
    ownerUserId: account.id,
    status: "reviewed",
    imageUrls: ["/old-result.jpg"],
    updatedAt: "2026-07-29T02:30:00.000Z",
  }]]);
  const partialImageEachNodeRun = {
    nodeId: "partial-image-each",
    nodeType: "model.gpt-image-each",
    attempt: 1,
    status: "partial",
    internalMetadata: { imageEach: { failed: 1, failedIndices: [2] } },
  };
  canvasRunFixture = {
    run: { id: "v1-partial-run", steps: [{ nodeId: "partial-image-each" }] },
    nodeRuns: [structuredClone(partialImageEachNodeRun)],
  };
  storedSchedule = {
    id: "schedule-v1-partial",
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    name: "V1 partial schedule",
    revision: 1,
    workflowId: workflowRecord.id,
    workflowRevision: workflowRecord.revision,
    status: "partial",
    batches: [{
      id: "batch-partial",
      name: "Partial batch",
      strategy: "input-1",
      status: "partial",
      contentTasks: [{
        id: "content-partial",
        status: "partial",
        imageTasks: [{ id: "image-partial", status: "partial", runId: "v1-partial-run", imageUrls: ["/kept.jpg"], createdAt, updatedAt: createdAt }],
        candidateImageUrls: ["/kept.jpg"],
        createdAt,
        updatedAt: createdAt,
      }],
      createdAt,
      updatedAt: createdAt,
    }],
    totalContentTasks: 1,
    totalImageTasks: 1,
    createdAt,
    updatedAt: createdAt,
  };
  retriedNode = undefined;
  await assert.rejects(
    scheduler.retryCanvasScheduleImageTask(storedSchedule.id, account, {
      batchId: "batch-partial",
      contentTaskId: "content-partial",
      imageTaskId: "image-partial",
    }),
    /Only failed image tasks can be retried/,
    "V1 partial image tasks must not expose a partial-specific retry",
  );
  storedSchedule.batches[0].contentTasks[0].imageTasks[0].status = "failed";
  canvasRunFixture = {
    run: { id: "v1-partial-run", steps: [{ nodeId: "failed-image-node" }] },
    nodeRuns: [{ nodeId: "failed-image-node", attempt: 1, status: "failed" }],
  };
  const retriedV1Failure = await scheduler.retryCanvasScheduleImageTask(storedSchedule.id, account, {
    batchId: "batch-partial",
    contentTaskId: "content-partial",
    imageTaskId: "image-partial",
  });
  assert.deepEqual(retriedNode, { runId: "v1-partial-run", nodeId: "failed-image-node" }, "ordinary V1 failures must remain retryable");
  assert.equal(retriedV1Failure.batches[0].contentTasks[0].imageTasks[0].status, "queued");

  canvasRunFixture = {
    run: { id: "child-run-1", steps: [{ nodeId: "partial-image-each" }] },
    nodeRuns: [structuredClone(partialImageEachNodeRun)],
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
        status: "partial",
        runId: "child-run-1",
        resultArtifacts: [{ kind: "images", items: [{ url: "/new-result.jpg" }], imageBatch: { status: "partial", total: 2, succeeded: 1, failed: 1, failedIndices: [2] } }],
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
  const rowRetrySchedule = structuredClone(storedSchedule);
  rowRetrySchedule.mainTasks[0].childTasks.push(
    { ...structuredClone(rowRetrySchedule.mainTasks[0].childTasks[0]), id: "child-failed", runId: "child-run-failed", status: "failed" },
    { ...structuredClone(rowRetrySchedule.mainTasks[0].childTasks[0]), id: "child-complete", runId: "child-run-complete", status: "completed" },
  );
  storedSchedule = rowRetrySchedule;
  const retriedV2Row = await scheduler.retryCanvasScheduleV2MainTask(storedSchedule.id, account, { mainTaskId: "main-1" });
  assert.deepEqual(
    retriedV2Row.mainTasks[0].childTasks.map((child) => [child.id, child.status, child.retryPending || false]),
    [["child-1", "pending", true], ["child-failed", "pending", true], ["child-complete", "completed", false]],
    "V2 row retry must retry failed and retryable partial children while leaving completed children unchanged",
  );

  storedSchedule = structuredClone(rowRetrySchedule);
  storedSchedule.mainTasks[0].childTasks = [storedSchedule.mainTasks[0].childTasks[0]];
  retriedNode = undefined;
  const retriedV2Partial = await scheduler.retryCanvasScheduleV2ChildTask(storedSchedule.id, account, { mainTaskId: "main-1", childTaskId: "child-1" });
  assert.equal(retriedNode, undefined, "a partial retry request must persist before scheduler reconciliation activates it");
  assert.equal(retriedV2Partial.mainTasks[0].childTasks[0].retryPending, true);
  assert.equal(retriedV2Partial.mainTasks[0].childTasks[0].status, "pending");
  assert.equal(retriedV2Partial.mainTasks[0].resultArtifacts[0].postId, postId, "partial retry must preserve the existing review draft artifact");
  storedSchedule = retriedV2Partial;
  listedSchedules = [structuredClone(retriedV2Partial)];
  canvasRunsById.set("child-run-1", { id: "child-run-1", status: "partial" });
  nodeRunsByRunId.set("child-run-1", [structuredClone(partialImageEachNodeRun)]);
  const activatedPartialRetry = await scheduler.getCanvasSchedule(storedSchedule.id, account);
  assert.deepEqual(retriedNode, { runId: "child-run-1", nodeId: "partial-image-each" }, "the scheduler must activate only the failed children in a partial per-image node");
  assert.equal(activatedPartialRetry.mainTasks[0].childTasks[0].status, "queued");
  assert.equal(activatedPartialRetry.mainTasks[0].childTasks[0].retryPending, false);

  storedSchedule = structuredClone(rowRetrySchedule);
  storedSchedule.mainTasks[0].childTasks = [storedSchedule.mainTasks[0].childTasks[1]];
  storedSchedule.mainTasks[0].childTasks[0].id = "child-1";
  storedSchedule.mainTasks[0].childTasks[0].runId = "child-run-1";
  canvasRunFixture = {
    run: { id: "child-run-1", steps: [{ nodeId: "failed-child-node" }] },
    nodeRuns: [{ nodeId: "failed-child-node", attempt: 1, status: "failed" }],
  };
  retriedNode = undefined;
  const retriedV2 = await scheduler.retryCanvasScheduleV2ChildTask(storedSchedule.id, account, { mainTaskId: "main-1", childTaskId: "child-1" });
  assert.equal(retriedNode, undefined, "a retry request must persist before scheduler reconciliation activates it");
  assert.equal(retriedV2.mainTasks[0].childTasks[0].retryPending, true);
  assert.equal(retriedV2.mainTasks[0].childTasks[0].status, "pending");
  assert.equal(retriedV2.mainTasks[0].mainRunId, "aggregate-run-1", "image-result retries must preserve an existing generated-post run");
  assert.equal(retriedV2.mainTasks[0].resultArtifacts[0].postId, postId, "image-result retries must preserve the existing review draft artifact");
  storedSchedule = retriedV2;
  listedSchedules = [structuredClone(retriedV2)];
  canvasRunsById.set("child-run-1", { id: "child-run-1", status: "failed" });
  nodeRunsByRunId.set("child-run-1", [{ nodeId: "failed-child-node", attempt: 1, status: "failed" }]);
  const activatedRetry = await scheduler.getCanvasSchedule(storedSchedule.id, account);
  assert.deepEqual(retriedNode, { runId: "child-run-1", nodeId: "failed-child-node" }, "the scheduler must activate ordinary failures without a schedule concurrency gate");
  assert.equal(activatedRetry.mainTasks[0].childTasks[0].retryPending, false);
  assert.equal(activatedRetry.mainTasks[0].childTasks[0].status, "queued");
  activatedRetry.mainTasks[0].childTasks[0].resultArtifacts = [{ kind: "images", items: [{ url: "/new-result.jpg" }] }];
  activatedRetry.mainTasks[0].pendingCandidateSync = true;
  storedSchedule = activatedRetry;
  listedSchedules = [];
  const acceptedV2 = await scheduler.acceptCanvasScheduleV2Candidates(storedSchedule.id, account, { mainTaskId: "main-1" });
  assert.deepEqual(generatedPosts.get(postId).imageUrls, ["/new-result.jpg"], "accepting V2 candidates must update the existing review draft");
  assert.equal(acceptedV2.mainTasks[0].pendingCandidateSync, false);
  assert.ok(acceptedV2.mainTasks[0].candidateFingerprint);
  canvasRunFixture = {
    run: { id: "generic-partial-run", steps: [{ nodeId: "generic-partial" }] },
    nodeRuns: [{ nodeId: "generic-partial", nodeType: "utility.display-any", attempt: 1, status: "partial" }],
  };
  storedSchedule = {
    ...acceptedV2,
    mainTasks: [{
      ...acceptedV2.mainTasks[0],
      childTasks: acceptedV2.mainTasks[0].childTasks.map((child) => ({ ...child, status: "partial", runId: "generic-partial-run" })),
    }],
  };
  await assert.rejects(
    scheduler.retryCanvasScheduleV2ChildTask(storedSchedule.id, account, { mainTaskId: "main-1", childTaskId: "child-1" }),
    /No failed per-image Canvas child is available to retry/,
    "generic partial child tasks must remain non-retryable",
  );
  canvasRunFixture = {
    run: { id: "ordinary-failure-partial-run", steps: [{ nodeId: "ordinary-failure" }] },
    nodeRuns: [{ nodeId: "ordinary-failure", nodeType: "model.gpt-text", attempt: 1, status: "failed" }],
  };
  storedSchedule.mainTasks[0].childTasks[0].runId = "ordinary-failure-partial-run";
  await assert.rejects(
    scheduler.retryCanvasScheduleV2ChildTask(storedSchedule.id, account, { mainTaskId: "main-1", childTaskId: "child-1" }),
    /No failed per-image Canvas child is available to retry/,
    "partial child tasks without failed per-image metadata must remain non-retryable even when another node failed",
  );
  canvasRunFixture = {
    run: { id: "shared-run-failed", steps: [{ nodeId: "shared-vision" }, { nodeId: "shared-select" }] },
    nodeRuns: [
      { nodeId: "shared-vision", attempt: 1, status: "completed" },
      { nodeId: "shared-select", attempt: 1, status: "failed" },
    ],
  };
  storedSchedule = {
    ...acceptedV2,
    status: "failed",
    mainTasks: [{
      ...acceptedV2.mainTasks[0],
      status: "failed",
      sharedRunId: "shared-run-failed",
      sharedStatus: "failed",
      sharedArtifacts: [],
      sharedError: "shared select failed",
      mainRunId: undefined,
      childTasks: acceptedV2.mainTasks[0].childTasks.map((child) => ({ ...child, status: "pending", runId: undefined, resultArtifacts: [] })),
    }],
  };
  retriedNode = undefined;
  const retriedShared = await scheduler.retryCanvasScheduleV2SharedTask(storedSchedule.id, account, { mainTaskId: "main-1" });
  assert.deepEqual(retriedNode, { runId: "shared-run-failed", nodeId: "shared-select" }, "shared retry must reuse the first failed node attempt in the original shared run");
  assert.equal(retriedShared.mainTasks[0].sharedStatus, "queued");
  assert.equal(retriedShared.mainTasks[0].sharedError, undefined);
  canvasRunFixture = {
    run: { id: "shared-run-partial", steps: [{ nodeId: "partial-image-each" }] },
    nodeRuns: [structuredClone(partialImageEachNodeRun)],
  };
  storedSchedule = {
    ...acceptedV2,
    status: "partial",
    mainTasks: [{
      ...acceptedV2.mainTasks[0],
      status: "partial",
      sharedRunId: "shared-run-partial",
      sharedStatus: "partial",
      sharedArtifacts: [],
      sharedError: undefined,
      mainRunId: undefined,
      childTasks: acceptedV2.mainTasks[0].childTasks.map((child) => ({ ...child, status: "pending", runId: undefined, resultArtifacts: [] })),
    }],
  };
  retriedNode = undefined;
  await assert.rejects(
    scheduler.retryCanvasScheduleV2SharedTask(storedSchedule.id, account, { mainTaskId: "main-1" }),
    /Only failed shared tasks can be retried/,
    "partial shared stages must not expose a partial-specific retry",
  );
  storedSchedule = {
    ...acceptedV2,
    mainTasks: [{ ...acceptedV2.mainTasks[0], sharedRunId: "shared-run-failed", sharedStatus: "failed", sharedArtifacts: [{ nodeId: "shared-select", outputPort: "images", artifactKind: "images", artifact: { kind: "images", items: [{ url: "/already-frozen.jpg" }] } }] }],
  };
  await assert.rejects(
    scheduler.retryCanvasScheduleV2SharedTask(storedSchedule.id, account, { mainTaskId: "main-1" }),
    /completed shared result cannot be rerun/,
    "successful frozen shared artifacts must never be rerun",
  );
  storedSchedule = {
    ...storedSchedule,
    mainTasks: [{ ...storedSchedule.mainTasks[0], sharedStatus: "failed", sharedArtifacts: [], childTasks: [{ ...storedSchedule.mainTasks[0].childTasks[0], runId: "already-launched-child" }] }],
  };
  await assert.rejects(
    scheduler.retryCanvasScheduleV2SharedTask(storedSchedule.id, account, { mainTaskId: "main-1" }),
    /completed shared result cannot be rerun/,
    "a shared stage must not rerun after child fan-out starts",
  );
  assert.match(
    schedulerSource,
    /function findFailedCanvasNode[\s\S]*orderedAttempts[\s\S]*\["failed", "blocked", "needs_config"\]/,
    "Image-child retry must preserve execution-order failure selection.",
  );
  assert.match(
    schedulerSource,
    /function findRetryableCanvasNode[\s\S]*findFailedCanvasNode[\s\S]*findRetryablePartialImageNode[\s\S]*nodeRun\.nodeType === "model\.gpt-image-each"[\s\S]*failedIndices/,
    "V2 partial retry must fall back only to per-image nodes with failed child metadata.",
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
  const sharedFanOutSource = database.slice(
    database.indexOf("export async function fanOutCanvasScheduleV2ChildrenInDb"),
    database.indexOf("export async function deferCanvasRunQueueItems"),
  );
  for (const snippet of ['await client.query("BEGIN")', 'await client.query("COMMIT")', 'await client.query("ROLLBACK")', "Canvas schedule revision conflict", "ON CONFLICT(id) DO NOTHING", "ON CONFLICT(run_id) DO NOTHING", "runSqliteTransaction", "INSERT OR IGNORE INTO canvas_runs", "INSERT OR IGNORE INTO canvas_run_queue"]) {
    assert.ok(sharedFanOutSource.includes(snippet), `shared child fan-out must atomically preserve ${snippet}`);
  }
  assert.match(
    schedulerSource,
    /runs\.push\(prepareCanvasRunFromGraph\(\{[\s\S]*targetNodeIds: sharedOutputs\.map\(\(output\) => output\.nodeId\)[\s\S]*phase: "shared"/,
    "each main task must combine every selected shared output into one shared Canvas run",
  );
  assert.match(
    schedulerSource,
    /await fanOutCanvasScheduleV2ChildrenInDb\(next, current\.revision, admissionRuns\)[\s\S]*ensureCanvasRunWorker\(\)[\s\S]*return;/,
    "eligible child fan-out must persist the revised schedule and runs before waking workers",
  );
  assert.match(
    schedulerSource,
    /flatMap\(\(main\) => \[main\.sharedRunId \|\| "", main\.mainRunId \|\| "", \.\.\.main\.childTasks/,
    "pause, resume, and cancellation run-id collection must include the shared stage",
  );
  assert.match(
    schedulerSource,
    /sharedOutputs: \(Array\.isArray\(value\.sharedOutputs\) \? value\.sharedOutputs : \[\]\)/,
    "historical V2 definitions must normalize missing shared outputs to an empty list",
  );
  assert.ok(schedulerSource.includes('return `canvas-scheduler-v2-shared-${mainTaskId}`'), "shared run ids must remain deterministic per main task");
  const collectionRoute = read("src/app/api/canvas/schedules/route.ts");
  const detailRoute = read("src/app/api/canvas/schedules/[id]/route.ts");
  assert.ok(collectionRoute.includes("requireWorkspaceAccount(request)"));
  for (const action of ["preflight", "resample", "launch", "duplicate", "convert-v2", "pause", "resume", "cancel", "retry", "retry-row", "retry-shared", "accept-candidates"]) {
    assert.ok(detailRoute.includes(`\"${action}\"`), `detail route is missing ${action}`);
  }
  assert.match(detailRoute, /action === "retry-shared"[\s\S]*mainTaskId is required[\s\S]*retryCanvasScheduleV2SharedTask/);
  const page = read("src/app/canvas/page.tsx");
  const css = read("src/app/globals.css");
  for (const snippet of ["CanvasScheduleCenter", "CanvasScheduleV2Editor", "CanvasScheduleParameterEditor", "ScheduleV2RuntimeTree", "节点名称", "人物场景预设", "ScheduleAssetFilterEditor", "多个标签，AND", "条件随机", "条件匹配", "批次内随机去重", "随机抽取", "固定个数", "随机范围", "每个主任务随机抽取", "确认并启动", "接受新增候选图", "onBlur={commitLabel}", "onSchedulerRoleChange", "insertSchedulerSkeleton", "Switch 输入", "画布绑定", "onSaveBindings", "saveQueueRef.current = saveQueueRef.current.then", "current?.id === schedule.id ? current.revision : schedule.revision"]) {
    assert.ok(page.includes(snippet), `Canvas UI is missing ${snippet}`);
  }
  assert.ok(page.includes("重试失败图片"), "Canvas UI must expose partial failed-image retry copy");
  assert.match(page, /main\.childTasks\.some\(isCanvasScheduleV2ChildRetryable\)/, "V2 row retry must include retryable partial children");
  assert.match(page, /content\.imageTasks\.map[\s\S]*task\.status === "failed"/, "V1 image retry must remain available for failed tasks");
  assert.ok(page.includes("重试本行失败项"), "V2 row retry must describe retryable failed children");
  assert.match(page, /function isCanvasScheduleV2ChildRetryable[\s\S]*artifact\.imageBatch\?\.status === "partial"/, "V2 UI must restrict partial retry to failed image batches");
  for (const snippet of ["requestGenerationRef", "queryStringRef", "filterRef", "searchDraftState", "commitSearch", "ScheduleAssetThumbnail", "/thumbnail", "seenCursors", "selectIdRange", "全选当前筛选结果", "清空已选", "加载更多", "预览图片", "上一张图片", "下一张图片"]) {
    assert.ok(page.includes(snippet), `Canvas scheduler image source UI is missing ${snippet}`);
  }
  assert.ok(!page.includes("IntersectionObserver"), "scheduler image pagination must require an explicit load-more command");
  assert.match(page, /new URLSearchParams\(\{ role, limit: "24" \}\)/, "scheduler image pages must be capped at 24 assets");
  assert.match(page, /setTimeout\(\(\) => commitSearch\(value\), 350\)/, "scheduler keyword input must debounce definition updates for 350 ms");
  assert.match(page, /event\.key === "Enter"[\s\S]*commitSearch\(searchDraft\)/, "Enter must commit the scheduler keyword immediately");
  assert.match(page, /<CanvasScheduleV2Editor[\s\S]*key=\{selected\.id\}/, "switching schedules must remount V2 filter drafts and cancel pending search commits");
  assert.match(page, /key=\{`\$\{selected\.id\}:\$\{batch\.id\}:scene`\}[\s\S]*key=\{`\$\{selected\.id\}:\$\{batch\.id\}:vehicle`\}/, "switching legacy schedules must remount both filter drafts and cancel pending search commits");
  assert.ok(!page.includes("data.assets.slice(0, 30)"), "scheduler image sources must render the complete loaded page");
  assert.match(page, /while \(cursor\)[\s\S]*seenCursors\.has\(cursor\)/, "select-all must consume every cursor and reject repeats");
  assert.match(page, /const assetIds = data\.assets\.map\(\(asset\) => asset\.id\)[\s\S]*assetIds\.push\(asset\.id\)[\s\S]*onChange\(\{ \.\.\.latestFilter, assetIds \}\)[\s\S]*setSelectedAllQuery\(queryString\)/, "select-all must accumulate and commit ids without appending unloaded assets to the DOM");
  assert.match(page, /setSelectedAllQuery\(""\); onChange\(\{ \.\.\.filter, assetIds: \[\] \}\)/, "bulk clear must update only asset ids and local completion state");
  assert.match(page, /sequence: data\.assets\.map/, "preview navigation must use the ordered loaded image sequence");
  assert.match(page, /function canvasScheduleParameterImages\([\s\S]*"url" in value[\s\S]*seen\.has\(key\)/, "V2 preview must extract and deduplicate frozen image snapshots");
  assert.match(page, /function ScheduleV2PreviewImages\([\s\S]*onPreview\(\{ kind: "image"[\s\S]*sequence \}\)[\s\S]*<Image src=\{image\.url\}/, "V2 preview must render frozen images and open the existing sequence viewer");
  assert.match(page, /<ScheduleV2Preview schedule=\{schedule\} onPreview=\{onPreview\}/, "V2 schedule preview must receive the image preview command");
  for (const snippet of ["canvasScheduleSharedOutputCandidates", "definition.sharedOutputs || []", "invalidSharedOutputs", "移除失效项", "getCanvasNodeExecutionMode(node) === \"disabled\"", "CanvasScheduleSharedStage", 'onAction("retry-shared", { mainTaskId: main.id })', "main.sharedArtifacts?.map"]) {
    assert.ok(page.includes(snippet), `Canvas shared-stage UI is missing ${snippet}`);
  }
  assert.ok(css.includes(".canvas-schedule-panel"));
  assert.ok(css.includes(".canvas-scheduler-bindings"));
  assert.match(css, /\.canvas-schedule-asset-results \{[^}]*max-block-size:[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/, "scheduler image results must use a bounded independent scroll viewport");
  assert.ok(css.includes(".canvas-schedule-asset-preview"));
  assert.ok(css.includes(".canvas-schedule-v2-preview-images"));
  assert.ok(css.includes(".canvas-schedule-shared-outputs"));
  assert.ok(css.includes(".canvas-schedule-shared-stage"));
  assert.ok(css.includes(".canvas-image-viewer-sequence-button"));
  assert.ok(css.includes("@media (max-width: 520px)"));
  assert.ok(css.includes(".canvas-schedule-body { display: grid; grid-template-columns: 1fr"));
  assert.ok(read("src/lib/canvas/executors.ts").includes("executePromptSwitch"));
  const runs = read("src/lib/canvas/runs.ts");
  assert.ok(runs.includes("prepareCanvasRunFromGraph"));
  assert.match(
    runs,
    /batchContext\?\.schemaVersion === 2[\s\S]*batchContext\.phase === "shared"[\s\S]*run\.status === "completed"[\s\S]*cannot be retried/,
    "generic Canvas node retry must reject completed shared-stage results",
  );
  assert.match(
    runs,
    /batchContext\.phase === "shared"[\s\S]*!options\.allowScheduledSharedRetry[\s\S]*must be retried from the batch schedule/,
    "generic Canvas node retry must not bypass shared-stage schedule reconciliation",
  );
  assert.match(
    schedulerSource,
    /retryCanvasNode\(run\.run\.id, failedNode\.nodeId, account, \{ allowScheduledSharedRetry: true \}\)/,
    "the schedule-level shared retry path must explicitly authorize the coordinated run retry",
  );
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
