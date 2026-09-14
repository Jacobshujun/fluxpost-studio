import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const contracts = load("src/lib/image-providers/contracts.ts");
const toApis = load("src/lib/toapis-image-api.ts", { "./image-providers/contracts": contracts });
const sizes = load("src/lib/image-size-options.ts");
const source = readFileSync("src/lib/image-generation.ts", "utf8");
const ast = ts.createSourceFile("image-generation.ts", source, ts.ScriptTarget.Latest, true);
const names = [
  "normalizeImageOptions", "normalizeImageQuality", "normalizeTaskConcurrency", "normalizeOutputCompression",
  "buildStandardImagesApiRequest", "buildStandardImagesGenerationBody", "buildOpenAiJsonRequest",
  "requestSingleToApisImagesApiForRoute", "callResponsesImageToolInPool",
];
const declarations = names.map((name) => {
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(ast);
}).join("\n");
const code = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const captured = [];
const boundary = new Error("Stop after capturing the outgoing request");
let routeModel = "fixture-model";
const dependencies = {
  validateImageBackground: contracts.validateImageBackground,
  normalizeImageGenerationSize: sizes.normalizeImageGenerationSize,
  defaultImageOptions: { size: "1024x1024", quality: "medium" },
  concurrencyConfig: { image: 1 },
  openaiImageRouteConfig: () => ({ model: routeModel }),
  openaiImageHeaders: () => ({}),
  readFile: async () => Buffer.from("fixture"),
  buildOpenAiJsonGenerationBody: contracts.buildOpenAiJsonGenerationBody,
  buildToApisGenerationBody: toApis.buildToApisGenerationBody,
  prepareToApisReferenceUrls: async (_route, references) => references.values,
  imageRequestTimeoutMs: 1000,
  maxImageAttempts: 1,
  getRemainingTimeoutMs: () => 1000,
  openaiImageUrl: (endpoint) => `https://fixture.invalid/${endpoint}`,
  fetchWithTimeout: async (url, request) => { captured.push({ url, body: JSON.parse(request.body) }); throw boundary; },
  toImageProviderTransportError: (error) => error,
  appConfig: { openaiImageModel: "fixture-image", openaiTextModel: "fixture-text" },
  buildImageSizeConstrainedPrompt: (prompt) => prompt,
  recordExecutionLog: async () => {},
};
const runtime = new Function(...Object.keys(dependencies), `${code}\nreturn { ${names.join(",")} };`)(...Object.values(dependencies));
const reference = { filePath: "fixture.png", fileName: "fixture.png", mimeType: "image/png" };

for (const background of ["auto", "transparent", "opaque"]) {
  for (const quality of ["low", "medium", "high"]) {
    const normalized = runtime.normalizeImageOptions({ size: "1024x1024", quality, background });
    assert.equal(normalized.background, background);
    assert.equal(normalized.quality, quality);
    const options = { ...normalized, background };
    for (const references of [[], [reference]]) {
      for (const builder of [runtime.buildStandardImagesApiRequest, runtime.buildOpenAiJsonRequest]) {
        const request = await builder("primary", "fixture", 1, options, references, true, false);
        if (references.length) {
          assert.equal(request.body.has("background"), false);
          assert.equal(request.body.get("quality"), quality);
          assert.equal(request.body.getAll("image[]").length, 1);
        } else {
          const body = JSON.parse(request.body);
          assert.equal("background" in body, false);
          assert.equal(body.quality, quality);
        }
      }
    }
    for (const values of [[], ["https://fixture.invalid/reference.png"]]) {
      await assert.rejects(runtime.requestSingleToApisImagesApiForRoute("primary", "fixture", 1, Date.now(), {
        ...options, ratio: "1:1", resolution: "1k",
      }, { values }), (error) => error === boundary);
      const body = captured.at(-1).body;
      assert.equal("background" in body, false);
      assert.equal(body.quality, quality);
      assert.deepEqual(body.image_urls || [], values);
      assert.deepEqual(body, {
        model: "fixture-model", prompt: "fixture", n: 1, size: "1:1", resolution: "1k", quality,
        output_format: "png", response_format: "url", ...(values.length ? { image_urls: values } : {}),
      });
    }
    await assert.rejects(runtime.callResponsesImageToolInPool("fixture", 1, options), (error) => error === boundary);
    assert.deepEqual(captured.at(-1).body.tools[0], {
      type: "image_generation", model: "fixture-image", size: "1024x1024",
    });
  }
}

const explicitInputError = (error) => error instanceof contracts.ImageProviderError && error.category === "input"
  && error.retryable === false && error.failoverAllowed === false;
for (const background of ["invalid", "", null, 1]) {
  assert.throws(() => contracts.validateImageBackground(background), explicitInputError);
}
assert.throws(() => contracts.validateImageBackground("transparent", "jpeg"), explicitInputError);

const legacy = runtime.normalizeImageOptions();
assert.equal(legacy.background, undefined, "Unrelated callers retain their existing provider defaults");
for (const references of [[], [reference]]) {
  for (const builder of [runtime.buildStandardImagesApiRequest, runtime.buildOpenAiJsonRequest]) {
    const request = await builder("primary", "fixture", 1, legacy, references, true, false);
    assert.equal(references.length ? request.body.has("background") : "background" in JSON.parse(request.body), false);
  }
}
assert.equal("background" in toApis.buildToApisGenerationBody({ model: "fixture", prompt: "fixture", ratio: "1:1", resolution: "1k" }), false);
for (const outputFormat of ["png", "jpeg"]) {
  assert.deepEqual(toApis.buildToApisGenerationBody({
    model: "gpt-image-2.5-sunburst", prompt: "fixture", ratio: "3:4", resolution: "2k",
    quality: "medium", background: "auto", count: 1, outputFormat, outputCompression: 100,
    referenceImages: ["https://fixture.invalid/reference.png"],
  }), {
    model: "gpt-image-2.5-sunburst", prompt: "fixture", n: 1, size: "3:4", resolution: "2k", quality: "high",
    reference_images: ["https://fixture.invalid/reference.png"],
  });
}
assert.deepEqual(contracts.buildOpenAiJsonGenerationBody({
  model: "fixture", prompt: "fixture", size: "1024x1024", quality: "high", background: "auto",
}), { model: "fixture", prompt: "fixture", n: 1, size: "1024x1024", quality: "high" });
for (const model of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
  routeModel = model;
  for (const background of [undefined, "auto", "opaque", "transparent"]) {
    for (const values of [[], ["https://fixture.invalid/reference.png"]]) {
      const options = runtime.normalizeImageOptions({ size: "2880x2880", ratio: "1:1", resolution: "4k", quality: "low", background });
      await assert.rejects(runtime.requestSingleToApisImagesApiForRoute("primary", "fixture", 1, Date.now(), options, { values }), (error) => error === boundary);
      assert.deepEqual(captured.at(-1), {
        url: "https://fixture.invalid/images/generations",
        body: { model, prompt: "fixture", n: 1, size: "1:1", resolution: "4k", quality: "high",
          ...(background === "transparent" ? { background } : {}), reference_images: values },
      });
    }
  }
  const before = captured.length;
  await assert.rejects(runtime.requestSingleToApisImagesApiForRoute("primary", "fixture", 2, Date.now(), { size: "auto", ratio: "1:1", resolution: "1k" }, { values: [] }), explicitInputError);
  assert.equal(captured.length, before, "Invalid output count must fail before submission");
  assert.throws(() => toApis.buildToApisGenerationBody({ model, prompt: "fixture", ratio: "1:1", resolution: "1k", background: "transparent", outputFormat: "jpeg" }), explicitInputError);
}
console.log("Image background checks passed: existing JSON/SSE/Responses bodies and corrected ordinary ToAPIs 2.5 bodies.");

function load(file, dependencies = {}) {
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
