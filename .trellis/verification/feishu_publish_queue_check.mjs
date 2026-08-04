import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

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

const queuePath = path.join(projectRoot, "src/lib/feishu-publish-queue.ts");
if (!existsSync(queuePath)) throw new Error("Feishu publish queue service is missing.");

const types = read("src/lib/types.ts");
const database = read("src/lib/database.ts");
const schema = read("db/migrations/001_initial_postgres.sql");
const queue = read("src/lib/feishu-publish-queue.ts");
const feishu = read("src/lib/feishu-cli.ts");
const route = read("src/app/api/publish/feishu/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const reviewPage = read("src/app/review/page.tsx");
const check = read(".trellis/verification/check.mjs");

assertContains(types, /export type FeishuPublishQueueStatus/, "Feishu publish queue status type is missing.");
assertContains(types, /export type FeishuPublishJob = \{[\s\S]*ownerUserId:\s*string[\s\S]*posts:\s*GeneratedPost\[\]/, "Feishu publish job must carry owner and posts.");
assertContains(types, /export type GeneratedPost = \{[\s\S]*taskKeyword\?:\s*string/, "Generated posts must persist the task keyword for Feishu vehicle writes.");
assertContains(types, /SimpleRunPublishResult = \{[\s\S]*status:\s*"queued"\s*\|\s*"running"/, "Simple-run publish result must include queued/running.");
assertContains(types, /SimpleRunPublishResult = \{[\s\S]*jobId\?:\s*string/, "Simple-run publish result must persist the Feishu job id.");

assertContains(database, /CREATE TABLE IF NOT EXISTS feishu_publish_queue/, "Runtime database schema must create feishu_publish_queue.");
assertContains(schema, /CREATE TABLE IF NOT EXISTS feishu_publish_queue/, "PostgreSQL migration must create feishu_publish_queue.");
assertContains(schema, /idx_feishu_publish_queue_ready/, "PostgreSQL migration must index ready Feishu jobs.");
assertContains(database, /export async function saveFeishuPublishJobToDb/, "Feishu queue save helper is missing.");
assertContains(database, /export async function claimNextFeishuPublishQueueItem/, "Feishu queue claim helper is missing.");
assertContains(database, /export async function heartbeatFeishuPublishQueueItem/, "Feishu queue heartbeat helper is missing.");
assertContains(database, /FOR UPDATE SKIP LOCKED/, "PostgreSQL Feishu queue claim must use SKIP LOCKED.");
assertContains(database, /running\.owner_user_id = feishu_publish_queue\.owner_user_id/, "Feishu queue must guard one running job per owner.");

assertContains(queue, /FEISHU_PUBLISH_WORKER_CONCURRENCY/, "Feishu queue worker concurrency env is missing.");
assertContains(queue, /FLUXPOST_DISABLE_BACKGROUND_WORKERS\s*===\s*"1"/, "Isolated verification must be able to enqueue without starting Feishu workers.");
assertContains(queue, /publishPostsToFeishu\(publishablePosts,\s*\{[\s\S]*notificationContext:\s*\{[\s\S]*jobId:\s*job\.id[\s\S]*source:\s*job\.source[\s\S]*sourceRunId:\s*job\.sourceRunId/, "Feishu queue worker must pass job context to Feishu notifications.");
assertContains(queue, /if \(!publishablePosts\.length\) \{[\s\S]*saveTerminalFeishuJob[\s\S]*return failedJob;[\s\S]*publishPostsToFeishu\(publishablePosts/, "An all-invalid prepared job must settle without invoking Feishu record creation.");
assertContains(queue, /taskKeyword:\s*post\.taskKeyword\s*\|\|\s*simpleRun\?\.input\.keyword/, "Feishu queue worker must backfill task keyword from the simple run before writing Base records.");
assertContains(queue, /claimNextFeishuPublishQueueItem\(workerId,\s*feishuPublishQueueLockMs\)/, "Feishu queue worker must claim durable work.");
assertContains(queue, /heartbeatFeishuPublishQueueItem\(runningJob\.id,\s*workerId,\s*feishuPublishQueueLockMs\)/, "Feishu queue worker must heartbeat leases.");
assertContains(queue, /feishuStateByPostId/, "Feishu queue worker must persist returned per-post Feishu state.");
assertContains(queue, /saveGeneratedPost\(post\)/, "Feishu queue worker must persist generated posts.");
assertContains(queue, /markSourceRewritten\(post\.sourceItemId,\s*post\)/, "Feishu queue worker must update source usage state.");
assertContains(queue, /syncSimpleRunPublishJob/, "Feishu queue worker must update simple-run publish state.");
assertContains(queue, /const publishPosts = normalizePosts\(posts\)/, "Feishu queue enqueue must snapshot posts without synchronous preparation.");
assertContains(queue, /prepareFeishuPublishJob[\s\S]*enrichPostsWithContentTags[\s\S]*validatePostsForFeishuPublish[\s\S]*persistPostsSerially/, "Feishu worker must prepare and persist posts before external publishing.");
assertContains(queue, /onChunkComplete:[\s\S]*persistPostsSerially\(changedPosts\)[\s\S]*saveFeishuPublishJobToDb/, "Each Feishu chunk must persist post state and durable progress.");
assertContains(queue, /completedChunks:\s*job\.progress\?\.completedChunks\s*\|\|\s*0/, "Terminal progress must retain completed chunks instead of treating planned chunks as completed.");
assertContains(queue, /retrySafe:\s*Boolean\(failure\.recordId\)/, "Known record ids must be retry-safe while unknown create outcomes remain unsafe.");
assertContains(queue, /mediaFailurePostIds[\s\S]*filter\(\(failure\) => !mediaFailurePostIds\.has\(failure\.postId\)\)/, "Media preflight failures must not be duplicated as attachment-stage failures.");
assertContains(queue, /async function persistPostsSerially\(posts: GeneratedPost\[\]\)[\s\S]*for \(const post of posts\)[\s\S]*withFeishuPublishTransientDatabaseRetry/, "Feishu queue must serialize local post persistence with transient database retry.");
assertContains(queue, /timeout exceeded when trying to connect/i, "Feishu queue persistence retry must cover PostgreSQL connection-pool timeout.");
assertNotContains(queue, /applyWorkspaceOwner\(post,\s*ownerAccess,\s*post\)/, "Feishu queue enqueue must not rewrite post ownership to the queue owner.");
assertNotContains(queue, /Promise\.all\(\s*finalPosts\.map\(persistOnePost\)\s*\)/, "Feishu queue must not fan out post-publish local persistence.");
assertNotContains(queue, /Promise\.all\(\s*posts\.map\(persistOnePost\)\s*\)/, "Feishu queue must not fan out pre-enqueue local persistence.");

assertContains(feishu, /contentCreationSource:\s*"内容创作来源"/, "Feishu publish defaults must write the content creation source field.");
assertContains(feishu, /vehicle:\s*"车型"/, "Feishu publish defaults must write the vehicle single-select field.");
assertContains(feishu, /case "contentCreationSource":[\s\S]*return formatContentCreationSource\(post\)/, "Feishu publish must map contentCreationSource from the post owner.");
assertContains(feishu, /case "vehicle":[\s\S]*return formatVehicleFieldValue\(post\)/, "Feishu publish must map vehicle from the task keyword.");
assertContains(feishu, /function formatVehicleFieldValue\(post: GeneratedPost\)[\s\S]*post\.taskKeyword\?\.trim\(\)\s*\|\|\s*null/, "Feishu vehicle field must use a single-select string value or null.");
assertContains(feishu, /function formatContentCreationSource\(post: GeneratedPost\)[\s\S]*post\.ownerDisplayName\?\.trim\(\)[\s\S]*post\.ownerUserId\?\.trim\(\)/, "Feishu content creation source must prefer owner display name and fall back to owner id.");
assertContains(feishu, /type FeishuPublishNotificationSummary[\s\S]*status:\s*"published"\s*\|\s*"record_failed"\s*\|\s*"attachment_failed"/, "Feishu notification must distinguish success from record and attachment failures.");
assertContains(feishu, /function buildPublishNotificationText[\s\S]*formatNotificationTask\(posts,\s*context\)[\s\S]*formatNotificationContentLines\(posts\)/, "Feishu notification text must be a publish batch summary.");
assertContains(feishu, /tryParseCreatedRecordIds\(stdout \|\| ""\)[\s\S]*recordMappings\.push[\s\S]*postsToCreate\s*\.slice\(returnedRecordIds\.length\)/, "Record ids returned before a CLI error must be retained while only unknown outcomes fail.");
assertContains(feishu, /内容示例：/, "Batch Feishu notifications should label post titles as content examples.");
assertNotContains(feishu, /const firstPost = posts\[0\]/, "Feishu notifications must not use the first post as the batch title.");
assertNotContains(feishu, /`标题：\$\{title\}`/, "Feishu notifications must not label the first post title as the whole publish title.");

assertContains(route, /enqueueFeishuPublishJob/, "Manual Feishu publish route must enqueue jobs.");
assertContains(route, /postIds\?:\s*string\[\]/, "Manual Feishu publish must accept post ids instead of full posts.");
assertContains(route, /getGeneratedPostsByIds\(postIds,\s*account\)/, "Manual Feishu publish must bulk-load owner-visible posts once.");
assertNotContains(route, /listFeishuVehicleOptions|persistPostsSerially|publishPostsToFeishu/, "Manual Feishu enqueue must not perform worker preparation or external writes.");
assertContains(route, /\{\s*status:\s*202\s*\}/, "Manual Feishu enqueue must return HTTP 202 after creating the durable job.");
assertContains(route, /export async function GET/, "Manual Feishu publish route must expose job polling.");

assertContains(simpleRuns, /enqueueFeishuPublishJob\(approvedPosts/, "Simple-run publish stage must enqueue Feishu publishing.");
assertContains(simpleRuns, /taskKeyword:\s*resolveSimplePostTaskKeyword\(normalizedInput,\s*source\)/, "Simple-run generated posts must carry the task keyword for Feishu vehicle writes.");
assertNotContains(simpleRuns, /publishPostsToFeishu/, "Simple-run publish stage must not call Feishu CLI directly.");

assertContains(reviewPage, /\/api\/publish\/feishu\?jobId=/, "Review must poll queued Feishu publish jobs.");
assertContains(reviewPage, /queueStatus\?:\s*FeishuPublishJob\["status"\]/, "Review publish status must track Feishu queue status.");
assertContains(reviewPage, /isFeishuPublishQueueLive/, "Review must stop polling after Feishu queue terminal status.");
assertContains(reviewPage, /postIds:\s*payloadPosts\.map/, "Review must submit generated-post ids only.");
assertContains(reviewPage, /progress\.processed[\s\S]*progress\.completedChunks/, "Review must render durable Feishu job progress.");
assertContains(check, /feishu_publish_queue_check\.mjs/, "Trellis baseline must include the Feishu publish queue check.");

await verifyFiftyPostManualEnqueue(route);

console.log("Feishu publish queue check passed.");

async function verifyFiftyPostManualEnqueue(routeSource) {
  const calls = { bulkRead: 0, enqueue: 0 };
  const postIds = Array.from({ length: 50 }, (_, index) => `post-${index + 1}`);
  const posts = postIds.map((id) => ({ id, sourceItemId: `source-${id}`, platform: "xiaohongshu", status: "approved", imageUrls: [] }));
  const job = {
    id: "feishu-publish-test-50",
    ownerUserId: "test-owner",
    source: "manual",
    status: "queued",
    priority: 0,
    attempts: 0,
    maxAttempts: 1,
    runAfter: "2026-08-04T00:00:00.000Z",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    postIds,
    posts,
  };
  const output = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "src/app/api/publish/feishu/route.ts",
  }).outputText;
  const loadedModule = { exports: {} };
  const mocks = {
    "next/server": {
      NextResponse: {
        json(payload, init) {
          return { status: init?.status || 200, json: async () => payload };
        },
      },
    },
    "@/lib/activity-log": { compactError: (error) => String(error), recordExecutionLog: async () => undefined },
    "@/lib/feishu-publish-queue": {
      buildFeishuPublishJobResponse: async (value) => ({ status: "queued", jobId: value.id, queueStatus: value.status, job: value }),
      enqueueFeishuPublishJob: async (value) => {
        calls.enqueue += 1;
        if (value.length !== 50) throw new Error(`Expected 50 posts at enqueue, got ${value.length}.`);
        return job;
      },
      getFeishuPublishJob: async () => undefined,
      listFeishuPublishJobs: async () => [],
    },
    "@/lib/generated-posts": {
      getGeneratedPostsByIds: async (value, account) => {
        calls.bulkRead += 1;
        if (value.join(",") !== postIds.join(",")) throw new Error("Manual route changed the requested post order.");
        if (account.id !== "test-owner") throw new Error("Manual route lost the authenticated owner boundary.");
        return posts;
      },
    },
    "@/lib/workspace-accounts": {
      requireWorkspaceAccount: async () => ({ id: "test-owner", displayName: "Test Owner", role: "operator" }),
    },
  };
  const localRequire = (id) => mocks[id] || require(id);
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename: "src/app/api/publish/feishu/route.ts",
  })(localRequire, loadedModule, loadedModule.exports);

  const previousDisable = process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS;
  process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS = "1";
  try {
    const response = await loadedModule.exports.POST(
      new Request("http://127.0.0.1/api/publish/feishu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postIds }),
      }),
    );
    const payload = await response.json();
    if (response.status !== 202 || payload.jobId !== job.id) {
      throw new Error(`50-post manual enqueue must return one 202 job: ${JSON.stringify({ status: response.status, payload })}.`);
    }
    if (calls.bulkRead !== 1 || calls.enqueue !== 1) {
      throw new Error(`50-post manual enqueue must bulk-read and enqueue once: ${JSON.stringify(calls)}.`);
    }
  } finally {
    if (previousDisable === undefined) delete process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS;
    else process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS = previousDisable;
  }
}
