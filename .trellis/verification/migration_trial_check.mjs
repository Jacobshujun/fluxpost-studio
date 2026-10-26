import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

const source = readFileSync("scripts/storage/migration-trial.mjs", "utf8");
for (const pattern of [
  /NODE_TLS_REJECT_UNAUTHORIZED\s*===\s*"0"/,
  /prefix\s*!==\s*targetPrefix/,
  /x-oss-forbid-overwrite/,
  /sha256/,
  /sourceHash/,
  /targetSha256/,
  /targetKeys\.has/,
  /test-artifacts/,
]) {
  assert(pattern.test(source), `Migration trial is missing safety contract ${pattern}.`);
}
assert(!/deleteObject|target\.delete|removeObject/.test(source), "Trial must never delete objects.");
assert(!/x-oss-copy-source/.test(source), "Trial must stream bytes so a content hash can be checked.");
assert(!/全部覆盖|overwrite:\s*true/.test(source), "Trial must not overwrite.");
assert(!/AccessKey\s*[:=]\s*["'][A-Za-z0-9]/.test(source), "Trial must not embed credentials.");
console.log("Migration trial safety contracts passed.");

const code = source.replace(/^import .*;\r?\n/gm, "").replaceAll("import.meta.url", '"file:///fixture.mjs"');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run({ apply = true, collision = false, corrupt = false, size = 3, liveCollision = false } = {}) {
  const key = "fluxpost/flux-lightmoment/fixture.png";
  const body = Buffer.from("abc");
  const receipts = [];
  let puts = 0;
  let reads = 0;
  class Tos {
    async getObjectV2() { return { data: { content: Readable.from(body) } }; }
    async headObject() { return { data: { "content-type": "image/png" } }; }
  }
  class Oss {
    constructor(options) { assert.equal(options.authorizationV4, true); }
    async head() {
      if (liveCollision) return {};
      throw Object.assign(new Error("missing"), { status: 404 });
    }
    async put(actualKey, stream, options) {
      assert.equal(actualKey, key);
      assert.equal(options.headers["x-oss-forbid-overwrite"], "true");
      assert.equal(receipts.at(-1).samples[0].state, "upload-attempted");
      for await (const chunk of stream) assert.deepEqual(chunk, body);
      puts++;
      return { res: { status: 200 } };
    }
    async getStream() {
      return { stream: Readable.from(corrupt ? Buffer.from("bad") : body), res: { headers: { "content-type": "image/png", etag: "fixture" } } };
    }
  }
  const execute = new AsyncFunction("createHash", "randomUUID", "mkdir", "readFile", "writeFile", "createRequire", "parseEnv", "OSS", "process", "console", code);
  let error;
  try {
    await execute(createHash, () => "unique-fixture", async () => {}, async (file) => {
      reads++;
      if (file === ".tmp-storage-inventory.json") return JSON.stringify({ source: { objects: [{ key, size }] }, target: { objects: collision ? [{ key }] : [] } });
      assert.equal(file, "aliyun_oss_key.txt");
      return "AccessKey ID: fixture-id\nAccessKey Secret: fixture-secret";
    }, async (_file, text) => receipts.push(JSON.parse(text)), () => () => ({ default: Tos }), () => {}, Oss,
    { env: { TOS_ACCESS_KEY_ID: "fixture-id", TOS_ACCESS_KEY_SECRET: "fixture-secret", TOS_BUCKET: "fixture", TOS_ENDPOINT: "tos-cn-guangzhou.volces.com", NODE_TLS_REJECT_UNAUTHORIZED: "1" }, argv: apply ? ["node", "trial", "--apply-trial"] : ["node", "trial"] }, { log: () => {} });
  } catch (caught) { error = caught; }
  return { error, receipts, puts, reads };
}
const denied = await run({ apply: false });
assert.match(denied.error.message, /authorization/);
assert.equal(denied.reads, 0);
for (const settings of [{ collision: true }, { liveCollision: true }, { size: 11 * 1024 * 1024 }]) {
  const result = await run(settings);
  assert(result.error);
  assert.equal(result.puts, 0);
}
const mismatch = await run({ corrupt: true });
assert.match(mismatch.error.message, /verification failed/);
assert.equal(mismatch.receipts.at(-1).samples[0].state, "uploaded");
const success = await run();
assert.equal(success.error, undefined);
assert.equal(success.puts, 1);
assert.equal(success.receipts.at(-1).samples[0].state, "verified");
assert.equal(success.receipts.at(-1).totalBytes, 3);
console.log("Trial execution gates, byte budget, collisions, durable write receipts and hash mismatch passed offline.");
