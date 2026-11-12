import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const require = createRequire(import.meta.url);
const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-feishu-attachments-"));
const bytes = new Map(Array.from({ length: 8 }, (_, index) => [`token-${index}`, Buffer.from(`unique image bytes ${index}`)]));
let tokens = [...bytes.keys()];
let recordId = "record-a", failToken, emptyToken;
const downloads = [], persisted = [];
const config = { feishuCliBin: "mock-cli", feishuAppId: "fixture-app", feishuAppSecret: "fixture-secret", feishuContentImportBaseToken: "fixture-base", feishuContentImportTableId: "fixture-table", feishuContentImportFieldMap: "" };
const exec = async (_file, args) => {
  assert.equal(args[0], "base");
  if (args[1] === "+record-search") {
    const payload = JSON.parse(args[args.indexOf("--json") + 1]);
    assert.equal(payload.keyword, "AI00001");
    return { stdout: JSON.stringify({ data: { fields: ["任务编号", "动态标题", "动态正文", "动态素材", "车型"],
      record_id_list: [recordId], data: [["AI00001", "Title", "Body", tokens.map((token) => ({ file_token: token, name: "asset.png" })), ["G9L"]]] } }), stderr: "" };
  }
  assert.equal(args[1], "+record-download-attachment");
  assert.equal(args[args.indexOf("--record-id") + 1], recordId);
  const token = args[args.indexOf("--file-token") + 1];
  const output = path.resolve(fixture, args[args.indexOf("--output") + 1]);
  assert.ok(output.startsWith(fixture + path.sep));
  assert.ok(existsSync(output), "CLI directory must exist before downloading");
  downloads.push({ token, output });
  if (token === failToken) throw new Error("fixture attachment download failure");
  if (token !== emptyToken) writeFileSync(path.join(output, "asset.png"), bytes.get(token));
  return { stdout: "{}", stderr: "" };
};
const execFile = () => { throw new Error("Unexpected callback dispatch"); };
execFile[promisify.custom] = exec;
const modules = {
  "node:child_process": { execFile },
  "./activity-log": { compactError: (error) => error.message, recordExecutionLog: async () => undefined },
  "./config": { appConfig: config },
  "./runtime-media-storage": { persistRuntimeMedia: async ({ filePath, publicPath }) => {
    const content = readFileSync(filePath);
    persisted.push({ publicPath, digest: createHash("sha256").update(content).digest("hex") });
    return publicPath;
  } },
  "./concurrency": { runWithConcurrencyPool: async (_pool, run) => run() },
  "./feishu-cli": { ensureConfiguredFeishuCliIdentity: async () => undefined, resolveFeishuCliInvocation: () => ({ file: "mock", argsPrefix: [] }) },
  "./media-cache": { cacheCrawledMedia: async (items) => items },
};
const loaded = { exports: {} };
const code = ts.transpileModule(readFileSync("src/lib/feishu-content-import.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
Function("require", "module", "exports", "process", code)((name) => {
  if (Object.hasOwn(modules, name)) return modules[name];
  if (name.startsWith("node:")) return require(name);
  throw new Error(`Unexpected runtime dependency: ${name}`);
}, loaded, loaded.exports, { cwd: () => fixture, env: {} });
const run = () => loaded.exports.importFeishuContentByTaskNumbers(["AI00001"]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
try {
  const legacy = path.join(fixture, "public/media/crawl/feishu/AI00001");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(path.join(legacy, "asset.png"), "stale legacy file");
  const first = await run();
  assert.equal(first.status, "completed");
  assert.equal(first.items[0].images.length, 8);
  assert.equal(first.results[0].materialCount, 8);
  assert.equal(new Set(first.items[0].images).size, 8);
  assert.equal(new Set(downloads.map((entry) => entry.output)).size, 8);
  assert.deepEqual(persisted.map((entry) => entry.digest), tokens.map((token) => digest(bytes.get(token))), "contents must match original attachment order");
  assert.ok(first.items[0].images.every((url) => url.endsWith("/asset.png")));
  const beforeRepeat = persisted.length;
  const repeated = await run();
  assert.deepEqual(repeated.items[0].images, first.items[0].images);
  assert.equal(persisted.length - beforeRepeat, 8);
  tokens = ["token-7", "token-0"];
  const reordered = await run();
  assert.deepEqual(reordered.items[0].images, [first.items[0].images[7], first.items[0].images[0]], "removed/stale attachments excluded and source order retained");
  tokens = [];
  assert.equal((await run()).items[0].images.length, 0, "empty materials must not enumerate previous downloads");
  tokens = ["token-0"];
  recordId = "record-b";
  assert.notEqual((await run()).items[0].images[0], first.items[0].images[0], "same displayed number in another record must remain isolated");
  failToken = "token-0";
  const failed = await run();
  assert.equal(failed.status, "failed");
  assert.equal(failed.items.length, 0);
  assert.match(failed.results[0].error, /attachment download failure/);
  failToken = undefined;
  recordId = "record-empty";
  emptyToken = "token-0";
  const empty = await run();
  assert.equal(empty.status, "failed");
  assert.match(empty.results[0].error, /实际得到 0 个/);
  console.log("Feishu attachments: eight identical names retain distinct bytes/URLs/order; repeat/remove/empty/record isolation and download failures pass.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
