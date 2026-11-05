import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
import vm from "node:vm";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

const concurrency = read("src/lib/concurrency.ts");
const imageGeneration = read("src/lib/image-generation.ts");
const openai = read("src/lib/openai.ts");
const sourceTagging = read("src/lib/source-tagging.ts");
const tikhub = read("src/lib/tikhub.ts");
const mediaCache = read("src/lib/media-cache.ts");
const feishu = read("src/lib/feishu-cli.ts");
const simpleRuns = read("src/lib/simple-runs.ts");

assertContains(concurrency, /crawl:\s*readConcurrencyEnv\("WORKER_CRAWL_CONCURRENCY",\s*12,\s*50\)/, "Crawl pool must default to 12 and cap at 50.");
assertContains(concurrency, /media:\s*readConcurrencyEnv\("WORKER_MEDIA_CONCURRENCY",\s*30,\s*100\)/, "Media pool must default to 30 and cap at 100.");
assertContains(concurrency, /gpt:\s*readConcurrencyEnv\("WORKER_GPT_CONCURRENCY",\s*50,\s*50\)/, "GPT pool must default to 50 and cap at 50.");
assertContains(
  concurrency,
  /image:\s*readConcurrencyEnv\("WORKER_IMAGE_CONCURRENCY",\s*100,\s*100\)/,
  "Image pool must default to 100 and cap at the global image-provider limit.",
);
assertContains(
  concurrency,
  /localImage:\s*readConcurrencyEnv\("WORKER_LOCAL_IMAGE_CONCURRENCY",\s*1,\s*1\)/,
  "Local image workflow pool must stay serialized for single-GPU ComfyUI workflows.",
);
assertContains(
  concurrency,
  /libraryThumbnail:\s*readConcurrencyEnv\("WORKER_LIBRARY_THUMBNAIL_CONCURRENCY",\s*4,\s*4\)/,
  "Library thumbnail generation must use a dedicated four-slot pool.",
);
assertContains(
  concurrency,
  /localVideo:\s*readConcurrencyEnv\("WORKER_LOCAL_VIDEO_CONCURRENCY",\s*1,\s*4\)/,
  "Local video encoding must default to one worker and have a hard cap of four.",
);
assertContains(
  concurrency,
  /feishu:\s*readConcurrencyEnv\("WORKER_FEISHU_CONCURRENCY",\s*50,\s*50\)/,
  "Feishu pool must default to 50 and cap at 50.",
);
assertContains(
  concurrency,
  /feishuAttachment:\s*readConcurrencyEnv\("WORKER_FEISHU_ATTACHMENT_CONCURRENCY",\s*3,\s*10\)/,
  "Feishu attachment pool must default to 3 and cap at 10.",
);
assertContains(concurrency, /production:\s*readConcurrencyEnv\("WORKER_PRODUCTION_CONCURRENCY",\s*30,\s*50\)/, "Production pool must default to 30 and cap at 50.");
assertContains(concurrency, /canvasRun:\s*readConcurrencyEnv\("WORKER_CANVAS_RUN_CONCURRENCY",\s*32,\s*100\)/, "Canvas run workers must default to 32 and cap at 100.");
assertContains(concurrency, /distributionRecord:\s*readConcurrencyEnv\("WORKER_DISTRIBUTION_RECORD_CONCURRENCY",\s*2,\s*10\)/, "Distribution record pool must default to 2 and cap at 10.");
assertContains(concurrency, /distributionGpt:\s*readConcurrencyEnv\("WORKER_DISTRIBUTION_GPT_CONCURRENCY",\s*6,\s*15\)/, "Distribution GPT pool must be isolated from main generation.");
assertContains(concurrency, /distributionFeishuRead:\s*readConcurrencyEnv\("WORKER_DISTRIBUTION_FEISHU_READ_CONCURRENCY",\s*2,\s*10\)/, "Distribution Feishu read pool must stay conservative.");
assertContains(concurrency, /distributionFeishuWrite:\s*readConcurrencyEnv\("WORKER_DISTRIBUTION_FEISHU_WRITE_CONCURRENCY",\s*1,\s*3\)/, "Distribution Feishu write pool must stay serialized by default.");
assertContains(concurrency, /runWithConcurrencyPool/, "Global concurrency runner must be exported.");
assertContains(concurrency, /mapWithConcurrency/, "Shared bounded mapper must be exported.");

assertContains(openai, /runWithConcurrencyPool\("gpt"/, "Text generation must use the GPT concurrency pool.");
assertContains(sourceTagging, /runWithConcurrencyPool\("gpt"/, "Source tagging model calls must use the GPT concurrency pool.");
assertContains(sourceTagging, /mapWithConcurrency\(items,\s*concurrencyConfig\.gpt/, "Source tagging item fan-out must be bounded by GPT concurrency.");

assertContains(imageGeneration, /runWithConcurrencyPool\("image"/, "Image generation calls must use the image concurrency pool.");
assertContains(imageGeneration, /runComfyUiKleinImageTask/, "Klein-routed image tasks must use the local ComfyUI image path.");
assertContains(read("src/lib/comfyui-klein.ts"), /runWithConcurrencyPool\("localImage"/, "ComfyUI Klein must use the serialized local image pool.");
assertContains(read("src/lib/canvas/media-tools.ts"), /runWithConcurrencyPool\("localVideo"/, "Canvas FFmpeg reconstruction must use the local video pool.");
assertContains(
  imageGeneration,
  /Math\.min\(Math\.max\(Math\.floor\(candidate\),\s*1\),\s*concurrencyConfig\.image\)/,
  "Image task concurrency must be capped by the global image pool limit.",
);

assertContains(tikhub, /runWithConcurrencyPool\("crawl"/, "TikHub HTTP calls must use the crawl concurrency pool.");
assertContains(mediaCache, /mapWithConcurrency\(items,\s*concurrencyConfig\.media/, "Media cache fan-out must use the media concurrency setting.");

assertContains(feishu, /runWithConcurrencyPool\("feishu"/, "Feishu CLI invocations must use the Feishu concurrency pool.");
assertContains(
  feishu,
  /mapWithConcurrency\(posts,\s*concurrencyConfig\.feishuAttachment/,
  "Feishu attachment uploads must be bounded by the lower attachment concurrency.",
);

assertContains(simpleRuns, /mapWithConcurrency\(normalizedInput\.platforms,\s*concurrencyConfig\.crawl/, "Simple-mode platform crawling must be concurrent and bounded.");
assertContains(simpleRuns, /const productionConcurrency = isSimpleRunDongchediPageMode\(normalizedInput\) \? 1 : concurrencyConfig\.production/, "Simple-mode production must keep global concurrency while Dongchedi page tasks remain serial.");
assertContains(simpleRuns, /mapWithConcurrency\(productionItems,\s*productionConcurrency/, "Simple-mode production must use the selected bounded concurrency.");
assertContains(simpleRuns, /runWithConcurrencyPool\("production"/, "Simple-mode post production must use the production pool.");
assertContains(simpleRuns, /taskConcurrency:\s*isSimpleRunDongchediPageMode\(normalizedInput\) \? 1 : concurrencyConfig\.image/, "Simple-mode image tasks must retain the global cap while Dongchedi page image work remains serial.");
assertContains(simpleRuns, /createRunUpdateQueue/, "Simple-mode concurrent progress writes must use a serialized run update queue.");

const canvasRuns = read("src/lib/canvas/runs.ts");
assertContains(canvasRuns, /concurrencyConfig\.canvasRun/, "Canvas queue consumers must use bounded worker concurrency.");
assertContains(canvasRuns, /activeWorkers/, "Canvas queue worker state must track parallel consumers.");

console.log("Concurrency pool integration check passed.");

const compiled = ts.transpileModule(concurrency, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const [value, expected] of [[undefined, 32], ["", 32], ["invalid", 32], ["Infinity", 32], ["1", 1], ["8", 8], ["32", 32], ["64", 64], ["100", 100], ["200", 100], ["0", 1], ["-5", 1], ["20.9", 20]]) {
  const instance = { exports: {} };
  vm.runInNewContext(compiled, { module: instance, exports: instance.exports, process: { env: value === undefined ? {} : { WORKER_CANVAS_RUN_CONCURRENCY: value } } });
  assert.equal(instance.exports.concurrencyConfig.canvasRun, expected, `Canvas configuration ${value}`);
  assert.equal(instance.exports.concurrencyConfig.image, 100, "Image pool remains unchanged");
  const ast = ts.createSourceFile("runs.ts", canvasRuns, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === "ensureCanvasRunWorker");
  const workerCode = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export /m, "");
  const queueState = { activeWorkers: Math.min(3, expected), sequence: 0 };
  const existing = queueState.activeWorkers;
  const callbacks = [];
  const workerIds = [];
  const ensure = new Function("concurrencyConfig", "queueState", "setTimeout", "drainCanvasRuns", "process", `${workerCode}\nreturn ensureCanvasRunWorker;`)(
    instance.exports.concurrencyConfig, queueState, callback => callbacks.push(callback), async workerId => { workerIds.push(workerId); }, { pid: 1 },
  );
  ensure();
  ensure();
  assert.equal(queueState.activeWorkers, expected);
  assert.equal(callbacks.length, expected - existing, "Repeated kicks must not over-spawn workers");
  for (const callback of callbacks) callback();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(queueState.activeWorkers, existing, "Settled workers release their slots");
  assert.equal(new Set(workerIds).size, callbacks.length, "Workers have independent lease identities");
}
const loaded = { exports: {} };
Function("module", "exports", compiled)(loaded, loaded.exports);
const { runWithConcurrencyPool, getConcurrencySnapshot } = loaded.exports;
let release;
let started;
const entered = new Promise((resolve) => { started = resolve; });
const holding = new Promise((resolve) => { release = resolve; });
const first = runWithConcurrencyPool("localImage", async () => { started(); await holding; });
await entered;
const controller = new AbortController();
let cancelledCallback = false;
const waiter = runWithConcurrencyPool("localImage", async () => { cancelledCallback = true; }, { signal: controller.signal });
assert.equal(getConcurrencySnapshot().localImage.queued, 1);
const reason = new Error("Cancelled while waiting for image resource");
controller.abort(reason);
await assert.rejects(waiter, (error) => error === reason);
assert.deepEqual(getConcurrencySnapshot().localImage, { limit: 1, active: 1, queued: 0 });
assert.equal(cancelledCallback, false);
let nextRan = false;
const next = runWithConcurrencyPool("localImage", async () => { nextRan = true; });
assert.equal(getConcurrencySnapshot().localImage.queued, 1);
release();
await Promise.all([first, next]);
assert.equal(nextRan, true);
assert.deepEqual(getConcurrencySnapshot().localImage, { limit: 1, active: 0, queued: 0 });
await assert.rejects(runWithConcurrencyPool("localImage", async () => { throw new Error("Must not start"); }, { signal: controller.signal }), (error) => error === reason);
assert.deepEqual(getConcurrencySnapshot().localImage, { limit: 1, active: 0, queued: 0 });
console.log("Concurrency cancellation: aborted waiters leave the queue, preserve occupied capacity and admit later work.");
