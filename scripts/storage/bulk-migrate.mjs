// Explicit operator command; imports no application/database/worker modules.
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import OSS from "ali-oss";
import { copyOne, validateInventory, SOURCE_BUCKET, TARGET_BUCKET, PREFIX } from "./bulk-core.mjs";

const safeCode = error => String(error?.code || error?.name || "Error").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
const root = path.resolve("data", "oss-migration");
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--apply" || process.env.FLUXPOST_OSS_NO_LIFECYCLE_CONFIRMED !== "1") {
    throw Object.assign(new Error("Requires --apply MANIFEST and operator lifecycle confirmation."), { code: "ExplicitApprovalRequired" });
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") throw Object.assign(new Error(), { code: "StrictTlsRequired" });
  const raw = await readFile(args[1], "utf8");
  const inventory = JSON.parse(raw);
  const items = validateInventory(inventory);
  const id = createHash("sha256").update(raw).digest("hex");
  const jobRoot = path.join(root, id);
  const storedManifest = path.join(jobRoot, "manifest.json");
  if (!existsSync(storedManifest) && Date.now() - Date.parse(inventory.capturedAt) > 24 * 3600_000) throw Object.assign(new Error(), { code: "StaleNewManifest" });
  const env = { ...process.env };
  if (env.FLUXPOST_CONFIG_FILE) Object.assign(env, parseEnv(await readFile(env.FLUXPOST_CONFIG_FILE, "utf8")));
  if (env.TOS_BUCKET !== SOURCE_BUCKET || (env.TOS_REGION || "cn-guangzhou") !== "cn-guangzhou" ||
      (env.TOS_OBJECT_PREFIX || PREFIX.slice(0, -1)) !== PREFIX.slice(0, -1) ||
      !["tos-cn-guangzhou.volces.com", "https://tos-cn-guangzhou.volces.com"].includes(env.TOS_ENDPOINT) ||
      !env.TOS_ACCESS_KEY_ID || !env.TOS_ACCESS_KEY_SECRET) throw Object.assign(new Error(), { code: "SourceConfigMismatch" });
  const keyText = await readFile(env.FLUXPOST_OSS_KEY_FILE || "aliyun_oss_key.txt", "utf8");
  const credential = label => {
    const found = keyText.match(new RegExp(`^\\s*${label}\\s*[:=\uFF1A]\\s*(\\S+)\\s*$`, "im"));
    if (!found) throw Object.assign(new Error(), { code: "CredentialFormatUnsupported" });
    return found[1];
  };
  const TosClient = createRequire(import.meta.url)("@volcengine/tos-sdk").default;
  const source = new TosClient({ accessKeyId: env.TOS_ACCESS_KEY_ID, accessKeySecret: env.TOS_ACCESS_KEY_SECRET,
    endpoint: "tos-cn-guangzhou.volces.com", region: "cn-guangzhou", bucket: SOURCE_BUCKET,
    secure: true, enableVerifySSL: true, maxRetryCount: 0, requestTimeout: 300_000, connectionTimeout: 15_000 });
  const target = new OSS({ accessKeyId: credential("AccessKey\\s*Id"), accessKeySecret: credential("AccessKey\\s*Secret"),
    endpoint: "https://oss-cn-guangzhou.aliyuncs.com", region: "oss-cn-guangzhou", bucket: TARGET_BUCKET,
    secure: true, authorizationV4: true, timeout: 300_000, retryMax: 0 });
  // Check target identity/defaults without treating denied policy reads as empty rules.
  const info = (await target.getBucketInfo(TARGET_BUCKET)).bucket;
  if (info?.Name !== TARGET_BUCKET || info.Location !== "oss-cn-guangzhou" ||
      info.StorageClass !== "Standard" || info.AccessControlList?.Grant !== "public-read" ||
      info.ServerSideEncryptionRule?.SSEAlgorithm !== "None") throw Object.assign(new Error(), { code: "TargetDefaultsChanged" });
  const targetKeys = new Map(inventory.target.objects.map(x => [x.key, x]));
  if (items.some(x => targetKeys.has(x.key) && Number(targetKeys.get(x.key).size) !== x.size)) throw Object.assign(new Error(), { code: "PreflightSizeCollision" });
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, "active.lock");
  const lock = await open(lockPath, "wx", 0o600);
  let journal;
  let summary;
  let serial = Promise.resolve();
  const attempt = randomUUID();
  const attemptRoot = path.join(jobRoot, attempt);
  const progressPath = path.join(root, "progress.json");
  const summaryPath = path.join(attemptRoot, "summary.json");
  const saveSummary = async () => {
    summary.updatedAt = new Date().toISOString();
    const text = JSON.stringify(summary, null, 2);
    for (const file of [summaryPath, progressPath]) {
      await writeFile(`${file}.tmp`, text, { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    }
  };
  let stop = false;
  const requestStop = () => { stop = true; };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, id, attempt, startedAt: new Date().toISOString() }));
    await lock.sync();
    await mkdir(attemptRoot, { recursive: true });
    if (existsSync(storedManifest)) {
      if (await readFile(storedManifest, "utf8") !== raw) throw Object.assign(new Error(), { code: "StoredManifestMismatch" });
    } else await writeFile(storedManifest, raw, { flag: "wx", mode: 0o600 });
    journal = await open(path.join(attemptRoot, "journal.ndjson"), "ax", 0o600);
    summary = { job: id, attempt, pid: process.pid, status: "running", startedAt: new Date().toISOString(),
      sourceBucket: SOURCE_BUCKET, targetBucket: TARGET_BUCKET, prefix: PREFIX, sourceCapturedAt: inventory.capturedAt,
      lifecycleEvidence: "operator-confirmed-no-rules", concurrency: 8, transfer: "memory-8MiB-multipart", totalObjects: items.length,
      totalBytes: inventory.source.bytes, verifiedObjects: 0, verifiedBytes: 0, uploadedObjects: 0,
      existingVerified: 0, failures: 0, manifestPath: storedManifest, journalPath: path.join(attemptRoot, "journal.ndjson") };
    await saveSummary();
    const record = event => {
      serial = serial.then(async () => {
        await journal.writeFile(JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
        await journal.sync();
        if (event.state === "verified") {
          summary.verifiedObjects++;
          summary.verifiedBytes += event.size;
          if (event.existing) summary.existingVerified++;
        } else if (event.state === "uploaded") summary.uploadedObjects++;
        else if (event.state === "error") { summary.failures++; summary.lastErrorCode = event.code; }
        await saveSummary();
      });
      return serial;
    };
    // Existing destinations are verified first, so known collisions fail before new writes.
    const ordered = [...items].sort((a, b) => Number(targetKeys.has(b.key)) - Number(targetKeys.has(a.key)));
    let cursor = 0;
    const worker = async () => {
      while (!stop && cursor < ordered.length) {
        if (existsSync(path.join(root, "STOP"))) { stop = true; break; }
        const item = ordered[cursor++];
        try {
          await copyOne({ source, target, item, record });
        } catch (error) {
          stop = true;
          await record({ state: "error", key: item.key, size: item.size, code: safeCode(error) });
          break;
        }
      }
    };
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => worker()));
    await serial;
    if (results.some(x => x.status === "rejected")) throw Object.assign(new Error(), { code: "WorkerOrJournalFailed" });
    summary.status = summary.failures ? "failed" : summary.verifiedObjects === items.length ? "snapshot-verified" : "stopped";
    summary.finishedAt = new Date().toISOString();
    await saveSummary();
    console.log(JSON.stringify(summary));
    if (summary.status !== "snapshot-verified") process.exitCode = 1;
  } catch (error) {
    if (summary) {
      summary.status = "failed";
      summary.lastErrorCode = safeCode(error);
      await saveSummary();
    }
    throw error;
  } finally {
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
    if (journal) await journal.close();
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(error => {
  // SDK error objects can contain signed requests and credentials: never dump them.
  console.error(JSON.stringify({ status: "failed", code: safeCode(error) }));
  process.exitCode = 1;
});
