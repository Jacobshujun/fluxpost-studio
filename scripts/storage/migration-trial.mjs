// Operator-only sample copy. Never imports app stores/workers; refuses overwrite.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import OSS from "ali-oss";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("TLS verification must be enabled.");
if (process.argv.slice(2).join(" ") !== "--apply-trial") {
  throw new Error("This command writes public OSS samples. Explicit --apply-trial authorization is required.");
}
const require = createRequire(import.meta.url);
const TosClient = require("@volcengine/tos-sdk").default;
const env = { ...process.env };
if (env.FLUXPOST_CONFIG_FILE) Object.assign(env, parseEnv(await readFile(env.FLUXPOST_CONFIG_FILE, "utf8")));
const prefix = env.TOS_OBJECT_PREFIX || "fluxpost/flux-lightmoment";
const targetPrefix = env.OSS_OBJECT_PREFIX || "fluxpost/flux-lightmoment";
if (prefix !== targetPrefix) throw new Error("Trial requires identical source and target prefixes.");

const inventory = JSON.parse(await readFile(".tmp-storage-inventory.json", "utf8"));
if (!Array.isArray(inventory.source?.objects) || !Array.isArray(inventory.target?.objects)) {
  throw new Error("Fresh complete storage inventory is required.");
}
const extensionOf = (key) => key.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase() || "";
const selectSmallest = (objects, filter) => objects.filter(filter).sort((a, b) => a.size - b.size)[0];
const samples = [
  ...["jpg", "png", "webp", "gif", "mov", "mp4"].map((ext) => selectSmallest(inventory.source.objects, (o) => extensionOf(o.key) === ext)),
  selectSmallest(inventory.source.objects, (o) => /\s/.test(o.key)),
  selectSmallest(inventory.source.objects, (o) => /[^\x00-\x7F]/.test(o.key)),
].filter(Boolean);
const uniqueSamples = [...new Map(samples.map((o) => [o.key, o])).values()];
if (!uniqueSamples.length || uniqueSamples.length > 20) throw new Error("Trial sample set is invalid.");
if (uniqueSamples.some((o) => !o.key.startsWith(`${prefix}/`) || !Number.isSafeInteger(o.size) || o.size <= 0) ||
    uniqueSamples.reduce((sum, o) => sum + o.size, 0) > 10 * 1024 * 1024) {
  throw new Error("Trial must stay within its source prefix and a 10 MiB byte budget.");
}
const targetKeys = new Set(inventory.target.objects.map((o) => o.key));
if (uniqueSamples.some((o) => targetKeys.has(o.key))) throw new Error("Trial key collision; refusing to overwrite.");

function readCredential(text, label) {
  const match = text.match(new RegExp(`^\\s*${label}\\s*[:=：]\\s*(\\S+)\\s*$`, "im"));
  if (!match) throw new Error(`CredentialFormatUnsupported: ${label}`);
  return match[1];
}
const ossKeyText = await readFile(env.FLUXPOST_OSS_KEY_FILE || "aliyun_oss_key.txt", "utf8");
if (!env.TOS_ACCESS_KEY_ID || !env.TOS_ACCESS_KEY_SECRET || !env.TOS_BUCKET || !env.TOS_ENDPOINT) {
  throw new Error("TOS source configuration is incomplete.");
}
const tosEndpoint = new URL(/^https:\/\//i.test(env.TOS_ENDPOINT) ? env.TOS_ENDPOINT : `https://${env.TOS_ENDPOINT}`);
const source = new TosClient({
  accessKeyId: env.TOS_ACCESS_KEY_ID,
  accessKeySecret: env.TOS_ACCESS_KEY_SECRET,
  bucket: env.TOS_BUCKET,
  endpoint: tosEndpoint.host,
  region: env.TOS_REGION || "cn-guangzhou",
  secure: true,
  enableVerifySSL: true,
  maxRetryCount: 0,
});
const target = new OSS({
  accessKeyId: readCredential(ossKeyText, "AccessKey\\s*Id"),
  accessKeySecret: readCredential(ossKeyText, "AccessKey\\s*Secret"),
  bucket: "xpai-imc",
  endpoint: "https://oss-cn-guangzhou.aliyuncs.com",
  region: "oss-cn-guangzhou",
  secure: true,
  authorizationV4: true,
  timeout: 120_000,
});

async function hashTosObject(key, expectedSize) {
  const response = await source.getObjectV2({ bucket: env.TOS_BUCKET, key });
  const body = response.data?.content ?? response.data;
  if (!body || typeof body[Symbol.asyncIterator] !== "function") throw new Error("TOS object body is not a stream.");
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of body) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(bytes);
    size += bytes.length;
  }
  if (size !== expectedSize) throw new Error(`Source size changed for ${key}: ${expectedSize} -> ${size}.`);
  return hash.digest("hex");
}

async function readTargetObject(key) {
  const result = await target.getStream(key);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of result.stream) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: hash.digest("hex"), type: result.res.headers["content-type"], etag: result.res.headers.etag };
}

const report = { startedAt: new Date().toISOString(), prefix, targetPrefix, mode: "create-only", samples: [] };
const reportPath = `test-artifacts/tos-oss-trial-${randomUUID()}.json`;
await mkdir("test-artifacts", { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
const saveReport = () => writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
for (const sample of uniqueSamples) {
  const existing = await target.head(sample.key).then(() => true, (error) => {
    if (error.status === 404) return false;
    throw error;
  });
  if (existing) throw new Error(`Trial key appeared after preflight; refusing to overwrite: ${sample.key}`);
  const sourceHash = await hashTosObject(sample.key, sample.size);
  const sourceHead = await source.headObject({ bucket: env.TOS_BUCKET, key: sample.key });
  const sourceType = sourceHead.data?.["content-type"] || sourceHead.data?.contentType || "application/octet-stream";
  const entry = { key: sample.key, size: sample.size, sourceSha256: sourceHash, sourceType, state: "upload-attempted" };
  report.samples.push(entry);
  // Save intent before PUT: a lost response must leave evidence of a possible write.
  await saveReport();
  const upload = await source.getObjectV2({ bucket: env.TOS_BUCKET, key: sample.key });
  const uploadBody = upload.data?.content ?? upload.data;
  const put = await target.put(sample.key, uploadBody, {
    headers: {
      "x-oss-forbid-overwrite": "true",
      "x-oss-object-acl": "public-read",
      "Content-Type": sourceType,
    },
  });
  entry.state = "uploaded";
  entry.targetStatus = put.res.status;
  await saveReport();
  const copied = await readTargetObject(sample.key);
  if (copied.size !== sample.size || copied.sha256 !== sourceHash || copied.type !== sourceType) {
    throw new Error(`Trial verification failed for ${sample.key}.`);
  }
  Object.assign(entry, {
    key: sample.key,
    size: copied.size,
    sourceSha256: sourceHash,
    targetSha256: copied.sha256,
    sourceType,
    targetType: copied.type,
    targetEtag: copied.etag,
    targetStatus: put.res.status,
    state: "verified",
  });
  await saveReport();
}
report.finishedAt = new Date().toISOString();
report.sampleCount = report.samples.length;
report.totalBytes = report.samples.reduce((sum, item) => sum + item.size, 0);
await saveReport();
console.log(JSON.stringify({
  mode: report.mode,
  sampleCount: report.sampleCount,
  totalBytes: report.totalBytes,
  prefix: report.prefix,
  verified: report.samples.every((item) => item.sourceSha256 === item.targetSha256 && item.size > 0),
  report: reportPath,
}, null, 2));
