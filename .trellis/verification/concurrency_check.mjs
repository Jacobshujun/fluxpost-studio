import { readFileSync } from "node:fs";
import path from "node:path";

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
const batchProduction = read("src/lib/batch-production.ts");

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
  /feishu:\s*readConcurrencyEnv\("WORKER_FEISHU_CONCURRENCY",\s*50,\s*50\)/,
  "Feishu pool must default to 50 and cap at 50.",
);
assertContains(
  concurrency,
  /feishuAttachment:\s*readConcurrencyEnv\("WORKER_FEISHU_ATTACHMENT_CONCURRENCY",\s*3,\s*10\)/,
  "Feishu attachment pool must default to 3 and cap at 10.",
);
assertContains(concurrency, /production:\s*readConcurrencyEnv\("WORKER_PRODUCTION_CONCURRENCY",\s*30,\s*50\)/, "Production pool must default to 30 and cap at 50.");
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
assertContains(simpleRuns, /mapWithConcurrency\(productionItems,\s*concurrencyConfig\.production/, "Simple-mode production must be concurrent and bounded.");
assertContains(simpleRuns, /runWithConcurrencyPool\("production"/, "Simple-mode post production must use the production pool.");
assertContains(simpleRuns, /taskConcurrency:\s*concurrencyConfig\.image/, "Simple-mode image tasks must use the global image concurrency cap.");
assertContains(simpleRuns, /createRunUpdateQueue/, "Simple-mode concurrent progress writes must use a serialized run update queue.");

assertContains(batchProduction, /mapWithConcurrency\(runningJob\.tasks,\s*concurrencyConfig\.production/, "Advanced batch production must be concurrent and bounded.");
assertContains(batchProduction, /createBatchJobUpdateQueue/, "Advanced batch progress writes must use a serialized job update queue.");

console.log("Concurrency pool integration check passed.");
