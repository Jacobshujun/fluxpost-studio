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

assertContains(simpleRuns, /selectSimpleProductionItems\(rankedProductionCandidates,\s*normalizedInput\.targetCount\)/, "Simple production must select media-eligible candidates before generation.");
assertContains(simpleRuns, /function hasSimpleProductionVisualSource\(source: NormalizedSourceItem\)/, "Simple production media eligibility helper is missing.");
assertContains(simpleRuns, /source\.downloadedImages\?\.length/, "Media eligibility must consider downloaded images.");
assertContains(simpleRuns, /source\.images\.length/, "Media eligibility must consider source images.");
assertContains(simpleRuns, /source\.videoFrames\?\.length/, "Media eligibility must consider video frames.");
assertContains(simpleRuns, /noMediaItems/, "Simple production must track no-media skipped items.");
assertContains(simpleRuns, /Simple production source skipped/, "No-media skips must be logged.");
assertContains(simpleRuns, /total:\s*productionItems\.length \+ noMediaItems\.length/, "Produce stage total must include skipped no-media candidates.");
assertContains(simpleRuns, /mapWithConcurrency\(productionItems,\s*concurrencyConfig\.production/, "Only media-eligible production items should enter generation.");
assertNotContains(
  simpleRuns,
  /\.sort\(\(a, b\) => b\.score - a\.score\)\s*\.slice\(0,\s*normalizedInput\.targetCount\)\s*\.map\(\(\{ item \}\) => item\)/,
  "Simple production must not let no-media items consume the target before media eligibility filtering.",
);

console.log("Simple crawl top-up and media policy check passed.");
