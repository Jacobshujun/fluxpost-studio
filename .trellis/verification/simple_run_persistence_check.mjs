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
const check = read(".trellis/verification/check.mjs");

assertContains(
  simpleRuns,
  /const savedPost = await saveGeneratedPost\(post,\s*access\);[\s\S]*await savePost\(savedPost,\s*access,\s*savedPost\);[\s\S]*return \{ post: savedPost, publishReady:/,
  "Single-source production must persist and return the same normalized post in both generated-post stores.",
);

assertContains(
  simpleRuns,
  /await produceSimpleSourceDraft\(source,[\s\S]*await produceRunUpdates\.update\(async \(latestRun\) => \{[\s\S]*const withPost = await addPostResult\(latestRun,\s*post\);[\s\S]*return incrementStage\(withPost,\s*"produce",\s*\{ completed: 1 \}\);[\s\S]*await syncSimpleSourceStatus\(post,[\s\S]*run\.id,\s*"draft"\)/,
  "Simple production must record the persisted post before non-fatal source-status sync.",
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
  /const \{ posts: persistedApprovedPosts, sourceStatusWarnings \} = await persistApprovedPostsForSimplePublish\(approvedPosts,\s*access,\s*run\.id\)[\s\S]*enqueueFeishuPublishJob\(persistedApprovedPosts/,
  "Simple publish approval should enqueue the normalized posts returned by serialized local persistence.",
);

assertContains(
  simpleRuns,
  /async function persistApprovedPostsForSimplePublish[\s\S]*for \(const post of posts\)[\s\S]*const persistedPost = await persistApprovedPostForSimplePublish\(post,\s*access\);[\s\S]*await syncSimpleSourceStatus\(persistedPost,\s*access,\s*runId,\s*"approved"\)[\s\S]*return \{ posts: persistedPosts, sourceStatusWarnings \}/,
  "Simple publish approval persistence should process and return normalized posts sequentially before Feishu enqueue.",
);

assertContains(
  simpleRuns,
  /async function persistApprovedPostForSimplePublish[\s\S]*const savedPost = await saveGeneratedPost\(post,\s*access\);[\s\S]*return savePost\(savedPost,\s*access,\s*savedPost\)/,
  "Simple publish persistence must reuse the generated-post store result in the runtime store.",
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

assertContains(check, /simple_run_persistence_check\.mjs/, "Trellis baseline must include the simple-run persistence check.");

console.log("Simple run persistence check passed.");
