import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertIncludes(source, snippet, message) {
  if (!source.includes(snippet)) throw new Error(message);
}

function assertNotIncludes(source, snippet, message) {
  if (source.includes(snippet)) throw new Error(message);
}

function loadViralModule() {
  const sourcePath = path.join(projectRoot, "src/lib/viral-replication.ts");
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const videoQualitySource = readFileSync(path.join(projectRoot, "src/lib/video-quality.ts"), "utf8");
const videoQualityTranspiled = ts.transpileModule(videoQualitySource, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: path.join(projectRoot, "src/lib/video-quality.ts"),
});
const videoQualityModule = { exports: {} };
vm.runInNewContext(videoQualityTranspiled.outputText, { module: videoQualityModule, exports: videoQualityModule.exports, console, URL }, { filename: path.join(projectRoot, "src/lib/video-quality.ts") });

const cjsModule = { exports: {} };
  const executionLogs = [];
  const requireMap = {
    "node:path": path,
    "node:fs/promises": { stat: async () => ({ isFile: () => true }) },
    "./creation-controls": { defaultImageStrategyPrompts: {} },
    "./activity-log": {
      compactError: (error) => error instanceof Error ? error.message : String(error || "Unknown error"),
      recordExecutionLog: async (entry) => {
        executionLogs.push(entry);
      },
    },
    "./config": {
      appConfig: {
        openaiApiKey: "test-key",
        openaiTextEndpoint: "responses",
        openaiTextModel: "test-vision-model",
        viralImageImitationPrompt: "env prompt: image 1 vehicle, image 2 viral style",
      },
      openaiTextUrl: (name) => `https://example.test/${name}`,
    },
    "./concurrency": { runWithConcurrencyPool: async (_name, task) => task() },
    "./model-image-input": {
      toModelImageUrl: async (url) => {
        if (url.includes("fail-input")) throw new Error("mock input failure");
        return `data:image/png;base64,${Buffer.from(url).toString("base64")}`;
      },
    },
    "./openai": { generatePost: async (input) => ({ imageTasks: input.imageTasks, aiNotes: [] }) },
    "./production-plan": { buildProductionPlan: () => ({}) },
    "./source-link-import": { resolveSourceLinks: async () => ({ items: [], results: [] }) },
  };
  vm.runInNewContext(transpiled.outputText, {
    console,
    fetch: async (_url, request) => {
      const body = JSON.parse(request.body);
      const imageUrl = body.input?.[0]?.content?.find((part) => part.type === "input_image")?.image_url || "";
      const encoded = imageUrl.split(",")[1] || "";
      const sourceName = Buffer.from(encoded, "base64").toString("utf8");
      if (sourceName.includes("model-fail")) {
        return {
          ok: false,
          status: 500,
          text: async () => "mock model failure",
        };
      }
      const isPoster = sourceName.includes("poster");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            imageType: isPoster ? "poster" : "photo",
            shotSize: "wide",
            vehiclePart: "full_vehicle",
            angle: "front_three_quarter",
            composition: "low-angle centered hero composition with strong foreground depth",
            hasPeople: false,
            hasText: isPoster,
            colorPalette: "cool cyan highlights with deep graphite shadows",
            recommendedStrategy: isPoster ? "text_image" : "car_reference",
            stylePrompt: "cinematic dusk automotive poster, cool cyan rim light, glossy reflections, premium social media finish",
            aestheticKeywords: ["cinematic", "cyan rim light", "glossy"],
            confidence: 0.91,
          }),
        }),
      };
    },
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      throw new Error(`Unexpected import in viral-replication.ts: ${name}`);
    },
  }, { filename: sourcePath });
  cjsModule.exports.__executionLogs = executionLogs;
  return cjsModule.exports;
}

const tikhub = read("src/lib/tikhub.ts");
const viral = read("src/lib/viral-replication.ts");
const imageGeneration = read("src/lib/image-generation.ts");
const check = read("scripts/harness/check.ps1");
const types = read("src/lib/types.ts");

const titleExtractor = tikhub.slice(tikhub.indexOf("function extractSourceTitle"), tikhub.indexOf("function extractContentText"));
const scoreFunction = viral.slice(viral.indexOf("export function scoreMaterialMatch"));

assertIncludes(tikhub, "function isDouyinNonContentTitle(", "Douyin non-content title filter is missing.");
assertIncludes(tikhub, "\\u521b\\u4f5c\\u7684\\u539f\\u58f0", "Douyin original-sound filter must use stable escaped Chinese text.");
assertIncludes(titleExtractor, "isDouyinNonContentTitle", "Douyin title extraction must apply the non-content title filter.");
assertNotIncludes(viral, "targetKeyword, materialPath, path.basename(materialPath)", "Material profile keywords must not inject targetKeyword into every asset.");
assertIncludes(viral, "const usedMaterialPaths = new Set<string>()", "Viral matching must avoid reusing one material for every slot.");
assertIncludes(viral, "const bodyText = stripViralBodyHashtags(item.contentText)", "Viral style analysis must ignore source-body hashtag tags.");
assertIncludes(viral, "Viral source body: ${bodyText}", "Viral text brief must use the hashtag-cleaned source body.");
assertIncludes(types, "stylePrompt: string", "ViralImageSpec must store the inverted source-image style prompt.");
assertIncludes(types, "aestheticKeywords: string[]", "ViralImageSpec must store source-image aesthetic keywords.");
assertIncludes(types, "analyzedImageCount?: number", "SimpleRunViralResult must expose analyzed viral image count.");
assertIncludes(types, "skippedImageCount?: number", "SimpleRunViralResult must expose skipped viral image analysis count.");
assertIncludes(types, "imageAnalysisErrors?: string[]", "SimpleRunViralResult must expose viral image analysis errors.");
assertIncludes(types, "referenceUrls?: string[]", "SourceImageTask must support additional reference image URLs.");
assertIncludes(types, "pairedImageCount?: number", "SimpleRunViralResult must expose ordered paired image count.");
assertIncludes(viral, "export type ViralImageAnalysisResult", "Viral image analysis must expose partial-success result metadata.");
assertIncludes(viral, "toModelImageUrl", "Viral image analysis must prepare real model-readable image inputs.");
assertIncludes(viral, "pairViralImagesWithMaterials", "Viral replication must expose ordered source/material pairing.");
assertIncludes(viral, "appConfig.viralImageImitationPrompt", "Viral image prompts must use the environment-configured imitation prompt.");
assertIncludes(viral, "referenceUrls: [pair.sourceImageUrl]", "Viral image tasks must attach the viral source image as image 2.");
assertIncludes(viral, "sourceSpec?: ViralImageSpec", "Viral image pairs must carry analyzed source-image style metadata.");
assertIncludes(viral, "sourceSpec?.stylePrompt", "Viral image task prompts must include the analyzed source-image style prompt.");
assertNotIncludes(viral, 'colorPalette: "match source visual mood"', "Viral image analysis must not use a fixed fake source mood.");
assertIncludes(viral, 'strategyKey: "carExterior"', "Ordered viral image tasks must use the carExterior strategy.");
assertIncludes(viral, "recordViralImageTaskPlan", "Viral replication must log safe per-slot image task planning summaries.");
assertIncludes(viral, "images/edits", "Viral replication observability should identify image edit/reference-image request shape.");
assertIncludes(scoreFunction, "return Math.max(score, 0)", "Viral material score should be clamped after penalties.");
assertIncludes(imageGeneration, "function resolveLocalReferenceFilePath(", "Image references must support local filesystem paths.");
assertIncludes(imageGeneration, "path.isAbsolute(value)", "Local absolute paths should be accepted as image edit references.");
assertIncludes(imageGeneration, "function getTaskReferenceImages", "Image generation must gather the primary and additional task references.");
assertIncludes(imageGeneration, "task.referenceUrls", "Image generation must submit task referenceUrls to the Images API.");
assertIncludes(imageGeneration, "referenceImages.slice(0, 4)", "Images API edit requests must upload multiple ordered reference images, including viral source style references.");
assertIncludes(check, "Viral replication regression check", "Harness baseline must include this regression check.");

const viralModule = loadViralModule();
if (typeof viralModule.stripViralBodyHashtags !== "function") {
  throw new Error("Viral replication must expose stripViralBodyHashtags for body-only hashtag cleanup.");
}

const cleanedBody = viralModule.stripViralBodyHashtags([
  "Main body line",
  "Second line with content #xpeng #g6",
  "#\u5c0f\u9e4fG6[\u8bdd\u9898]# #\u65b0\u80fd\u6e90[\u8bdd\u9898]# #EV",
].join("\n"));
if (cleanedBody.includes("#") || !cleanedBody.includes("Second line with content")) {
  throw new Error("Viral body cleanup must remove hashtag tags without dropping real body text.");
}

if (typeof viralModule.analyzeViralImages !== "function") {
  throw new Error("Viral replication must expose analyzeViralImages.");
}

const analysis = await viralModule.analyzeViralImages(["good-photo.png", "fail-input.png", "model-fail.png", "poster-card.png"]);
if (!Array.isArray(analysis.specs) || !Array.isArray(analysis.failures)) {
  throw new Error("analyzeViralImages must return { specs, failures } for partial success.");
}
if (analysis.specs.length !== 2 || analysis.failures.length !== 2) {
  throw new Error(`Expected partial image analysis success with 2 specs and 2 failures, got ${analysis.specs.length}/${analysis.failures.length}.`);
}
if (!analysis.specs.every((spec) => spec.stylePrompt?.includes("cinematic dusk automotive poster"))) {
  throw new Error("Every successful viral image spec must include the inverted source stylePrompt.");
}
if (analysis.specs[1].recommendedStrategy !== "text_image") {
  throw new Error("Poster-like viral source images must preserve text_image strategy.");
}

if (typeof viralModule.pairViralImagesWithMaterials !== "function") {
  throw new Error("Viral replication must expose pairViralImagesWithMaterials.");
}

const pairing = await viralModule.pairViralImagesWithMaterials(
  ["source-1.png", "source-2.png", "source-3.png", "source-4.png", "source-5.png"],
  ["C:/private/materials/g6-front.png", "C:/private/materials/g6-side.png", "C:/private/materials/g6-rear.png"],
  "小鹏G6",
  analysis.specs,
);
if (pairing.sourceImageCount !== 5 || pairing.vehicleImageCount !== 3 || pairing.pairs.length !== 3) {
  throw new Error(`Expected ordered pairing to use min(source=5, vehicle=3) = 3, got source=${pairing.sourceImageCount}, vehicle=${pairing.vehicleImageCount}, pairs=${pairing.pairs.length}.`);
}
if (pairing.pairs[0].sourceImageUrl !== "source-1.png" || pairing.pairs[2].material.referenceMaterialPath !== "C:/private/materials/g6-rear.png") {
  throw new Error("Ordered viral image pairing must preserve source and material order.");
}
if (!pairing.pairs[0].sourceSpec?.stylePrompt?.includes("cinematic dusk automotive poster")) {
  throw new Error("Ordered viral image pairing must bind analyzed source style metadata to each pair.");
}

const generated = await viralModule.buildViralGeneratedPost({
  source: { item: { id: "source-1", platform: "douyin", sourceId: "1", images: [], mediaUrls: [], metrics: {} }, style: {}, images: ["source-1.png", "source-2.png", "source-3.png", "source-4.png", "source-5.png"] },
  targetKeyword: "小鹏G6",
  materialPaths: pairing.pairs.map((pair) => pair.material.referenceMaterialPath),
  imagePairs: pairing.pairs,
  settings: {
    textInstruction: "text",
    imageWashPrompt: "wash",
    imageStrategyPrompts: {
      carExterior: "car strategy",
      textImage: "text image strategy",
      peopleWithCar: "people strategy",
    },
  },
});
const prompts = generated.imageTasks?.map((task) => task.prompt) || [];
if (generated.imageTasks?.length !== 3) {
  throw new Error(`Expected 3 viral image tasks from ordered source/material pairs, got ${generated.imageTasks?.length || 0}.`);
}
if (generated.imageTasks?.[0]?.url !== "C:/private/materials/g6-front.png" || generated.imageTasks?.[0]?.referenceUrls?.[0] !== "source-1.png") {
  throw new Error("Viral image task 1 must use vehicle image 1 as image 1 and source image 1 as image 2.");
}
if (generated.imageTasks?.[2]?.url !== "C:/private/materials/g6-rear.png" || generated.imageTasks?.[2]?.referenceUrls?.[0] !== "source-3.png") {
  throw new Error("Viral image task 3 must preserve ordered vehicle/source references.");
}
if (!prompts[0]?.includes("env prompt: image 1 vehicle, image 2 viral style")) {
  throw new Error("Viral image task prompt must include the environment-configured imitation prompt.");
}
if (!prompts[0]?.includes("Reference image 1 is the user-provided target vehicle image") || !prompts[0]?.includes("Reference image 2 is the viral source style image")) {
  throw new Error("Viral image task prompt must describe image 1/image 2 roles.");
}
if (!prompts[0]?.includes("cinematic dusk automotive poster, cool cyan rim light, glossy reflections, premium social media finish")) {
  throw new Error("Viral image task prompt must include the analyzed artistic style from the corresponding source image.");
}
if (!generated.imageTasks?.every((task) => task.provider === "openai_images" && task.mode === "wash" && task.strategyKey === "carExterior")) {
  throw new Error("Viral image tasks must use OpenAI Images edit references with the carExterior strategy.");
}

if (typeof viralModule.recordViralImageTaskPlan !== "function") {
  throw new Error("Viral replication must expose recordViralImageTaskPlan for observability checks.");
}
await viralModule.recordViralImageTaskPlan({
  runId: "simple-test",
  pairs: pairing.pairs,
  imageTasks: generated.imageTasks,
});
const taskPlanLog = viralModule.__executionLogs.find((entry) => entry.action === "Plan viral image tasks");
if (!taskPlanLog) throw new Error("Viral image task planning should write an execution log entry.");
if (taskPlanLog.details.referenceShape !== "images/edits" || taskPlanLog.details.taskCount !== generated.imageTasks.length) {
  throw new Error("Viral image task planning log should summarize Images API edit request shape and task count.");
}
if (JSON.stringify(taskPlanLog.details).includes("C:/private/materials")) {
  throw new Error("Viral image task planning log must not expose full private material paths.");
}

console.log("Viral replication regression check passed.");
