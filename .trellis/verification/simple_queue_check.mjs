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
const database = read("src/lib/database.ts");
const types = read("src/lib/types.ts");
const feishu = read("src/lib/feishu-cli.ts");
const schema = read("db/migrations/001_initial_postgres.sql");
const page = read("src/app/page.tsx");
const route = read("src/app/api/simple/runs/route.ts");

assertContains(types, /export type SimpleRunQueueItem = \{[\s\S]*runId:\s*string[\s\S]*status:\s*SimpleRunQueueStatus/, "Simple run queue item type is missing.");
assertContains(types, /platformCrawlSettings\?:\s*PlatformCrawlSettings/, "SimpleRun must persist platform crawl settings for queued execution.");

assertContains(simpleRuns, /SIMPLE_RUN_MAX_ITEMS",\s*500,\s*10,\s*2000/, "Simple-mode target limit must be configurable and default above 100.");
assertNotContains(simpleRuns, /const\s+maxSimpleRunItems\s*=\s*100\b/, "Simple-mode target limit must no longer be hard-capped at 100.");
assertContains(simpleRuns, /await\s+enqueueSimpleRunQueueItem\(context\.run\)/, "startSimpleRun must enqueue the run instead of executing it inline.");
assertContains(simpleRuns, /ensureSimpleRunQueueWorker\(\)/, "Simple run queue worker must be started after enqueue/list.");
assertContains(simpleRuns, /claimNextSimpleRunQueueItem\(workerId,\s*simpleRunQueueLockMs\)/, "Simple queue worker must claim work from the durable queue.");
assertContains(simpleRuns, /heartbeatSimpleRunQueueItem\(item\.id,\s*workerId,\s*simpleRunQueueLockMs\)/, "Simple queue worker must heartbeat running work.");
assertContains(simpleRuns, /getSimpleRunQueueItemByRunId\(run\.id\)/, "Interrupted-run reconciliation must inspect the durable queue.");
assertContains(simpleRuns, /failSimpleRunQueueItemByRunId\(run\.id,\s*message\)/, "Interrupted runs must close their queue item.");
assertContains(simpleRuns, /export async function terminateSimpleRun/, "Simple runs must expose an operator force-terminate helper.");
assertContains(simpleRuns, /Simple run force terminated/, "Force termination must be observable in execution logs.");
assertContains(route, /export async function DELETE/, "Simple run API must expose a force-termination endpoint.");
assertContains(route, /terminateSimpleRun\(runId/, "Simple run DELETE endpoint must close the run through the domain helper.");
assertContains(page, /onTerminateRun=\{terminateSimpleRunFromUi\}/, "Simple UI must wire the force-terminate action.");
assertContains(page, /强制终止/, "Simple UI must expose a force-terminate button.");
assertContains(page, /max=\{sourceMode === "feishu" \? Math\.max\(1,\s*feishuTaskCount \|\| 1\) : sourceMode === "viral" \|\| sourceMode === "original" \? 1 : sourceMode === "links" \? Math\.max\(1,\s*linkCount \|\| 1\) : 500\}/, "Keyword-mode target count input must still allow more than 100 items while viral/original mode stays single-post.");
assertContains(page, /<SimpleOverallProgressBar[\s\S]*runs=\{runs\}[\s\S]*activeRun=\{runForSummary\}/, "Compact progress must receive the simple-run list, not only one active run.");
assertContains(page, /buildSimpleOverallProgressRuns\(runs,\s*activeRun\)/, "Compact progress must derive multiple visible runs from current simple runs.");
assertContains(page, /simple-overall-run-list/, "Compact progress must render a multi-run progress list.");
assertContains(page, /progressRuns\.map\(\(progressRun\)/, "Compact progress must map over multiple runs.");
assertNotContains(page, /<SimpleOverallProgressBar\s+run=\{runForSummary\}/, "Compact progress must not be wired to a single run prop.");

assertContains(database, /CREATE TABLE IF NOT EXISTS simple_run_queue/, "Runtime database schema must create simple_run_queue.");
assertContains(schema, /CREATE TABLE IF NOT EXISTS simple_run_queue/, "PostgreSQL migration must create simple_run_queue.");
assertContains(database, /FOR UPDATE SKIP LOCKED/, "PostgreSQL queue claim must use FOR UPDATE SKIP LOCKED.");
assertContains(database, /export async function enqueueSimpleRunQueueItem/, "Queue enqueue helper is missing.");
assertContains(database, /export async function claimNextSimpleRunQueueItem/, "Queue claim helper is missing.");
assertContains(database, /export async function heartbeatSimpleRunQueueItem/, "Queue heartbeat helper is missing.");

assertContains(feishu, /export const feishuRecordBatchSize = 50/, "Feishu record batch size must be 50.");
assertContains(feishu, /chunkPosts\(publishablePosts,\s*feishuRecordBatchSize\)/, "Feishu publish must split preflight-valid posts into 50-record chunks.");
assertContains(feishu, /recordPayloadPaths/, "Feishu publish should expose all chunk payload paths.");
assertNotContains(feishu, /posts\.length\s*>\s*200/, "Feishu publish must not rely on the old 200-record request cap.");

console.log("Simple queue and Feishu chunking check passed.");
