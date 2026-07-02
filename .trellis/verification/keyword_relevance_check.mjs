import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src/lib/tikhub.ts");
const source = readFileSync(sourcePath, "utf8");

if (/filterCrawledItemsByQuery|isRelevantToQuery|shouldApplyKeywordRelevance/.test(source)) {
  throw new Error("src/lib/tikhub.ts must not contain local post-crawl keyword relevance filtering helpers.");
}

if (/await\s+recordKeywordRelevanceDiagnostics\(/.test(source)) {
  throw new Error("crawlTikHub must not log or apply post-crawl keyword relevance diagnostics.");
}

if (!/const filteredItems = dedupeItems\(items\)\.slice\(0,\s*input\.targetCount\);/.test(source)) {
  throw new Error("crawlTikHub should only dedupe and slice collected items before media caching.");
}

console.log("No post-crawl keyword filter check passed.");
