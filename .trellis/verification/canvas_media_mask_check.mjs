import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const typesSource = read("src/lib/canvas/types.ts");
const registrySource = read("src/lib/canvas/registry.ts");
const toolsSource = read("src/lib/canvas/media-tools.ts");
const pageSource = read("src/app/canvas/page.tsx");
const serializationSource = read("src/lib/canvas/serialization.ts");

assert.match(typesSource, /"utility\.media-mask"/);
assert.match(typesSource, /shape: "rectangle" \| "rounded-rectangle"/);
assert.match(typesSource, /mode: "solid" \| "blur" \| "mosaic" \| "image"/);
assert.match(typesSource, /validateCanvasMediaMaskConfig/);
assert.match(registrySource, /type: "utility\.media-mask"/);
assert.match(registrySource, /inputs: \[[\s\S]*id: "images"[\s\S]*id: "videos"/);
assert.match(toolsSource, /export async function maskCanvasMedia/);
assert.match(toolsSource, /runWithConcurrencyPool\("localVideo"/);
assert.match(toolsSource, /maskGeometryExpressions/);
assert.match(toolsSource, /property === "x" \|\| property === "y" \? Math\.max\(0, rounded\) : Math\.max\(1, rounded\)/, "edge-aligned masks must allow zero-pixel x/y coordinates");
assert.match(toolsSource, /mediaFingerprint\("media-mask-v2"/, "mask renderer fixes must invalidate older derived-media cache entries");
assert.match(pageSource, /CanvasMediaMaskEditor/);
assert.match(pageSource, /utility\.media-mask/);
assert.match(serializationSource, /nodeType === "utility\.media-mask" && key === "mask"/);
assert.match(pageSource, /const activeRunId = selectedRunIdRef\.current;[\s\S]*const routeRun = !activeRunId && runId[\s\S]*const selectedRun = explicitRun/);

const getModelArtifact = loadTsFunctions(
  pageSource,
  ["getModelArtifact", "isPreviewableModelArtifact"],
  "getModelArtifact",
  {
    getCanvasNodeDefinition: () => ({
      outputs: [
        { id: "images", kind: "images" },
        { id: "videos", kind: "videos" },
      ],
    }),
  },
);
const videoArtifact = { kind: "videos", items: [{ url: "/generated/masked.mp4" }] };
const imageArtifact = { kind: "images", items: [{ url: "/generated/masked.png" }] };
assert.equal(getModelArtifact("utility.media-mask", { outputs: { videos: videoArtifact } }), videoArtifact, "video-only mask results must remain previewable when images is the first declared output");
assert.equal(getModelArtifact("utility.media-mask", { outputs: { images: imageArtifact } }), imageArtifact, "image-only mask results must remain previewable");
assert.equal(getModelArtifact("utility.media-mask", { outputs: { text: { kind: "text", value: "unexpected" } } }), undefined, "undeclared artifact kinds must not become previewable through compatibility fallback lookup");
assert.equal(getModelArtifact("utility.media-mask", { outputs: {} }), undefined, "empty mask results must keep the existing empty state");

const maskGeometryExpressions = loadTsFunctions(toolsSource, ["maskGeometryExpressions"], "maskGeometryExpressions");
assert.deepEqual(
  maskGeometryExpressions({ x: 0, y: 0, width: 1, height: 0.1 }, 1920, 1080),
  { x: "0", y: "0", width: "1920", height: "108" },
  "full-width edge masks must start at the exact top-left pixel",
);

const types = loadTsModule("src/lib/canvas/types.ts");
const valid = {
  protocolVersion: 1,
  regions: [{ id: "wm", shape: "rounded-rectangle", mode: "solid", x: 0.7, y: 0.04, width: 0.2, height: 0.08, opacity: 0.85, color: "#000000", startMs: 0, endMs: 5000, keyframes: [{ timeMs: 0, x: 0.7, y: 0.04, width: 0.2, height: 0.08 }, { timeMs: 3000, x: 0.65, y: 0.1, width: 0.2, height: 0.08 }] }],
};
assert.equal(types.validateCanvasMediaMaskConfig(valid).length, 0);
assert.ok(types.validateCanvasMediaMaskConfig({ protocolVersion: 1, regions: [{ ...valid.regions[0], opacity: 2 }] }).some((error) => /opacity/.test(error)));
assert.ok(types.validateCanvasMediaMaskConfig({ protocolVersion: 1, regions: [{ ...valid.regions[0], keyframes: [{ ...valid.regions[0].keyframes[1] }, { ...valid.regions[0].keyframes[0] }] }] }).some((error) => /ascending/.test(error)));
console.log("Canvas media mask contracts passed.");

function loadTsModule(relativePath) {
  const source = read(relativePath);
  const transformed = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const moduleRecord = { exports: {} };
  const sandbox = { module: moduleRecord, exports: moduleRecord.exports, require: () => ({}), console, process, __dirname: path.dirname(path.join(root, relativePath)), __filename: path.join(root, relativePath) };
  vm.runInNewContext(transformed, sandbox, { filename: relativePath });
  return moduleRecord.exports;
}

function loadTsFunctions(source, names, returnName, scope = {}) {
  const ast = ts.createSourceFile("canvas-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = names.map((name) => {
    const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `source is missing function ${name}`);
    return declaration.getText(ast);
  });
  const transformed = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
    fileName: "canvas-page.tsx",
  }).outputText;
  const keys = Object.keys(scope);
  return Function(...keys, `${transformed}\nreturn ${returnName};`)(...keys.map((key) => scope[key]));
}
