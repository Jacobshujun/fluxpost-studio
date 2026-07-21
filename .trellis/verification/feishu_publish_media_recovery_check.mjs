import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  materializer: "src/lib/runtime-media-materializer.ts",
  storage: "src/lib/runtime-media-storage.ts",
  queue: "src/lib/feishu-publish-queue.ts",
  cli: "src/lib/feishu-cli.ts",
  database: "src/lib/database.ts",
  types: "src/lib/types.ts",
  route: "src/app/api/publish/feishu/route.ts",
  page: "src/app/page.tsx",
  review: "src/app/review/page.tsx",
  baseline: ".trellis/verification/check.ps1",
};

for (const relativePath of Object.values(files)) {
  if (!existsSync(path.join(root, relativePath))) throw new Error(`Missing Feishu media recovery file: ${relativePath}`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, relativePath]) => [key, readFileSync(path.join(root, relativePath), "utf8")]));

assertContains(source.materializer, /findExistingRuntimeMedia/, "Historical local references must use the shared exact-key TOS lookup.");
assertContains(
  source.materializer,
  /isAppLocalRuntimeMediaUrl\(url\)[\s\S]*findExistingRuntimeMedia\(url\)[\s\S]*recoveredFromTos:\s*true/,
  "Missing app-managed media must expose its canonical recovered TOS URL.",
);
assertContains(source.materializer, /AbortSignal\.timeout\(timeoutMs\)/, "Runtime media downloads must be bounded by an abort timeout.");
assertContains(source.materializer, /imageDownloadTimeoutMs\s*=\s*120_000/, "Image recovery must use a 120 second default timeout.");
assertContains(source.materializer, /videoDownloadTimeoutMs\s*=\s*300_000/, "Video recovery must use a 300 second default timeout.");
assertContains(source.storage, /buildTosObjectKey\(publicPath/, "TOS recovery must map the complete logical public path to the object key.");

const prepareIndex = source.queue.indexOf("prepareFeishuPublishJobMedia(runningJob)");
const publishIndex = source.queue.indexOf("publishPostsToFeishu(latestPosts");
assertEqual(prepareIndex >= 0 && publishIndex > prepareIndex, true, "Recovered URLs must be persisted before Feishu publish starts.");
assertContains(source.queue, /resolveRuntimeMediaReference\(url\)/, "The queue must reuse shared runtime media reference resolution.");
assertContains(source.queue, /changedPosts\.length\) await persistRecoveredPostsSerially\(changedPosts\)/, "Recovered generated posts must be persisted.");
assertContains(
  source.queue,
  /saveFeishuPublishJobToDb\(\{[\s\S]*posts:\s*repairedPosts[\s\S]*postIds:\s*repairedPosts\.map/,
  "The running job snapshot must store repaired media references.",
);
assertContains(source.queue, /isPostFullyPublished/, "Partial publish persistence must decide generated-post status per post.");

assertContains(source.cli, /preflightFailedPostIds/, "Feishu attachment preflight must track failed posts independently.");
assertContains(source.cli, /publishablePosts\s*=\s*posts\.filter/, "Valid posts must be partitioned from media failures.");
assertContains(source.cli, /chunkPosts\(publishablePosts,\s*feishuRecordBatchSize\)/, "Record creation must receive only preflight-valid posts.");
assertContains(source.cli, /!publishablePosts\.length[\s\S]*\("failed" as const\)/, "An all-invalid batch must fail before record creation.");
assertContains(source.cli, /mediaFailures/, "Per-post media failures must be returned to the durable job.");
assertNotContains(
  source.cli,
  /throw new Error\(\s*`Post \$\{post\.id\} has media URLs that could not be prepared/,
  "One media failure must not abort attachment preparation for the entire batch.",
);

assertContains(source.database, /getFeishuPublishQueueContextFromDb/, "Queue polling must expose same-owner queue context.");
assertContains(source.database, /queue_ahead/, "PostgreSQL queue context must count jobs ahead.");
assertContains(source.route, /await buildFeishuPublishJobResponse\(job\)/, "Publish polling must await queue context.");
assertContains(source.page, /queueAhead\?:\s*number/, "Main publish UI must type queue position.");
assertContains(source.review, /queueAhead\?:\s*number/, "Review publish UI must type queue position.");
assertContains(source.types, /mediaRepairCount\?:\s*number/, "Durable jobs must report recovered media count.");
assertContains(source.types, /mediaFailures\?:\s*Array/, "Durable jobs must report structured per-post media failures.");
assertContains(source.baseline, /feishu_publish_media_recovery_check\.mjs/, "The full Trellis baseline must run this regression.");

console.log("Feishu publish media recovery check passed.");

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}
