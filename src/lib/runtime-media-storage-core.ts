export type TosObjectMetadata = {
  size: number;
  etag: string;
};

export type VerifiedTosClient = {
  headObject(input: { bucket: string; key: string }): Promise<{ data?: Record<string, unknown> }>;
  putObject(input: {
    bucket: string;
    key: string;
    body: unknown;
    contentLength: number;
    contentType: string;
    acl: string;
  }): Promise<unknown>;
};

export type EnsureVerifiedTosObjectInput = {
  client: VerifiedTosClient;
  bucket: string;
  objectKey: string;
  body: unknown | (() => unknown);
  contentLength?: number;
  contentType: string;
  overwrite: boolean;
  maxAttempts: number;
  retryDelayMs?: number;
};

export function normalizeTosEndpoint(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizeTosObjectPrefix(value: string) {
  return value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map(assertSafeObjectSegment)
    .join("/");
}

export function buildTosObjectKey(logicalPath: string, prefix: string) {
  const cleanPath = decodeURIComponent(logicalPath.split(/[?#]/, 1)[0] || "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
  const segments = cleanPath.split("/").filter(Boolean).map(assertSafeObjectSegment);
  if (!segments.length) throw new Error("Runtime media path is empty.");
  const normalizedPrefix = normalizeTosObjectPrefix(prefix);
  return [normalizedPrefix, ...segments].filter(Boolean).join("/");
}

export function buildTosPublicUrl(input: { publicBaseUrl: string; objectKey: string; etag?: string }) {
  const baseUrl = normalizeTosEndpoint(input.publicBaseUrl);
  if (!baseUrl) throw new Error("TOS public base URL is not configured.");
  const encodedKey = input.objectKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(`${baseUrl}/${encodedKey}`);
  const version = normalizeEtag(input.etag);
  if (version) url.searchParams.set("v", version);
  return url.toString();
}

export function isManagedTosUrl(url: string | undefined, publicBaseUrl: string, prefix: string) {
  if (!url || !publicBaseUrl) return false;
  try {
    const candidate = new URL(url);
    const base = new URL(normalizeTosEndpoint(publicBaseUrl));
    if (candidate.origin !== base.origin) return false;
    const basePath = base.pathname.replace(/\/+$/, "");
    const expectedPrefix = `/${[basePath, normalizeTosObjectPrefix(prefix)].filter(Boolean).join("/")}`.replace(/\/{2,}/g, "/");
    const candidatePath = decodeURIComponent(candidate.pathname).replace(/\/{2,}/g, "/");
    return candidatePath === expectedPrefix || candidatePath.startsWith(`${expectedPrefix}/`);
  } catch {
    return false;
  }
}

export async function ensureVerifiedTosObject(input: EnsureVerifiedTosObjectInput): Promise<TosObjectMetadata> {
  const expectedSize = resolveContentLength(input.body, input.contentLength);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) throw new Error("Runtime media file is empty.");
  if (!input.bucket.trim()) throw new Error("TOS bucket is not configured.");
  if (!input.objectKey.trim()) throw new Error("TOS object key is empty.");

  if (!input.overwrite) {
    const existing = await readExistingObjectMetadata(input.client, input.bucket, input.objectKey);
    if (existing?.size === expectedSize) return existing;
  }

  const maxAttempts = Math.max(1, Math.min(Math.trunc(input.maxAttempts || 1), 5));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await input.client.putObject({
        bucket: input.bucket,
        key: input.objectKey,
        body: typeof input.body === "function" ? input.body() : input.body,
        contentLength: expectedSize,
        contentType: input.contentType,
        acl: "public-read",
      });
      const verified = await readRequiredObjectMetadata(input.client, input.bucket, input.objectKey);
      if (verified.size !== expectedSize) {
        throw new Error(`TOS object size mismatch: expected ${expectedSize}, got ${verified.size}.`);
      }
      return verified;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableTosError(error)) break;
      const delayMs = Math.max(0, input.retryDelayMs || 0) * attempt;
      if (delayMs) await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("TOS upload failed.");
}

export async function findTosObjectMetadata(client: VerifiedTosClient, bucket: string, objectKey: string) {
  return readExistingObjectMetadata(client, bucket, objectKey);
}

async function readExistingObjectMetadata(client: VerifiedTosClient, bucket: string, key: string) {
  try {
    return await readRequiredObjectMetadata(client, bucket, key);
  } catch (error) {
    if (isNotFoundTosError(error)) return undefined;
    throw error;
  }
}

async function readRequiredObjectMetadata(client: VerifiedTosClient, bucket: string, key: string) {
  const response = await client.headObject({ bucket, key });
  const data = response.data || {};
  const size = Number(data["content-length"] ?? data.contentLength);
  const etag = String(data.etag || data.ETag || "");
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("TOS HEAD response did not include a valid content length.");
  if (!etag) throw new Error("TOS HEAD response did not include an ETag.");
  return { size, etag };
}

function resolveContentLength(body: unknown, explicitLength?: number) {
  if (Number.isSafeInteger(explicitLength) && Number(explicitLength) >= 0) return Number(explicitLength);
  if (body instanceof Uint8Array) return body.byteLength;
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  return Number.NaN;
}

function isNotFoundTosError(error: unknown) {
  return readStatusCode(error) === 404;
}

function isRetryableTosError(error: unknown) {
  const status = readStatusCode(error);
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return true;
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(error.message);
}

function readStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const record = error as Record<string, unknown>;
  return Number(record.statusCode || record.status || (record.response as Record<string, unknown> | undefined)?.status || 0);
}

function assertSafeObjectSegment(value: string) {
  if (!value || value === "." || value === ".." || value.includes("\0") || value.includes("\\")) {
    throw new Error("Runtime media path contains an unsafe segment.");
  }
  return value;
}

function normalizeEtag(value?: string) {
  return (value || "").trim().replace(/^\"|\"$/g, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 128);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
