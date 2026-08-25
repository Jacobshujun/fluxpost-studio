import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const modeModule = loadTypescriptCommonJs("src/lib/feishu-publish-mode.ts");
const types = read("src/lib/types.ts");
const database = read("src/lib/database.ts");
const queue = read("src/lib/feishu-publish-queue.ts");
const cli = read("src/lib/feishu-cli.ts");
const manualRoute = read("src/app/api/publish/feishu/route.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const mainPage = read("src/app/page.tsx");
const reviewPage = read("src/app/review/page.tsx");
const registry = read("src/lib/canvas/registry.ts");
const executors = read("src/lib/canvas/executors.ts");
const baseline = read(".trellis/verification/check.mjs");

assertEqual(modeModule.normalizeFeishuPublishMode(undefined), "full", "A missing mode must retain historical full publishing.");
for (const mode of ["full", "text", "media"]) {
  assertEqual(modeModule.normalizeFeishuPublishMode(mode), mode, `${mode} must be accepted.`);
}
for (const invalid of [null, "", "FULL", "video", 1, false]) {
  assertThrows(() => modeModule.normalizeFeishuPublishMode(invalid), /must be one of: full, text, media/i, `Explicit invalid mode ${JSON.stringify(invalid)} must fail.`);
}
assertEqual(modeModule.feishuPublishModeIncludesText("full"), true, "Full mode must include text.");
assertEqual(modeModule.feishuPublishModeIncludesText("text"), true, "Text mode must include text.");
assertEqual(modeModule.feishuPublishModeIncludesText("media"), false, "Media mode must exclude text.");
assertEqual(modeModule.feishuPublishModeIncludesMedia("full"), true, "Full mode must include media.");
assertEqual(modeModule.feishuPublishModeIncludesMedia("text"), false, "Text mode must exclude media.");
assertEqual(modeModule.feishuPublishModeIncludesMedia("media"), true, "Media mode must include media.");
const customMediaEvidence = modeModule.buildCustomMediaAttachmentEvidence(
  [
    { id: "images", imageUrls: ["image-a", "image-b"], videoUrls: [] },
    { id: "video-only", imageUrls: [], videoUrls: ["video-a"] },
    { id: "unmapped", imageUrls: ["image-c"], videoUrls: [] },
  ],
  [
    { postId: "images", recordId: "rec-images" },
    { postId: "video-only", recordId: "rec-video" },
  ],
);
assertEqual(customMediaEvidence.length, 2, "Custom media evidence must include only mapped posts.");
assertEqual(customMediaEvidence[0].fileCount, 2, "Custom media evidence must count images.");
assertEqual(customMediaEvidence[1].fileCount, 1, "Custom media evidence must count video-only posts.");
assertEqual(customMediaEvidence[1].status, "uploaded", "Successful custom media writes must become uploaded state evidence.");

assertContains(types, /FeishuPublishJob = \{[\s\S]*publishMode:\s*FeishuPublishMode/, "Durable Feishu jobs must persist the selected mode.");
assertContains(types, /SimpleRunInput = \{[\s\S]*feishuPublishMode\?:\s*FeishuPublishMode/, "Simple runs must persist the selected Feishu mode.");
assertContains(database, /publishMode:\s*normalizeFeishuPublishMode\(data\.publishMode\)/, "Historical Feishu queue rows must default through the shared mode decoder.");
assertContains(database, /normalizeStoredSimpleRun[\s\S]*feishuPublishMode:\s*normalizeFeishuPublishMode/, "Historical simple runs must default through the shared mode decoder.");

assertContains(queue, /findEquivalentQueuedJob\(ownerUserId,\s*postIds,\s*publishMode\)/, "Queue dedupe must receive the publish mode.");
assertContains(queue, /job\.publishMode\s*!==\s*publishMode/, "Queue dedupe must keep different modes distinct.");
assertContains(queue, /publishMode === "text"[\s\S]*validateTextPostsForFeishuPublish/, "Text mode must use text-only validation.");
assertContains(queue, /publishMode === "media"[\s\S]*validateMediaPostsForFeishuPublish/, "Media mode must use media-only validation.");
assertContains(queue, /job\.publishMode === "full" \? await enrichPostsWithContentTags/, "Only full mode may enrich content tags.");
if (queue.includes("canvasImageBatch") || executors.includes("canvasImageBatch") || reviewPage.includes("canvasImageBatch")) {
  throw new Error("Legacy Canvas image-batch metadata must not affect full, text, media, Canvas, or review publishing.");
}
assertContains(queue, /if \(!feishuPublishModeIncludesMedia\(job\.publishMode\)\)[\s\S]*repairedPosts\.push\(post\)/, "Text mode must skip runtime media repair.");
assertContains(queue, /publishPostsToFeishu\(publishablePosts,\s*\{[\s\S]*publishMode:\s*job\.publishMode/, "Queue execution must pass the durable mode into the CLI boundary.");

assertContains(cli, /projectPostsForFeishuPayload\(posts,\s*publishMode\)/, "Staged payloads must be projected by mode.");
assertContains(cli, /publishMode === "text"[\s\S]*\{ id: post\.id, title: post\.title, body: post\.body \}/, "Text payloads must contain only identity, title, and body.");
assertContains(cli, /\{ id: post\.id, imageUrls: post\.imageUrls, videoUrls: post\.videoUrls \|\| \[\] \}/, "Media payloads must contain only identity and media.");
assertContains(cli, /publishMode === "text"\) return key === "title" \|\| key === "body"/, "Text record payloads must exclude metadata and attachments.");
assertContains(cli, /publishMode === "media"\) return includeMediaField && key === "imageUrls"/, "Media record payloads must exclude text and metadata.");
assertContains(cli, /FEISHU_PUBLISH_MODE:\s*publishMode/, "Custom CLI calls must receive the selected mode in the environment.");
assertContains(cli, /!useDefaultBaseCreate && publishMode === "media"[\s\S]*buildCustomMediaAttachmentEvidence\(postsToCreate, createdMappings\)/, "Successful custom media commands must produce attachment upload evidence.");
assertContains(cli, /!useDefaultBaseCreate && publishMode === "media"[\s\S]*attachmentFailures\.push[\s\S]*returnedRecordIds\.length/, "Failed custom media commands that return record ids must remain attachment failures.");
assertContains(cli, /const fieldMapError = validateBitableFieldMapForPublishMode\(fieldMap, publishMode\);[\s\S]*status:\s*"needs_config"[\s\S]*const useDefaultBaseCreate/, "Selected-mode field configuration must fail before any external record creation.");
assertContains(cli, /publishMode === "text"[\s\S]*\["title", "body"\][\s\S]*missingFields\.length/, "Text publishing must require configured title and body fields.");
assertContains(cli, /publishMode === "media" && !fieldMap\.imageUrls\?\.trim\(\)/, "Media publishing must require a configured attachment field.");
assertContains(cli, /publishMode === "media"[\s\S]*attachmentStatus:\s*"failed"[\s\S]*attachmentError:\s*recordFailure\.error/, "Media record-creation failures must update only the media publish state.");
assertContains(cli, /publishMode === "text"[\s\S]*recordStatus:\s*"failed"[\s\S]*recordError:\s*recordFailure\.error/, "Text record failures must update only the text publish state.");
assertContains(cli, /feishuPublishModeIncludesText\(publishMode\)[\s\S]*writeAndVerifyGeneratedFieldsToFeishu/, "Media mode must skip text writes and read-back verification.");
assertContains(cli, /fieldMap\.imageUrls && feishuPublishModeIncludesMedia\(publishMode\)/, "Text mode must skip attachment upload.");
assertContains(queue, /publishMode === "text"\) return feishu\?\.recordStatus === "verified"/, "Text success must depend only on text field verification.");
assertContains(queue, /publishMode === "media"\) return Boolean\(feishu\?\.recordId\) && feishu\?\.attachmentStatus === "uploaded"/, "Media success must depend on a record id and uploaded attachments.");

for (const route of [manualRoute, simpleRoute]) {
  assertContains(route, /normalizeFeishuPublishMode\(body\.feishuPublishMode|normalizeFeishuPublishMode\(body\.publishMode/, "Both APIs must use the shared strict mode decoder.");
  assertContains(route, /status:\s*400/, "Invalid API modes must return HTTP 400.");
}
assertContains(simpleRuns, /feishuPublishMode:\s*normalizeFeishuPublishMode\(input\.feishuPublishMode\)/, "New simple runs must persist an explicit normalized mode.");
assertContains(simpleRuns, /publishMode:\s*normalizedInput\.feishuPublishMode/g, "Every simple-run publish branch must pass its mode to the queue.");
assertContains(mainPage, /feishuPublishMode:\s*simpleFeishuPublishMode/, "Main workspace requests must send the selected mode.");
assertContains(reviewPage, /postIds:\s*payloadPosts\.map\([\s\S]*publishMode:\s*feishuPublishMode/, "Review requests must send one shared mode for the batch.");
assertContains(reviewPage, /job\?\.publishMode \|\| "full"/, "Review polling must display the job's persisted mode.");

assertContains(registry, /const feishuPublishV2Definition:[\s\S]*version:\s*2[\s\S]*publishMode[\s\S]*defaultConfig:\s*\{ publishMode: "full" \}/, "Canvas must register publish.feishu@2 with a full default.");
assertContains(registry, /node\.type === "publish\.feishu" && node\.version === 1[\s\S]*config:\s*\{ \.\.\.structuredClone\(node\.config\), publishMode: "full" \}/, "Canvas v1 upgrades must force the backward-compatible full mode.");
assertContains(registry, /node\.type === "publish\.feishu" && node\.version === 1[\s\S]*version:\s*2/, "Canvas v1 publish nodes must upgrade to v2.");
assertContains(executors, /normalizeFeishuPublishMode\(node\.config\.publishMode\)[\s\S]*publishMode,/, "Canvas execution must strictly decode and enqueue its configured mode.");
assertContains(baseline, /feishu_publish_mode_check\.mjs/, "The Trellis baseline must register this check.");

console.log("Feishu publish mode check passed.");

function loadTypescriptCommonJs(relativePath) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relativePath,
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relativePath })(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function assertThrows(operation, pattern, message) {
  try {
    operation();
  } catch (error) {
    if (pattern.test(String(error))) return;
    throw new Error(`${message} Unexpected error: ${String(error)}`);
  }
  throw new Error(message);
}
