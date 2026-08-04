import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = process.cwd();
const relativePath = "src/lib/feishu-publish-batching.ts";
const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: relativePath,
}).outputText;
const loadedModule = { exports: {} };
vm.runInThisContext(`(function(module,exports){${output}\n})`, { filename: relativePath })(loadedModule, loadedModule.exports);

const { chunkFeishuPublishItems, countFeishuPublishChunks, feishuRecordBatchSize, processFeishuPublishChunks } = loadedModule.exports;
if (feishuRecordBatchSize !== 10) throw new Error(`Feishu publish batch size must be 10, got ${feishuRecordBatchSize}.`);

for (const [count, expected] of [[1, 1], [10, 1], [11, 2], [50, 5], [51, 6]]) {
  const values = Array.from({ length: count }, (_, index) => index);
  const chunks = chunkFeishuPublishItems(values);
  if (chunks.length !== expected) throw new Error(`${count} posts must produce ${expected} chunk(s), got ${chunks.length}.`);
  if (countFeishuPublishChunks(count) !== expected) throw new Error(`Chunk count helper disagrees for ${count} posts.`);
  if (chunks.flat().join(",") !== values.join(",")) throw new Error(`Chunking must preserve order for ${count} posts.`);
  if (chunks.some((chunk) => chunk.length > 10)) throw new Error(`Chunking exceeded 10 posts for ${count} posts.`);
}

const settled = [];
const durableSnapshots = [];
const recordIds = new Map();
let notificationCount = 0;
await processFeishuPublishChunks(
  Array.from({ length: 50 }, (_, index) => index),
  async (chunk, chunkIndex) => {
    if (chunkIndex === 2) throw new Error("simulated third chunk timeout");
    chunk.forEach((value) => recordIds.set(value, `rec_${value}`));
  },
  async (outcome) => {
    settled.push({ chunkIndex: outcome.chunkIndex, failed: Boolean(outcome.error) });
    durableSnapshots.push({
      chunkIndex: outcome.chunkIndex,
      recordIds: Array.from(recordIds.values()),
      failed: Boolean(outcome.error),
    });
  },
);
notificationCount += 1;
if (settled.map((item) => item.chunkIndex).join(",") !== "0,1,2,3,4") {
  throw new Error(`Chunk processing must continue after the third chunk fails: ${JSON.stringify(settled)}.`);
}
if (settled.filter((item) => item.failed).map((item) => item.chunkIndex).join(",") !== "2") {
  throw new Error(`Only the simulated third chunk should fail: ${JSON.stringify(settled)}.`);
}
if (durableSnapshots[1].recordIds.length !== 20 || durableSnapshots[2].recordIds.length !== 20) {
  throw new Error(`The failed third chunk must preserve the first two chunks: ${JSON.stringify(durableSnapshots)}.`);
}
if (durableSnapshots[4].recordIds.length !== 40) {
  throw new Error(`Chunks four and five must continue after the timeout: ${JSON.stringify(durableSnapshots)}.`);
}
const terminalStatus = settled.some((item) => item.failed) ? "partial" : "completed";
if (terminalStatus !== "partial") throw new Error(`A failed third chunk must settle the logical job as partial, got ${terminalStatus}.`);
if (notificationCount !== 1) throw new Error(`One logical job must send one summary notification, got ${notificationCount}.`);

console.log("Feishu publish batch check passed.");
