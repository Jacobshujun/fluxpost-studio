import OSS from "ali-oss";
import { Readable } from "node:stream";
import type { ObjectStorageConfig } from "./object-storage-config";
import type { VerifiedTosClient } from "./runtime-media-storage-core";

export type ObjectStorageClient = VerifiedTosClient & {
  deleteObject(input: { bucket: string; key: string }): Promise<unknown>;
};

export function createOssStorageClient(config: ObjectStorageConfig): ObjectStorageClient {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("OSS requires TLS certificate verification; remove NODE_TLS_REJECT_UNAUTHORIZED=0.");
  }
  for (const value of [config.endpoint, config.publicBaseUrl]) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("OSS endpoints must be HTTPS origins without credentials, paths or query strings.");
    }
  }
  const client = new OSS({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    endpoint: config.endpoint,
    region: config.region,
    secure: true,
    authorizationV4: true,
    timeout: 60_000,
  });
  function assertBucket(bucket: string) {
    if (bucket !== config.bucket) throw new Error("OSS client bucket mismatch.");
  }
  return {
    async headObject({ bucket, key }) {
      assertBucket(bucket);
      const result = await client.head(key);
      return { data: result.res.headers as Record<string, unknown> };
    },
    async putObject({ bucket, key, body, contentLength, contentType, acl }) {
      assertBucket(bucket);
      const headers = { "x-oss-object-acl": acl };
      if (body instanceof Readable) {
        // put delegates readable streams to putStream; its published type incorrectly
        // requires optional callback/meta fields on direct putStream calls.
        const options = { contentLength, mime: contentType, headers };
        return client.put(key, body, options);
      }
      if (!(body instanceof Buffer)) throw new Error("OSS upload requires a Buffer or readable stream.");
      return client.put(key, body, { mime: contentType, headers });
    },
    async deleteObject({ bucket, key }) {
      assertBucket(bucket);
      return client.delete(key);
    },
  };
}
