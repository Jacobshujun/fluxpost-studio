import { readFileSync } from "node:fs";
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

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

const types = read("src/lib/types.ts");
const concurrency = read("src/lib/concurrency.ts");
const activityLog = read("src/lib/activity-log.ts");
const feishu = read("src/lib/feishu-cli.ts");
const recordVerification = read("src/lib/feishu-record-verification.ts");
const route = read("src/app/api/publish/feishu/route.ts");
const queue = read("src/lib/feishu-publish-queue.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const page = read("src/app/page.tsx");

assertContains(types, /export type FeishuPostPublishState = \{[\s\S]*recordId\?:\s*string[\s\S]*attachmentStatus\?:\s*FeishuAttachmentStatus/, "Generated posts must have a Feishu publish state shape.");
assertContains(types, /feishu\?:\s*FeishuPostPublishState/, "GeneratedPost must persist Feishu publish state.");
assertContains(types, /status:\s*"published"\s*\|\s*"record_failed"\s*\|\s*"attachment_failed"\s*\|\s*"needs_config"/, "Simple run publish status must include record_failed and attachment_failed.");
assertContains(types, /recordStatus\?:\s*"verified"\s*\|\s*"failed"/, "Generated posts must persist record field verification state.");

assertContains(concurrency, /WORKER_FEISHU_ATTACHMENT_CONCURRENCY",\s*3,\s*10/, "Feishu attachment uploads must have a separate low concurrency knob.");
assertContains(activityLog, /--base-token\\s\+/, "Execution log compaction must redact Feishu --base-token values.");
assertContains(activityLog, /FEISHU_BITABLE_APP_TOKEN=/, "Execution log compaction must redact Feishu Base token env values.");

assertContains(feishu, /function getExistingFeishuRecordId\(post: GeneratedPost\)[\s\S]*post\.feishu\?\.recordId/, "Feishu publish must reuse existing per-post record IDs.");
assertContains(feishu, /mapWithConcurrency\(posts,\s*concurrencyConfig\.feishuAttachment/, "Attachment uploads must use the low attachment concurrency.");
assertContains(feishu, /"\+record-upsert"/, "Feishu publish must repair created and reused record fields with record-upsert.");
assertContains(feishu, /"\+record-get"/, "Feishu publish must read records back after field writes.");
assertContains(feishu, /verifyFeishuRecordFields/, "Feishu publish must verify read-back fields before reporting success.");
assertContains(feishu, /recordFailures\.length\s*\?\s*\("record_failed" as const\)/, "Record field failures must return record_failed instead of published.");
assertContains(feishu, /recordFailures\.length[\s\S]*attachmentFailures\.length\s*\?\s*\("attachment_failed" as const\)/, "Record failures must take priority while attachment failures still return attachment_failed.");
assertContains(feishu, /postStates/, "Feishu publish must return postStates for persistence.");
assertContains(feishu, /buildFeishuPostStateUpdates/, "Feishu publish must build per-post state updates.");
assertContains(feishu, /buildStagedFeishuPostStateUpdates/, "Feishu config-missing staging must still return per-post state updates.");
assertContains(feishu, /catch \(error\) \{[\s\S]*failure:\s*\{[\s\S]*error:\s*compactCliError\(error\)/, "Attachment upload failures must be captured per post.");
assertContains(feishu, /function sanitizeCliText\(value: string\)[\s\S]*--base-token/, "CLI output sanitization must redact base tokens.");
assertContains(feishu, /Feishu attachment upload incomplete/, "Incomplete attachment uploads must be logged explicitly.");

assertContains(route, /enqueueFeishuPublishJob/, "Manual publish route must enqueue Feishu publish jobs.");
assertContains(simpleRuns, /enqueueFeishuPublishJob\(approvedPosts/, "Simple-run publish must enqueue Feishu publish jobs.");
assertContains(queue, /feishuStateByPostId/, "Feishu queue worker must persist returned Feishu post states.");
assertContains(queue, /publishStatus === "attachment_failed"/, "Feishu queue worker must reflect attachment_failed in simple-run publish state.");
assertContains(queue, /publishStatus === "record_failed"/, "Feishu queue worker must reflect record_failed in simple-run publish state.");
assertContains(page, /postStates\?:\s*Array<\{ postId: string; feishu: FeishuPostPublishState \}>/, "Frontend publish response type must include postStates.");
assertContains(page, /value === "record_failed" \|\| value === "attachment_failed" \|\| value === "needs_config"/, "Simple publish status badge must treat record and attachment failures as warnings.");

assertContains(recordVerification, /export function verifyFeishuRecordFields/, "Record verification must expose a pure read-back validator.");
verifyRecordReadBack(loadTypescriptCommonJs("src/lib/feishu-record-verification.ts"));

console.log("Feishu publish resume check passed.");

function verifyRecordReadBack(module) {
  const expectations = [
    {
      recordId: "rec_alpha",
      fields: { Title: "Expected title", Body: "Expected body", Tags: ["One", "Two"], Vehicle: "G6", Empty: "" },
    },
  ];
  const matching = JSON.stringify({
    ok: true,
    data: {
      fields: ["Title", "Body", "Tags", "Vehicle", "Empty"],
      record_id_list: ["rec_alpha"],
      data: [["Expected title", "Expected body", ["Two", "One"], "G6", null]],
    },
  });
  assertEqual(module.verifyFeishuRecordFields(matching, expectations).length, 0, "Matching read-back fields must verify.");

  const blank = JSON.stringify({
    ok: true,
    data: {
      fields: ["Title", "Body", "Tags", "Vehicle", "Empty"],
      record_id_list: ["rec_alpha"],
      data: [[null, null, null, null, null]],
    },
  });
  const blankFailures = module.verifyFeishuRecordFields(blank, expectations);
  assertEqual(blankFailures.length, 1, "Blank read-back fields must fail verification.");
  assertEqual(blankFailures[0].recordId, "rec_alpha", "Verification failure must retain the record id for safe retry.");

  const missing = JSON.stringify({
    ok: true,
    data: { fields: ["Title"], record_id_list: ["rec_alpha"], data: [[null]], record_not_found: ["rec_alpha"] },
  });
  assertEqual(module.verifyFeishuRecordFields(missing, expectations).length, 1, "Missing records must fail verification.");
}

function loadTypescriptCommonJs(relativePath) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relativePath });
  wrapper(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
