import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");
const contracts = loadTypescriptCommonJs("src/lib/image-providers/contracts.ts");

assert.deepEqual(contracts.IMAGE_PROVIDER_PROFILES, ["openai_json", "openai_sse", "toapis_async"]);
assert.deepEqual(contracts.IMAGE_PROVIDER_CAPABILITIES.toapis_async, {
  transport: "task_polling",
  referenceInput: "url_upload",
  acceptsCustomPixelSizes: false,
  taskBased: true,
});
assert.equal(contracts.normalizeImageProviderProfile(" OPENAI_JSON "), "openai_json");
assert.equal(contracts.normalizeImageProviderProfile("unknown"), undefined);
assert.equal(
  contracts.resolveImageProviderProfile({ explicitProfile: "openai_json", legacyDialect: "toapis", baseUrl: "https://toapis.com/v1" }),
  "openai_json",
  "An explicit profile must override the legacy dialect and hostname.",
);
assert.equal(
  contracts.resolveImageProviderProfile({ legacyDialect: "openai", baseUrl: "https://relay.example/v1" }),
  "openai_sse",
  "The legacy OpenAI dialect must preserve deployed SSE behavior.",
);
assert.equal(
  contracts.resolveImageProviderProfile({ legacyDialect: "toapis", baseUrl: "https://relay.example/v1" }),
  "toapis_async",
);
assert.equal(
  contracts.resolveImageProviderProfile({ legacyDialect: "auto", baseUrl: "https://img.toapis.com/v1" }),
  "toapis_async",
);
assert.equal(
  contracts.resolveImageProviderProfile({ legacyDialect: "auto", baseUrl: "https://relay.example/v1" }),
  "openai_sse",
);

const generationBody = contracts.buildOpenAiJsonGenerationBody({
  model: "gpt-image-2",
  prompt: "probe",
  size: "1024x1024",
  quality: "high",
});

for (const hostname of ["toapis.com", "api.toapis.com", "toapis.cn", "api.toapis.cn", "img.toapis.cn", "API.TOAPIS.CN"]) {
  const baseUrl = `https://${hostname}/v1`;
  for (const legacyDialect of [undefined, "auto"]) {
    assert.equal(contracts.resolveImageProviderProfile({ baseUrl, legacyDialect }), "toapis_async", baseUrl);
  }
  for (const explicitProfile of contracts.IMAGE_PROVIDER_PROFILES) {
    assert.equal(contracts.resolveImageProviderProfile({ baseUrl, explicitProfile }), explicitProfile);
  }
  assert.equal(contracts.resolveImageProviderProfile({ baseUrl, legacyDialect: "openai" }), "openai_sse");
}
for (const hostname of ["nottoapis.cn", "toapis.cn.example", "api.toapis.com.example", "relay.example"]) {
  assert.equal(contracts.resolveImageProviderProfile({ baseUrl: `https://${hostname}/v1` }), "openai_sse");
}
assert.deepEqual(generationBody, {
  model: "gpt-image-2",
  prompt: "probe",
  n: 1,
  size: "1024x1024",
  quality: "high",
});
assert.equal("stream" in generationBody, false);
assert.equal("response_format" in generationBody, false);
assert.equal("input_fidelity" in generationBody, false);
assert.throws(
  () => contracts.buildOpenAiJsonGenerationBody({ model: "gpt-image-2", prompt: "probe", size: "1200x1600" }),
  /does not support image size 1200x1600/,
);

assert.deepEqual(
  contracts.parseOpenAiJsonImageResponse(
    JSON.stringify({ data: [{ b64_json: "YWJj" }, { url: "https://files.example/result.png" }] }),
    "application/json; charset=utf-8",
  ),
  { data: [{ b64_json: "YWJj" }, { url: "https://files.example/result.png" }] },
);
assert.throws(
  () => contracts.parseOpenAiJsonImageResponse("<html>bad gateway</html>", "text/html"),
  /returned non-JSON response/,
);
assert.throws(
  () => contracts.parseOpenAiJsonImageResponse(JSON.stringify({ data: [] }), "application/json"),
  /did not contain an image/,
);

const acceptedError = new contracts.ImageProviderError("accepted task failed", {
  category: "provider",
  retryable: false,
  failoverAllowed: false,
  taskAccepted: true,
});
assert.equal(acceptedError.taskAccepted, true);
assert.equal(acceptedError.failoverAllowed, false);

const config = read("src/lib/config.ts");
const types = read("src/lib/types.ts");
const imageGeneration = read("src/lib/image-generation.ts");
const toApis = loadTypescriptCommonJs("src/lib/toapis-image-api.ts", { "./image-providers/contracts": contracts });
const imageAst = ts.createSourceFile("image-generation.ts", imageGeneration, ts.ScriptTarget.Latest, true);
const requestFunctions = ["requestSingleStandardImagesApiWithRetryForRoute", "requestSingleToApisImagesApiForRoute"];
const requestSource = requestFunctions.map((name) => {
  const declaration = imageAst.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(imageAst);
}).join("\n");
const requestCode = ts.transpileModule(requestSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const requestBoundary = new Error("Stop at the mocked provider boundary");
for (const hostname of ["toapis.com", "api.toapis.com", "toapis.cn", "api.toapis.cn"]) {
  for (const route of ["primary", "backup"]) {
    for (const model of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
      const baseUrl = `https://${hostname}/v1`;
      const routeConfig = { baseUrl, model, profile: contracts.resolveImageProviderProfile({ baseUrl }) };
      const requests = [];
      const dependencies = {
        openaiImageRouteConfig: (selectedRoute) => { assert.equal(selectedRoute, route); return routeConfig; },
        buildToApisGenerationBody: toApis.buildToApisGenerationBody,
        prepareToApisReferenceUrls: async (selectedRoute, references) => { assert.equal(selectedRoute, route); return references.urls; },
        imageRequestTimeoutMs: 1000,
        maxImageAttempts: 1,
        getRemainingTimeoutMs: () => 1000,
        openaiImageUrl: (endpoint, selectedRoute) => { assert.equal(selectedRoute, route); return `${baseUrl}/${endpoint}`; },
        openaiImageHeaders: (json, selectedRoute) => {
          assert.equal(json, true);
          assert.equal(selectedRoute, route);
          return { "Content-Type": "application/json" };
        },
        fetchWithTimeout: async (url, request) => { requests.push({ url, ...request }); throw requestBoundary; },
        toImageProviderTransportError: (error) => error,
      };
      const submit = new Function(...Object.keys(dependencies), `${requestCode}\nreturn requestSingleStandardImagesApiWithRetryForRoute;`)(...Object.values(dependencies));
      for (const urls of [[], ["https://fixture.invalid/reference.png"]]) {
        await assert.rejects(submit(route, "fixture prompt", 1, Date.now(), {
          size: "1536x2048", ratio: "3:4", resolution: "2k", quality: "medium",
        }, { urls }, urls.length ? "images/edits" : "images/generations"), (error) => error === requestBoundary);
        const request = requests.at(-1);
        assert.equal(request.url, `${baseUrl}/images/generations`);
        assert.equal(request.method, "POST");
        assert.equal(request.headers["Content-Type"], "application/json");
        const body = JSON.parse(request.body);
        assert.equal(body.model, model);
        assert.equal(body.prompt, "fixture prompt");
        assert.equal(body.n, 1);
        assert.equal(body.size, "3:4");
        assert.equal(body.resolution, "2k");
        assert.equal(body.quality, "high");
        assert.equal("response_format" in body, false);
        assert.equal("output_format" in body, false);
        assert.deepEqual(body.reference_images, urls);
        assert.equal("stream" in body, false);
        assert.equal("input_fidelity" in body, false);
      }
      assert.equal(requests.length, 2, "Each request reaches the provider boundary exactly once.");
    }
  }
}
const configPage = read("src/app/config/page.tsx");
const probeRoute = read("src/app/api/config/image-provider-check/route.ts");
const configRoute = read("src/app/api/config/route.ts");

assert.match(config, /OPENAI_IMAGE_API_PROFILE/);
assert.match(config, /OPENAI_IMAGE_BACKUP_API_PROFILE/);
assert.match(config, /OPENAI_IMAGE_BACKUP_MODEL/);
assert.match(config, /openaiImageRouteConfig\(route/);
assert.match(config, /options:\s*\["openai_json",\s*"openai_sse",\s*"toapis_async"\]/);
assert.match(types, /openaiImagePrimaryProfile:\s*ImageProviderProfile/);
assert.match(types, /openaiImageBackupProfile:\s*ImageProviderProfile/);
assert.match(types, /export type ImageProviderProbeResult/);
assert.match(imageGeneration, /profile === "openai_json"[\s\S]*requestSingleOpenAiJsonImageForRoute/);
assert.match(imageGeneration, /profile === "toapis_async"[\s\S]*requestSingleToApisImagesApiForRoute/);
assert.match(imageGeneration, /routeConfig\.model/);
const toApisUpload = between(imageGeneration, "async function uploadToApisReferenceImage", "function getToApisPollDelayMs");
assert.match(toApisUpload, /if \(!response\.ok\) throw toImageProviderHttpError\("ToAPIs image upload", response\.status, body\)/);
assert.match(toApisUpload, /const inputRejected = \/image upload failed/);
assert.match(toApisUpload, /failoverAllowed: !inputRejected/);
const openAiJsonRequest = between(imageGeneration, "async function buildOpenAiJsonRequest", "async function requestSingleToApisImagesApiForRoute");
assert.match(openAiJsonRequest, /form\.append\("image\[\]"/);
assert.doesNotMatch(openAiJsonRequest, /stream|response_format|input_fidelity/);
assert.match(imageGeneration, /persistTosProbeObject[\s\S]*deleteRuntimeMediaObject/);
assert.match(probeRoute, /requireWorkspaceAccount/);
assert.match(probeRoute, /isWorkspaceAdmin/);
assert.match(probeRoute, /route !== "primary" && route !== "backup"/);
assert.match(probeRoute, /Request body must be valid JSON/);
assert.match(probeRoute, /isOpenaiImageRouteConfigured\(route\)/);
assert.match(probeRoute, /runImageProviderProbe/);
assert.match(configPage, /\/api\/config\/image-provider-check/);
assert.match(configPage, /window\.confirm/);
assert.match(configPage, /两次付费生图/);
assert.doesNotMatch(configRoute, /runImageProviderProbe|image-provider-check/);

console.log("Image provider profiles check passed.");

function loadTypescriptCommonJs(relativePath, dependencyOverrides = {}) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: relativePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const wrapper = vm.runInThisContext(`(function(require,module,exports,Buffer){${output}\n})`, { filename: relativePath });
  wrapper((id) => dependencyOverrides[id] || require(id), loadedModule, loadedModule.exports, Buffer);
  return loadedModule.exports;
}

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Could not isolate source between ${start} and ${end}.`);
  return source.slice(startIndex, endIndex);
}
