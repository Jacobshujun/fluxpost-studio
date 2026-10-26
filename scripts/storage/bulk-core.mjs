import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const SOURCE_BUCKET = "seedance-gz-xpeng22365";
export const TARGET_BUCKET = "xpai-imc";
export const PREFIX = "fluxpost/flux-lightmoment/";
const maxFileBytes = 1024 ** 3;
const normalizeEtag = value => String(value || "").replace(/^"|"$/g, "");
const lowerHeaders = headers => Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
const failure = code => Object.assign(new Error(code), { code });

export function validateInventory(inventory) {
  const objects = inventory.source?.objects;
  if (inventory.settings?.bucket !== SOURCE_BUCKET || inventory.settings?.prefix !== PREFIX.slice(0, -1) ||
      !Number.isFinite(Date.parse(inventory.capturedAt)) || !Array.isArray(objects) || !objects.length ||
      !Array.isArray(inventory.target?.objects) || inventory.source.error || inventory.target.error) throw failure("InvalidManifest");
  const keys = new Set();
  for (const item of objects) {
    if (typeof item.key !== "string" || !item.key.startsWith(PREFIX) || item.key.includes("\\") ||
        /[\x00-\x1f\x7f]/.test(item.key) || item.key.split("/").some(s => s === "." || s === "..") ||
        !Number.isSafeInteger(item.size) || item.size < 0 || item.size > maxFileBytes ||
        !normalizeEtag(item.etag) || !Number.isFinite(Date.parse(item.modified)) ||
        item.storageClass !== "STANDARD" || keys.has(item.key)) throw failure("UnsafeManifestObject");
    keys.add(item.key);
  }
  if (inventory.source.count !== objects.length || inventory.source.bytes !== objects.reduce((sum, x) => sum + x.size, 0)) throw failure("ManifestTotalsMismatch");
  return objects;
}

export function transferableHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(lowerHeaders(headers))) {
    if (["content-type", "cache-control", "content-encoding", "content-disposition", "content-language", "expires"].includes(key)) {
      result[key] = String(value);
    } else if (key.startsWith("x-tos-meta-")) {
      result[key.replace(/^x-tos-meta-/, "x-oss-meta-")] = String(value);
    }
  }
  if (!result["content-type"]) throw failure("SourceMimeMissing");
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function validateSource(head, item) {
  if (Number(head["content-length"]) !== item.size || normalizeEtag(head.etag) !== normalizeEtag(item.etag) ||
      Date.parse(head["last-modified"]) !== Date.parse(item.modified)) throw failure("SourceChangedSinceInventory");
  if (head["x-tos-object-type"] && head["x-tos-object-type"] !== "Normal") throw failure("UnsupportedSourceObjectType");
  if (head["x-tos-storage-class"] && head["x-tos-storage-class"] !== "STANDARD") throw failure("SourceStorageChanged");
}

async function headTarget(target, key) {
  try { return lowerHeaders((await target.head(key)).res.headers); }
  catch (error) { if (error.status === 404) return undefined; throw error; }
}

function validateTarget(head, item, headers) {
  if (Number(head["content-length"]) !== item.size || !head.etag) throw failure("TargetSizeOrEtagMismatch");
  for (const [key, value] of Object.entries(headers)) {
    if (String(head[key] ?? "") !== value) throw failure("TargetMetadataMismatch");
  }
}

async function hashStream(stream, expectedSize, destination) {
  const hash = createHash("sha256");
  let bytes = 0;
  const counter = new Transform({ transform(chunk, _encoding, done) {
    bytes += chunk.length;
    if (bytes > expectedSize) { done(failure("BodyExceedsManifestSize")); return; }
    hash.update(chunk);
    done(null, chunk);
  } });
  const sink = destination || new Writable({ write(_chunk, _encoding, done) { done(); } });
  await pipeline(stream, counter, sink, { signal: AbortSignal.timeout(300_000) });
  if (bytes !== expectedSize) throw failure("BodySizeMismatch");
  return hash.digest("hex");
}

// No cloud deletes or overwrites. One file's bytes are pinned, staged, then read back.
export async function copyOne({ source, target, item, stagingRoot, record }) {
  const input = { bucket: SOURCE_BUCKET, key: item.key, ifMatch: item.etag };
  const head = lowerHeaders((await source.headObject(input)).data);
  validateSource(head, item);
  const headers = transferableHeaders(head);
  const existing = await headTarget(target, item.key);
  if (existing) validateTarget(existing, item, headers);
  await mkdir(stagingRoot, { recursive: true });
  const stagedPath = path.join(stagingRoot, `${randomUUID()}.part`);
  let staged = false;
  try {
    const response = await source.getObjectV2({ ...input, dataType: "stream" });
    if (normalizeEtag(response.data.etag) !== normalizeEtag(item.etag)) {
      response.data.content.destroy();
      throw failure("SourceGetEtagMismatch");
    }
    staged = true;
    const sourceSha256 = await hashStream(response.data.content, item.size, createWriteStream(stagedPath, { flags: "wx", mode: 0o600 }));
    if (!existing) {
      await record({ state: "put-intent", key: item.key, size: item.size, sourceSha256, sourceEtag: item.etag, sourceModified: item.modified, headers });
      const body = createReadStream(stagedPath);
      try {
        const result = await target.put(item.key, body, {
          contentLength: item.size,
          mime: headers["content-type"],
          headers: { ...headers, "x-oss-forbid-overwrite": "true", "x-oss-storage-class": "Standard" },
        });
        if (result.res.status !== 200) throw failure("PutUnexpectedStatus");
      } finally { body.destroy(); }
      await record({ state: "uploaded", key: item.key, size: item.size, sourceSha256 });
    }
    const targetHead = await headTarget(target, item.key);
    if (!targetHead) throw failure("TargetMissingAfterUpload");
    validateTarget(targetHead, item, headers);
    const got = await target.getStream(item.key, { headers: { "If-Match": targetHead.etag } });
    if (got.res?.status && got.res.status !== 200) { got.stream.destroy(); throw failure("TargetGetUnexpectedStatus"); }
    const targetSha256 = await hashStream(got.stream, item.size);
    if (sourceSha256 !== targetSha256) throw failure("TargetHashMismatch");
    // Detect mutations during transfer before issuing a success receipt.
    const finalSource = lowerHeaders((await source.headObject(input)).data);
    validateSource(finalSource, item);
    if (JSON.stringify(transferableHeaders(finalSource)) !== JSON.stringify(headers)) throw failure("SourceMetadataChanged");
    const finalTarget = await headTarget(target, item.key);
    if (!finalTarget || finalTarget.etag !== targetHead.etag) throw failure("TargetChangedDuringVerification");
    validateTarget(finalTarget, item, headers);
    const result = { state: "verified", key: item.key, size: item.size, sourceSha256, targetSha256,
      sourceEtag: item.etag, sourceModified: item.modified, targetEtag: targetHead.etag, existing: Boolean(existing) };
    await record(result);
    return result;
  } finally {
    if (staged) await unlink(stagedPath).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
