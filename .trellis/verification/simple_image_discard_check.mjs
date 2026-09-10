import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const imageSource = readFileSync("src/lib/image-generation.ts", "utf8");
const simpleSource = readFileSync("src/lib/simple-runs.ts", "utf8");
const ast = ts.createSourceFile("image-generation.ts", imageSource, ts.ScriptTarget.Latest, true);
const functionNames = [
  "generateImagesFromPrompt", "runSelectedImageTask", "normalizeImageOptions",
  "normalizeTaskConcurrency", "normalizeOutputCompression", "normalizeProviderPrompt",
  "makeTaskGenerationResult", "isStrictDualReferenceTask", "getTaskReferenceImages",
  "resolveTaskEndpointPath", "recordStrictTaskNeedsReview", "recordKeepTaskNeedsReview",
];
const declarations = functionNames.map((name) => {
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, `Missing function ${name}`);
  return declaration.getText(ast).replace(/^export\s+/, "");
});
const output = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
let sourceReads = 0;
const logs = [];
const scope = {
  appConfig: { openaiImageEndpoint: "images" },
  concurrencyConfig: { image: 3 },
  normalizeImageGenerationSize: (value) => value || "auto",
  normalizeImageQuality: (value) => value || "medium",
  validateImageBackground: (value) => value,
  isImageProviderConfigured: () => true,
  isComfyUiKleinConfigured: () => true,
  openaiImageRouteConfig: () => ({ profile: "openai_sse" }),
  resolveActiveStandardImagesApiRoute: () => "primary",
  compactError: (error) => error instanceof Error ? error.message : String(error),
  recordExecutionLog: async (entry) => { logs.push(entry); },
  buildSingleImageTaskPrompt: (prompt) => prompt,
  mapWithConcurrency: async (items, _limit, callback) => Promise.all(items.map(callback)),
  runImageProviderTask: async (_prompt, task) => {
    if (task.failure) throw new Error(task.failure);
    return [`generated:${task.id}`];
  },
  resolveDirectSourceImageUrl: async (url) => { sourceReads += 1; return url; },
  resolveSourceFallback: async (task) => { sourceReads += 1; return { ok: true, url: task.url }; },
  shouldFallbackComfyUiKleinTask: (task) => task.provider === "comfyui_klein",
  isImageTaskSourceFallbackError: () => true,
  isImageTaskTimeoutError: (error) => /timeout/i.test(error.message),
  resolveImageTaskFallbackTimeoutMs: () => 180_000,
};
const generate = Function(...Object.keys(scope), `${output}\nreturn generateImagesFromPrompt;`)(...Object.values(scope));
const makeTask = (id, patch = {}) => ({ id, label: id, url: `source:${id}`, mode: "wash", kind: "other", selected: true, ...patch });

for (const taskConcurrency of [1, 3]) {
  for (const failure of ["request timeout", "HTTP 503", "unsupported image", "provider failed"]) {
    for (const provider of ["openai", "comfyui_klein"]) {
      sourceReads = 0;
      const failed = makeTask("failed", { failure, provider });
      const result = await generate("prompt", 1, [failed, makeTask("success")], { allowSourceFallback: false, taskConcurrency });
      assert.deepEqual(result.imageUrls, ["generated:success"]);
      assert.equal(result.taskResults[0].status, "failed");
      assert.equal(result.taskResults[0].fallbackUsed, false);
      assert.equal(result.taskResults[0].message, failure);
      assert.equal(sourceReads, 0, "Discarded tasks must never read their original image");
      await assert.rejects(generate("prompt", 1, [failed], { allowSourceFallback: false, taskConcurrency }), /All image tasks failed/);
      assert.equal(sourceReads, 0);
    }
  }
}

sourceReads = 0;
const keepResult = await generate("prompt", 1, [makeTask("keep", { mode: "keep" })], { allowSourceFallback: false });
assert.deepEqual(keepResult.imageUrls, ["source:keep"]);
assert.equal(sourceReads, 1, "Explicit keep mode remains supported");

sourceReads = 0;
const strictResult = await generate("prompt", 1, [makeTask("strict", { referencePolicy: "strict_dual_reference", failure: "timeout" })], { allowSourceFallback: false });
assert.deepEqual(strictResult.imageUrls, []);
assert.equal(strictResult.status, "needs_review");
assert.equal(sourceReads, 0, "Strict review tasks must never fall back either");

for (const provider of ["openai", "comfyui_klein"]) {
  const result = await generate("prompt", 1, [makeTask("legacy", { provider, failure: "timeout" })]);
  assert.deepEqual(result.imageUrls, ["source:legacy"], "Unrelated callers retain their existing policy");
}
assert.ok(logs.some((entry) => entry.action === "Image task failed" && entry.status === "error"));

const simpleAst = ts.createSourceFile("simple-runs.ts", simpleSource, ts.ScriptTarget.Latest, true);
let calls = 0;
const visit = (node) => {
  if (ts.isCallExpression(node) && node.expression.getText(simpleAst) === "generateImagesFromPrompt") {
    calls += 1;
    const options = node.arguments[3];
    assert.ok(options && ts.isObjectLiteralExpression(options));
    assert.ok(options.properties.some((property) => ts.isPropertyAssignment(property)
      && property.name.getText(simpleAst) === "allowSourceFallback"
      && property.initializer.kind === ts.SyntaxKind.FalseKeyword), "Every simple-run reference-image call must disable source fallback");
  }
  ts.forEachChild(node, visit);
};
visit(simpleAst);
assert.equal(calls, 2);
assert.match(imageSource, /if \(imageOptions\.allowSourceFallback !== false && isImageTaskSourceFallbackError\(error\)\)/);
console.log("Simple image discard check passed.");
