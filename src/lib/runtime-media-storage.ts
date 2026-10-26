import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import TosClient, { ACLType } from "@volcengine/tos-sdk";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { isObjectStorageConfigured, selectObjectStorageConfig } from "./object-storage-config";
import { createOssStorageClient, type ObjectStorageClient } from "./oss-storage-client";
import {
  buildTosObjectKey,
  buildTosPublicUrl,
  ensureVerifiedTosObject,
  findTosObjectMetadata,
  isManagedTosUrl,
  normalizeTosEndpoint,
  type VerifiedTosClient,
} from "./runtime-media-storage-core";

export type PersistRuntimeMediaInput = {
  filePath: string;
  publicPath: string;
  contentType?: string;
  overwrite?: boolean;
};

export type PendingReconcileResult = {
  uploaded: number;
  failed: number;
  errors: string[];
};

export type PersistLibraryObjectInput = {
  publicPath: string;
  body: Buffer;
  contentType: string;
};

function getPendingRoot(provider: "tos" | "oss") {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data",
    provider === "oss" ? "oss-pending" : "tos-pending");
}
const uploadMaxAttempts = 3;
let cachedClient: { fingerprint: string; client: TosClient } | undefined;
type RuntimeTosClient = VerifiedTosClient & TosClient;

// Legacy export retained for existing API/consumer contracts; checks the selected backend.
export function isTosRuntimeMediaConfigured() {
  return isObjectStorageConfigured(appConfig);
}

export function isRuntimeMediaStorageEnabled() {
  return selectObjectStorageConfig(appConfig).enabled;
}

export function isManagedRuntimeMediaUrl(url?: string) {
  const config = selectObjectStorageConfig(appConfig);
  return isManagedTosUrl(url, config.publicBaseUrl, config.objectPrefix) ||
    isManagedTosUrl(url, appConfig.tosPublicBaseUrl, appConfig.tosObjectPrefix);
}

export function buildRuntimeMediaObjectKey(publicPath: string) {
  return buildTosObjectKey(publicPath, selectObjectStorageConfig(appConfig).objectPrefix);
}

export async function findExistingRuntimeMedia(publicPath: string) {
  if (!isRuntimeMediaStorageEnabled() || !isTosRuntimeMediaConfigured()) return undefined;
  const config = requireTosConfig();
  const objectKey = buildTosObjectKey(publicPath, config.objectPrefix);
  try {
    const metadata = await findTosObjectMetadata(getVerifiedTosClient(config), config.bucket, objectKey);
    return metadata && metadata.size > 0
      ? buildTosPublicUrl({ publicBaseUrl: config.publicBaseUrl, objectKey, etag: metadata.etag })
      : undefined;
  } catch (error) {
    throw new Error(sanitizeTosError(error));
  }
}

export async function persistRuntimeMedia(input: PersistRuntimeMediaInput) {
  if (!isRuntimeMediaStorageEnabled()) return normalizePublicPath(input.publicPath);
  const config = requireTosConfig();
  const fileStat = await stat(input.filePath);
  if (!fileStat.isFile() || !fileStat.size) throw new Error("Runtime media staging file is empty.");
  const objectKey = buildTosObjectKey(input.publicPath, config.objectPrefix);

  try {
    const metadata = await ensureVerifiedTosObject({
      client: getVerifiedTosClient(config),
      bucket: config.bucket,
      objectKey,
      body: () => createReadStream(input.filePath),
      contentLength: fileStat.size,
      contentType: input.contentType || inferMediaContentType(input.filePath),
      overwrite: input.overwrite === true,
      maxAttempts: uploadMaxAttempts,
      retryDelayMs: 300,
    });
    await rm(input.filePath, { force: true });
    return buildTosPublicUrl({ publicBaseUrl: config.publicBaseUrl, objectKey, etag: metadata.etag });
  } catch (error) {
    const retainedPath = await retainPendingFile(input.filePath, objectKey, config.provider);
    const message = sanitizeTosError(error);
    await recordExecutionLog({
      scope: `storage/${config.provider}`,
      action: "Object storage runtime media upload failed",
      status: "error",
      message,
      details: {
        objectKey,
        retainedPath: path.relative(process.cwd(), retainedPath),
      },
    });
    throw new Error(`Object storage runtime media upload failed for ${objectKey}: ${message}`);
  }
}

export async function reconcilePendingRuntimeMedia(): Promise<PendingReconcileResult> {
  const config = requireTosConfig();
  const pendingRoot = getPendingRoot(config.provider);
  const files = await listPendingFiles(pendingRoot);
  const result: PendingReconcileResult = { uploaded: 0, failed: 0, errors: [] };
  for (const filePath of files) {
    const objectKey = path.relative(pendingRoot, filePath).split(path.sep).join("/");
    try {
      const fileStat = await stat(filePath);
      await ensureVerifiedTosObject({
        client: getVerifiedTosClient(config),
        bucket: config.bucket,
        objectKey,
        body: () => createReadStream(filePath),
        contentLength: fileStat.size,
        contentType: inferMediaContentType(filePath),
        overwrite: false,
        maxAttempts: uploadMaxAttempts,
        retryDelayMs: 300,
      });
      await rm(filePath, { force: true });
      result.uploaded += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${objectKey}: ${sanitizeTosError(error)}`);
    }
  }
  return result;
}

export async function persistTosProbeObject(input: { objectKeySuffix: string; body: Buffer; contentType: string }) {
  const config = requireTosConfig();
  const objectKey = buildTosObjectKey(`/_health/${input.objectKeySuffix}`, config.objectPrefix);
  let metadata;
  try {
    metadata = await ensureVerifiedTosObject({
      client: getVerifiedTosClient(config),
      bucket: config.bucket,
      objectKey,
      body: input.body,
      contentLength: input.body.length,
      contentType: input.contentType,
      overwrite: true,
      maxAttempts: uploadMaxAttempts,
      retryDelayMs: 300,
    });
  } catch (error) {
    throw new Error(sanitizeTosError(error));
  }
  return {
    objectKey,
    url: buildTosPublicUrl({ publicBaseUrl: config.publicBaseUrl, objectKey, etag: metadata.etag }),
  };
}

export async function persistLibraryObject(input: PersistLibraryObjectInput) {
  if (!isRuntimeMediaStorageEnabled() || !isTosRuntimeMediaConfigured()) {
    throw new Error("Library imports require fully configured object storage.");
  }
  if (!input.body.length) throw new Error("Library image is empty.");
  const config = requireTosConfig();
  const objectKey = buildTosObjectKey(input.publicPath, config.objectPrefix);
  try {
    const metadata = await ensureVerifiedTosObject({
      client: getVerifiedTosClient(config),
      bucket: config.bucket,
      objectKey,
      body: input.body,
      contentLength: input.body.length,
      contentType: input.contentType,
      overwrite: false,
      maxAttempts: uploadMaxAttempts,
      retryDelayMs: 300,
    });
    return {
      objectKey,
      etag: metadata.etag,
      publicUrl: buildTosPublicUrl({ publicBaseUrl: config.publicBaseUrl, objectKey, etag: metadata.etag }),
    };
  } catch (error) {
    throw new Error(`Object storage library upload failed for ${objectKey}: ${sanitizeTosError(error)}`);
  }
}

export async function deleteRuntimeMediaObject(objectKey: string) {
  const config = requireTosConfig();
  try {
    await getVerifiedTosClient(config).deleteObject({ bucket: config.bucket, key: objectKey });
  } catch (error) {
    throw new Error(sanitizeTosError(error));
  }
}

function requireTosConfig() {
  if (!isTosRuntimeMediaConfigured()) throw new Error("Runtime media object storage is not fully configured.");
  const config = selectObjectStorageConfig(appConfig);
  return {
    ...config,
    endpoint: normalizeTosEndpoint(config.endpoint),
    publicBaseUrl: normalizeTosEndpoint(config.publicBaseUrl),
  };
}

function getTosClient(config: ReturnType<typeof requireTosConfig>): RuntimeTosClient {
  const fingerprint = [config.accessKeyId, config.accessKeySecret, config.bucket, config.endpoint, config.region].join("\0");
  if (cachedClient?.fingerprint === fingerprint) return cachedClient.client as unknown as RuntimeTosClient;
  const endpointHost = new URL(config.endpoint).host;
  const client = new TosClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    endpoint: endpointHost,
    region: config.region,
    secure: true,
    maxRetryCount: 0,
    enableVerifySSL: true,
  });
  cachedClient = { fingerprint, client };
  return client as unknown as RuntimeTosClient;
}

function getVerifiedTosClient(config: ReturnType<typeof requireTosConfig>): ObjectStorageClient {
  if (config.provider === "oss") return createOssStorageClient(config);
  const client = getTosClient(config);
  return {
    deleteObject: (input) => client.deleteObject(input),
    headObject: (input) => client.headObject(input) as Promise<{ data?: Record<string, unknown> }>,
    putObject: (input) =>
      client.putObject({
        ...input,
        acl: ACLType.ACLPublicRead,
      } as never),
  };
}

async function retainPendingFile(filePath: string, objectKey: string, provider: "tos" | "oss") {
  const target = path.join(/*turbopackIgnore: true*/ getPendingRoot(provider), ...objectKey.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { force: true });
  try {
    await rename(filePath, target);
  } catch (error) {
    const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
    if (code !== "EXDEV") throw error;
    await copyFile(filePath, target);
    await rm(filePath, { force: true });
  }
  return target;
}

async function listPendingFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listPendingFiles(filePath)));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function normalizePublicPath(value: string) {
  const clean = value.split(/[?#]/, 1)[0] || "";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function inferMediaContentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

function sanitizeTosError(error: unknown) {
  let message = compactError(error);
  for (const secret of [appConfig.tosAccessKeyId, appConfig.tosAccessKeySecret, appConfig.ossAccessKeyId, appConfig.ossAccessKeySecret]) {
    if (secret) message = message.replaceAll(secret, "***");
  }
  return message;
}
