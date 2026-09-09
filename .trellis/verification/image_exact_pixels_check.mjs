import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import ts from "typescript";

const contracts = loadModule("src/lib/image-providers/contracts.ts");
const toApis = loadModule("src/lib/toapis-image-api.ts", { "./image-providers/contracts": contracts });
const source = readFileSync("src/lib/image-generation.ts", "utf8");
const ast = ts.createSourceFile("image-generation.ts", source, ts.ScriptTarget.Latest, true);
const names = [
  "assertGeneratedImageSize", "parseRequestedPixelSize", "saveBase64Images",
  "materializeGeneratedImageUrls", "downloadGeneratedImageUrl", "callImagesApiInPool",
  "requestSingleToApisImagesApiForRoute", "isImageTaskSourceFallbackError",
  "isImageProviderCapabilityError", "isImageTaskTimeoutError", "callResponsesImageToolInPool",
  "buildImageSizeConstrainedPrompt", "buildStandardImagesApiRequest", "buildStandardImagesGenerationBody",
];
const declarations = names.map((name) => {
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, `Missing runtime function ${name}`);
  return declaration.getText(ast);
}).join("\n");
const code = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const exact = { size: "1200x1600", quality: "medium" };
const matchingPng = await fixture(1200, 1600, "png");
const matchingJpeg = await fixture(1200, 1600, "jpeg");
const undersized = await fixture(768, 1024, "png");
const swapped = await fixture(1600, 1200, "png");

for (const buffer of [matchingPng, matchingJpeg]) {
  const runtime = harness(buffer);
  await runtime.api.assertGeneratedImageSize(buffer, exact);
  await runtime.api.saveBase64Images([buffer.toString("base64")], exact);
  assert.deepEqual(runtime.state.writes[0], buffer, "Accepted bytes must not be resized or re-encoded");
  await runtime.api.materializeGeneratedImageUrls(["https://fixture.invalid/output.png"], exact);
  assert.deepEqual(runtime.state.writes[1], buffer);
  assert.equal(runtime.state.uploads, 2);
}

for (const buffer of [undersized, swapped]) {
  const runtime = harness(buffer);
  const mismatch = (error) => error instanceof contracts.ImageProviderError
    && /要求 1200x1600/.test(error.message)
    && /实际返回 (768x1024|1600x1200)/.test(error.message)
    && !error.retryable && !error.failoverAllowed && error.taskAccepted;
  await assert.rejects(runtime.api.saveBase64Images([buffer.toString("base64")], exact), mismatch);
  await assert.rejects(runtime.api.materializeGeneratedImageUrls(["https://fixture.invalid/output.png"], exact), mismatch);
  assert.equal(runtime.state.writes.length, 0);
  assert.equal(runtime.state.uploads, 0);
  assert.equal(runtime.state.logs.some((entry) => entry.status === "success"), false);
  try { await runtime.api.assertGeneratedImageSize(buffer, exact); } catch (error) {
    assert.equal(runtime.api.isImageTaskSourceFallbackError(error), false);
  }
}

const corrupt = harness(Buffer.from("not an image"));
await assert.rejects(corrupt.api.saveBase64Images([Buffer.from("not an image").toString("base64")], exact));
assert.equal(corrupt.state.uploads, 0);
assert.equal(corrupt.state.writes.length, 0);

for (const options of [{ size: "auto" }, { ...exact, ratio: "3:4", resolution: "1k" }]) {
  const runtime = harness(undersized);
  await runtime.api.saveBase64Images([undersized.toString("base64")], options);
  assert.deepEqual(runtime.state.writes[0], undersized, "Explicit auto/ratio mode must not inherit a pixel constraint");
}

const blocked = harness(undersized, "toapis_async");
const inputError = (error) => error instanceof contracts.ImageProviderError
  && /1200x1600/.test(error.message) && error.category === "input" && !error.retryable && !error.failoverAllowed;
await assert.rejects(blocked.api.callImagesApiInPool("fixture", 1, exact, ["local-reference.png"]), inputError);
assert.equal(blocked.state.preparations, 0, "Reject unsupported exact pixels before downloading/preparing references");
await assert.rejects(blocked.api.requestSingleToApisImagesApiForRoute("primary", "fixture", 1, Date.now(), exact, {}), inputError);
assert.equal(blocked.state.referenceUploads, 0, "Reject before paid-provider reference upload");
assert.equal(blocked.state.requests, 0);
try { toApis.resolveToApisImageSize("1200x1600"); } catch (error) {
  assert.equal(blocked.api.isImageTaskSourceFallbackError(error), false);
}

for (const resume of [undefined, { resumeTaskId: "already-accepted", resumeTaskRoute: "primary" }]) {
  const runtime = harness(undersized, resume ? "toapis_async" : "openai_sse");
  await assert.rejects(runtime.api.callImagesApiInPool("fixture", 1, exact, [], undefined, resume), /实际返回 768x1024/);
  assert.equal(runtime.state.generationRequests, 1, "Dimension errors must not trigger another provider call");
  assert.equal(runtime.state.uploads, 0);
  assert.equal(runtime.state.logs.some((entry) => entry.status === "success"), false);
}

const responses = harness(undersized);
await assert.rejects(responses.api.callResponsesImageToolInPool("fixture", 1, exact), /实际返回 768x1024/);
assert.equal(responses.state.requestBodies[0].tools[0].size, "1200x1600");
assert.equal(responses.state.uploads, 0);

const standard = harness(matchingPng);
const jsonRequest = await standard.api.buildStandardImagesApiRequest("primary", "fixture", 1, exact, [], true, false);
assert.equal(JSON.parse(jsonRequest.body).size, "1200x1600");
const multipart = await standard.api.buildStandardImagesApiRequest("primary", "fixture", 1, exact, [
  { filePath: "fixture.png", fileName: "fixture.png", mimeType: "image/png" },
], true, true);
assert.equal(multipart.body.get("size"), "1200x1600");
assert.equal(contracts.buildOpenAiJsonGenerationBody({ model: "fixture", prompt: "fixture", size: "1024x1536" }).size, "1024x1536");
assert.throws(() => contracts.buildOpenAiJsonGenerationBody({ model: "fixture", prompt: "fixture", size: "1200x1600" }), /does not support/);
console.log("Exact image pixel contract and mocked persistence checks passed.");

async function fixture(width, height, format) {
  return sharp({ create: { width, height, channels: 3, background: "#334455" } }).toFormat(format).toBuffer();
}

function harness(buffer, profile = "openai_sse") {
  const state = { writes: [], uploads: 0, logs: [], requests: 0, generationRequests: 0, preparations: 0, referenceUploads: 0, requestBodies: [] };
  const dependencies = {
    sharp, path, Buffer, process, FormData, Blob,
    ImageProviderError: contracts.ImageProviderError,
    IMAGE_PROVIDER_CAPABILITIES: contracts.IMAGE_PROVIDER_CAPABILITIES,
    resolveToApisImageSize: toApis.resolveToApisImageSize,
    buildToApisGenerationBody: toApis.buildToApisGenerationBody,
    compactError: (error) => error instanceof Error ? error.message : String(error),
    randomUUID: () => "fixture", mkdir: async () => {},
    writeFile: async (_file, bytes) => { state.writes.push(Buffer.from(bytes)); },
    readFile: async () => buffer,
    persistRuntimeMedia: async ({ publicPath }) => { state.uploads++; return publicPath; },
    recordExecutionLog: async (entry) => { state.logs.push(entry); },
    fetchWithTimeout: async (_url, request) => {
      state.requests++;
      if (request?.body) state.requestBodies.push(JSON.parse(request.body));
      return new Response(buffer, { headers: { "content-type": "image/png" } });
    },
    readJsonResponse: async () => ({ output: [{ type: "image_generation_call", result: buffer.toString("base64") }] }),
    buildMediaRequestHeaders: () => ({}),
    normalizeMimeType: (mime) => mime,
    extensionFromMimeType: () => "png",
    maxGeneratedImageUrlBytes: 10_000_000,
    imageRequestTimeoutMs: 10000,
    openaiImageRouteConfig: () => ({ profile, model: "fixture" }),
    resolveActiveStandardImagesApiRoute: () => "primary",
    activeStandardImagesApiRoute: "primary",
    prepareReferenceImages: async () => {
      state.preparations++;
      return { files: [], entries: [], values: [] };
    },
    makeResumedTaskReferences: () => ({ files: [], entries: [], values: [] }),
    requestImagesApiWithRetry: async () => {
      state.requests++;
      state.generationRequests++;
      return { data: [{ url: "https://fixture.invalid/output.png" }] };
    },
    prepareToApisReferenceUrls: async () => { state.referenceUploads++; return []; },
    appConfig: { openaiImageModel: "fixture", openaiTextModel: "fixture" },
    openaiImageUrl: () => "https://fixture.invalid/generation",
    openaiImageHeaders: () => ({}),
  };
  return { state, api: new Function(...Object.keys(dependencies), `${code}\nreturn { ${names.join(",")} };`)(...Object.values(dependencies)) };
}

function loadModule(file, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
