import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadCheckpoints, pacePayloads, guardedClient } from "../../scripts/storage/bulk-resume.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "fluxpost-resume-"));
try {
  const checkpoint = { state: "verified", key: "key", size: 3, sourceEtag: "s", sourceModified: "2026-10-26T00:00:00Z", targetEtag: "t", sourceSha256: "a".repeat(64), targetSha256: "a".repeat(64) };
  await mkdir(path.join(root, "attempt"));
  await writeFile(path.join(root, "attempt", "summary.json"), JSON.stringify({ job: "job" }));
  await writeFile(path.join(root, "attempt", "journal.ndjson"), [checkpoint, { ...checkpoint, key: "bad", targetSha256: "b".repeat(64) }, { ...checkpoint, key: "intent", state: "uploaded" }].map(x => JSON.stringify(x)).join("\n") + "\n");
  const loaded = await loadCheckpoints(root, "job");
  assert.equal(loaded.size, 1);
  assert.equal(loaded.get("key").targetEtag, "t");
  assert.equal((await loadCheckpoints(root, "different")).size, 0);
} finally {
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(root, { recursive: true });
}

let time = 0;
const waits = [];
const pace = pacePayloads({ bytesPerSecond: 4, now: () => time, sleep: async ms => { waits.push(ms); time += ms; } });
await pace(8);
await pace(8);
assert.deepEqual(waits, [2000, 2000]);

async function probe({ method = "head", error, failures = 1 }) {
  const retries = [];
  let calls = 0;
  const client = guardedClient({ [method]: async () => { calls++; if (calls <= failures) throw error; return "ok"; } },
    { label: "fixture", pace: async () => {}, record: async ev => retries.push(ev), sleep: async () => {} });
  let caught;
  try { await client[method]("key"); } catch (e) { caught = e; }
  return { calls, retries, caught };
}
assert.equal((await probe({ error: Object.assign(new Error(), { code: "ECONNRESET" }) })).calls, 2);
assert.equal((await probe({ error: Object.assign(new Error(), { status: 503 }), failures: 4 })).calls, 3);
assert.equal((await probe({ error: { code: "RequestError", cause: { code: "ETIMEDOUT" } } })).calls, 2);
for (const error of [{ status: 403 }, { status: 409 }, { status: 412 }, { code: "TargetHashMismatch" }, { code: "RequestError" }]) {
  const r = await probe({ error });
  assert.equal(r.calls, 1);
  assert.equal(r.caught, error);
}
for (const method of ["initMultipartUpload", "completeMultipartUpload"]) assert.equal((await probe({ method, error: { code: "ECONNRESET" } })).calls, 1);
const detail = await probe({ error: { code: "ECONNRESET", message: "secret-value", config: { authorization: "secret" } } });
assert(!JSON.stringify(detail.retries).includes("secret"));
console.log("Migration resume: same-job verified receipts, pacing, bounded idempotent-only retries and redaction passed.");
