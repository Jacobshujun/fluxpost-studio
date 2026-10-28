import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { loadCutoverConfig } from "./cutover-config.mjs";

process.on("SIGINT", () => {});
async function main() {
  if (process.argv[2] !== "--accept") throw new Error("ExplicitAcceptanceRequired");
  if (process.env.RUNTIME_STORAGE_PROVIDER !== "oss") throw new Error("OssConfigurationRequired");
  const { evidenceDir } = await loadCutoverConfig();
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) throw new Error("LocalDatabaseRequired");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  const token = randomBytes(32).toString("base64url");
  const id = `oss-accept-${randomUUID()}`;
  const base = "http://127.0.0.1:3001";
  const result = { at: new Date().toISOString(), ok: false, mediaReads: 0 };
  await client.connect();
  try {
    const account = (await client.query("SELECT id FROM workspace_accounts WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1")).rows[0];
    assert(account, "ActiveAdminRequired");
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 10 * 60_000).toISOString();
    const tokenHash = createHash("sha256").update(token).digest("base64url");
    const session = { id, accountId: account.id, tokenHash, createdAt: now, expiresAt: expires, lastSeenAt: now };
    await client.query("INSERT INTO workspace_sessions(id,account_id,token_hash,created_at,expires_at,last_seen_at,data_json) VALUES($1,$2,$3,$4,$5,$4,$6)", [id, account.id, tokenHash, now, expires, session]);
    const request = async (endpoint, method = "GET") => {
      const response = await fetch(base + endpoint, { method, headers: { cookie: `fluxpost_session=${token}` }, signal: AbortSignal.timeout(60000) });
      assert.equal(response.status, 200, "AcceptanceHttpStatus");
      return response.json();
    };
    const version = await request("/api/version");
    assert(version.mode === "candidate" && version.versioned, "CandidateRequired");
    const config = await request("/api/config?advanced=1");
    const fields = config.advanced.groups.flatMap(group => group.fields);
    assert.equal(fields.find(field => field.key === "RUNTIME_STORAGE_PROVIDER")?.value, "oss");
    assert(config.status.tosEnabled && config.status.tosConfigured, "ConfiguredOssRequired");
    const navigation = await request("/api/library/navigation");
    const assets = await request("/api/library/assets?limit=3");
    const expected = (await client.query("SELECT count(*)::int count FROM library_assets")).rows[0].count;
    assert.equal(navigation.counts.all, expected);
    assert.equal(assets.total, expected);
    const core = JSON.parse(await readFile(`${evidenceDir}/core-data-before.json`, "utf8"));
    for (const table of ["copy_library_entries", "library_collections", "library_collection_assets", "library_asset_labels", "library_asset_favorites", "library_smart_folders"]) {
      const actual = (await client.query(`SELECT count(*)::int count,md5(string_agg(h,'' ORDER BY h)) digest FROM (SELECT md5(row_to_json(r)::text) h FROM "${table}" r) s`)).rows[0];
      assert.deepEqual(actual, core[table], "CoreDataChanged");
    }
    assert.equal(expected, core.library_assets.count, "LibraryCountChanged");
    for (const asset of assets.assets) {
      const url = asset.publicUrl;
      assert.equal(new URL(url).hostname, "xpai-imc.oss-cn-guangzhou.aliyuncs.com");
      const response = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200);
      result.mediaReads++;
    }
    // Existing administrator probe creates then removes two tiny dedicated health objects.
    const probe = await request("/api/config/tos-check", "POST");
    assert(probe.ok && probe.uploadVerified && probe.headVerified && probe.publicReadVerified && probe.rangeVerified && probe.cleanupVerified, "StorageProbeFailed");
    Object.assign(result, { ok: true, commit: version.commit, libraryAssets: expected, copyEntries: core.copy_library_entries.count, coreDataPreserved: true, probePassed: true });
  } finally {
    await client.query("DELETE FROM workspace_sessions WHERE id=$1", [id]);
    await client.end();
    await writeFile(`${evidenceDir}/cutover-acceptance.json`, JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ code: error.code || error.name })); process.exitCode = 1; });
