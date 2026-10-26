// Explicit operator-only read path. Never import application stores or workers.
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import OSS from "ali-oss";
import pg from "pg";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("TLS verification must be enabled.");
const require = createRequire(import.meta.url);
const TosClient = require("@volcengine/tos-sdk").default;
const env = { ...process.env };
if (env.FLUXPOST_CONFIG_FILE) Object.assign(env, parseEnv(await readFile(env.FLUXPOST_CONFIG_FILE, "utf8")));
const report = { capturedAt: new Date().toISOString(), readOnly: true };
const safeError = (error) => ({ code: String(error.code || error.name || "Error"), status: error.statusCode || error.status || null });
const prefix = env.TOS_OBJECT_PREFIX || "fluxpost/flux-lightmoment";
report.settings = { provider: env.RUNTIME_STORAGE_PROVIDER || "tos", enabled: env.TOS_ENABLED === "true", prefix, bucket: env.TOS_BUCKET, publicBaseUrl: env.TOS_PUBLIC_BASE_URL };
let sourceObjects = [];
try {
  if (!env.TOS_ACCESS_KEY_ID || !env.TOS_ACCESS_KEY_SECRET || !env.TOS_ENDPOINT || !env.TOS_BUCKET) throw new Error("SourceConfigMissing");
  const endpoint = new URL(/^https:\/\//.test(env.TOS_ENDPOINT) ? env.TOS_ENDPOINT : `https://${env.TOS_ENDPOINT}`);
  const client = new TosClient({ accessKeyId: env.TOS_ACCESS_KEY_ID, accessKeySecret: env.TOS_ACCESS_KEY_SECRET,
    endpoint: endpoint.host, region: env.TOS_REGION || "cn-guangzhou", bucket: env.TOS_BUCKET,
    secure: true, enableVerifySSL: true, maxRetryCount: 0 });
  let token;
  do {
    const { data } = await client.listObjectsType2({ bucket: env.TOS_BUCKET, prefix: `${prefix}/`, maxKeys: 1000, ...(token ? { continuationToken: token } : {}), listOnlyOnce: true });
    sourceObjects.push(...data.Contents.map(({ Key, Size, ETag, LastModified, StorageClass }) => ({ key: Key, size: Size, etag: ETag, modified: LastModified, storageClass: StorageClass })));
    token = data.IsTruncated ? data.NextContinuationToken : undefined;
    if (data.IsTruncated && !token) throw new Error("MissingContinuationToken");
  } while (token);
  report.source = { count: sourceObjects.length, bytes: sourceObjects.reduce((sum, o) => sum + o.size, 0), scopedPrefix: `${prefix}/`, objects: sourceObjects };
} catch (error) { report.source = { error: safeError(error), complete: false }; }

if (process.argv.includes("--target")) {
  try {
    const keyText = await readFile(env.FLUXPOST_OSS_KEY_FILE || "aliyun_oss_key.txt", "utf8");
    function readCredential(label) {
      const match = keyText.match(new RegExp(`^\\s*${label}\\s*[:=：]\\s*(\\S+)\\s*$`, "im"));
      if (!match) throw new Error("CredentialFormatUnsupported");
      return match[1];
    }
    const target = new OSS({ accessKeyId: readCredential("AccessKey\\s*Id"), accessKeySecret: readCredential("AccessKey\\s*Secret"),
      bucket: "xpai-imc", endpoint: "https://oss-cn-guangzhou.aliyuncs.com", region: "oss-cn-guangzhou", secure: true, authorizationV4: true, timeout: 30000 });
    const objects = [];
    let marker = "";
    do {
      const result = await target.list({ ...(marker ? { marker } : {}), "max-keys": 1000 }, {});
      objects.push(...(result.objects || []).map(({ name, size, etag, lastModified }) => ({ key: name, size, etag, modified: lastModified })));
      marker = result.isTruncated ? result.nextMarker : "";
      if (result.isTruncated && !marker) throw new Error("MissingNextMarker");
    } while (marker);
    report.target = { count: objects.length, bytes: objects.reduce((sum, o) => sum + Number(o.size), 0), objects };
    const sample = objects.find((o) => /\.(png|jpg|jpeg|webp|mp4)$/i.test(o.key));
    if (sample) {
      report.target.sample = {};
      const encoded = sample.key.split("/").map(encodeURIComponent).join("/");
      for (const host of ["xpai-imc.oss-cn-guangzhou.aliyuncs.com", "xpai-imc.cn-guangzhou.taihangztn.cn"]) {
        try {
          const response = await fetch(`https://${host}/${encoded}`, { headers: { Range: "bytes=0-31" }, redirect: "error", signal: AbortSignal.timeout(15000) });
          report.target.sample[host] = { status: response.status, type: response.headers.get("content-type"), disposition: response.headers.get("content-disposition"), range: response.headers.get("content-range") };
          await response.body?.cancel();
        } catch (error) { report.target.sample[host] = { error: safeError(error.cause || error) }; }
      }
    }
  } catch (error) { report.target = { error: safeError(error), complete: false }; }
}

const databaseUrl = env.FLUXPOST_DIAG_DATABASE_URL;
if (databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','json','jsonb','character varying') AND table_name NOT IN ('workspace_accounts','workspace_sessions') ORDER BY table_name,ordinal_position");
    const refs = [];
    const quote = (name) => `"${name.replaceAll('"', '""')}"`;
    if (!env.TOS_PUBLIC_BASE_URL) throw new Error("SourcePublicBaseMissing");
    for (const { table_name: table, column_name: column } of rows) {
      const result = await client.query(`SELECT count(*)::int AS count FROM public.${quote(table)} WHERE strpos(${quote(column)}::text, $1) > 0`, [env.TOS_PUBLIC_BASE_URL]);
      if (result.rows[0].count) refs.push({ table, column, rows: result.rows[0].count });
    }
    report.database = { columnsWithSourceReferences: refs, note: "Row counts per column, not distinct objects; no row contents exported." };
    const sample = await client.query("SELECT object_key FROM library_assets WHERE public_url LIKE $1 AND object_key <> '' LIMIT 1", [`%${env.TOS_PUBLIC_BASE_URL}%`]);
    if (sample.rows[0] && process.argv.includes("--target")) {
      const encoded = sample.rows[0].object_key.split("/").map(encodeURIComponent).join("/");
      report.knownKeyReads = {};
      for (const host of [env.TOS_PUBLIC_BASE_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""), "xpai-imc.oss-cn-guangzhou.aliyuncs.com"]) {
        try {
          const response = await fetch(`https://${host}/${encoded}`, { headers: { Range: "bytes=0-31" }, redirect: "error", signal: AbortSignal.timeout(15000) });
          report.knownKeyReads[host] = { status: response.status, type: response.headers.get("content-type"), disposition: response.headers.get("content-disposition"), range: response.headers.get("content-range") };
          await response.body?.cancel();
        } catch (error) { report.knownKeyReads[host] = { error: safeError(error.cause || error) }; }
      }
    }
  } catch (error) { report.database = { error: safeError(error), complete: false }; }
  finally { await client.end(); }
} else report.database = { skipped: "Dedicated read-only database URL unavailable" };

await writeFile(".tmp-storage-inventory.json", JSON.stringify(report, null, 2), { mode: 0o600 });
const summary = structuredClone(report);
if (summary.source?.objects) delete summary.source.objects;
if (summary.target?.objects) delete summary.target.objects;
console.log(JSON.stringify(summary, null, 2));
if (report.source?.error || report.target?.error || report.database?.error) process.exitCode = 1;
