import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const source = readFileSync(file, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", code)((id) => stubs[id] ?? require(id), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const config = load("src/lib/object-storage-config.ts");
const fixture = {
  runtimeStorageProvider: "tos", tosEnabled: true, tosAccessKeyId: "source-id", tosAccessKeySecret: "source-secret",
  tosBucket: "source", tosRegion: "cn-guangzhou", tosEndpoint: "tos-cn-guangzhou.volces.com",
  tosPublicBaseUrl: "https://source.example.com", tosObjectPrefix: "original/prefix",
  ossEnabled: true, ossAccessKeyId: "target-id", ossAccessKeySecret: "target-secret", ossBucket: "xpai-imc",
  ossRegion: "oss-cn-guangzhou", ossEndpoint: "https://oss-cn-guangzhou.aliyuncs.com",
  ossPublicBaseUrl: "https://xpai-imc.oss-cn-guangzhou.aliyuncs.com", ossObjectPrefix: "original/prefix",
};
assert.equal(config.selectObjectStorageConfig(fixture).bucket, "source");
assert.equal(config.selectObjectStorageConfig({ ...fixture, runtimeStorageProvider: "oss" }).bucket, "xpai-imc");
assert.throws(() => config.selectObjectStorageConfig({ ...fixture, runtimeStorageProvider: "other" }), /provider/i);
assert.equal(config.isObjectStorageConfigured({ ...fixture, runtimeStorageProvider: "oss", ossAccessKeySecret: "" }), false);
assert.equal(config.selectObjectStorageConfig({ ...fixture, runtimeStorageProvider: "oss", ossEnabled: false }).enabled, false);

let options;
const calls = [];
class MockOSS {
  constructor(value) { options = value; }
  async head(key) { calls.push(["head", key]); return { res: { headers: { "content-length": "3", etag: '"abc"' } } }; }
  async put(key, body, opts) { calls.push([Buffer.isBuffer(body) ? "put" : "stream", key, body, opts]); }
  async putStream(key, body, opts) { calls.push(["stream", key, body, opts]); }
  async delete(key) { calls.push(["delete", key]); }
}
const { createOssStorageClient } = load("src/lib/oss-storage-client.ts", { "ali-oss": MockOSS });
const selected = config.selectObjectStorageConfig({ ...fixture, runtimeStorageProvider: "oss" });
const oldTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
try {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  assert.throws(() => createOssStorageClient(selected), /TLS/i);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
  for (const field of ["endpoint", "publicBaseUrl"]) {
    assert.throws(() => createOssStorageClient({ ...selected, [field]: "http://unsafe.example" }), /HTTPS/i);
  }
  const client = createOssStorageClient(selected);
  assert.equal(options.secure, true);
  assert.equal(options.authorizationV4, true, "Target bucket forbids V1 signatures.");
  assert.equal(options.bucket, "xpai-imc");
  assert.equal(options.endpoint, fixture.ossEndpoint);
  const key = "original/prefix/a space/%literal.png";
  const body = Buffer.from("abc");
  const head = await client.headObject({ bucket: "xpai-imc", key });
  assert.equal(head.data["content-length"], "3");
  await client.putObject({ bucket: "xpai-imc", key, body, contentLength: 3, contentType: "image/png", acl: "public-read" });
  assert.equal(calls.at(-1)[1], key);
  assert.equal(calls.at(-1)[3].headers["x-oss-object-acl"], "public-read");
  assert.equal(calls.at(-1)[3].mime, "image/png");
  const { Readable } = await import("node:stream");
  await client.putObject({ bucket: "xpai-imc", key, body: Readable.from(body), contentLength: 3, contentType: "image/png", acl: "public-read" });
  assert.equal(calls.at(-1)[0], "stream");
  assert.equal(calls.at(-1)[3].contentLength, 3);
  await assert.rejects(() => client.headObject({ bucket: "wrong", key }), /bucket/i);
  const core = load("src/lib/runtime-media-storage-core.ts");
  await core.ensureVerifiedTosObject({ client, bucket: "xpai-imc", objectKey: key, body, contentType: "image/png", overwrite: true, maxAttempts: 1 });
  const denied = Object.assign(new Error("denied"), { status: 403 });
  const originalHead = MockOSS.prototype.head;
  MockOSS.prototype.head = async () => { throw denied; };
  await assert.rejects(() => core.findTosObjectMetadata(client, "xpai-imc", key), (error) => error === denied);
  MockOSS.prototype.head = async () => { throw Object.assign(new Error("missing"), { status: 404 }); };
  assert.equal(await core.findTosObjectMetadata(client, "xpai-imc", key), undefined);
  MockOSS.prototype.head = originalHead;
  await assert.rejects(() => core.ensureVerifiedTosObject({ client, bucket: "xpai-imc", objectKey: key, body: Buffer.from("different size"), contentType: "image/png", overwrite: true, maxAttempts: 1 }), /size mismatch/);
  assert.equal(core.buildTosObjectKey("/generated/a%20b.png", "original/prefix"), "original/prefix/generated/a b.png");
  await client.deleteObject({ bucket: "xpai-imc", key });
  assert.equal(calls.at(-1)[0], "delete");
  const appConfig = { ...fixture, runtimeStorageProvider: "oss" };
  const storage = load("src/lib/runtime-media-storage.ts", {
    "./config": { appConfig },
    "./activity-log": { compactError: (error) => error.message, recordExecutionLog: async () => {} },
    "./object-storage-config": config,
    "./oss-storage-client": { createOssStorageClient },
    "./runtime-media-storage-core": core,
  });
  assert.equal(storage.isRuntimeMediaStorageEnabled(), true);
  assert.equal(storage.isManagedRuntimeMediaUrl("https://source.example.com/original/prefix/old.png"), true);
  assert.equal(storage.isManagedRuntimeMediaUrl(`${fixture.ossPublicBaseUrl}/original/prefix/new.png`), true);
  assert.equal(storage.isManagedRuntimeMediaUrl(`${fixture.ossPublicBaseUrl}.evil.example/original/prefix/new.png`), false);
  const saved = await storage.persistLibraryObject({ publicPath: "/generated/a.png", body, contentType: "image/png" });
  assert.equal(saved.objectKey, "original/prefix/generated/a.png");
  assert(saved.publicUrl.startsWith(`${fixture.ossPublicBaseUrl}/original/prefix/`));
  assert((await storage.findExistingRuntimeMedia("/generated/a.png")).startsWith(fixture.ossPublicBaseUrl));
  appConfig.ossEnabled = false;
  assert.equal(await storage.persistRuntimeMedia({ filePath: "never-read", publicPath: "/generated/local.png" }), "/generated/local.png");
  await assert.rejects(() => storage.persistLibraryObject({ publicPath: "/generated/a.png", body, contentType: "image/png" }), /configured/);
  appConfig.ossEnabled = true;
  const renamed = [];
  const logs = [];
  const failingStorage = load("src/lib/runtime-media-storage.ts", {
    "./config": { appConfig },
    "node:fs/promises": { stat: async () => ({ isFile: () => true, size: 3 }), mkdir: async () => {}, rm: async () => {}, rename: async (...args) => renamed.push(args) },
    "./activity-log": { compactError: (error) => error.message, recordExecutionLog: async (entry) => logs.push(entry) },
    "./object-storage-config": config,
    "./oss-storage-client": { createOssStorageClient: () => ({ headObject: async () => {
      // A config change during an in-flight upload must not re-route retained bytes.
      appConfig.runtimeStorageProvider = "tos";
      throw Object.assign(new Error("target-secret denied"), { status: 403 });
    } }) },
    "./runtime-media-storage-core": core,
  });
  await assert.rejects(() => failingStorage.persistRuntimeMedia({ filePath: "fixture.png", publicPath: "/generated/a.png" }), /\*\*\* denied/);
  assert.equal(renamed.length, 1);
  assert.match(renamed[0][1], /[\\/]data[\\/]oss-pending[\\/]original[\\/]prefix/);
  assert(!JSON.stringify(logs).includes("target-secret"));
} finally {
  if (oldTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = oldTls;
}
console.log("OSS selection, TLS rejection, exact key, SDK HEAD/PUT/stream/delete and core verification passed (offline).");

// Run the operator inventory with fake two-page SDKs and no network/database.
let sourcePages = 0;
let targetPages = 0;
let inventory;
class InventoryTos {
  async listObjectsType2(query) {
    assert(!Object.values(query).includes(undefined));
    assert.equal(query.continuationToken, sourcePages ? "source-next" : undefined);
    sourcePages++;
    return { data: { Contents: [{ Key: `source-${sourcePages}.bin`, Size: 3 }], IsTruncated: sourcePages === 1, NextContinuationToken: "source-next" } };
  }
}
class InventoryOss {
  constructor(options) { assert.equal(options.authorizationV4, true); }
  async list(query) {
    assert(!Object.values(query).includes(""));
    assert.equal(query.marker, targetPages ? "target-next" : undefined);
    targetPages++;
    return { objects: [{ name: `target-${targetPages}.bin`, size: 3 }], isTruncated: targetPages === 1, nextMarker: "target-next" };
  }
}
const inventorySource = readFileSync("scripts/storage/inventory.mjs", "utf8").replace(/^import .*;\r?\n/gm, "").replace("import.meta.url", '"file:///fixture/inventory.mjs"');
const executeInventory = new Function("readFile", "writeFile", "parseEnv", "createRequire", "OSS", "pg", "process", "console", `return (async () => {${inventorySource}})()`);
await executeInventory(
  async (file) => { assert.equal(file, "fixture-key.txt"); return "AccessKey ID: fixture-id\nAccessKey Secret: fixture-secret"; },
  async (_file, text) => { inventory = JSON.parse(text); },
  () => { throw new Error("Unexpected environment file read"); },
  () => () => ({ default: InventoryTos }), InventoryOss, {},
  { env: { NODE_TLS_REJECT_UNAUTHORIZED: "1", FLUXPOST_OSS_KEY_FILE: "fixture-key.txt", TOS_ACCESS_KEY_ID: "fixture-id", TOS_ACCESS_KEY_SECRET: "fixture-secret", TOS_BUCKET: "fixture", TOS_ENDPOINT: "tos-cn-guangzhou.volces.com" }, argv: ["--target"] },
  { log: () => {} },
);
assert.equal(sourcePages, 2);
assert.equal(targetPages, 2);
assert.equal(inventory.source.count, 2);
assert.equal(inventory.target.count, 2);
console.log("Inventory pagination omits empty signing parameters and uses OSS V4 (offline).");
