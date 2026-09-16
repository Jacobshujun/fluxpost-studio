import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(file, dependencies = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", code)(loaded, loaded.exports, (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return loaded.exports;
}
const models = load("src/lib/image-model-options.ts");
const contracts = load("src/lib/image-providers/contracts.ts");
const toApis = load("src/lib/toapis-image-api.ts", { "./image-providers/contracts": contracts });
const dimensions = load("src/lib/gpt-image-dimensions.ts", { "./toapis-image-api": toApis });
const source = readFileSync("src/lib/image-generation.ts", "utf8");
const ast = ts.createSourceFile("image-generation.ts", source, ts.ScriptTarget.Latest, true);
const names = ["requestSingleStandardImagesApiWithRetry", "requestSingleStandardImagesApiWithRetryForRoute", "requestSingleToApisImagesApiForRoute", "toImageProviderHttpError", "redactImageProviderMessage", "imageProviderErrorDetail", "toAcceptedImageProviderError", "pollToApisImageTask", "normalizeToApisPendingStatus"];
const code = ts.transpileModule(names.map((name) => ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name).getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const requests = [];
const logs = [];
const routes = [];
let responseStatus = 200;
let responsePayload = { id: "fixture-task", status: "pending" };
const secret = "fixture-private-key";
const routeConfig = { model: "default-model", profile: "toapis_async", toApisRequestFormat: "ratio" };
const pending = new Error("accepted fixture task");
const dependencies = {
  ...contracts, ...toApis,
  appConfig: { openaiApiKey: secret, openaiImageApiKey: secret, openaiImageBackupApiKey: "backup-private-key" },
  openaiImageRouteConfig: (route) => { routes.push(route); return routeConfig; },
  resolveActiveStandardImagesApiRoute: () => "backup",
  activeStandardImagesApiRoute: "backup",
  resolveNextStandardImagesApiRoute: () => { throw new Error("Unexpected failover"); },
  restorePrimaryStandardImagesApiRouteAfterBackupFailure: () => {},
  openaiImageUrl: (endpoint, route) => `https://${route}.invalid/v1/${endpoint}`,
  openaiImageHeaders: () => ({ Authorization: `Bearer ${secret}` }),
  prepareToApisReferenceUrls: async (_route, references) => references.values,
  imageRequestTimeoutMs: 10000, maxImageAttempts: 3, retryableImageStatuses: new Set([429, 500, 502, 503]),
  getRemainingTimeoutMs: () => 10000, hasRetryWindow: () => true,
  isImageProviderCapabilityError: (body) => /model_not_found|unsupported model/i.test(body),
  toImageProviderTransportError: (error) => error,
  recordExecutionLog: async (entry) => logs.push(entry),
  compactError: (error) => error instanceof Error ? error.message : String(error),
  throwOrPreservePendingToApisTask: () => { throw pending; },
  fetchWithTimeout: async (url, request) => {
    requests.push({ url, body: JSON.parse(request.body) });
    return new Response(JSON.stringify(responsePayload), { status: responseStatus, headers: { "Content-Type": "application/json" } });
  },
  parseJsonResponse: (body) => JSON.parse(body),
};
const runtime = new Function(...Object.keys(dependencies), `${code}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
const size = dimensions.pixelSizeForRatio("4:3", "4k");
assert.equal(size, "3312x2480");
assert.equal(models.normalizeImageModel("  Custom/Model:V3  "), "Custom/Model:V3");
assert.throws(() => models.normalizeImageModel("  "), /不能为空/);
assert.equal(models.legacyRouteRequestFormat("unknown-next-release"), "ratio");
for (const { model, format } of [...models.imageModelPresets.filter((preset) => preset.format !== "legacy"), { model: "Custom/Model:V3", format: "pixels" }, { model: "Another-Unknown", format: "ratio" }]) {
  for (const values of [[], ["https://fixture.invalid/reference.png"]]) {
    const before = requests.length;
    await assert.rejects(runtime.requestSingleStandardImagesApiWithRetry("fixture", 1, Date.now(), {
      model, toApisRequestFormat: format, size, ratio: "4:3", resolution: "4k", quality: "medium",
    }, { values, files: [] }, "images/generations", { returnPendingAfterAcceptance: true }), (error) => error === pending);
    assert.equal(requests.length, before + 1);
    const request = requests.at(-1);
    assert.equal(request.url, "https://primary.invalid/v1/images/generations");
    assert.equal(request.body.model, model);
    assert.equal(request.body.size, format === "pixels" ? size : "4:3");
    assert.equal(request.body.resolution, format === "pixels" ? undefined : "4k");
    assert.deepEqual(request.body.image_urls ?? request.body.reference_images, values);
    assert.equal(request.body.output_format, undefined);
  }
}
assert.ok(routes.every((route) => route === "primary"), "An explicit node must not inherit another node's cached backup route");
await assert.rejects(runtime.requestSingleToApisImagesApiForRoute("primary", "old-workflow", 1, Date.now(), {
  size, ratio: "4:3", resolution: "4k", quality: "medium",
}, { values: [] }, { returnPendingAfterAcceptance: true }), (error) => error === pending);
assert.equal(requests.at(-1).body.model, "default-model", "A missing node model retains the route default");
for (const format of ["ratio", "pixels"]) {
  assert.equal(toApis.buildToApisGenerationBody({ model: "gpt-image-2", requestFormat: format, prompt: "fixture", requestedSize: size, ratio: "4:3", resolution: "4k" }).size, format === "pixels" ? size : "4:3", "Even an old model ID cannot override explicit format");
}
responseStatus = 400;
responsePayload = { error: { code: "unsupported_size", message: `Model gpt-image-2.5-flare-vip rejects 3312x2480; key=${secret}; Authorization=Bearer sk-hidden-secret` } };
const before = requests.length;
await assert.rejects(runtime.requestSingleStandardImagesApiWithRetry("fixture", 1, Date.now(), {
  model: "gpt-image-2.5-flare-vip", toApisRequestFormat: "pixels", size, ratio: "4:3", resolution: "4k", quality: "medium",
}, { values: [], files: [] }, "images/generations"), (error) => {
  assert.match(error.message, /上游.*HTTP 400.*unsupported_size.*rejects 3312x2480/);
  assert.equal(error.retryable, false);
  assert.equal(error.failoverAllowed, false);
  assert.ok(!error.message.includes(secret));
  assert.ok(!error.message.includes("sk-hidden-secret"));
  return true;
});
assert.equal(requests.length, before + 1, "Upstream size rejection must not retry, downgrade or fail over");
assert.equal(runtime.toImageProviderHttpError("fixture", 500, JSON.stringify(responsePayload)).retryable, false, "A size refusal is not transient even when wrapped in HTTP 500");
assert.ok(!JSON.stringify(logs).includes(secret));
assert.ok(!JSON.stringify(logs).includes("sk-hidden-secret"));
await assert.rejects(runtime.pollToApisImageTask("primary", "fixture", { status: "failed", error: { code: "unsupported_size", message: `VIP refuses 4K 4:3 ${secret}` } }, Date.now()), (error) => error.message.includes("unsupported_size") && !error.message.includes(secret) && error.taskAccepted);
assert.equal(runtime.toImageProviderHttpError("fixture", 404, '{"error":{"code":"model_not_found","message":"No such model"}}').failoverAllowed, false);
assert.equal(runtime.imageProviderErrorDetail("<html>gateway failure</html>"), "");
console.log("Canvas model IDs, explicit routing, VIP 4K/4:3, upstream errors and redaction checks passed.");
