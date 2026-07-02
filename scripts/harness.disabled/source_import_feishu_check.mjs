import { existsSync, readFileSync } from "node:fs";
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

const sourceLinkImport = read("src/lib/source-link-import.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const config = read("src/lib/config.ts");
const readme = read("README.md");
const checkPs1 = read("scripts/harness/check.ps1");

if (existsSync(path.join(projectRoot, "src/lib/source-import-feishu.ts"))) {
  throw new Error("Source-link import must not keep the retired Feishu source-import sync module.");
}

assertNotContains(sourceLinkImport, /syncSourceItemsToFeishu|SourceImportFeishu|sourceFeishuSync/, "Advanced link import must not call or expose Feishu source-import sync.");
assertNotContains(sourceLinkImport, /feishuSourceCreated|feishuSourceSkippedDuplicate|feishuSourceFailed/, "Link import summaries must not include retired Feishu source-import counters.");
assertContains(sourceLinkImport, /filterUnsafeSourceItems\(dedupedItems/, "Link import must still apply source safety before tagging and ingest.");
assertContains(sourceLinkImport, /tagSourceItems\(safetyResult\.items\)/, "Link import must still tag safety-kept source items.");

assertNotContains(simpleRuns, /syncSourceItemsToFeishu|source-import-feishu/, "Simple link mode must not write imported source content back to a Feishu Base.");
assertContains(simpleRuns, /if \(isSimpleRunLinkMode\(normalizedInput\)\) \{[\s\S]*applyUnsafeFilterLinkResults/, "Simple link mode must still reflect source-safety filtering.");

assertNotContains(config, /FEISHU_SOURCE_IMPORT|feishuSourceImport/, "App config must not expose retired Feishu source-import knobs.");
assertNotContains(readme, /FEISHU_SOURCE_IMPORT|Source-link imports also mirror/, "README must not document retired Feishu source-import sync.");
assertContains(checkPs1, /Source import retirement check/, "Harness baseline must include the source import retirement check.");

console.log("Source import retirement check passed.");
