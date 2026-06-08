import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const page = read("src/app/page.tsx");
const route = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const types = read("src/lib/types.ts");
const checkPs1 = read("scripts/harness/check.ps1");

assertContains(types, /sourceMode\?:\s*"keyword"\s*\|\s*"links"/, "SimpleRunInput must persist keyword/link source mode.");
assertContains(types, /links\?:\s*string\[\]/, "SimpleRunInput must persist source links for link-mode simple runs.");
assertContains(types, /linkResults\?:\s*SimpleRunLinkResult\[\]/, "SimpleRun should persist per-link results.");

assertContains(sourceLinkImport, /export async function resolveSourceLinks/, "Source-link import should expose a reusable resolver for simple runs.");

assertContains(route, /sourceMode\?:\s*"keyword"\s*\|\s*"links"/, "Simple run API should accept sourceMode.");
assertContains(route, /links\?:\s*string\[\]\s*\|\s*string/, "Simple run API should accept batch links.");
assertContains(route, /sourceMode:\s*body\.sourceMode === "links" \? "links" : "keyword"/, "Simple run API must forward link mode.");
assertContains(route, /links:\s*body\.links/, "Simple run API must forward source links.");

assertContains(simpleRuns, /isSimpleRunLinkMode\(normalizedInput\)[\s\S]*collectSimpleLinkItems/, "Simple run workflow must branch into link collection.");
assertContains(simpleRuns, /resolveSourceLinks\(\{[\s\S]*links,[\s\S]*platform:/, "Link-mode simple runs must reuse the source-link resolver.");
assertContains(simpleRuns, /sourceMode === "links" && !links\.length/, "Link-mode input validation must require source links.");
assertContains(simpleRuns, /sourceMode === "keyword" && !platforms\.length/, "Keyword-mode input validation must keep requiring platforms.");
assertContains(simpleRuns, /sourceMode === "links" \? Math\.min\(targetCount,\s*links\.length\)/, "Link-mode target count should be bounded by link count.");
assertContains(simpleRuns, /applyUnsafeFilterLinkResults/, "Simple link results should reflect source-safety filtering.");

assertContains(page, /type SimpleSourceMode = "keyword" \| "links"/, "Simple UI should define keyword/link modes.");
assertContains(page, /simpleSourceMode/, "Simple UI should keep source mode state.");
assertContains(page, /simpleLinkText/, "Simple UI should keep controlled source-link textarea state.");
assertContains(page, /批量导入链接/, "Simple and compact UI should expose the batch-link entry.");
assertContains(page, /sourceMode,\s*\n\s*keyword,\s*\n\s*targetCount:[\s\S]*links: sourceMode === "links" \? links : undefined/, "Simple start request must send link-mode payload.");
assertContains(page, /variant=\{workspaceMode === "compact" \? "compact" : "standard"\}[\s\S]*sourceMode=\{simpleSourceMode\}[\s\S]*linkText=\{simpleLinkText\}/, "Compact and simple variants must share the link-mode props.");

assertContains(checkPs1, /Simple link run check/, "Harness baseline must include the simple link run check.");

console.log("Simple link run check passed.");
