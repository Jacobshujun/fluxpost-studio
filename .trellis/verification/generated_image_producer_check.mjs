import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const files = {
  "src/lib/image-generation.ts": ["saveBase64Images", "downloadGeneratedImageUrl"],
  "src/lib/comfyui-klein.ts": ["saveComfyOutputImages"],
  "src/lib/qwen-image.ts": ["generateQwenImages"],
};
for (const [file, expected] of Object.entries(files)) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found = [];
  function visit(node, owner) {
    if (ts.isFunctionDeclaration(node)) owner = node.name?.text;
    if (ts.isCallExpression(node) && node.expression.getText(source) === "captureGeneratedImage") {
      found.push(owner);
      assert(ts.isAwaitExpression(node.arguments[0]), "Capture must wait for persistence");
      assert.equal(node.arguments[0].expression.expression.getText(source), "persistRuntimeMedia");
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(source);
  assert.deepEqual(found.sort(), expected.sort(), `${file}: only true output saves capture provenance`);
}
for (const file of ["src/lib/canvas/executors.ts", "src/lib/original-batches.ts", "src/lib/simple-runs.ts", "src/app/api/images/route.ts"]) {
  const source = readFileSync(file, "utf8");
  assert(source.includes("withGeneratedImageContext("), `${file}: owner/task context must reach output saves`);
  assert(source.includes("ownerUserId:"));
}
assert(!readFileSync("src/lib/runtime-media-storage.ts", "utf8").includes("captureGeneratedImage"), "Inputs and caches must not be enrolled by generic storage");
assert(!readFileSync("src/lib/generated-image-backfill.ts", "utf8").includes("generateImagesFromPrompt"), "Backfill never invokes a model");
console.log("Generated producer persistence boundaries, owner/task propagation and input exclusion contracts passed.");
