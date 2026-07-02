import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const simpleRuns = read("src/lib/simple-runs.ts");
const contentPool = read("src/lib/content-pool.ts");
const check = read("scripts/harness/check.ps1");

assertContains(
  simpleRuns,
  /await saveGeneratedPost\(post,\s*access\);[\s\S]*await produceRunUpdates\.update\(async \(latestRun\) => \{[\s\S]*const withPost = await addPostResult\(latestRun,\s*post\);[\s\S]*return incrementStage\(withPost,\s*"produce",\s*\{ completed: 1 \}\);[\s\S]*await syncSimpleSourceStatus\(post,\s*access,\s*run\.id,\s*"draft"\)/,
  "Simple production must persist and record the generated post before non-fatal source-status sync.",
);

assertContains(
  simpleRuns,
  /async function syncSimpleSourceStatus\(post: GeneratedPost,\s*access: WorkspaceAccessActor \| undefined,\s*runId: string,\s*stage: "draft" \| "approved"\)/,
  "Simple runs should wrap source-status sync in a non-fatal helper.",
);

const directSourceSyncCalls = simpleRuns.match(/await markSourceRewritten\(post\.sourceItemId,\s*post,\s*access\);/g) || [];
if (directSourceSyncCalls.length !== 1) {
  throw new Error("Simple runs should call markSourceRewritten only inside the non-fatal source-status helper.");
}

assertContains(
  simpleRuns,
  /const sourceStatusWarnings = await persistApprovedPostsForSimplePublish\(approvedPosts,\s*access,\s*run\.id\)/,
  "Simple publish approval should use the serialized local persistence helper.",
);

assertContains(
  simpleRuns,
  /async function persistApprovedPostsForSimplePublish[\s\S]*for \(const post of posts\)[\s\S]*await persistApprovedPostForSimplePublish\(post,\s*access\);[\s\S]*await syncSimpleSourceStatus\(post,\s*access,\s*runId,\s*"approved"\)/,
  "Simple publish approval persistence should process posts sequentially before Feishu enqueue.",
);

if (/Promise\.all\(\s*approvedPosts\.map/.test(simpleRuns)) {
  throw new Error("Simple publish approval persistence must not fan out approvedPosts with Promise.all.");
}

assertContains(
  simpleRuns,
  /function isSimpleRunTransientDatabaseError\(error: unknown\)[\s\S]*code === "40P01"[\s\S]*code === "40001"[\s\S]*message\.includes\("死锁"\)/,
  "Simple publish approval persistence should retry transient PostgreSQL deadlock/serialization conflicts.",
);

assertContains(
  contentPool,
  /const sourceRewriteMaxAttempts = 3;/,
  "Source rewrite status sync should retry transient PostgreSQL conflicts.",
);

assertContains(
  contentPool,
  /function isSourceRewriteRetryableError\(error: unknown\)[\s\S]*code === "40P01"[\s\S]*code === "40001"/,
  "Source rewrite retry guard should recognize PostgreSQL deadlock and serialization failures.",
);

assertContains(
  contentPool,
  /await delaySourceRewriteRetry\(attempt\)/,
  "Source rewrite status sync should wait briefly before retrying.",
);

assertContains(check, /simple_run_persistence_check\.mjs/, "Harness baseline must include the simple-run persistence check.");

console.log("Simple run persistence check passed.");
