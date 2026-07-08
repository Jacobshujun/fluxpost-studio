import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const simpleRuns = read("src/lib/simple-runs.ts");

assertContains(simpleRuns, /collectSimpleKeywordItems\(run,\s*crawledItems,\s*normalizedInput,\s*settings\)/, "Simple run workflow must route keyword crawls through the keyword collection helper.");
assertContains(simpleRuns, /topUpSimpleCrawlIfNeeded\(nextRun,\s*crawledItems,\s*normalizedInput,\s*settings,\s*perPlatformTarget\)/, "Simple keyword crawl must top up after initial per-platform crawl.");
assertContains(simpleRuns, /function topUpSimpleCrawlIfNeeded\(/, "Simple crawl top-up helper is missing.");
assertContains(simpleRuns, /input\.targetCount\s*-\s*dedupeItems\(crawledItems\)\.length/, "Top-up must be based on deduped missing candidates.");
assertContains(simpleRuns, /const requested = previousRequested \+ missing/, "Top-up must request the previous platform target plus the missing count.");
assertContains(simpleRuns, /buildDefaultCrawlInput\(platform,\s*input\.keyword,\s*requested,\s*settings\)/, "Top-up must use normal platform request parameters.");
assertContains(simpleRuns, /Simple run crawl top-up/, "Top-up attempts must be observable in execution logs.");

assertContains(simpleRuns, /const generateImages = shouldGenerateImages\(normalizedInput\)[\s\S]*selectSimpleProductionItems\(rankedProductionCandidates,\s*normalizedInput\.targetCount,[\s\S]*requireVisualSource:\s*generateImages/, "Simple production must require media-eligible candidates only when image generation is enabled.");
assertContains(simpleRuns, /function hasSimpleProductionVisualSource\(source: NormalizedSourceItem\)/, "Simple production media eligibility helper is missing.");
assertContains(simpleRuns, /function hasSimpleProductionPickupRecordTag\(source: NormalizedSourceItem\)/, "Simple production must identify pickup-record content tags.");
assertContains(simpleRuns, /hasSimpleProductionPickupRecordTag\(source\)\)\s*return false/, "Pickup-record sources must not be eligible for simple automatic production.");
assertContains(simpleRuns, /if \(hasSimpleProductionPickupRecordTag\(item\)\)[\s\S]*noMediaItems\.push\(item\)/, "Pickup-record sources must still be skipped even when image generation is disabled.");
assertContains(simpleRuns, /source\.downloadedImages\?\.length/, "Media eligibility must consider downloaded images.");
assertContains(simpleRuns, /source\.images\.length/, "Media eligibility must consider source images.");
assertContains(simpleRuns, /source\.videoFrames\?\.length/, "Media eligibility must consider video frames.");
assertContains(simpleRuns, /function isSimpleProductionVideoLikeSource\(source: NormalizedSourceItem\)/, "Simple production must distinguish video-like sources from image-only sources.");
assertContains(simpleRuns, /isSimpleProductionVideoLikeSource\(source\)[\s\S]*isSourceVideoLike\(source\)/, "Simple production must use the shared source-video-like helper.");
assertContains(simpleRuns, /function hasSimpleProductionVideoReference\(source: NormalizedSourceItem\)/, "Simple production must use a shared source-video reference helper.");
assertContains(simpleRuns, /hasSimpleProductionVideoReference\(source\)[\s\S]*hasSourceVideoReference\(source\)/, "Simple production video references must resolve through the shared helper.");
assertContains(simpleRuns, /if \(isSimpleProductionVideoLikeSource\(source\)\)\s*return Boolean\(hasSimpleProductionVideoReference\(source\) \|\| source\.videoFrames\?\.length\)/, "Video-like simple production sources must allow source-video references or extracted video frames.");
assertContains(simpleRuns, /Skipped video source without a source video reference or extracted video frames\./, "Video-like skips must mention missing source videos and frames.");
assertContains(simpleRuns, /Skipped pickup record source excluded from production\./, "Pickup-record skips must be logged with a specific operator-facing reason.");
assertContains(simpleRuns, /pickupRecord:\s*hasSimpleProductionPickupRecordTag\(source\)/, "Pickup-record skip details must be visible in execution logs.");
assertContains(simpleRuns, /noMediaItems/, "Simple production must track no-media skipped items.");
assertContains(simpleRuns, /Simple production source skipped/, "No-media skips must be logged.");
assertContains(simpleRuns, /total:\s*productionItems\.length \+ noMediaItems\.length/, "Produce stage total must include skipped no-media candidates.");
assertContains(simpleRuns, /mapWithConcurrency\(productionItems,\s*concurrencyConfig\.production/, "Only selected production items should enter generation.");
assertNotContains(
  simpleRuns,
  /\.sort\(\(a, b\) => b\.score - a\.score\)\s*\.slice\(0,\s*normalizedInput\.targetCount\)\s*\.map\(\(\{ item \}\) => item\)/,
  "Simple production must not let no-media items consume the target before media eligibility filtering.",
);

const creationControls = read("src/lib/creation-controls.ts");
assertContains(creationControls, /function shouldUseVideoFramesAsImageTasks\(source: NormalizedSourceItem\)/, "Default production task builder must keep a video-frame policy helper.");
assertContains(creationControls, /function isVideoLikeSource\(source: NormalizedSourceItem\)/, "Default production task builder must distinguish video-like sources from image-only sources.");
assertContains(creationControls, /if \(shouldUseVideoFramesAsImageTasks\(source\)\)\s*\{\s*return frameTasks\.slice\(0,\s*maxVideoHighlightFrames\);\s*\}/, "Video-like default production tasks must not fall back to source/cover images when no frames were extracted.");
assertContains(creationControls, /function shouldUseVideoFramesAsImageTasks\(source: NormalizedSourceItem\)\s*\{\s*return isVideoLikeSource\(source\);/, "Default production task video-frame policy must apply to every video-like source, even when no frames were extracted.");

const productionPlan = read("src/lib/production-plan.ts");
assertContains(productionPlan, /contentTagging\?\.tags\.includes\("提车记录"\)/, "Production planning must detect pickup-record content tags.");
assertContains(productionPlan, /decision:\s*"observe_only"[\s\S]*pickup_record_observe_only/, "Pickup-record content must be marked observe_only before advanced or batch generation.");
assertContains(productionPlan, /提车记录属于车主提车归档内容，不进入后续内容生产流程。/, "Pickup-record observe-only reason must be operator-facing.");

const contentPool = read("src/lib/content-pool.ts");
assertContains(contentPool, /patch\.contentTagging === undefined \? item\.productionPlan : undefined/, "Manual content-tag edits must recalculate production plans.");

console.log("Simple crawl top-up and media policy check passed.");
