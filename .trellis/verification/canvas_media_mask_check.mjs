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

assert.match(typesSource, /"utility\.media-mask"/);
assert.match(typesSource, /shape: "rectangle" \| "rounded-rectangle"/);
assert.match(typesSource, /mode: "solid" \| "blur" \| "mosaic" \| "image"/);
assert.match(typesSource, /validateCanvasMediaMaskConfig/);
assert.match(registrySource, /type: "utility\.media-mask"/);
assert.match(registrySource, /inputs: \[[\s\S]*id: "images"[\s\S]*id: "videos"/);
assert.match(toolsSource, /export async function maskCanvasMedia/);
assert.match(toolsSource, /runWithConcurrencyPool\("localVideo"/);
assert.match(toolsSource, /maskGeometryExpressions/);
assert.match(pageSource, /CanvasMediaMaskEditor/);
assert.match(pageSource, /utility\.media-mask/);

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
