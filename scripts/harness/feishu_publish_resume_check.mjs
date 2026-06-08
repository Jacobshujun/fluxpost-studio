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
const concurrency = read("src/lib/concurrency.ts");
const activityLog = read("src/lib/activity-log.ts");
const feishu = read("src/lib/feishu-cli.ts");
const route = read("src/app/api/publish/feishu/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const page = read("src/app/page.tsx");

assertContains(types, /export type FeishuPostPublishState = \{[\s\S]*recordId\?:\s*string[\s\S]*attachmentStatus\?:\s*FeishuAttachmentStatus/, "Generated posts must have a Feishu publish state shape.");
assertContains(types, /feishu\?:\s*FeishuPostPublishState/, "GeneratedPost must persist Feishu publish state.");
assertContains(types, /status:\s*"published"\s*\|\s*"attachment_failed"\s*\|\s*"needs_config"/, "Simple run publish status must include attachment_failed.");

assertContains(concurrency, /WORKER_FEISHU_ATTACHMENT_CONCURRENCY",\s*3,\s*10/, "Feishu attachment uploads must have a separate low concurrency knob.");
assertContains(activityLog, /--base-token\\s\+/, "Execution log compaction must redact Feishu --base-token values.");
assertContains(activityLog, /FEISHU_BITABLE_APP_TOKEN=/, "Execution log compaction must redact Feishu Base token env values.");

assertContains(feishu, /function getExistingFeishuRecordId\(post: GeneratedPost\)[\s\S]*post\.feishu\?\.recordId/, "Feishu publish must reuse existing per-post record IDs.");
assertContains(feishu, /mapWithConcurrency\(posts,\s*concurrencyConfig\.feishuAttachment/, "Attachment uploads must use the low attachment concurrency.");
assertContains(feishu, /status:\s*attachmentFailures\.length\s*\?\s*\("attachment_failed" as const\)/, "Attachment failures must return attachment_failed instead of throwing the whole publish.");
assertContains(feishu, /postStates/, "Feishu publish must return postStates for persistence.");
assertContains(feishu, /buildFeishuPostStateUpdates/, "Feishu publish must build per-post state updates.");
assertContains(feishu, /buildStagedFeishuPostStateUpdates/, "Feishu config-missing staging must still return per-post state updates.");
assertContains(feishu, /catch \(error\) \{[\s\S]*failure:\s*\{[\s\S]*error:\s*compactCliError\(error\)/, "Attachment upload failures must be captured per post.");
assertContains(feishu, /function sanitizeCliText\(value: string\)[\s\S]*--base-token/, "CLI output sanitization must redact base tokens.");
assertContains(feishu, /Feishu attachment upload incomplete/, "Incomplete attachment uploads must be logged explicitly.");

assertContains(route, /feishuStateByPostId/, "Manual publish route must persist returned Feishu post states.");
assertContains(simpleRuns, /feishuStateByPostId/, "Simple-run publish must persist returned Feishu post states.");
assertContains(simpleRuns, /publishResult\.status === "attachment_failed"/, "Simple-run publish must mark attachment_failed as a run error.");
assertContains(page, /postStates\?:\s*Array<\{ postId: string; feishu: FeishuPostPublishState \}>/, "Frontend publish response type must include postStates.");
assertContains(page, /value === "attachment_failed" \|\| value === "needs_config"/, "Simple publish status badge must treat attachment_failed as a warning.");

console.log("Feishu publish resume check passed.");
