import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { copyOne, validateInventory, transferableHeaders, PART_BYTES } from "../../scripts/storage/bulk-core.mjs";

const item = { key: "fluxpost/flux-lightmoment/a space/%literal.png", size: 3, etag: '"source-etag"', modified: "2026-10-26T00:00:00.000Z", storageClass: "STANDARD" };
const inventory = { capturedAt: "2026-10-26T00:00:00.000Z", settings: { bucket: "seedance-gz-xpeng22365", prefix: "fluxpost/flux-lightmoment" }, source: { count: 1, bytes: 3, objects: [item] }, target: { count: 0, objects: [] } };
assert.equal(validateInventory(inventory).length, 1);
for (const changed of [{ key: "outside/x" }, { size: -1 }, { storageClass: "ARCHIVE" }, { etag: "" }, { size: 2 ** 31 }, { key: "fluxpost/flux-lightmoment/../x" }]) {
  assert.throws(() => validateInventory({ ...inventory, source: { ...inventory.source, objects: [{ ...item, ...changed }] } }));
}
assert.throws(() => validateInventory({ ...inventory, source: { ...inventory.source, objects: [item, item] } }));
assert.throws(() => validateInventory({ ...inventory, settings: { ...inventory.settings, bucket: "wrong" } }));
assert.deepEqual(transferableHeaders({ "Content-Type": "image/png", "x-tos-meta-test": "value", authorization: "never" }), { "content-type": "image/png", "x-oss-meta-test": "value" });
assert.equal(PART_BYTES, 8 * 1024 * 1024);

const root = await mkdtemp(path.join(os.tmpdir(), "fluxpost-bulk-check-"));
async function scenario({ existing = false, badHash = false, badMime = false, race = false, sourceChange = false, headError = 0, failReceipt = false } = {}) {
  const events = [];
  let puts = 0;
  let gets = 0;
  let aborted = 0;
  const header = { "content-length": "3", etag: item.etag, "last-modified": "Mon, 26 Oct 2026 00:00:00 GMT", "content-type": "image/png", "cache-control": "max-age=60", "x-tos-meta-test": "value" };
  const targetHeader = { ...transferableHeaders(header), "content-length": "3", etag: '"target-etag"' };
  let exists = existing;
  const source = {
    async headObject(input) {
      assert.equal(input.ifMatch, item.etag);
      return { data: { ...header, etag: sourceChange ? '"changed"' : item.etag } };
    },
    async getObjectV2(input) {
      gets++;
      assert.equal(input.ifMatch, item.etag);
      assert.equal(input.rangeStart, 0);
      assert.equal(input.rangeEnd, 2);
      return { statusCode: 206, headers: { "content-range": "bytes 0-2/3", etag: item.etag }, data: { content: Buffer.from("abc"), etag: item.etag } };
    },
  };
  const target = {
    async head(key) {
      assert.equal(key, item.key);
      if (headError) throw Object.assign(new Error("denied"), { status: headError });
      if (!exists) throw Object.assign(new Error("missing"), { status: 404 });
      return { res: { headers: { ...targetHeader, "content-type": badMime ? "text/plain" : "image/png" } } };
    },
    async initMultipartUpload(key, options) {
      assert.equal(key, item.key);
      assert.equal(options.headers["x-oss-meta-test"], "value");
      assert.equal(events.at(-1).state, "put-intent");
      return { uploadId: "upload-1" };
    },
    async uploadPart(key, uploadId, number, buffer, start, end) {
      assert.equal(key, item.key);
      assert.equal(uploadId, "upload-1");
      assert.equal(number, 1);
      assert.equal(start, 0);
      assert.equal(end, 3);
      assert.equal(buffer.toString(), "abc");
      return { etag: '"part-1"' };
    },
    async completeMultipartUpload(key, uploadId, parts, options) {
      assert.equal(key, item.key);
      assert.equal(uploadId, "upload-1");
      assert.deepEqual(parts, [{ number: 1, etag: '"part-1"' }]);
      assert.equal(options.headers["x-oss-forbid-overwrite"], "true");
      if (race) throw Object.assign(new Error("collision"), { status: 409 });
      puts++;
      exists = true;
      return { res: { status: 200 } };
    },
    async abortMultipartUpload() { aborted++; },
    async get(key, options) {
      assert.equal(key, item.key);
      assert.equal(options.headers.Range, "bytes=0-2");
      assert.equal(options.headers["If-Match"], '"target-etag"');
      return { res: { status: 206, headers: { "content-range": "bytes 0-2/3", etag: '"target-etag"' } }, content: Buffer.from(badHash ? "bad" : "abc") };
    },
  };
  let error;
  let result;
  try {
    result = await copyOne({ source, target, item, stagingRoot: root, record: async (event) => {
      if (failReceipt && event.state === "put-intent") throw new Error("journal failure");
      events.push(event);
    } });
  } catch (caught) { error = caught; }
  return { result, error, events, puts, gets, aborted };
}
try {
  for (const existing of [false, true]) {
    const r = await scenario({ existing });
    assert.equal(r.error, undefined);
    assert.equal(r.puts, existing ? 0 : 1);
    assert.equal(r.gets, 1);
    assert.equal(r.result.state, "verified");
    assert.equal(r.events.at(-1).state, "verified");
  }
  for (const options of [{ badHash: true }, { existing: true, badHash: true }, { existing: true, badMime: true }, { race: true }, { sourceChange: true }, { headError: 403 }, { failReceipt: true }]) {
    const r = await scenario(options);
    assert(r.error, JSON.stringify(options));
    assert(!r.events.some(e => e.state === "verified"));
    if (options.existing || options.sourceChange || options.headError || options.failReceipt) assert.equal(r.puts, 0);
    if (options.race) assert.equal(r.aborted, 1);
  }
} finally {
  // mkdtemp's exact returned path is the sole cleanup target.
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true });
}
console.log("Bulk copy: exact keys, conditional source/read-back, SHA-256, metadata, no-overwrite races and durable receipt failures pass offline.");

const large = { ...item, key: `${item.key}-multipart`, size: PART_BYTES + 3 };
const srcBytes = Buffer.alloc(large.size, 0x58);
const chunkVisits = [];
const uploaded = new Map();
const events = [];
const largeSource = {
  async headObject() { return { data: { "content-length": String(large.size), etag: large.etag, "last-modified": "Mon, 26 Oct 2026 00:00:00 GMT", "content-type": "image/png" } }; },
  async getObjectV2({ rangeStart, rangeEnd, ifMatch }) {
    assert.equal(ifMatch, large.etag);
    chunkVisits.push([rangeStart, rangeEnd]);
    return { statusCode: 206, headers: { "content-range": `bytes ${rangeStart}-${rangeEnd}/${large.size}`, etag: large.etag }, data: { content: srcBytes.subarray(rangeStart, rangeEnd + 1), etag: large.etag } };
  },
};
let completed = false;
const largeTarget = {
  async head() {
    if (!completed) throw Object.assign(new Error("missing"), { status: 404 });
    return { res: { headers: { "content-length": String(large.size), etag: '"target-large"', "content-type": "image/png" } } };
  },
  async initMultipartUpload() { return { uploadId: "large-upload" }; },
  async uploadPart(_key, _uploadId, number, buffer, start, end) {
    assert.equal(start, 0);
    assert.equal(end, buffer.length);
    uploaded.set(number, Buffer.from(buffer));
    return { etag: `"part-${number}"` };
  },
  async completeMultipartUpload(_key, _uploadId, parts, options) {
    assert.equal(options.headers["x-oss-forbid-overwrite"], "true");
    assert.deepEqual(parts.map(x => x.number), [1, 2]);
    completed = true;
    return { res: { status: 200 } };
  },
  async get(_key, { headers }) {
    assert.equal(headers["If-Match"], '"target-large"');
    const [, start, end] = headers.Range.match(/^bytes=(\d+)-(\d+)$/).map(Number);
    const content = Buffer.concat([...uploaded.values()]).subarray(start, end + 1);
    return { content, res: { status: 206, headers: { etag: '"target-large"', "content-range": `bytes ${start}-${end}/${large.size}` } } };
  },
};
const largeResult = await copyOne({ source: largeSource, target: largeTarget, item: large, record: async ev => events.push(ev) });
assert.equal(largeResult.state, "verified");
assert.deepEqual(chunkVisits, [[0, PART_BYTES - 1], [PART_BYTES, PART_BYTES + 2]]);
assert.equal(uploaded.size, 2);
assert.equal(events.at(-1).sourceSha256, events.at(-1).targetSha256);
console.log("Two-part 8 MiB boundary, byte order and full read-back hash passed offline.");

const denied = spawnSync(process.execPath, ["scripts/storage/bulk-migrate.mjs"], { encoding: "utf8" });
assert.equal(denied.status, 1);
assert.equal(JSON.parse(denied.stderr.trim()).code, "ExplicitApprovalRequired");
const runnerSource = readFileSync("scripts/storage/bulk-migrate.mjs", "utf8");
const executable = runnerSource.replace(/^import .*;\r?\n/gm, "").replaceAll("import.meta.url", '"file:///fixture.mjs"').replace("main().catch(error =>", "return main().catch(error =>");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function runWorkerFixture({ failed = false, stop = false, locked = false, defaultRegion = false } = {}) {
  const files = new Map();
  const events = [];
  const env = { FLUXPOST_OSS_NO_LIFECYCLE_CONFIRMED: "1", NODE_TLS_REJECT_UNAUTHORIZED: "1", TOS_BUCKET: inventory.settings.bucket, TOS_REGION: "cn-guangzhou", TOS_ACCESS_KEY_ID: "id", TOS_ACCESS_KEY_SECRET: "secret", TOS_ENDPOINT: "tos-cn-guangzhou.volces.com" };
  if (defaultRegion) delete env.TOS_REGION;
  const mockProcess = { env, argv: ["node", "runner", "--apply", "fixture-manifest"], pid: 123, on() {}, off() {} };
  let copies = 0;
  let active = 0;
  let peak = 0;
  const record = async (_name, flags) => {
    if (locked && flags === "wx") throw Object.assign(new Error(), { code: "EEXIST" });
    return { async writeFile(text) { events.push(text); }, async sync() {}, async close() {} };
  };
  class MockOSS {
    async getBucketInfo() { return { bucket: { Name: "xpai-imc", Location: "oss-cn-guangzhou", StorageClass: "Standard", AccessControlList: { Grant: "public-read" }, ServerSideEncryptionRule: { SSEAlgorithm: "None" } } }; }
  }
  const fakeItems = [item, { ...item, key: `${item.key}-2` }, { ...item, key: `${item.key}-3` }];
  const manifest = { ...inventory, capturedAt: new Date().toISOString(), source: { objects: fakeItems, count: 3, bytes: 9 } };
  const names = ["createHash", "randomUUID", "existsSync", "mkdir", "open", "readFile", "rename", "unlink", "writeFile", "path", "createRequire", "parseEnv", "OSS", "copyOne", "validateInventory", "SOURCE_BUCKET", "TARGET_BUCKET", "PREFIX", "process", "console"];
  await new AsyncFunction(...names, executable)(
    () => ({ update() { return this; }, digest: () => "job-id" }), () => "attempt-id",
    name => files.has(name) || (stop && name.endsWith("STOP")), async () => {}, record,
    async name => name === "fixture-manifest" ? JSON.stringify(manifest) : name === "aliyun_oss_key.txt" ? "AccessKey ID: id\nAccessKey Secret: secret" : files.get(name),
    async (from, to) => { files.set(to, files.get(from)); files.delete(from); }, async () => {},
    async (name, text) => files.set(name, text), path, () => () => ({ default: class {} }), () => {}, MockOSS,
    async ({ item: current, record: log }) => {
      active++; peak = Math.max(active, peak); copies++;
      try {
        if (failed) throw Object.assign(new Error("must not dump credential"), { code: "FixtureFailure" });
        await log({ state: "put-intent", key: current.key });
        await log({ state: "uploaded", key: current.key });
        await log({ state: "verified", key: current.key, size: 3, existing: false });
      } finally { active--; }
    }, validateInventory, "seedance-gz-xpeng22365", "xpai-imc", "fluxpost/flux-lightmoment/", mockProcess,
    { log() {}, error(text) { assert(!text.includes("credential")); } },
  );
  const summaryFile = [...files.keys()].find(name => name.endsWith("progress.json"));
  return { copies, peak, events, exit: mockProcess.exitCode, summary: summaryFile && JSON.parse(files.get(summaryFile)) };
}
const successRun = await runWorkerFixture();
assert.equal(successRun.summary.status, "snapshot-verified");
assert.equal(successRun.summary.verifiedObjects, 3);
assert.equal(successRun.summary.verifiedBytes, 9);
assert(successRun.peak <= 8);
assert.equal(successRun.summary.concurrency, 8);
assert.equal(successRun.summary.transfer, "memory-8MiB-multipart");
assert.equal((await runWorkerFixture({ defaultRegion: true })).summary.status, "snapshot-verified");
const failureRun = await runWorkerFixture({ failed: true });
assert.equal(failureRun.summary.status, "failed");
assert(failureRun.copies <= 8);
const stopRun = await runWorkerFixture({ stop: true });
assert.equal(stopRun.summary.status, "stopped");
assert.equal(stopRun.copies, 0);
assert.equal((await runWorkerFixture({ locked: true })).copies, 0);
console.log("Bulk runner opt-in gate, exclusive lock, serialized receipts, concurrency, STOP and failure dispatch passed offline.");
