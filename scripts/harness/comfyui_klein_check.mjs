import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const config = read("src/lib/config.ts");
const types = read("src/lib/types.ts");
const creationControls = read("src/lib/creation-controls.ts");
const imageGeneration = read("src/lib/image-generation.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const page = read("src/app/page.tsx");
const comfyKlein = read("src/lib/comfyui-klein.ts");
const database = read("src/lib/database.ts");
const schema = read("db/migrations/001_initial_postgres.sql");
const envExample = read(".env.example");

assertContains(config, /comfyUiBaseUrl:\s*normalizeBaseUrl\(process\.env\.COMFYUI_BASE_URL/, "ComfyUI base URL must be configurable.");
assertContains(
  config,
  /comfyUiKleinEnabled:\s*booleanOrDefault\(process\.env\.COMFYUI_KLEIN_ENABLED,\s*false\)/,
  "Klein routing must be disabled by default and controlled by env.",
);
assertContains(config, /comfyUiKleinWorkflowJson:\s*process\.env\.COMFYUI_KLEIN_WORKFLOW_API_JSON/, "Klein API workflow JSON must be configurable by env.");
assertContains(config, /comfyUiKleinWorkflowPath:\s*process\.env\.COMFYUI_KLEIN_WORKFLOW_PATH/, "Klein workflow path must be environment-driven.");
assertContains(config, /COMFYUI_KLEIN_KSAMPLER_STEPS/, "Klein KSampler steps must be configurable by env.");
assertContains(config, /COMFYUI_KLEIN_KSAMPLER_CFG/, "Klein KSampler cfg must be configurable by env.");
assertContains(config, /COMFYUI_KLEIN_KSAMPLER_DENOISE/, "Klein KSampler denoise must be configurable by env.");
assertContains(config, /COMFYUI_KLEIN_FAILURE_POLICY/, "Klein failure policy must be configurable.");

assertContains(types, /provider\?: SourceImageTaskProvider/, "Source image tasks must carry optional provider routing.");
assertContains(types, /comfyUiKleinEnabled:\s*boolean/, "Config status must expose the non-sensitive Klein enabled flag.");
assertContains(types, /comfyUiKleinWorkflowJsonConfigured:\s*boolean/, "Config status must expose non-sensitive inline Klein workflow status.");
assertContains(types, /export type ImageGenerationQueueJob/, "Local image queue job type must exist.");

assertContains(
  creationControls,
  /export type ImageTaskRoutingOptions[\s\S]*useComfyUiKlein\?:\s*boolean/,
  "Image task routing must accept an explicit Klein enable option.",
);
assertContains(
  creationControls,
  /resolveStrategyProvider[\s\S]*useComfyUiKlein[\s\S]*"comfyui_klein"[\s\S]*"openai_images"/,
  "Strategy tasks must route to ComfyUI only when explicitly enabled and otherwise use OpenAI Images.",
);
assertContains(
  creationControls,
  /prompt:\s*resolvedPrompts\.carExterior[\s\S]*provider:\s*resolveStrategyProvider\(options\)[\s\S]*strategyKey:\s*"carExterior"/,
  "Car exterior background-replacement tasks must use env-gated provider routing.",
);
assertContains(
  creationControls,
  /tag === "APP"[\s\S]*mode:\s*"keep"[\s\S]*prompt:\s*""/,
  "APP/application-interface visual tags must keep the original image and avoid image-model routing.",
);
assertContains(
  creationControls,
  /strategyKey:\s*"carExterior"/,
  "Car-exterior visual tags should keep the car-exterior strategy key.",
);
assertContains(
  creationControls,
  /prompt:\s*resolvedPrompts\.peopleWithCar[\s\S]*provider:\s*resolveStrategyProvider\(options\)[\s\S]*strategyKey:\s*"peopleWithCar"/,
  "People-with-car replacement tasks must use env-gated provider routing.",
);

assertContains(simpleRuns, /buildDefaultImageTasks\(source,\s*settings\.imageStrategyPrompts,\s*\{\s*useComfyUiKlein:\s*isComfyUiKleinConfigured\(\)\s*\}/, "Simple runs must route Klein tasks from env status.");
assertContains(page, /const useComfyUiKleinTasks = Boolean\(config\?\.comfyUiKleinConfigured\)/, "Frontend task previews must use non-sensitive config status for Klein routing.");
assertContains(page, /buildDefaultImageTasks\(selectedSource,\s*workspaceSettings\.imageStrategyPrompts,\s*\{\s*useComfyUiKlein:\s*useComfyUiKleinTasks\s*\}\)/, "Frontend default image tasks must follow the Klein enabled status.");

assertContains(
  imageGeneration,
  /runImageProviderTask[\s\S]*task\.provider === "comfyui_klein" && isComfyUiKleinConfigured\(\)/,
  "Image generation must dispatch Klein tasks only when the env-gated workflow is configured.",
);
assertContains(
  imageGeneration,
  /shouldFallbackComfyUiKleinTask[\s\S]*isComfyUiKleinConfigured\(\)[\s\S]*fallback_source/,
  "Klein failures must use the source-image fallback policy only when Klein is enabled and configured.",
);

assertContains(comfyKlein, /appConfig\.comfyUiKleinEnabled && hasComfyUiKleinWorkflow\(\)/, "Klein configured check must require the enabled flag and a workflow source.");
assertContains(comfyKlein, /appConfig\.comfyUiKleinWorkflowJson\.trim\(\)/, "Klein workflow loader must support inline API workflow JSON.");
assertContains(comfyKlein, /runWithConcurrencyPool\("localImage"/, "Klein workflow calls must be serialized by the local image pool.");
assertContains(comfyKlein, /saveImageGenerationQueueJobToDb/, "Klein workflow calls must persist queue/job state.");
assertContains(comfyKlein, /upload\/image/, "Klein workflow must upload reference images through ComfyUI.");
assertContains(comfyKlein, /comfyUrl\("prompt"\)/, "Klein workflow must submit prompts through ComfyUI.");
assertContains(comfyKlein, /history\/\$\{encodeURIComponent\(promptId\)\}/, "Klein workflow must poll prompt history for outputs.");
assertContains(comfyKlein, /comfyUrl\("view"\)/, "Klein workflow must download output images through ComfyUI view.");
assertContains(comfyKlein, /convertUiWorkflowToPrompt/, "Klein integration must support the provided UI workflow JSON.");
assertContains(comfyKlein, /applyUseEverywhereLinks[\s\S]*ue_links/, "Klein UI workflow conversion must preserve Anything Everywhere hidden links.");
assertContains(comfyKlein, /resolveKSamplerWidgetInputs/, "Klein UI workflow conversion must map KSampler widgets.");
assertContains(comfyKlein, /applyKSamplerOverrides/, "Klein KSampler env overrides must be applied before submission.");

assertContains(database, /image_generation_queue/, "Runtime database must include image_generation_queue support.");
assertContains(schema, /CREATE TABLE IF NOT EXISTS image_generation_queue/, "PostgreSQL schema must include image_generation_queue.");
assertContains(envExample, /COMFYUI_KLEIN_ENABLED=false/, ".env.example must keep local Klein disabled by default.");
assertContains(envExample, /COMFYUI_KLEIN_WORKFLOW_API_JSON=/, ".env.example must document the inline Klein workflow API JSON.");
assertContains(envExample, /COMFYUI_KLEIN_WORKFLOW_PATH=/, ".env.example must document the Klein workflow path.");

console.log("ComfyUI Klein integration check passed.");
