import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const types = read("src/lib/types.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const crawlJobsRoute = read("src/app/api/crawl/jobs/route.ts");
const crawlLinksRoute = read("src/app/api/crawl/links/route.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const baseline = read(".trellis/verification/check.mjs");

assertContains(types, /export type CrawlJob = \{[^}]*contentSafetyPolicy\?:\s*ContentSafetyPolicy/, "Crawl jobs must persist an optional policy snapshot.");
assertContains(types, /export type SimpleRun = \{[^}]*contentSafetyPolicy\?:\s*ContentSafetyPolicy/, "Simple runs must persist an optional policy snapshot.");

assertContains(
  simpleRuns,
  /const contentSafetyPolicy = normalizeContentSafetyPolicySnapshot\(await getContentSafetyPolicy\(\)\);[\s\S]*makeInitialRun\(normalizedInput, settings, contentSafetyPolicy\)/,
  "Simple-run creation must read and freeze the current policy before persistence.",
);
assertContains(
  simpleRuns,
  /function makeInitialRun\([\s\S]*contentSafetyPolicy:\s*ContentSafetyPolicy[\s\S]*contentSafetyPolicy,[\s\S]*stages:/,
  "Simple-run creation must store the frozen policy on the run record.",
);
assertContains(
  simpleRuns,
  /const contentSafetyPolicy = normalizeContentSafetyPolicySnapshot\(run\.contentSafetyPolicy\);[\s\S]*filterUnsafeSourceItems\(crawledItems,[\s\S]*contentSafetyPolicy\)/,
  "Simple-run execution must use the persisted snapshot and shipped-default fallback.",
);

const crawlPolicyRead = crawlJobsRoute.indexOf("normalizeContentSafetyPolicySnapshot(await getContentSafetyPolicy())");
const crawlJobSave = crawlJobsRoute.indexOf("const job = await saveJob(");
const crawlProviderCall = crawlJobsRoute.indexOf("await crawlTikHub(input)");
if (crawlPolicyRead < 0 || crawlJobSave < 0 || crawlProviderCall < 0 || !(crawlPolicyRead < crawlJobSave && crawlJobSave < crawlProviderCall)) {
  throw new Error("Advanced crawl jobs must freeze and persist policy before provider work.");
}
assertContains(crawlJobsRoute, /contentSafetyPolicy,[\s\S]*items:\s*\[\]/, "Advanced crawl jobs must persist the frozen policy.");
assertContains(
  crawlJobsRoute,
  /filterUnsafeSourceItems\(items,\s*\{\s*scope:\s*"crawl\/jobs",\s*query:\s*input\.query\s*\},\s*contentSafetyPolicy\)/,
  "Advanced crawl evaluation must receive the request-start policy snapshot.",
);

assertContains(
  crawlLinksRoute,
  /const contentSafetyPolicy = normalizeContentSafetyPolicySnapshot\(await getContentSafetyPolicy\(\)\);[\s\S]*importSourceLinks\(\{ \.\.\.input, owner: account, contentSafetyPolicy \}\)/,
  "Synchronous link imports must read policy once and pass it into domain logic.",
);
assertContains(
  sourceLinkImport,
  /contentSafetyPolicy:\s*ContentSafetyPolicy/,
  "Source-link import input must require an explicit request-start policy snapshot.",
);
assertContains(
  sourceLinkImport,
  /filterUnsafeSourceItems\(dedupedItems,[\s\S]*input\.contentSafetyPolicy\)/,
  "Source-link import evaluation must use the explicit snapshot.",
);

if ((simpleRuns.match(/getContentSafetyPolicy\(\)/g) || []).length !== 1) {
  throw new Error("Simple runs may read the mutable current policy only once, during run creation.");
}
if ((crawlLinksRoute.match(/getContentSafetyPolicy\(\)/g) || []).length !== 1) {
  throw new Error("Synchronous link imports must read the mutable current policy exactly once per request.");
}

assertContains(baseline, /content_safety_policy_snapshot_check\.mjs/, "The Trellis baseline must include policy snapshot verification.");

console.log("Content safety policy snapshot check passed.");
