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
const canvasTypes = read("src/lib/canvas/types.ts");
assert.ok(canvasTypes.includes('export type CanvasArtifactKind = "text" | "images" | "videos" | "socialPost" | "publishJobRef";'), "display-any must not add a wildcard artifact kind");
assert.ok(canvasTypes.includes('export type CanvasPortKind = CanvasArtifactKind | "any" | "visual";'), "wildcard and visual compatibility must stay isolated to port definitions");
requireText(canvasTypes, [
  'phase: "shared" | "child" | "aggregate";',
  "sharedOutputs?: CanvasScheduleV2SharedOutput[];",
  "export type CanvasScheduleV2SharedArtifact = CanvasScheduleV2SharedOutput & {",
  "sharedRunId?: string;",
  "sharedStatus?: CanvasScheduleTaskStatus;",
  "sharedArtifacts?: CanvasScheduleV2SharedArtifact[];",
  "sharedError?: string;",
], "Canvas shared-stage type contracts");
const areCanvasPortKindsCompatibleForUi = compileFunction(canvasTypes, "areCanvasPortKindsCompatible");

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-canvas-check-"));
try {
  writeFileSync(path.join(temp, "toapis-image-api.js"), `exports.toApisImageRatios = ${JSON.stringify(["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])}; exports.toApis4kImageRatios = ${JSON.stringify(["16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])};`, "utf8");
  writeFileSync(path.join(temp, "feishu-publish-mode.js"), "exports.feishuPublishModeOptions=[{value:'full',label:'完整写入'},{value:'text',label:'仅标题与正文'},{value:'media',label:'仅图片与视频'}];exports.normalizeFeishuPublishMode=(value)=>value===undefined?'full':['full','text','media'].includes(value)?value:(()=>{throw new Error('invalid mode')})();", "utf8");
  for (const name of ["types", "node-utils", "source-video-contract", "video-loader", "save-images", "seedance-references", "subtitle-style", "subtitle-editor", "registry", "graph", "serialization", "clipboard", "workflow-file"]) {
    const source = read(`src/lib/canvas/${name}.ts`).replace('"../toapis-image-api"', '"./toapis-image-api"').replace('"../feishu-publish-mode"', '"./feishu-publish-mode"');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: `${name}.ts`,
    }).outputText;
    writeFileSync(path.join(temp, `${name}.js`), output, "utf8");
  }
  const require = createRequire(import.meta.url);
  const { getCanvasNodeDefinition, getCanvasNodeExecutionMode, upgradeCanvasGraph, upgradeCanvasNode, validateCanvasNodeConfig, normalizeUrlList } = require(path.join(temp, "registry.js"));
  const { validateCanvasGraph, validateCanvasGraphForPersistence, buildCanvasRunPlan } = require(path.join(temp, "graph.js"));
  const { createCanvasClipboardPayload, instantiateCanvasClipboardPayload, parseCanvasClipboardPayload, prepareCanvasClipboardPaste } = require(path.join(temp, "clipboard.js"));
  const { createCanvasWorkflowFile, parseCanvasWorkflowFile, canvasWorkflowFileName, CANVAS_WORKFLOW_FILE_MAX_BYTES } = require(path.join(temp, "workflow-file.js"));
  const { areCanvasPortKindsCompatible, CANVAS_GRAPH_LIMITS, CANVAS_NODE_SIZE_LIMITS } = require(path.join(temp, "types.js"));
  const seedanceReferences = require(path.join(temp, "seedance-references.js"));
  const nodeUtils = require(path.join(temp, "node-utils.js"));
  assert.equal(getCanvasNodeDefinition("input.images")?.label, "图片", "image input node should use the concise label");
  assert.equal(getCanvasNodeDefinition("model.gpt-image")?.version, 2, "new GPT image nodes must use v2");
  assert.equal(getCanvasNodeDefinition("model.gpt-image", 1)?.version, 1, "legacy GPT image snapshots must remain resolvable");
  assert.equal(getCanvasNodeDefinition("model.gpt-vision")?.inputs.find((port) => port.id === "instruction")?.label, "用户提示词", "vision prompt input must be presented as authoritative user text");
  assert.equal(getCanvasNodeDefinition("model.seedance")?.version, 1, "Seedance 2.5 must preserve the saved Canvas node version");
  assert.equal(getCanvasNodeDefinition("model.seedance")?.label, "Seedance 2.5");
  assert.deepEqual(getCanvasNodeDefinition("model.seedance")?.fields.map((field) => field.key), ["duration", "ratio", "resolution", "generateAudio", "watermark", "complianceRisk"]);
  assert.deepEqual(getCanvasNodeDefinition("model.seedance")?.defaultConfig, {
    prompt: "",
    referenceUrls: [],
    mentionIds: [],
    mentionUrls: [],
    duration: 8,
    ratio: "9:16",
    resolution: "720p",
    generateAudio: true,
    watermark: true,
    complianceRisk: "low",
  });
  const legacySeedance = {
    id: "legacy-seedance",
    type: "model.seedance",
    version: 1,
    position: { x: 0, y: 0 },
    config: { duration: 8, ratio: "9:16", resolution: "720p", modelVersion: "seedance2.0_vip", complianceRisk: "low" },
  };
  assert.equal(upgradeCanvasNode(legacySeedance).version, 1, "legacy Dreamina-backed Seedance nodes must remain readable");
  assert.equal(getCanvasNodeDefinition("model.seedance")?.inputs.find((port) => port.id === "prompt")?.required, undefined, "Seedance local Prompt must make the upstream Prompt port optional");
  const personMarker = seedanceReferences.seedanceMentionMarker("person-ref");
  const carMarker = seedanceReferences.seedanceMentionMarker("car-ref");
  const resolvedMentions = seedanceReferences.resolveSeedanceInput({
    prompt: `让${personMarker}驾驶${carMarker}`,
    referenceUrls: ["https://example.test/person.jpg"],
    mentionIds: ["person-ref", "car-ref"],
    mentionUrls: ["https://example.test/person.jpg", "https://example.test/car.jpg"],
  }, [], ["https://example.test/dynamic.jpg", "https://example.test/car.jpg"]);
  assert.deepEqual(resolvedMentions, {
    prompt: "让图片1驾驶图片2",
    images: ["https://example.test/person.jpg", "https://example.test/car.jpg", "https://example.test/dynamic.jpg"],
    promptSource: "node",
  }, "Seedance mentioned fixed images must precede unmentioned dynamic images and serialize to official ordinals");
  assert.deepEqual(seedanceReferences.parseSeedancePromptDocument(`前${personMarker}后`), [
    { kind: "text", value: "前" },
    { kind: "mention", id: "person-ref" },
    { kind: "text", value: "后" },
  ]);
  assert.throws(() => seedanceReferences.resolveSeedanceInput({
    prompt: personMarker,
    mentionIds: ["person-ref"],
    mentionUrls: ["https://example.test/removed.jpg"],
  }, [], ["https://example.test/other.jpg"]), /removed image/i, "deleted Seedance mentions must not silently rebind");
  assert.throws(() => seedanceReferences.resolveSeedanceInput({ prompt: "节点 Prompt" }, [{ kind: "text", value: "上游 Prompt" }], []), /at the same time/i);
  assert.deepEqual(seedanceReferences.resolveSeedanceInput({}, [{ kind: "text", value: "旧工作流 Prompt" }], ["https://example.test/legacy.jpg"]), {
    prompt: "旧工作流 Prompt",
    images: ["https://example.test/legacy.jpg"],
    promptSource: "upstream",
  }, "legacy upstream-only Seedance nodes must retain their behavior");
  const fixedReferenceGraph = {
    nodes: [
      { id: "seedance", type: "model.seedance", version: 1, position: { x: 0, y: 0 }, config: { referenceUrls: ["https://example.test/direct.jpg"] } },
      { id: "static", type: "input.images", version: 1, position: { x: 0, y: 0 }, config: { urls: ["https://example.test/static.jpg"] } },
      { id: "dynamic", type: "model.gpt-image", version: 2, position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [
      { id: "static-edge", source: "static", sourcePort: "images", target: "seedance", targetPort: "images" },
      { id: "dynamic-edge", source: "dynamic", sourcePort: "images", target: "seedance", targetPort: "images" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.deepEqual(seedanceReferences.resolveSeedanceFixedReferences(fixedReferenceGraph, "seedance").map((item) => item.url), [
    "https://example.test/direct.jpg",
    "https://example.test/static.jpg",
  ], "Seedance authoring references must exclude dynamic model outputs");
  const fixedReferences = seedanceReferences.resolveSeedanceFixedReferences(fixedReferenceGraph, "seedance");
  assert.deepEqual(seedanceReferences.orderSeedanceFixedReferences({
    prompt: seedanceReferences.seedanceMentionMarker("static-ref"),
    referenceUrls: ["https://example.test/direct.jpg"],
    mentionIds: ["static-ref"],
    mentionUrls: ["https://example.test/static.jpg"],
  }, fixedReferences).map((item) => item.url), [
    "https://example.test/direct.jpg",
    "https://example.test/static.jpg",
  ], "Seedance Inspector numbering must use the same direct-first order as provider serialization");
  assert.throws(() => seedanceReferences.resolveSeedanceInput({ prompt: "字".repeat(2001) }, [], []), /2000 characters/i, "Seedance local Prompt length must be validated before the provider adapter");
  assert.deepEqual(getCanvasNodeDefinition("compose.social-post")?.inputs.map((port) => `${port.id}:${port.kind}`), ["title:text", "body:text", "vehicle:text", "images:images", "videos:videos"], "content composition must accept vehicle text from an upstream node");
  assert.ok(!getCanvasNodeDefinition("compose.social-post")?.fields.some((field) => field.key === "vehicle"), "new content composition nodes must not edit vehicle text in node config");
  assert.deepEqual(getCanvasNodeDefinition("compose.social-post")?.defaultConfig, { fallbackTitle: "画布生成内容" });
  assert.equal(getCanvasNodeDefinition("publish.feishu")?.version, 2, "new Feishu publish nodes must use v2");
  assert.equal(getCanvasNodeDefinition("publish.feishu", 1)?.version, 1, "legacy Feishu publish snapshots must remain resolvable");
  assert.deepEqual(getCanvasNodeDefinition("publish.feishu")?.defaultConfig, { publishMode: "full" });
  assert.match(validateCanvasNodeConfig("publish.feishu", { publishMode: "bad" }, 2).join(" "), /invalid mode/i);
  assert.equal(validateCanvasNodeConfig("publish.feishu", { publishMode: "media" }, 2).length, 0);
  const upgradedFeishu = upgradeCanvasNode({ id: "publish", type: "publish.feishu", version: 1, position: { x: 0, y: 0 }, config: {} });
  assert.equal(upgradedFeishu.version, 2);
  assert.equal(upgradedFeishu.config.publishMode, "full");
  assert.equal(getCanvasNodeDefinition("utility.text-split")?.version, 2, "new text split nodes must use v2");
  assert.equal(getCanvasNodeDefinition("utility.text-split")?.label, "文本分割", "text split must use the confirmed node name");
  assert.deepEqual(getCanvasNodeDefinition("utility.text-split")?.outputs.map((port) => port.label), ["标题", "正文"]);
  assert.equal(getCanvasNodeDefinition("utility.text-split", 1)?.label, "文本拆分", "legacy text split snapshots must retain the v1 definition");
  assert.deepEqual(getCanvasNodeDefinition("utility.text-concatenate"), {
    type: "utility.text-concatenate",
    version: 1,
    label: "文本拼接",
    description: "按顺序用指定分隔符合并最多四路文本。",
    category: "utility",
    icon: "Combine",
    color: "#16a34a",
    inputs: [
      { id: "text_a", label: "文本 A", kind: "text" },
      { id: "text_b", label: "文本 B", kind: "text" },
      { id: "text_c", label: "文本 C", kind: "text" },
      { id: "text_d", label: "文本 D", kind: "text" },
    ],
    outputs: [{ id: "text", label: "文字", kind: "text" }],
    fields: [
      { key: "delimiter", label: "分隔符", kind: "text", placeholder: "例如：\\n" },
      { key: "clean_whitespace", label: "清理首尾空白", kind: "boolean" },
    ],
    defaultConfig: { delimiter: ", ", clean_whitespace: false },
  }, "text concatenate must retain the WAS-compatible v1 contract");
  assert.deepEqual(getCanvasNodeDefinition("utility.image-preview")?.bypass, { inputPort: "images", outputPort: "images" }, "image preview must declare explicit image passthrough");
  assert.equal(getCanvasNodeDefinition("utility.image-preview")?.passiveSink, true, "image preview must retain passive sink behavior");
  const saveImagesDefinition = getCanvasNodeDefinition("utility.save-images");
  assert.equal(saveImagesDefinition?.version, 1, "save-images must use the additive v1 contract");
  assert.equal(saveImagesDefinition?.label, "保存图片");
  assert.deepEqual(saveImagesDefinition?.inputs, [{ id: "images", label: "图片", kind: "images", required: true, multiple: true }]);
  assert.deepEqual(saveImagesDefinition?.outputs, [], "save-images must remain a terminal node");
  assert.deepEqual(saveImagesDefinition?.fields, [{ key: "filenamePrefix", label: "文件名前缀", kind: "text", placeholder: "FluxPost" }]);
  assert.deepEqual(saveImagesDefinition?.defaultConfig, { filenamePrefix: "FluxPost" });
  assert.equal(saveImagesDefinition?.passiveSink, true, "save-images must follow selected image producers automatically");
  assert.equal(saveImagesDefinition?.bypass, undefined, "save-images cannot bypass an outputless side-effect boundary");
  assert.deepEqual(getCanvasNodeDefinition("utility.prompt-switch")?.inputs.map((port) => port.id), ["input1", "input2", "input3"], "prompt switch must expose three ordinal inputs");
  assert.deepEqual(getCanvasNodeDefinition("utility.prompt-switch")?.inputs.map((port) => port.label), ["输入 1", "输入 2", "输入 3"]);
  assert.deepEqual(getCanvasNodeDefinition("utility.prompt-switch")?.defaultConfig, { selectedInput: "1" });
  assert.deepEqual(getCanvasNodeDefinition("utility.prompt-switch", 1)?.inputs.map((port) => port.id), ["scene", "sceneModification", "scenePerson"], "legacy prompt switch snapshots must remain resolvable");
  assert.deepEqual(getCanvasNodeDefinition("utility.display-any"), {
    type: "utility.display-any",
    version: 1,
    label: "展示任何",
    description: "展示任意上游节点的输出内容。",
    category: "utility",
    icon: "Eye",
    color: "#7c3aed",
    inputs: [{ id: "value", label: "任意", kind: "any", required: true }],
    outputs: [],
    fields: [],
    defaultConfig: {},
    passiveSink: true,
  }, "display-any must be a passive, outputless wildcard sink");
  for (const kind of ["text", "images", "videos", "socialPost", "publishJobRef"]) {
    assert.equal(areCanvasPortKindsCompatible(kind, "any"), true, `${kind} output must connect to an any input`);
    assert.equal(areCanvasPortKindsCompatible(kind, kind), true, `${kind} must retain exact compatibility`);
  }
  assert.equal(areCanvasPortKindsCompatible("any", "text"), false, "wildcard outputs must not connect to typed inputs");
  assert.equal(areCanvasPortKindsCompatible("images", "visual"), true, "image outputs must connect to visual inputs");
  assert.equal(areCanvasPortKindsCompatible("videos", "visual"), true, "video outputs must connect to visual inputs");
  assert.equal(areCanvasPortKindsCompatible("text", "visual"), false, "text outputs must not connect to visual inputs");
  assert.equal(areCanvasPortKindsCompatible("visual", "videos"), false, "visual must remain input-only");
  assert.equal(areCanvasPortKindsCompatible("text", "images"), false, "existing mismatched types must stay incompatible");
  const commonNodeContracts = {
    "input.content-pool": { inputs: [], outputs: ["title:text", "body:text", "source:text", "images:images", "videos:videos"] },
    "input.library-images": { inputs: [], outputs: ["images:images"] },
    "utility.prompt-template": { inputs: ["values:text"], outputs: ["text:text"] },
    "utility.text-concatenate": { inputs: ["text_a:text", "text_b:text", "text_c:text", "text_d:text"], outputs: ["text:text"] },
    "utility.text-split": { inputs: ["text:text"], outputs: ["head:text", "tail:text"] },
    "model.gpt-vision": { inputs: ["images:images", "instruction:text"], outputs: ["text:text"] },
    "utility.image-select": { inputs: ["images:images"], outputs: ["images:images"] },
    "utility.image-transform": { inputs: ["images:images"], outputs: ["images:images"] },
    "utility.video-frames": { inputs: ["videos:videos"], outputs: ["images:images"] },
    "utility.save-images": { inputs: ["images:images"], outputs: [] },
    "utility.display-any": { inputs: ["value:any"], outputs: [] },
    "input.source-video": { inputs: [], outputs: ["videos:videos"] },
    "utility.video-reconstruct": { inputs: ["source:videos", "replacement:visual"], outputs: ["videos:videos"] },
  };
  for (const [type, contract] of Object.entries(commonNodeContracts)) {
    const definition = getCanvasNodeDefinition(type);
    assert.ok(definition, `${type} must be registered`);
    assert.equal(definition.version, type === "utility.text-split" ? 2 : 1, `${type} latest version changed unexpectedly`);
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
  assert.match(validateCanvasNodeConfig("utility.text-split", { mode: "delimiter", delimiter: "---", delimiterIndex: 0 }, 2).join(" "), /positive integer/i);
  assert.match(validateCanvasNodeConfig("utility.text-split", { mode: "delimiter", delimiter: "---", delimiterIndex: 1.5 }, 2).join(" "), /positive integer/i);
  assert.equal(validateCanvasNodeConfig("utility.text-split", { mode: "first-line", delimiter: "", delimiterIndex: 0 }, 2).length, 0, "first-line mode must ignore delimiter settings");
  assert.equal(validateCanvasNodeConfig("utility.text-concatenate", { delimiter: ", ", clean_whitespace: false }, 1).length, 0);
  assert.match(validateCanvasNodeConfig("utility.text-concatenate", { delimiter: ", ", clean_whitespace: "false" }, 1).join(" "), /must be a boolean/i);
  assert.equal(validateCanvasNodeConfig("utility.save-images", { filenamePrefix: "车型图" }, 1).length, 0);
  for (const invalidPrefix of ["", " ", "a/b", "a\\b", "a:b", "bad.", "bad ", "x".repeat(81), "bad\u0000name"]) {
    assert.match(validateCanvasNodeConfig("utility.save-images", { filenamePrefix: invalidPrefix }, 1).join(" "), /filename prefix/i, `save-images must reject ${JSON.stringify(invalidPrefix)}`);
  }

  const saveSinkGraph = {
    nodes: [
      { id: "save-source", type: "input.images", version: 1, position: { x: 0, y: 0 }, config: { urls: ["https://example.test/image.png"] } },
      { id: "save-target", type: "utility.save-images", version: 1, position: { x: 220, y: 0 }, config: { filenamePrefix: "car" } },
    ],
    edges: [{ id: "save-edge", source: "save-source", sourcePort: "images", target: "save-target", targetPort: "images" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.equal(validateCanvasGraph(saveSinkGraph).valid, true, "save-images must accept image producers");
  assert.deepEqual(buildCanvasRunPlan(saveSinkGraph, ["save-source"]).includedNodeIds, ["save-source", "save-target"], "selected image producers must include the passive save sink");
  assert.deepEqual(buildCanvasRunPlan(saveSinkGraph, ["save-source"]).capabilities, [], "browser downloads must not add a paid or external-write capability");

  assert.equal(nodeUtils.renderCanvasPromptTemplate({ preset: "custom", template: "二={{input2}}\n一={{input1}}\n全部={{input}}" }, ["A", "B"]), "二=B\n一=A\n全部=A\n\nB");
  assert.throws(() => nodeUtils.renderCanvasPromptTemplate({ preset: "custom", template: "{{input3}}" }, ["A", "B"]), /missing input3/i);
  assert.equal(nodeUtils.concatenateCanvasText({ delimiter: ", ", clean_whitespace: false }, ["A", "", " B ", "C"]), "A,  B , C");
  assert.equal(nodeUtils.concatenateCanvasText({ delimiter: "\\n", clean_whitespace: true }, [" A ", "", " B ", "  "]), "A\nB");
  assert.equal(nodeUtils.concatenateCanvasText({ delimiter: "\n", clean_whitespace: false }, ["A", "B"]), "A\nB");
  assert.equal(nodeUtils.concatenateCanvasText({ delimiter: "-", clean_whitespace: false }, []), "");
  assert.equal(nodeUtils.concatenateCanvasText({ delimiter: "-", clean_whitespace: false }, [" ", "B"]), " -B", "whitespace-only input must remain when cleanup is disabled");
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "first-line" }, "标题\n正文第一行\n正文第二行"), { head: "标题", tail: "正文第一行\n正文第二行" });
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---" }, "标题---正文"), { head: "标题", tail: "正文" });
  assert.throws(() => nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---" }, "没有分隔符"), /does not contain/i);
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---", delimiterIndex: 2 }, "A---B---C"), { head: "A---B", tail: "C" });
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---", delimiterIndex: 2 }, "A---B---C---D"), { head: "A---B", tail: "C---D" }, "later delimiters must remain in the body");
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---", delimiterIndex: 2 }, "A---B", { fallbackToBody: true }), { tail: "A---B" });
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---", delimiterIndex: 1 }, "---正文", { fallbackToBody: true }), { tail: "---正文" });
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---", delimiterIndex: 1 }, "标题---", { fallbackToBody: true }), { tail: "标题---" });
  assert.deepEqual(nodeUtils.splitCanvasText({ mode: "first-line" }, " 标题\r\n正文第一段\n\n正文第二段 ", { fallbackToBody: true }), { head: "标题", tail: "正文第一段\n\n正文第二段" });
  assert.throws(() => nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---" }, "   ", { fallbackToBody: true }), /cannot be empty/i);
  assert.throws(() => nodeUtils.splitCanvasText({ mode: "delimiter", delimiter: "---", delimiterIndex: 0 }, "标题---正文", { fallbackToBody: true }), /positive integer/i);
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
  const upgradedTextSplitNode = upgradeCanvasNode({ id: "legacy-split", type: "utility.text-split", version: 1, position: { x: 0, y: 0 }, config: { mode: "delimiter", delimiter: "###" } });
  assert.equal(upgradedTextSplitNode.version, 2, "editable legacy text split nodes must upgrade to v2");
  assert.deepEqual(upgradedTextSplitNode.config, { mode: "delimiter", delimiter: "###", delimiterIndex: 1 });
  const upgradedPromptGraph = upgradeCanvasGraph({
    nodes: [
      { id: "legacy-prompt", type: "input.text", version: 1, position: { x: 0, y: 0 }, config: { text: "提示词" } },
      { id: "legacy-switch", type: "utility.prompt-switch", version: 1, position: { x: 200, y: 0 }, config: { strategy: "scene-person" } },
    ],
    edges: [{ id: "legacy-edge", source: "legacy-prompt", sourcePort: "text", target: "legacy-switch", targetPort: "scenePerson" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  assert.equal(upgradedPromptGraph.nodes.find((node) => node.id === "legacy-switch")?.version, 2);
  assert.deepEqual(upgradedPromptGraph.nodes.find((node) => node.id === "legacy-switch")?.config, { selectedInput: "3" });
  assert.equal(upgradedPromptGraph.edges[0].targetPort, "input3", "editable prompt-switch edges must migrate with the node");

  const textNode = { id: "text", type: "input.text", version: 1, position: { x: 0, y: 0 }, config: { text: "source" } };
  assert.equal(getCanvasNodeExecutionMode(textNode), "enabled", "legacy nodes without a mode must remain enabled");
  const gptNode = { id: "gpt", type: "model.gpt-text", version: 1, position: { x: 200, y: 0 }, config: { instruction: "rewrite" } };
  const validGraph = {
    nodes: [textNode, gptNode],
    edges: [{ id: "e1", source: "text", sourcePort: "text", target: "gpt", targetPort: "prompt" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const concatenateNode = { id: "concatenate", type: "utility.text-concatenate", version: 1, position: { x: 220, y: 0 }, config: { delimiter: "\\n", clean_whitespace: true } };
  const concatenateGraph = {
    nodes: [textNode, concatenateNode],
    edges: [{ id: "concatenate-a", source: "text", sourcePort: "text", target: "concatenate", targetPort: "text_a" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.equal(validateCanvasGraph(concatenateGraph).valid, true, "text concatenate must participate in typed graph validation");
  const concatenateClipboard = createCanvasClipboardPayload(concatenateGraph.nodes, concatenateGraph.edges, ["text", "concatenate"]);
  assert.equal(parseCanvasClipboardPayload(JSON.stringify(concatenateClipboard))?.nodes.find((node) => node.type === "utility.text-concatenate")?.config.clean_whitespace, true, "text concatenate config must round-trip through clipboard validation");
  assert.deepEqual(CANVAS_NODE_SIZE_LIMITS, { minWidth: 190, minHeight: 120, maxWidth: 720, maxHeight: 900 }, "node resizing bounds must stay shared across persistence and UI");
  assert.equal(validateCanvasGraph(validGraph).valid, true, "valid typed graph should pass");
  const incompleteDraftGraph = {
    nodes: [
      { ...structuredClone(textNode), config: { text: "" } },
      { ...structuredClone(gptNode), id: "draft-gpt" },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.equal(validateCanvasGraphForPersistence(incompleteDraftGraph).valid, true, "persistence must accept structurally valid incomplete drafts");
  assert.match(validateCanvasGraph(incompleteDraftGraph).errors.join(" "), /不能为空.*requires input/i, "execution validation must still reject incomplete draft config and wiring");
  assert.equal(parseCanvasWorkflowFile(JSON.stringify(createCanvasWorkflowFile("Incomplete draft", incompleteDraftGraph))).graph.nodes.length, 2, "workflow files must round-trip incomplete drafts");
  const resizedGraph = structuredClone(validGraph);
  resizedGraph.nodes[0].size = { width: 360, height: 280 };
  assert.equal(validateCanvasGraph(resizedGraph).valid, true, "valid custom node dimensions should pass graph validation");
  const oversizedGraph = structuredClone(resizedGraph);
  oversizedGraph.nodes[0].size.width = 721;
  assert.match(validateCanvasGraph(oversizedGraph).errors.join(" "), /190x120.*720x900/i, "out-of-range node dimensions must fail graph validation");
  assert.match(validateCanvasGraphForPersistence(oversizedGraph).errors.join(" "), /190x120.*720x900/i, "persistence must still reject out-of-range node dimensions");
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
  const displayNodes = ["text", "images", "videos", "post", "job"].map((suffix, index) => ({ id: `display-${suffix}`, type: "utility.display-any", version: 1, position: { x: 600, y: index * 120 }, config: {} }));
  const displayAnyGraph = {
    nodes: [
      textNode,
      { id: "images", type: "input.images", version: 1, position: { x: 0, y: 120 }, config: { urls: ["https://example.test/a.jpg"] } },
      { id: "videos", type: "input.videos", version: 1, position: { x: 0, y: 240 }, config: { urls: ["https://example.test/a.mp4"] } },
      { id: "compose", type: "compose.social-post", version: 1, position: { x: 220, y: 360 }, config: {} },
      { id: "publish", type: "publish.feishu", version: 1, position: { x: 420, y: 480 }, config: {} },
      ...displayNodes,
    ],
    edges: [
      { id: "compose-body", source: "text", sourcePort: "text", target: "compose", targetPort: "body" },
      { id: "publish-post", source: "compose", sourcePort: "post", target: "publish", targetPort: "post" },
      { id: "display-text-edge", source: "text", sourcePort: "text", target: "display-text", targetPort: "value" },
      { id: "display-images-edge", source: "images", sourcePort: "images", target: "display-images", targetPort: "value" },
      { id: "display-videos-edge", source: "videos", sourcePort: "videos", target: "display-videos", targetPort: "value" },
      { id: "display-post-edge", source: "compose", sourcePort: "post", target: "display-post", targetPort: "value" },
      { id: "display-job-edge", source: "publish", sourcePort: "job", target: "display-job", targetPort: "value" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  assert.equal(validateCanvasGraph(displayAnyGraph).valid, true, "all five artifact kinds must connect to display-any");
  assert.deepEqual(buildCanvasRunPlan(displayAnyGraph, ["text"]).includedNodeIds, ["text", "display-text"], "selected producers must automatically include direct display-any sinks");
  assert.deepEqual(buildCanvasRunPlan(displayAnyGraph, ["text"]).capabilities, [], "display-any must not add paid confirmation");
  const occupiedDisplayGraph = structuredClone(displayAnyGraph);
  occupiedDisplayGraph.edges.push({ id: "second-display-input", source: "images", sourcePort: "images", target: "display-text", targetPort: "value" });
  assert.match(validateCanvasGraph(occupiedDisplayGraph).errors.join(" "), /accepts one connection/i, "display-any must reject a second upstream edge");
  const unsupportedBypass = structuredClone(previewGraph);
  unsupportedBypass.nodes[0].executionMode = "bypass";
  assert.match(validateCanvasGraph(unsupportedBypass).errors.join(" "), /does not support bypass/i, "nodes without explicit mappings must reject bypass");

  const cyclic = structuredClone(validGraph);
  cyclic.edges.push({ id: "e2", source: "gpt", sourcePort: "text", target: "text", targetPort: "missing" });
  assert.match(validateCanvasGraph(cyclic).errors.join(" "), /cycles/i);
  assert.match(validateCanvasGraphForPersistence(cyclic).errors.join(" "), /cycles/i, "persistence must still reject cycles");
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
  assert.match(validateCanvasGraphForPersistence(wrongType).errors.join(" "), /incompatible/i, "persistence must still reject incompatible ports");

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
  const sizedClipboard = structuredClone(clipboardPayload);
  sizedClipboard.nodes[0].size = { width: 420, height: 300 };
  assert.deepEqual(parseCanvasClipboardPayload(JSON.stringify(sizedClipboard))?.nodes[0].size, { width: 420, height: 300 }, "clipboard must preserve custom node dimensions");
  const invalidSizeClipboard = structuredClone(sizedClipboard);
  invalidSizeClipboard.nodes[0].size.height = 901;
  assert.equal(parseCanvasClipboardPayload(JSON.stringify(invalidSizeClipboard)), undefined, "clipboard must reject out-of-range node dimensions");
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
  const displayClipboard = createCanvasClipboardPayload(displayAnyGraph.nodes, displayAnyGraph.edges, ["text", "display-text"]);
  const parsedDisplayClipboard = parseCanvasClipboardPayload(JSON.stringify(displayClipboard));
  assert.equal(parsedDisplayClipboard?.nodes.find((node) => node.type === "utility.display-any")?.id, "display-text", "display-any must round-trip through the version-1 clipboard envelope");
  assert.equal(parsedDisplayClipboard?.edges[0].targetPort, "value", "wildcard input edges must survive clipboard validation");

  const roleGraph = structuredClone(validGraph);
  roleGraph.nodes[0].schedulerRole = "prompt-switch";
  const roleClipboard = createCanvasClipboardPayload(roleGraph.nodes, roleGraph.edges, roleGraph.nodes.map((node) => node.id));
  const parsedRoleClipboard = parseCanvasClipboardPayload(JSON.stringify(roleClipboard));
  assert.equal(parsedRoleClipboard?.nodes[0].schedulerRole, "prompt-switch", "clipboard version 1 must preserve scheduler roles");
  const preparedPaste = prepareCanvasClipboardPaste(
    { nodes: [{ ...structuredClone(roleGraph.nodes[0]), id: "occupied" }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    parsedRoleClipboard,
    { x: 100, y: 120 },
    (kind, index) => `${kind}-prepared-${index}`,
  );
  assert.equal(preparedPaste.nodes[0].schedulerRole, undefined, "paste must clear only a scheduler role already occupied by the target graph");
  assert.deepEqual(preparedPaste.clearedSchedulerRoles, ["prompt-switch"], "paste must report every cleared scheduler role");
  assert.equal(preparedPaste.nodes[1].id, "node-prepared-1", "paste preparation must preserve fresh node ids");
  assert.throws(
    () => prepareCanvasClipboardPaste(
      { nodes: Array.from({ length: CANVAS_GRAPH_LIMITS.maxNodes - 1 }, (_, index) => ({ ...structuredClone(textNode), id: `existing-${index}` })), edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      parsedRoleClipboard,
      { x: 0, y: 0 },
      (kind, index) => `${kind}-overflow-${index}`,
    ),
    /at most 200 nodes/i,
    "paste must reject the complete fragment before a merged graph exceeds the node limit",
  );
  const maximumClipboardNodes = Array.from({ length: CANVAS_GRAPH_LIMITS.maxNodes }, (_, index) => ({ ...structuredClone(textNode), id: `maximum-${index}` }));
  assert.equal(createCanvasClipboardPayload(maximumClipboardNodes, [], maximumClipboardNodes.map((node) => node.id))?.nodes.length, CANVAS_GRAPH_LIMITS.maxNodes, "clipboard capacity must match the canvas node limit");
  assert.equal(createCanvasClipboardPayload([...maximumClipboardNodes, { ...structuredClone(textNode), id: "too-many" }], [], [...maximumClipboardNodes.map((node) => node.id), "too-many"]), undefined, "clipboard must reject selections beyond the canvas node limit");

  const workflowFile = createCanvasWorkflowFile("Portable workflow", roleGraph);
  assert.equal(workflowFile.kind, "fluxpost.canvas.workflow");
  assert.equal(workflowFile.version, 1);
  assert.equal(CANVAS_WORKFLOW_FILE_MAX_BYTES, 10 * 1024 * 1024);
  const parsedWorkflowFile = parseCanvasWorkflowFile(JSON.stringify({
    ...workflowFile,
    id: "must-not-import",
    ownerUserId: "must-not-import",
    revision: 99,
    runs: [{ id: "must-not-import" }],
  }));
  assert.equal(parsedWorkflowFile.name, "Portable workflow");
  assert.equal(parsedWorkflowFile.graph.nodes[0].schedulerRole, "prompt-switch", "workflow files must preserve scheduler roles");
  assert.deepEqual(Object.keys(parsedWorkflowFile).sort(), ["graph", "kind", "name", "version"], "workflow parsing must project only the portable file contract");
  assert.equal(JSON.stringify(createCanvasWorkflowFile("Portable workflow", roleGraph)).includes("ownerUserId"), false, "workflow export must exclude owner metadata");
  assert.equal(canvasWorkflowFileName('  Demo: workflow/one  '), "Demo- workflow-one.fluxpost-workflow.json", "workflow filenames must remove platform-invalid characters");
  assert.throws(() => parseCanvasWorkflowFile(JSON.stringify({ ...workflowFile, kind: "comfyui.workflow" })), /FluxPost Canvas workflow file/i);
  assert.throws(() => parseCanvasWorkflowFile(JSON.stringify({ ...workflowFile, version: 2 })), /version 1/i);
  assert.throws(() => parseCanvasWorkflowFile(JSON.stringify({ ...workflowFile, graph: { ...workflowFile.graph, viewport: { x: 0, y: 0, zoom: 0 } } })), /viewport/i);
  const unknownVersionFile = structuredClone(workflowFile);
  unknownVersionFile.graph.nodes[0].version = 99;
  assert.throws(() => parseCanvasWorkflowFile(JSON.stringify(unknownVersionFile)), /unknown canvas node/i);
  const cyclicWorkflowFile = structuredClone(workflowFile);
  cyclicWorkflowFile.graph.edges.push({ id: "workflow-cycle", source: "gpt", sourcePort: "text", target: "gpt", targetPort: "prompt" });
  assert.throws(() => parseCanvasWorkflowFile(JSON.stringify(cyclicWorkflowFile)), /cycles/i);

  const executorSource = read("src/lib/canvas/executors.ts");
  const executeDisplayAny = compileFunction(executorSource, "executeDisplayAny", { structuredClone });
  const displayArtifact = { kind: "socialPost", postId: "post-1", post: { title: "展示标题", imageUrls: [], videoUrls: [], platform: "xiaohongshu" } };
  const displayResult = await executeDisplayAny({ inputs: { value: [displayArtifact] } });
  assert.deepEqual(displayResult.outputs.preview, displayArtifact, "display-any must persist the exact upstream artifact shape");
  assert.notEqual(displayResult.outputs.preview, displayArtifact, "display-any must clone the upstream artifact");
  await assert.rejects(() => executeDisplayAny({ inputs: {} }), /一个上游结果/, "display-any must reject a missing upstream artifact");
  await assert.rejects(() => executeDisplayAny({ inputs: { value: [{ kind: "text", value: "A" }, { kind: "text", value: "B" }] } }), /一个上游结果/, "display-any must reject multiple upstream artifacts");
  const executeSaveImages = compileFunctions(executorSource, ["executeSaveImages", "imageItems"], "executeSaveImages", { structuredClone, CANVAS_SAVE_IMAGE_MAX_ITEMS: 30 });
  const oneSaveImage = { kind: "images", items: [{ url: "/generated/one.png", name: "one" }] };
  const oneSaveResult = await executeSaveImages({ inputs: { images: [oneSaveImage] } });
  assert.deepEqual(oneSaveResult.outputs.downloads, oneSaveImage, "save-images must persist the ordered image artifact");
  assert.notEqual(oneSaveResult.outputs.downloads, oneSaveImage, "save-images must clone the upstream artifact");
  assert.notEqual(oneSaveResult.outputs.downloads.items, oneSaveImage.items, "save-images must clone image items");
  await assert.rejects(() => executeSaveImages({ inputs: {} }), /1 to 30 images/i, "save-images must reject an empty input");
  assert.equal((await executeSaveImages({ inputs: { images: [{ kind: "images", items: Array.from({ length: 30 }, (_, index) => ({ url: `/generated/${index}.png` })) }] } })).outputs.downloads.items.length, 30);
  await assert.rejects(() => executeSaveImages({ inputs: { images: [{ kind: "images", items: Array.from({ length: 31 }, (_, index) => ({ url: `/generated/${index}.png` })) }] } }), /1 to 30 images/i, "save-images must reject oversized batches");
  const executePromptSwitch = compileFunctions(
    executorSource,
    ["executePromptSwitch", "textValues"],
    "executePromptSwitch",
  );
  const promptInputs = {
    input1: [{ kind: "text", value: "提示词一" }],
    input2: [{ kind: "text", value: "提示词二" }],
    input3: [{ kind: "text", value: "提示词三" }],
  };
  assert.deepEqual((await executePromptSwitch({ node: { version: 2, config: { selectedInput: "2" } }, inputs: promptInputs })).outputs, { text: { kind: "text", value: "提示词二" } });
  assert.deepEqual((await executePromptSwitch({ node: { version: 2, config: { selectedInput: "3" } }, inputs: promptInputs })).outputs, { text: { kind: "text", value: "提示词三" } });
  await assert.rejects(() => executePromptSwitch({ node: { version: 2, config: { selectedInput: "1" } }, inputs: { ...promptInputs, input1: [] } }), /非空文字输入/);
  assert.deepEqual((await executePromptSwitch({ node: { version: 1, config: { strategy: "scene-person" } }, inputs: { scenePerson: [{ kind: "text", value: "旧提示词" }] } })).outputs, { text: { kind: "text", value: "旧提示词" } });
  const executeTextConcatenate = compileFunctions(
    executorSource,
    ["executeTextConcatenate", "textValues"],
    "executeTextConcatenate",
    { concatenateCanvasText: nodeUtils.concatenateCanvasText },
  );
  assert.deepEqual((await executeTextConcatenate({
    node: { type: "utility.text-concatenate", version: 1, config: { delimiter: "\\n", clean_whitespace: true } },
    inputs: {
      text_d: [{ kind: "text", value: " D " }],
      text_b: [{ kind: "text", value: " B " }],
      text_a: [{ kind: "text", value: " A " }],
    },
  })).outputs, { text: { kind: "text", value: "A\nB\nD" } }, "executor must use fixed A-D order instead of object insertion order");
  assert.deepEqual((await executeTextConcatenate({
    node: { type: "utility.text-concatenate", version: 1, config: { delimiter: ", ", clean_whitespace: false } },
    inputs: {},
  })).outputs, { text: { kind: "text", value: "" } }, "executor must succeed with no connected inputs");
  const executeTextSplit = compileFunctions(
    executorSource,
    ["executeTextSplit", "textValues"],
    "executeTextSplit",
    { splitCanvasText: nodeUtils.splitCanvasText },
  );
  assert.deepEqual((await executeTextSplit({
    node: { type: "utility.text-split", version: 2, config: { mode: "delimiter", delimiter: "---", delimiterIndex: 2 } },
    inputs: { text: [{ kind: "text", value: "A---B" }] },
  })).outputs, { tail: { kind: "text", value: "A---B" } }, "v2 fallback must omit the empty title artifact");
  await assert.rejects(() => executeTextSplit({
    node: { type: "utility.text-split", version: 1, config: { mode: "delimiter", delimiter: "---" } },
    inputs: { text: [{ kind: "text", value: "A" }] },
  }), /does not contain/i, "v1 executor must preserve strict snapshot behavior");
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
for (const table of ["canvas_workflows", "canvas_schedules", "canvas_runs", "canvas_node_runs", "canvas_run_queue"]) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing ${table} schema`);
}
requireText(schema, ["revision = $8", "FOR UPDATE SKIP LOCKED", "requeueCanvasRunQueueItem", "requeueExpiredCanvasRunQueueItemsWithProviderTasks", "providerTaskId", "json_extract", "listCanvasSuccessfulNodeRunsForWorkflowFromDb", "JOIN canvas_runs"], "canvas persistence");

const workflows = read("src/lib/canvas/workflows.ts");
requireText(workflows, ["filterWorkspaceOwnedRecords", "assertCanAccessWorkspaceRecord", "CanvasRevisionConflictError", "structuredClone(graph)", "validateCanvasGraphForPersistence", "decodeCanvasGraph(input.graph)"], "workflow service");

const runs = read("src/lib/canvas/runs.ts");
requireText(runs, ["structuredClone(workflow.graph)", "runMode", "isolated", "inputFingerprint", "reusedFrom", "bypassed", "disabled", "Missing required input", "cancelRequestedAt", "collectDescendants", "previousNodeRun", "resumableNodeRun", "onProviderTaskUpdate", "providerTaskRoute", "result.providerTaskId || nodeRun.providerTaskId", "finalRun.status === \"running\"", "requeueCanvasRunQueueItem(finalRun.id, 30_000)", "setTimeout(ensureCanvasRunWorker, 30_000)", "requeueExpiredCanvasRunQueueItemsWithProviderTasks", "listCanvasRunHistory", "listCanvasSuccessfulNodeRunsForWorkflowFromDb", "latestSuccessfulNodeRuns", "workflowRevision", "nodeConfig", "concurrencyConfig.canvasRun", "activeWorkers", "storedQueueState.activeWorkers ??= 0"], "DAG scheduler and latest-success projection");
requireText(runs, ["Promise.all(ready.map((nodeId) => runPlannedNode"], "ready DAG branch concurrency");
assert.match(runs, /error: status === "running"\s*\? undefined\s*:/, "Pending provider runs must clear stale errors from earlier failed attempts.");
requireText(read("src/lib/concurrency.ts"), ["image: readConcurrencyEnv(\"WORKER_IMAGE_CONCURRENCY\", 100, 100)"], "confirmed ToAPIs 100-task submission concurrency");
requireText(read("src/app/api/canvas/runs/route.ts"), ["ensureCanvasRunWorker", "export async function GET"], "canvas status reads must wake durable recovery after a local restart");

const seedanceSource = read("src/lib/canvas/seedance.ts");
requireText(seedanceSource, ["contents/generations/tasks", "reference_image", "reference_video", "generate_audio", "Authorization", "Bearer", "AbortSignal.timeout", "succeeded without a video URL"], "Ark Seedance adapter");
assert.ok(!seedanceSource.includes("dreamina"), "Ark Seedance adapter must not retain Dreamina CLI behavior");

const seedanceRequests = [];
const seedanceResponses = [
  new Response(JSON.stringify({ id: "ark-task-1" }), { status: 200 }),
  new Response(JSON.stringify({ id: "ark-task-1", status: "succeeded", content: { video_url: "https://example.test/result.mp4" } }), { status: 200 }),
  new Response(JSON.stringify({ id: "ark-task-failed", status: "failed", error: { code: "BadRequest", message: "invalid reference" } }), { status: 200 }),
];
const seedance = loadTsModule("src/lib/canvas/seedance.ts", {
  "../config": {
    appConfig: {
      arkApiKey: "test-ark-key",
      arkBaseUrl: "https://ark.example.test/api/v3",
      arkSeedanceModel: "doubao-seedance-2-5-260628",
      arkSeedanceRequestTimeoutMs: 30_000,
    },
  },
}, {
  AbortSignal,
  fetch: async (url, init) => {
    seedanceRequests.push({ url: String(url), init });
    return seedanceResponses.shift();
  },
});
const createdSeedance = await seedance.submitArkSeedanceVideo({
  prompt: "替换产品，运镜不变",
  images: ["https://example.test/reference.jpg"],
  videos: ["https://example.test/source.mp4"],
  duration: 5,
  ratio: "16:9",
  resolution: "720p",
  generateAudio: true,
  watermark: false,
});
assert.equal(createdSeedance.taskId, "ark-task-1");
assert.equal(createdSeedance.status, "queued");
assert.equal(seedanceRequests[0].url, "https://ark.example.test/api/v3/contents/generations/tasks");
assert.equal(seedanceRequests[0].init.method, "POST");
assert.equal(seedanceRequests[0].init.headers.Authorization, "Bearer test-ark-key");
assert.deepEqual(JSON.parse(seedanceRequests[0].init.body), {
  model: "doubao-seedance-2-5-260628",
  content: [
    { type: "text", text: "替换产品，运镜不变" },
    { type: "image_url", image_url: { url: "https://example.test/reference.jpg" }, role: "reference_image" },
    { type: "video_url", video_url: { url: "https://example.test/source.mp4" }, role: "reference_video" },
  ],
  generate_audio: true,
  ratio: "16:9",
  duration: 5,
  resolution: "720p",
  watermark: false,
});
const completedSeedance = await seedance.queryArkSeedanceVideo("ark-task-1");
assert.equal(seedanceRequests[1].url, "https://ark.example.test/api/v3/contents/generations/tasks/ark-task-1");
assert.equal(seedanceRequests[1].init.method, "GET");
assert.deepEqual(Array.from(completedSeedance.videoUrls), ["https://example.test/result.mp4"]);
await assert.rejects(() => seedance.queryArkSeedanceVideo("ark-task-failed"), /BadRequest: invalid reference/);

let unconfiguredSeedanceRequests = 0;
const unconfiguredSeedance = loadTsModule("src/lib/canvas/seedance.ts", {
  "../config": {
    appConfig: {
      arkApiKey: "",
      arkBaseUrl: "https://ark.example.test/api/v3",
      arkSeedanceModel: "doubao-seedance-2-5-260628",
      arkSeedanceRequestTimeoutMs: 30_000,
    },
  },
}, {
  AbortSignal,
  fetch: async () => {
    unconfiguredSeedanceRequests += 1;
    throw new Error("unexpected network call");
  },
});
await assert.rejects(() => unconfiguredSeedance.submitArkSeedanceVideo({
  prompt: "测试",
  images: [],
  videos: [],
  duration: 5,
  ratio: "16:9",
  resolution: "720p",
  generateAudio: true,
  watermark: true,
}), /ARK_API_KEY is required/);
assert.equal(unconfiguredSeedanceRequests, 0, "missing Ark configuration must fail before network access");

const executors = read("src/lib/canvas/executors.ts");
requireText(executors, ["callOpenAIForText", "callOpenAIForVisionText", "generateCanvasGptImages", "directReferences", "resolveCanvasGptImageReferences", "references.length > 16", "resolvedInputs", "resumeTaskId", "resumeTaskRoute", "onTaskUpdate", "result.status === \"pending\"", "providerTaskRoute", "utility.image-preview", "executeImagePreview", "utility.save-images", "executeSaveImages", "utility.display-any", "executeDisplayAny", "executePromptTemplate", "executeTextSplit", "executeGptVision", "executeImageSelect", "executeImageTransform", "executeVideoFrames", "CanvasMediaNeedsConfigError", "generateImagesFromPrompt", "saveGeneratedPost", "enqueueFeishuPublishJob", "queryArkSeedanceVideo(previousSubmitId)"], "node executors");
requireText(runs, ["getArkSeedanceReadiness", 'needsConfig ? "needs_config" : "blocked"'], "Ark Seedance local preflight");
assert.ok(!runs.includes("getDreaminaCredit"), "Canvas preflight must not call Dreamina or a live Ark endpoint");
const { createWorkflowSaveCoordinator } = loadTsModule("src/lib/canvas/workflow-save-coordinator.ts");
const deferredSave = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};
let latestSaveSnapshot = { workflowId: "workflow-1", dirtyVersion: 1, name: "canvas", revision: 7, graph: { marker: "first" } };
const saveRequests = [];
const saveDeferreds = [];
const saveFeedback = [];
const savingTransitions = [];
let activeSaves = 0;
let maxActiveSaves = 0;
const saveCoordinator = createWorkflowSaveCoordinator({
  capture: () => structuredClone(latestSaveSnapshot),
  save: async (snapshot) => {
    saveRequests.push(snapshot);
    activeSaves += 1;
    maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
    const deferred = deferredSave();
    saveDeferreds.push(deferred);
    try {
      return await deferred.promise;
    } finally {
      activeSaves -= 1;
    }
  },
  onSavingChange: (saving) => savingTransitions.push(saving),
  onSaved: (_workflow, snapshot, mode) => saveFeedback.push({ dirtyVersion: snapshot.dirtyVersion, mode }),
});
const firstAutomaticSave = saveCoordinator.request("automatic");
assert.equal(saveRequests.length, 1, "the first automatic save must start immediately");
latestSaveSnapshot = { ...latestSaveSnapshot, dirtyVersion: 2, graph: { marker: "latest" } };
const queuedManualSave = saveCoordinator.request("manual");
assert.equal(saveRequests.length, 1, "manual intent during a slow save must not create a concurrent PATCH");
saveDeferreds[0].resolve({ id: "workflow-1", revision: 8 });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(saveRequests.length, 2, "edits made during a slow save must trigger one serialized follow-up PATCH");
assert.equal(saveRequests[1].revision, 8, "the follow-up PATCH must use the prior response revision");
assert.equal(saveRequests[1].dirtyVersion, 2);
assert.deepEqual(saveRequests[1].graph, { marker: "latest" }, "the follow-up PATCH must contain the latest graph");
saveDeferreds[1].resolve({ id: "workflow-1", revision: 9 });
assert.deepEqual(await Promise.all([firstAutomaticSave, queuedManualSave]), [true, true]);
assert.equal(maxActiveSaves, 1, "workflow PATCH requests must remain serialized");
assert.deepEqual(saveFeedback, [
  { dirtyVersion: 1, mode: "automatic" },
  { dirtyVersion: 2, mode: "manual" },
]);
assert.deepEqual(savingTransitions, [true, false], "saving feedback must remain stable across the serialized queue");

let coveredSaveCalls = 0;
const coveredDeferred = deferredSave();
const coveredFeedback = [];
const coveredCoordinator = createWorkflowSaveCoordinator({
  capture: () => ({ workflowId: "covered", dirtyVersion: 4, name: "covered", revision: 11, graph: {} }),
  save: async () => {
    coveredSaveCalls += 1;
    return coveredDeferred.promise;
  },
  onSaved: (_workflow, _snapshot, mode) => coveredFeedback.push(mode),
});
const coveredAutomatic = coveredCoordinator.request("automatic");
const coveredManual = coveredCoordinator.request("manual");
coveredDeferred.resolve({ id: "covered", revision: 12 });
assert.deepEqual(await Promise.all([coveredAutomatic, coveredManual]), [true, true]);
assert.equal(coveredSaveCalls, 1, "manual intent already covered by the in-flight snapshot must not duplicate the PATCH");
assert.deepEqual(coveredFeedback, ["manual"], "covered manual intent must still receive manual-save acknowledgement");

let retrySaveCalls = 0;
const retryErrors = [];
const retryCoordinator = createWorkflowSaveCoordinator({
  capture: () => ({ workflowId: "retry", dirtyVersion: 3, name: "retry", revision: 2, graph: {} }),
  save: async () => {
    retrySaveCalls += 1;
    if (retrySaveCalls === 1) throw new Error("temporary failure");
    return { id: "retry", revision: 3 };
  },
  onError: (error) => retryErrors.push(error.message),
});
assert.equal(await retryCoordinator.request("automatic"), false);
assert.equal(await retryCoordinator.request("automatic"), false, "a failed automatic save must not loop");
assert.equal(retrySaveCalls, 1);
assert.equal(await retryCoordinator.request("manual"), true, "a later explicit manual save must retry");
assert.equal(retrySaveCalls, 2);
assert.deepEqual(retryErrors, ["temporary failure"]);
const resolveCanvasVisionInstruction = compileFunctions(executors, ["resolveCanvasVisionInstruction", "textValues"], "resolveCanvasVisionInstruction", { canvasVisionPresets: { describe: "默认图片描述" } });
const visionNode = { config: { preset: "describe", instruction: "默认节点指令" } };
assert.equal(resolveCanvasVisionInstruction(visionNode, [{ kind: "text", value: "  用户提示词  " }]), "用户提示词", "connected user text must fully replace the vision preset and node instruction");
assert.equal(resolveCanvasVisionInstruction(visionNode, [{ kind: "text", value: "第一条" }, { kind: "text", value: "第二条" }]), "第一条\n\n第二条", "multiple user prompts must preserve incoming order");
assert.equal(resolveCanvasVisionInstruction(visionNode, []), "默认图片描述\n\n默认节点指令", "legacy vision nodes without user text must retain preset fallback behavior");
const resolveCanvasCompositionVehicle = compileFunctions(executors, ["resolveCanvasCompositionVehicle", "textValues"], "resolveCanvasCompositionVehicle");
assert.equal(resolveCanvasCompositionVehicle({ config: { vehicle: "旧配置车型" } }, [{ kind: "text", value: "  小鹏 G6  " }]), "小鹏 G6", "connected vehicle text must override legacy node config");
assert.equal(resolveCanvasCompositionVehicle({ config: { vehicle: "  旧配置车型  " } }, []), "旧配置车型", "legacy composition nodes must retain their saved vehicle fallback");
assert.equal(resolveCanvasCompositionVehicle({ config: {} }, []), undefined, "new composition nodes may omit vehicle text");
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
  "./finished-body-policy": loadTsModule("src/lib/finished-body-policy.ts"),
  "./mock-data": {},
  "./model-image-input": { toModelImageUrl: async (url) => `prepared:${url}` },
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
      callback(null, command === "ffprobe" ? JSON.stringify({ format: { duration: "8", format_name: "mov,mp4" }, streams: [{ codec_type: "video", width: 3840, height: 2160 }] }) : "", "");
      return { on: () => undefined };
    },
  },
  "node:fs/promises": {
    mkdir: async () => undefined,
    copyFile: async () => undefined,
    rename: async () => undefined,
    rm: async () => undefined,
    stat: async (filePath) => {
      if (String(filePath).includes("canvas-tools")) throw new Error("missing");
      return { size: 1024, isFile: () => true };
    },
  },
  "../concurrency": { runWithConcurrencyPool: async (_name, task) => task() },
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
  "../concurrency": { runWithConcurrencyPool: async (_name, task) => task() },
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
requireText(page, [
  "createWorkflowSaveCoordinator",
  "workflowSaving",
  "manualSaveAcknowledged",
  'request(automatic ? "automatic" : "manual")',
  'workflowSaving ? "保存中" : manualSaveAcknowledged ? "画布已保存" : "保存"',
  "disabled={!activeWorkflow || busy}",
], "Canvas serialized save UI");
requireText(page, [
  "SeedancePromptComposer",
  "orderSeedanceFixedReferences",
  "resolveSeedanceFixedReferences",
  "seedance-reference",
  "seedanceMentionSequenceRef",
  "seedanceMentionMarker",
  "data-seedance-mention-id",
  'contentEditable = "false"',
  "event.clipboardData.getData(\"text/plain\")",
  'role="listbox"',
  'role="option"',
  "固定参考图",
  "Prompt 中存在已移除的图片引用",
], "Seedance structured mention Inspector");
requireText(page, ["onlyRenderVisibleElements", "displayedEdges", "markActiveCanvasEdges", "canvasViewportDetail", "syncCanvasViewportDetail", "dataset.canvasViewportDetail", 'classList.add("canvas-stage-viewport-moving")', 'classList.remove("canvas-stage-viewport-moving")'], "canvas viewport performance policy");
const canvasFlowNodeSource = page.slice(page.indexOf("function CanvasFlowNode"), page.indexOf("function CanvasNodeTextEditor"));
requireText(canvasFlowNodeSource, ["visibleImageUrls.map", "<Image src={url}"], "canvas media nodes must retain their mounted media subtree");
assert.ok(!canvasFlowNodeSource.includes("canvasViewportDetail"), "viewport detail must not conditionally remount Canvas node media");
requireText(page, ["CanvasTextSplitControls", "文本分割方式", "第几个分隔符", "CanvasTextSplitNodeResult", "CanvasTextSplitOutput", "未匹配，已全部作为正文", "getTextOutputArtifact", 'field.key === "delimiterIndex"'], "text split v2 UI");
requireText(page, ["CanvasTextConcatenateControls", "文本拼接分隔符", "清理文本首尾空白", 'node.type === "utility.text-concatenate"', 'field.kind === "boolean"', "canvas-inspector-toggle", "Combine"], "text concatenate UI");
requireText(page, ["NodeResizer", "CANVAS_NODE_SIZE_LIMITS", "displayedNodes", "applyCanvasNodeChanges", "change.setAttributes", "applyFlowNodeSize", "canvas-node-resize-handle", "canvas-node-resize-line"], "canvas node resizing UI");
requireText(page, ["CanvasNodeTextEditor", "setDraft(nextValue)", "document.activeElement !== editorRef.current", "data-node-id={nodeId}"], "canvas text editor caret preservation");
requireText(page, ["CanvasDisplayAnyNodeResult", "CanvasDisplayAnyArtifact", "getDisplayAnyArtifact", "outputs.preview", "等待上游结果", "没有图片内容", "没有视频内容", "飞书发布任务", "areCanvasPortKindsCompatible", "isQuickAddPortCompatible", "portKindLabel", "utility.display-any"], "display-any UI");
requireText(page, ["CanvasSaveImagesNodeResult", "getSaveImagesArtifact", "utility.save-images", "下载全部", "downloadCanvasSaveImages", "parseCanvasDownloadFilename", "URL.createObjectURL", "URL.revokeObjectURL", "下载成功", "下载失败", "Download", "downloadBusyRef.current", "disabled={busy}", "latestSuccessful?.nodeRun"], "save-images UI");
requireText(page, ["CanvasScheduleMainImageDownload", "downloadCanvasRunSaveImages", '["completed", "partial"].includes(main.status)', "main.mainRunId", "下载图片", "该主任务没有可下载的保存图片结果", "canvas-schedule-main-download"], "batch schedule save-images UI");
const requestedDownloadIndices = [];
const browserDownloads = [];
const revokedDownloadUrls = [];
let activeDownloads = 0;
let maxActiveDownloads = 0;
const canvasDownloadUrl = {
  createObjectURL: () => `blob:canvas-${browserDownloads.length}`,
  revokeObjectURL: (url) => revokedDownloadUrls.push(url),
};
const canvasDownloadDocument = {
  body: { append: () => undefined },
  createElement: () => ({
    hidden: false,
    href: "",
    download: "",
    click() { browserDownloads.push(this.download); },
    remove() {},
  }),
};
const canvasDownloadFetch = async (url) => {
  activeDownloads += 1;
  maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
  const index = Number(new URL(url, "http://localhost").searchParams.get("index"));
  requestedDownloadIndices.push(index);
  await Promise.resolve();
  activeDownloads -= 1;
  if (index === 1) return new Response("failed", { status: 500 });
  return new Response("image", {
    headers: { "Content-Disposition": `attachment; filename="car_000${index + 1}.png"; filename*=UTF-8''car_000${index + 1}.png` },
  });
};
const canvasDownloadFunctions = compileFunctions(
  page,
  ["parseCanvasDownloadFilename", "downloadCanvasSaveImages"],
  "{ parseCanvasDownloadFilename, downloadCanvasSaveImages }",
  { fetch: canvasDownloadFetch, URL: canvasDownloadUrl, document: canvasDownloadDocument },
);
assert.equal(canvasDownloadFunctions.parseCanvasDownloadFilename("attachment; filename=\"FluxPost_0001.png\"; filename*=UTF-8''%E8%BD%A6%E5%9E%8B%E5%9B%BE_0001.png"), "车型图_0001.png");
assert.equal(canvasDownloadFunctions.parseCanvasDownloadFilename("attachment; filename=\"car_0001.jpg\""), "car_0001.jpg");
assert.equal(canvasDownloadFunctions.parseCanvasDownloadFilename("attachment; filename*=UTF-8''..%2Fsecret.png"), undefined, "download filenames must reject path separators");
assert.deepEqual(await canvasDownloadFunctions.downloadCanvasSaveImages("run-1", "node-run-1", 3), { success: 2, failed: 1 }, "one failed image must not stop later downloads");
assert.deepEqual(requestedDownloadIndices, [0, 1, 2], "downloads must be requested in source order");
assert.equal(maxActiveDownloads, 1, "downloads must remain serial");
assert.deepEqual(browserDownloads, ["car_0001.png", "car_0003.png"]);
assert.equal(revokedDownloadUrls.length, 2, "every successful Blob URL must be released");
const scheduleDownloadCalls = [];
const scheduleDownloadFunctions = compileFunctions(
  page,
  ["getSaveImagesArtifact", "latestAttempts", "downloadCanvasRunSaveImages"],
  "{ downloadCanvasRunSaveImages }",
  {
    CANVAS_SAVE_IMAGE_MAX_ITEMS: 30,
    api: async (url) => url.includes("main-run-empty") ? ({
      run: { graphSnapshot: { nodes: [{ id: "save-empty", type: "utility.save-images" }] } },
      nodeRuns: [],
    }) : ({
      run: {
        graphSnapshot: {
          nodes: [
            { id: "save-b", type: "utility.save-images" },
            { id: "other", type: "utility.image-preview" },
            { id: "save-a", type: "utility.save-images" },
          ],
        },
      },
      nodeRuns: [
        { id: "save-a-old", nodeId: "save-a", status: "completed", attempt: 1, outputs: {} },
        { id: "save-a-new", nodeId: "save-a", status: "reused", attempt: 2, outputs: { downloads: { kind: "images", items: [{ url: "/a-1.png" }, { url: "/a-2.png" }] } } },
        { id: "save-b-run", nodeId: "save-b", status: "completed", attempt: 1, outputs: { downloads: { kind: "images", items: [{ url: "/b.png" }] } } },
      ],
    }),
    downloadCanvasSaveImages: async (runId, nodeRunId, count) => {
      scheduleDownloadCalls.push({ runId, nodeRunId, count });
      return nodeRunId === "save-b-run" ? { success: 1, failed: 0 } : { success: 1, failed: 1 };
    },
  },
);
assert.deepEqual(await scheduleDownloadFunctions.downloadCanvasRunSaveImages("main-run-1"), { success: 2, failed: 1 }, "batch downloads must combine every successful save node result");
assert.deepEqual(scheduleDownloadCalls, [
  { runId: "main-run-1", nodeRunId: "save-b-run", count: 1 },
  { runId: "main-run-1", nodeRunId: "save-a-new", count: 2 },
], "batch downloads must use latest attempts in immutable graph order");
await assert.rejects(
  () => scheduleDownloadFunctions.downloadCanvasRunSaveImages("main-run-empty"),
  /没有可下载的保存图片结果/u,
  "batch downloads must fail clearly when a main run has no save result",
);
requireText(page, ["ReactFlow", "onConnect", "wouldCreateCycle", "NodeInspector", "panOnDrag={isMobile}", "selectionOnDrag={!isMobile}", "nodesDraggable={!isMobile}", "RunSummary", "FlowingCanvasEdge", "canvas-port-row", "colorMode={flowColorMode}", "subscribeTheme", "CANVAS_CLIPBOARD_MIME", "dataTransferImageFiles", "isEditableClipboardTarget", "pasteFromSystemClipboard", "canvas-image-file-input", "CanvasNodeInteractionContext", "latestNodeRuns", "latestSuccessfulNodeRuns", "useMemo(() => latestAttempts", "(result.get(nodeRun.nodeId)?.attempt || 0) < nodeRun.attempt", "const selectedRun = explicitRun || data.runs[0]", "await refreshRun(selectedRun.id, workflowId)", "runSelectionIsExplicitRef", "focusCanvasNode", "selectedNodeId", "if (selectedNode) setSelectedNodeId(selectedNode.id)", "interaction?.selectedNodeId === node.id", "canvas-node-text-editor nodrag nopan nowheel", "event.currentTarget.focus({ preventScroll: true })", "interaction?.onNodeFocus(node.id)", "onClick={(event) => {", "onKeyDown={(event) => event.stopPropagation()}", "CanvasModelNodeResult", "CanvasImagePreviewNodeResult", "updateNodeExecutionMode", "仅运行此节点", "运行到此节点", 'requestRun([selectedNodeId], "isolated")', "打开评审", "历史版本 r", "最近成功结果 · r", "definition?.outputs", "isPreviewableModelArtifact", "artifact.value.trim()", "artifact.items.length > 0", "showArtifact", "运行完成，但没有可预览内容", "CanvasTextPreviewDialog", "CanvasVideoPreviewDialog", "CanvasImagePreviewDialog", "canvas-node-result-gallery", "canvas-node-result-gallery-open", "canvas-node-result-gallery-meta", "canvas-image-preview-open", "图片{index + 1}", "imageUrls.length}/16", "moveListItem", 'form.append("mode", "gpt-reference")', "edgeAnimationDelay", "pathLength={100}", "canvas-flow-edge-trail", "canvas-flow-edge-body", "canvas-flow-edge-core", "打开原图", "缩小图片", "放大图片", "重置图片缩放"], "canvas UI");
requireText(page, [
  "prepareCanvasClipboardPaste",
  "canvasClipboardRef",
  "canvasClipboardRef.current = payload",
  "navigator.clipboard?.readText",
  "pasteCanvasPayload(canvasClipboardRef.current)",
  "createCanvasWorkflowFile",
  "parseCanvasWorkflowFile",
  "canvasWorkflowFileName",
  "CANVAS_WORKFLOW_FILE_MAX_BYTES",
  "function exportWorkflowFile",
  "async function importWorkflowFile",
  'api<{ workflow: CanvasWorkflow }>("/api/canvas/workflows"',
  'accept="application/json,.json,.fluxpost-workflow.json"',
  'ariaLabel="导入工作流"',
  'ariaLabel="导出工作流"',
], "Canvas cross-workflow clipboard and portable file UI");
requireText(page, ["ContentPoolSnapshotPicker", "LibraryImageSnapshotPicker", "contentPoolSnapshotConfig", "刷新快照", "刷新所选素材", "CanvasQuickAdd", "resolveQuickAddConnection", "quickAddChoices", "isQuickAddTargetOccupied", "eventPoint", "stageCenter", 'event.key === "Tab"', 'event.key === "ArrowDown"', 'event.key === "ArrowUp"', 'event.key === "Enter"', 'event.key === "Escape"', '.closest(".react-flow__pane")', "screenToFlowPosition", "isQuickAddPortCompatible", "该输入端口已连接"], "snapshot pickers and ComfyUI quick add");
requireText(page, ["canvasHistoryLimit", "createCanvasHistory", "commitCanvasHistory", "stepCanvasHistory", "scheduleCanvasHistoryCommit", "restoreCanvasHistory", "event.altKey", 'event.key.toLowerCase() === "s"', 'event.key.toLowerCase() === "z"', 'event.key.toLowerCase() === "y"', 'event.key.toLowerCase() === "a"', 'aria-keyshortcuts="Control+Enter Meta+Enter"', 'aria-keyshortcuts="Control+Alt+Enter Meta+Alt+Enter"', 'ariaKeyShortcuts="Control+S Meta+S"', "aria-keyshortcuts={ariaKeyShortcuts}"], "canvas shortcuts and history");
requireText(page, ["paletteVisible", "canvas-workspace-palette-hidden", "canvas-palette-collapsed", "PanelLeftClose", "PanelLeftOpen", "CanvasTaskCenter", "openTaskCenter", "loadTaskCenterRuns", 'api<{ runs: CanvasRun[] }>("/api/canvas/runs")', "loadTaskRun", "CanvasTaskFilter", "isActiveCanvasRun", "isFailedCanvasRun", "mergeTaskRunHistory", "canvas-task-center-button"], "collapsible node library and task center");
assert.ok(page.includes("await startRun(data.plan, targetNodeIds, runMode);"), "successful canvas plans must enqueue directly");
assert.ok(!page.includes("ConfirmationDialog"), "canvas runs must not show a paid or external-write confirmation dialog");
assert.ok(!page.includes("setConfirmation"), "canvas runs must not retain confirmation state");
assert.ok(!page.includes("width={1600}"), "image preview must not impose a fixed 4:3 intrinsic width");
assert.ok(!page.includes("height={1200}"), "image preview must not impose a fixed 4:3 intrinsic height");
assert.ok(!page.includes("style={{ top:"), "canvas handles must be positioned by their port rows, not node-level pixel offsets");
const latestAttempts = compileFunction(page, "latestAttempts");
const markActiveCanvasEdges = compileFunction(page, "markActiveCanvasEdges");
const viewportDetailFunctions = compileFunctions(
  page,
  ["canvasViewportDetail", "syncCanvasViewportDetail"],
  "({ canvasViewportDetail, syncCanvasViewportDetail })",
  { canvasViewportDetailZoom: { reduced: 0.65, overview: 0.35 } },
);
assert.equal(viewportDetailFunctions.canvasViewportDetail(1), "full");
assert.equal(viewportDetailFunctions.canvasViewportDetail(0.65), "full", "the full-detail threshold must be inclusive");
assert.equal(viewportDetailFunctions.canvasViewportDetail(0.64), "reduced");
assert.equal(viewportDetailFunctions.canvasViewportDetail(0.35), "reduced", "the reduced-detail threshold must be inclusive");
assert.equal(viewportDetailFunctions.canvasViewportDetail(0.34), "overview");
let viewportDetailWrites = 0;
const viewportDetailDataset = new Proxy({}, {
  set(target, key, value) {
    viewportDetailWrites += 1;
    target[key] = value;
    return true;
  },
});
const viewportDetailStage = { dataset: viewportDetailDataset };
viewportDetailFunctions.syncCanvasViewportDetail(viewportDetailStage, 1);
viewportDetailFunctions.syncCanvasViewportDetail(viewportDetailStage, 0.8);
assert.equal(viewportDetailWrites, 1, "moves inside one detail tier must not rewrite the stage dataset");
viewportDetailFunctions.syncCanvasViewportDetail(viewportDetailStage, 0.5);
assert.equal(viewportDetailWrites, 2, "crossing a detail threshold must update the stage dataset once");
const canvasEdgeFixtures = [
  { id: "active-source", source: "running", target: "idle" },
  { id: "active-target", source: "idle", target: "queued" },
  { id: "inactive", source: "idle", target: "completed" },
];
const projectedEdges = markActiveCanvasEdges(canvasEdgeFixtures, new Map([
  ["running", { nodeId: "running", status: "running" }],
  ["queued", { nodeId: "queued", status: "queued" }],
  ["completed", { nodeId: "completed", status: "completed" }],
]));
assert.equal(projectedEdges.find((edge) => edge.id === "active-source")?.data?.beamActive, true, "an edge leaving a running node must retain its beam");
assert.equal(projectedEdges.find((edge) => edge.id === "active-target")?.data?.beamActive, true, "an edge entering a queued node must retain its beam");
assert.equal(projectedEdges.find((edge) => edge.id === "inactive")?.data?.beamActive, false, "an idle edge must remain visually distinct from a running-related edge");
const currentGraph = compileFunction(page, "currentGraph");
const projectedGraph = currentGraph(
  [{ id: "node", position: { x: 10, y: 20 }, data: { canvasNode: { id: "node", type: "input.text", version: 1, position: { x: 0, y: 0 }, config: {} } } }],
  [{ id: "edge", source: "node", target: "node", sourceHandle: "text", targetHandle: "prompt", data: { beamActive: true, canvasViewportDetail: "overview" } }],
  { x: 1, y: 2, zoom: 0.34 },
);
assert.deepEqual(projectedGraph.edges, [{ id: "edge", source: "node", target: "node", sourcePort: "text", targetPort: "prompt" }], "display-only viewport and beam data must not persist in graph edges");
assert.ok(!JSON.stringify(projectedGraph).includes("canvasViewportDetail"), "viewport detail must remain a stage-only display concern");
const getTextOutputArtifact = compileFunction(page, "getTextOutputArtifact");
assert.equal(getTextOutputArtifact({ outputs: { head: { kind: "text", value: "标题" } } }, "head")?.value, "标题");
assert.equal(getTextOutputArtifact({ outputs: { head: { kind: "text", value: "   " } } }, "head"), undefined, "empty title artifacts must not render or flow through the v2 result UI");
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
const mergeTaskRunHistory = compileFunction(page, "mergeTaskRunHistory", { mergeRunHistory });
const otherWorkflowRun = { id: "other-workflow", workflowId: "other", createdAt: "2026-07-24T03:00:00.000Z", status: "running" };
assert.deepEqual(
  mergeTaskRunHistory([newestRun, olderRun, otherWorkflowRun], { ...olderRun, status: "failed" }).map((run) => run.id),
  ["other-workflow", "new", "old"],
  "task-center refreshes must preserve runs from other workflows and chronological ordering",
);
const canvasHistoryLimit = 50;
const historyFunctions = compileFunctions(
  page,
  ["canvasGraphsEqual", "createCanvasHistory", "commitCanvasHistory", "stepCanvasHistory"],
  "({ createCanvasHistory, commitCanvasHistory, stepCanvasHistory })",
  { canvasHistoryLimit },
);
const historyGraph = (id) => ({ nodes: [{ id, position: { x: 0, y: 0 }, data: {} }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
let canvasHistory = historyFunctions.createCanvasHistory(historyGraph("base"));
canvasHistory = historyFunctions.commitCanvasHistory(canvasHistory, historyGraph("one"));
canvasHistory = historyFunctions.commitCanvasHistory(canvasHistory, historyGraph("two"));
let historyStep = historyFunctions.stepCanvasHistory(canvasHistory, historyGraph("two"), -1);
assert.equal(historyStep.graph.nodes[0].id, "one", "undo must restore the previous graph");
historyStep = historyFunctions.stepCanvasHistory(historyStep.history, historyGraph("one"), 1);
assert.equal(historyStep.graph.nodes[0].id, "two", "redo must restore the next graph");
historyStep = historyFunctions.stepCanvasHistory(historyStep.history, historyGraph("branch"), -1);
const branchedHistory = historyFunctions.commitCanvasHistory(historyStep.history, historyGraph("replacement"));
assert.equal(branchedHistory.entries.at(-1).nodes[0].id, "replacement", "a new edit after undo must replace the abandoned redo branch");
assert.ok(!branchedHistory.entries.some((graph) => graph.nodes[0].id === "branch"), "the transient current graph must not leak into a replacement branch");
let boundedHistory = historyFunctions.createCanvasHistory(historyGraph("start"));
for (let index = 0; index < canvasHistoryLimit + 8; index += 1) boundedHistory = historyFunctions.commitCanvasHistory(boundedHistory, historyGraph(`edit-${index}`));
assert.equal(boundedHistory.entries.length, canvasHistoryLimit, "canvas history must remain bounded");
assert.equal(boundedHistory.index, canvasHistoryLimit - 1, "bounded history must keep its index on the newest entry");
const quickAddDefinitions = [
  { type: "input.content-pool", label: "内容池", description: "快照", category: "input", inputs: [], outputs: [{ id: "title", label: "标题", kind: "text" }, { id: "body", label: "正文", kind: "text" }] },
  { type: "compose.social-post", label: "内容组装", description: "组装", category: "compose", inputs: [{ id: "title", label: "标题", kind: "text" }, { id: "body", label: "正文", kind: "text" }, { id: "vehicle", label: "车型", kind: "text" }], outputs: [{ id: "post", label: "内容", kind: "socialPost" }] },
  { type: "utility.image-select", label: "图片选择", description: "筛选", category: "utility", inputs: [{ id: "images", label: "图片", kind: "images", multiple: true }], outputs: [{ id: "images", label: "图片", kind: "images" }] },
  { type: "utility.display-any", label: "展示任何", description: "预览", category: "utility", inputs: [{ id: "value", label: "任意", kind: "any" }], outputs: [] },
];
const quickAddChoices = compileFunctions(page, ["quickAddChoices", "isQuickAddPortCompatible", "isQuickAddTargetOccupied"], "quickAddChoices", { canvasNodeDefinitions: quickAddDefinitions, areCanvasPortKindsCompatible: areCanvasPortKindsCompatibleForUi });
assert.deepEqual(
  quickAddChoices({ nodeId: "source", portId: "text", handleType: "source", kind: "text" }, []).map((choice) => `${choice.definition.type}:${choice.port.id}`),
  ["compose.social-post:title", "compose.social-post:body", "compose.social-post:vehicle", "utility.display-any:value"],
  "dragging from a text output must expose ambiguous compatible input ports",
);
assert.deepEqual(
  quickAddChoices({ nodeId: "display", portId: "value", handleType: "target", kind: "any" }, []).map((choice) => `${choice.definition.type}:${choice.port.id}`),
  ["input.content-pool:title", "input.content-pool:body", "compose.social-post:post", "utility.image-select:images"],
  "reverse dragging from an any input must expose every typed output",
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
assert.equal((edgeFunction.match(/className="canvas-flow-edge-trail"/g) || []).length, 1, "each edge must render one restrained moving trail");
assert.equal((edgeFunction.match(/className="canvas-flow-edge-body"/g) || []).length, 1, "each edge must render one source-colored moving body");
assert.equal((edgeFunction.match(/className="canvas-flow-edge-core"/g) || []).length, 1, "each edge must render one short bright core");
requireText(edgeFunction, ["canvasEdgeBeamProfile(sourceX, sourceY, targetX, targetY)", "canvasEdgeAnimationDuration.active", "canvasEdgeAnimationDuration.idle", "edgeAnimationDelay(id, animationDuration)", "strokeDasharray={beam.trailDash}", "strokeDasharray={beam.bodyDash}", "strokeDasharray={beam.coreDash}"], "distance-aware canvas edge beam");
assert.ok(edgeFunction.includes("selected || data?.beamActive"), "selected or running-related edges must retain their emphasized beam state");
assert.ok(!edgeFunction.includes("beamActive ? <>"), "idle edges must keep their flow paths mounted");
requireText(page, ['minZoom={0.2}', '<Controls showInteractive={false} />'], "canvas native zoom policy");
const canvasStage = page.slice(page.indexOf('<div className="canvas-stage"'), page.indexOf('{activeWorkflow ? <CanvasNodeInteractionContext.Provider'));
requireText(canvasStage, [
  "onDragOver={(event) => handleCanvasMediaDragOver(event)}",
  "onDrop={(event) => void handleCanvasMediaDrop(event)}",
], "canvas local media drop surface");
const imageDropHandler = page.slice(page.indexOf("function handleCanvasMediaDragOver"), page.indexOf("async function pasteFromSystemClipboard"));
requireText(imageDropHandler, [
  "dataTransferHasImageFile(event.dataTransfer)",
  "dataTransferImageFiles(event.dataTransfer)",
  "dataTransferHasVideoFile(event.dataTransfer)",
  "dataTransferVideoFiles(event.dataTransfer)",
  'event.dataTransfer.dropEffect = "copy"',
  "reactFlowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY })",
  "canvasImageDropTargetId(event.target, nodes)",
  "importImageFiles(files, targetNodeId, position)",
], "canvas local image drop behavior");
const dataTransferHasImageFile = compileFunction(page, "dataTransferHasImageFile");
assert.equal(dataTransferHasImageFile({ items: [{ kind: "file", type: "image/png" }], files: [] }), true, "dragover must accept protected image items before File objects are readable");
assert.equal(dataTransferHasImageFile({ items: [{ kind: "file", type: "text/plain" }], files: [] }), false, "dragover must ignore non-image files");
const dataTransferImageFiles = compileFunction(page, "dataTransferImageFiles");
assert.deepEqual(
  dataTransferImageFiles({
    items: [
      { kind: "file", type: "image/png", getAsFile: () => ({ name: "one.png", type: "image/png" }) },
      { kind: "file", type: "text/plain", getAsFile: () => ({ name: "notes.txt", type: "text/plain" }) },
    ],
    files: [],
  }).map((file) => file.name),
  ["one.png"],
  "canvas drops must import image files only",
);
class CanvasDropElement {
  constructor(nodeId) { this.nodeId = nodeId; }
  closest(selector) { return selector === ".react-flow__node" ? { getAttribute: () => this.nodeId } : null; }
}
const canvasImageDropTargetId = compileFunction(page, "canvasImageDropTargetId", { Element: CanvasDropElement });
const dropNodes = [
  { id: "image-node", data: { canvasNode: { type: "input.images", version: 1 } } },
  { id: "gpt-image-node", data: { canvasNode: { type: "model.gpt-image", version: 2 } } },
  { id: "text-node", data: { canvasNode: { type: "input.text", version: 1 } } },
];
assert.equal(canvasImageDropTargetId(new CanvasDropElement("image-node"), dropNodes), "image-node", "dropping on an image input must append to that node");
assert.equal(canvasImageDropTargetId(new CanvasDropElement("gpt-image-node"), dropNodes), "gpt-image-node", "dropping on GPT Image v2 must append a reference image");
assert.equal(canvasImageDropTargetId(new CanvasDropElement("text-node"), dropNodes), undefined, "dropping outside an image-compatible node must create a new image input");
for (const removedZoomController of ["CanvasViewportControls", "canvasWheelZoomTarget", "canvasZoomEase", "canvasZoomTransition", "smoothCanvasWheelZoom", "zoomOnScroll={false}"]) {
  assert.ok(!page.includes(removedZoomController), `custom eased zoom controller must stay removed: ${removedZoomController}`);
}
const uploadRoute = read("src/app/api/canvas/media/route.ts");
requireText(uploadRoute, ["requireWorkspaceAccount", "request.formData()", "form.getAll(\"files\")", "maxCanvasUploadFiles", "maxCanvasUploadBytes", "saveRuntimeImageUpload", 'mode === "seedance-reference"', "appConfig.tosEnabled", "isTosRuntimeMediaConfigured", "public HTTP(S) URL"], "canvas media route");
const runtimeUpload = read("src/lib/runtime-image-upload.ts");
requireText(runtimeUpload, ["sniffImageFormat(buffer)", "format?.browserSupported", "persistRuntimeMedia", 'directory: "review-uploads" | "canvas-uploads"'], "runtime image upload");
const styles = read("src/app/globals.css");
requireText(styles, [".canvas-flow-edge-flowing .canvas-flow-edge-core", ".canvas-flow-edge-beam-active .canvas-flow-edge-trail", ".canvas-stage-viewport-moving .canvas-flow-edge-trail", "animation: none", "filter: none"], "canvas edge performance styles");
requireText(styles, ['.canvas-stage[data-canvas-viewport-detail="reduced"]', '.canvas-stage[data-canvas-viewport-detail="overview"]', ".canvas-node:not(.canvas-node-selected)", ".canvas-stage-viewport-moving .react-flow__minimap", "visibility: hidden !important", "box-shadow: none"], "canvas viewport detail styles");
assert.ok(!styles.includes(".canvas-stage-viewport-moving .canvas-node-image-grid"), "viewport movement must not hide node image grids");
assert.ok(!styles.includes(".canvas-stage-viewport-moving .canvas-node-result"), "viewport movement must not hide node media results");
requireText(page, ["--xy-edge-stroke-selected"], "selected canvas edge color variable");
requireText(styles, [".react-flow__edge.selected .canvas-flow-edge-base", "stroke: var(--canvas-edge-color, var(--accent))"], "selected canvas edge color policy");
requireText(styles, [".canvas-stage .react-flow__viewport { will-change: transform; }"], "canvas viewport compositor hint");
assert.ok(!styles.includes(".canvas-confirm-dialog"), "removed canvas confirmation UI must not leave dead styles");
assert.ok(!styles.includes(".canvas-confirm-detail"), "removed canvas confirmation details must not leave dead styles");
requireText(styles, [".canvas-node-resized", ".canvas-node-content", ".canvas-node-resize-handle", ".canvas-node-resize-line"], "canvas node resizing styles");
requireText(styles, [".canvas-save-images-actions", ".canvas-save-images-feedback"], "save-images result styles");
requireText(styles, [".canvas-workspace-palette-hidden", ".canvas-palette-collapsed", ".canvas-palette-dismiss", ".canvas-task-center", ".canvas-task-center-panel", ".canvas-task-center-tools", ".canvas-task-filters", ".canvas-task-center-body", ".canvas-task-list", ".canvas-task-detail", ".canvas-task-center-button"], "collapsible palette and task-center styles");
requireText(styles, ["--canvas-stage:", ".canvas-port-input .react-flow__handle-left", ".canvas-port-output .react-flow__handle-right", ".canvas-flow-edge-base", ".canvas-flow-edge-trail", ".canvas-flow-edge-body", ".canvas-flow-edge-core", "--canvas-edge-peak-opacity", "--canvas-edge-duration", "--canvas-edge-layer-start", "--canvas-edge-layer-end", "var(--canvas-edge-duration, 3.6s)", "@keyframes canvas-edge-beam", "prefers-reduced-motion", ".canvas-flow-edge-trail, .canvas-flow-edge-body, .canvas-flow-edge-core { display: none;", ".canvas-selection-actions", ".canvas-node-text-editor", ".canvas-node-result", ".canvas-node-result-gallery", ".canvas-node-result-gallery-open", ".canvas-node-result-gallery-meta", ".canvas-node-video-result", ".canvas-node-bypassed", ".canvas-node-disabled", ".canvas-node-mode-menu", ".canvas-result-viewer-backdrop", ".canvas-image-preview-list", ".canvas-image-preview-list.is-ordered", "background-size: contain", ".canvas-image-viewer-backdrop", ".canvas-image-viewer-stage", ".canvas-image-viewer-image", ".canvas-snapshot-picker", ".canvas-picker-results", ".canvas-picker-selected", ".canvas-quick-add", ".canvas-quick-add-search", ".canvas-quick-add-list", ".canvas-quick-add-group", ".canvas-quick-add-empty"], "canvas theme, edge, result preview, picker, and quick-add styles");
requireText(styles, [".canvas-stage .react-flow__pane.draggable { cursor: grab; }", ".canvas-stage .react-flow__pane.dragging { cursor: grabbing; }", ".canvas-stage .react-flow__pane.selection { cursor: default; }"], "canvas selection and pan cursors");
assert.ok(!/canvas-flow-edge-trail[^}]*stroke-width:\s*(?:9|11)/.test(styles), "canvas trail must remain restrained");
assert.ok(!styles.includes("stroke-dasharray: 2 12"), "canvas edges must not use the old repeated short-dash treatment");
assert.ok(!styles.includes("stroke-dasharray: 14 86"), "canvas edges must not restore the long fixed white highlight");
assert.ok(!styles.includes("animation: canvas-edge-beam 2.3s"), "canvas edges must use state-aware animation duration");
assert.ok(read("src/app/page.tsx").includes('href="/canvas"'), "home navigation should link to canvas");

console.log("Canvas workflow checks passed.");
