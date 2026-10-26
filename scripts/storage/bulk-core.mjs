import { createHash } from "node:crypto";

export const SOURCE_BUCKET = "seedance-gz-xpeng22365";
export const TARGET_BUCKET = "xpai-imc";
export const PREFIX = "fluxpost/flux-lightmoment/";
const maxFileBytes = 1024 ** 3;
export const PART_BYTES = 8 * 1024 * 1024;
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

async function hashRanges({ size, read }) {
  const hash = createHash("sha256");
  for (let start = 0; start < size; start += PART_BYTES) {
    const end = Math.min(start + PART_BYTES, size) - 1;
    hash.update(await read(start, end));
  }
  return hash.digest("hex");
}

function checkedRange(result, start, end, expectedEtag, provider) {
  const headers = lowerHeaders(result.res?.headers || result.headers || {});
  const data = result.content ?? result.data?.content;
  if (!Buffer.isBuffer(data) || data.length !== end - start + 1) throw failure(`${provider}RangeSizeMismatch`);
  if (result.statusCode !== 206 && result.res?.statusCode !== 206 && result.res?.status !== 206) throw failure(`${provider}RangeStatusMismatch`);
  if (headers["content-range"] !== `bytes ${start}-${end}/${result.totalSize}`) throw failure(`${provider}ContentRangeMismatch`);
  if (normalizeEtag(headers.etag || result.data?.etag) !== normalizeEtag(expectedEtag)) throw failure(`${provider}RangeEtagMismatch`);
  return data;
}

async function readSourceRange(source, input, item, start, end) {
  const result = await source.getObjectV2({ ...input, dataType: "buffer", rangeStart: start, rangeEnd: end });
  return checkedRange({ ...result, totalSize: item.size }, start, end, item.etag, "Source");
}

async function readTargetRange(target, key, size, etag, start, end) {
  const result = await target.get(key, { headers: { Range: `bytes=${start}-${end}`, "If-Match": etag } });
  return checkedRange({ ...result, totalSize: size }, start, end, etag, "Target");
}

// 8 MiB is the maximum retained object payload per worker; nothing is staged on disk.
export async function copyOne({ source, target, item, record }) {
  const input = { bucket: SOURCE_BUCKET, key: item.key, ifMatch: item.etag };
  const head = lowerHeaders((await source.headObject(input)).data);
  validateSource(head, item);
  const headers = transferableHeaders(head);
  const existing = await headTarget(target, item.key);
  if (existing) validateTarget(existing, item, headers);
  let uploadId;
  let completed = false;
  try {
    let sourceSha256;
    if (!existing) {
      await record({ state: "put-intent", key: item.key, size: item.size, sourceEtag: item.etag, sourceModified: item.modified, headers });
      const init = await target.initMultipartUpload(item.key, { mime: headers["content-type"], headers: { ...headers, "x-oss-object-acl": "public-read", "x-oss-storage-class": "Standard" } });
      if (!init.uploadId) throw failure("MultipartUploadIdMissing");
      uploadId = init.uploadId;
      await record({ state: "multipart-init", key: item.key, uploadId });
      const hash = createHash("sha256");
      const parts = [];
      for (let start = 0, number = 1; start < item.size; start += PART_BYTES, number++) {
        const end = Math.min(start + PART_BYTES, item.size) - 1;
        const buffer = await readSourceRange(source, input, item, start, end);
        hash.update(buffer);
        const part = await target.uploadPart(item.key, uploadId, number, buffer, 0, buffer.length);
        if (!part.etag) throw failure("MultipartPartEtagMissing");
        parts.push({ number, etag: part.etag });
      }
      sourceSha256 = hash.digest("hex");
      const done = await target.completeMultipartUpload(item.key, uploadId, parts, { headers: { "x-oss-forbid-overwrite": "true" } });
      if (done.res?.status !== 200) throw failure("MultipartCompleteStatusMismatch");
      completed = true;
      await record({ state: "uploaded", key: item.key, size: item.size, sourceSha256 });
    } else {
      sourceSha256 = await hashRanges({ size: item.size, read: (start, end) => readSourceRange(source, input, item, start, end) });
    }
    const targetHead = await headTarget(target, item.key);
    if (!targetHead) throw failure("TargetMissingAfterUpload");
    validateTarget(targetHead, item, headers);
    const targetSha256 = await hashRanges({ size: item.size, read: (start, end) => readTargetRange(target, item.key, item.size, targetHead.etag, start, end) });
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
  } catch (error) {
    if (uploadId && !completed) {
      try { await target.abortMultipartUpload(item.key, uploadId); }
      catch { await record({ state: "multipart-abort-failed", key: item.key, uploadId }); }
    }
    throw error;
  }
}
