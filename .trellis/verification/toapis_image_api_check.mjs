import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = process.cwd();
const contract = loadTypescriptCommonJs("src/lib/toapis-image-api.ts", { "./types": {} });
const imageGeneration = read("src/lib/image-generation.ts");
const config = read("src/lib/config.ts");
const providerContracts = read("src/lib/image-providers/contracts.ts");

for (const [input, size, resolution] of [
  ["auto", "1:1", "1k"],
  ["1024x1024", "1:1", "1k"],
  ["1024x1536", "2:3", "1k"],
  ["1536x1024", "3:2", "1k"],
  ["2048x2048", "1:1", "2k"],
  ["2048x1152", "16:9", "2k"],
  ["1152x2048", "9:16", "2k"],
  ["3840x2160", "16:9", "4k"],
  ["2160x3840", "9:16", "4k"],
  ["1200x1600", "3:4", "1k"],
]) {
  assertDeepEqual(contract.resolveToApisImageSize(input), { size, resolution }, `Unexpected ToAPIs mapping for ${input}.`);
}
assertThrows(() => contract.resolveToApisImageSize("1234x987"), /does not have an explicit size mapping/, "Unknown custom sizes must fail before submission.");

assertDeepEqual(
  contract.buildToApisGenerationBody({ model: "gpt-image-2", prompt: "city", requestedSize: "1024x1536" }),
  { model: "gpt-image-2", prompt: "city", n: 1, size: "2:3", resolution: "1k", response_format: "url" },
  "Text-to-image body must follow the documented asynchronous ToAPIs contract.",
);
assertDeepEqual(
  contract.buildToApisGenerationBody({
    model: "gpt-image-2",
    prompt: "edit",
    requestedSize: "2048x1152",
    referenceImages: ["https://bucket.example/source.jpg"],
  }),
  {
    model: "gpt-image-2",
    prompt: "edit",
    n: 1,
    size: "16:9",
    resolution: "2k",
    response_format: "url",
    reference_images: ["https://bucket.example/source.jpg"],
  },
  "Reference generation must use URL-only reference_images on /images/generations.",
);

assertEqual(contract.requireToApisTaskId({ id: "task-1" }), "task-1", "Submission id must be accepted.");
assertEqual(contract.requireToApisTaskId({ task_id: "task-2" }), "task-2", "Documented compatibility task_id must be accepted.");
assertThrows(() => contract.requireToApisTaskId({ status: "queued" }), /did not include a task id/, "Missing task ids must fail.");
assertDeepEqual(
  contract.getToApisCompletedImageUrls({ status: "completed", result: { data: [{ url: "https://files.example/a.jpg" }, { url: "https://files.example/a.jpg" }] } }),
  ["https://files.example/a.jpg"],
  "Completed result URLs must be decoded and deduplicated.",
);
assertEqual(contract.formatToApisTaskError({ error: { code: "model_not_found", message: "no available channel" } }), "model_not_found: no available channel", "Provider task errors must retain code and message.");
assertEqual(contract.parseRetryAfterMs("7", 1_000), 7_000, "Retry-After seconds must be honored.");
assertEqual(contract.parseRetryAfterMs("Thu, 01 Jan 1970 00:00:11 GMT", 1_000), 10_000, "Retry-After dates must be honored.");

assertContains(config, /OPENAI_IMAGE_API_DIALECT[\s\S]*options:\s*\["auto",\s*"openai",\s*"toapis"\]/, "Advanced config must expose the image API dialect.");
assertContains(providerContracts, /hostname === "toapis\.com" \|\| hostname\.endsWith\("\.toapis\.com"\)/, "Auto profile resolution must recognize ToAPIs hosts.");
assertContains(imageGeneration, /profile === "toapis_async"[\s\S]*requestSingleToApisImagesApiForRoute/, "Route dispatch must select the ToAPIs adapter before OpenAI profiles.");
assertContains(imageGeneration, /profile === "toapis_async"[\s\S]*return requestSingleToApisImagesApiForRoute[\s\S]*profile === "openai_json"/, "ToAPIs must use structured size fields without inheriting OpenAI request fields.");
assertContains(imageGeneration, /openaiImageUrl\("images\/generations", route\)[\s\S]*JSON\.stringify\(requestBody\)/, "ToAPIs submission must use JSON POST /images/generations.");
assertContains(imageGeneration, /openaiImageUrl\(`images\/generations\/\$\{encodeURIComponent\(taskId\)\}`, route\)/, "ToAPIs status polling must encode the task id in the documented endpoint.");
assertContains(imageGeneration, /form\.append\("file"[\s\S]*openaiImageUrl\("uploads\/images", route\)/, "Local references must use the documented ToAPIs upload endpoint.");
assertContains(imageGeneration, /const toApisPollIntervalMs = 5_000;[\s\S]*parseRetryAfterMs\(response\.headers\.get\("retry-after"\)\)/, "Polling must wait at least five seconds and honor Retry-After.");
assertContains(imageGeneration, /\["pending",\s*"queued",\s*"in_progress"\]\.includes\(task\.status\)/, "Observed ToAPIs pending status must remain a non-terminal polling state.");
assertContains(imageGeneration, /response\.status === 429 \|\| \(response\.status >= 500 && response\.status <= 504\)/, "Transient ToAPIs status-query failures must retry the accepted task instead of resubmitting it.");
assertContains(imageGeneration, /function toAcceptedImageProviderError[\s\S]*taskAccepted:\s*true[\s\S]*function isStandardImagesApiFailoverError[\s\S]*!error\.taskAccepted/, "Accepted ToAPIs tasks must not fail over into duplicate paid submissions.");
assertContains(imageGeneration, /getToApisCompletedImageUrls[\s\S]*urls\.map\(\(url\) => \(\{ url \}\)\)[\s\S]*materializeGeneratedImageUrls/, "Temporary ToAPIs result URLs must continue through generated-image persistence.");
assertContains(imageGeneration, /function isImageProviderCapabilityError[\s\S]*model_not_found\|no available channel/, "Model channel failures must have an explicit hard-error classifier.");
assertContains(imageGeneration, /function isImageTaskSourceFallbackError[\s\S]*isImageProviderCapabilityError\(error\)\) return false/, "Model channel failures must not silently fall back to source images.");
assertContains(imageGeneration, /function isImageTaskSourceFallbackError[\s\S]*ToAPIs image[\s\S]*return false/, "ToAPIs boundary failures must never masquerade as successful source-image generation.");

console.log("ToAPIs GPT-Image-2 adapter check passed.");

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

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertThrows(action, pattern, message) {
  try {
    action();
  } catch (error) {
    const value = error instanceof Error ? error.message : String(error);
    if (pattern.test(value)) return;
    throw new Error(`${message} Wrong error: ${value}`);
  }
  throw new Error(`${message} Expected an error.`);
}
