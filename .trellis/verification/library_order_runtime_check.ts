import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { Pool } from "pg";
import type * as Library from "../../src/lib/library-assets";
import type { LibraryAsset, LibraryAssetOrder } from "../../src/lib/types";

async function main() {
  const project = process.cwd();
  let library: typeof Library;
  let save: (asset: LibraryAsset) => Promise<unknown>;
  let dispose = async () => {};
  if (process.env.LIBRARY_ORDER_POSTGRES === "1") {
    assert(process.env.DATABASE_URL && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "Explicit loopback PostgreSQL only");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    dispose = async () => { client.release(); await pool.end(); };
    await client.query(`CREATE TEMP TABLE library_assets(id TEXT PRIMARY KEY,owner_user_id TEXT,visibility TEXT,name TEXT,original_name TEXT,note TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,data_json JSONB,search_vector TSVECTOR);
      CREATE TEMP TABLE library_collection_assets(collection_id TEXT,asset_id TEXT);
      CREATE TEMP TABLE library_asset_favorites(owner_user_id TEXT,asset_id TEXT);
      CREATE TEMP TABLE library_asset_labels(asset_id TEXT,dimension TEXT,value TEXT);
      CREATE TEMP TABLE library_asset_palettes(asset_id TEXT,data_json JSONB);`);
    function load(file: string, overrides: Record<string, unknown>, append = "") {
      const require = createRequire(path.resolve(file));
      const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const mod = { exports: {} };
      Function("require", "module", "exports", output + append)((name: string) => overrides[name] || require(name), mod, mod.exports);
      return mod.exports;
    }
    const db = load("src/lib/database.ts", {}, "\nmodule.exports.bindFixture = p => { postgresPool=p; initializationBackend='postgres'; initializationPromise=Promise.resolve(); };\n") as { bindFixture: (value: unknown) => void };
    db.bindFixture({ query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) });
    library = load("src/lib/library-assets.ts", { "./database": db }) as typeof Library;
    save = async (asset) => client.query("INSERT INTO library_assets(id,owner_user_id,visibility,name,original_name,note,created_at,updated_at,deleted_at,data_json) VALUES($1,$2,$3,$4,$5,'',$6,$7,$8,$9)", [asset.id, asset.ownerUserId, asset.visibility, asset.name, asset.originalName, asset.createdAt, asset.updatedAt, asset.deletedAt, asset]);
  } else {
    const root = process.env.FLUXPOST_LIBRARY_ORDER_FIXTURE;
    assert(root, "Isolated fixture required");
    process.chdir(root);
    const db = await import("../../src/lib/database");
    library = await import("../../src/lib/library-assets");
    save = db.saveLibraryAssetToDb;
  }
  try {
  const actor = { id: "owner", displayName: "Owner", role: "operator" as const };
  const profile = { scenes: [], vehicleModels: [], vehicleColors: [], angles: [], people: "unknown" as const, customTags: [] };
  const assets: LibraryAsset[] = [];
  for (let i = 0; i < 63; i++) {
    const id = `asset-${String(i).padStart(3, "0")}`;
    const asset: LibraryAsset = {
      id, ownerUserId: i === 62 ? "other" : actor.id, ownerDisplayName: "Owner",
      name: ["a2.jpg", "A10.jpg", "风景.jpg", "车.jpg", "same.jpg"][i % 5], originalName: `${id}.jpg`,
      objectKey: `${id}.jpg`, publicUrl: `https://fixture.invalid/${id}.jpg`, sha256: id,
      mimeType: "image/jpeg", extension: ".jpg", byteSize: 100, collectionIds: [], visibility: "private",
      aiTags: profile, manualOverrides: {}, effectiveTags: profile, taggingStatus: "idle", cleanupStatus: "ready",
      createdAt: `2026-10-${String(1 + i % 20).padStart(2, "0")}T00:00:00.000Z`,
      updatedAt: `2026-11-${String(1 + (62 - i) % 20).padStart(2, "0")}T00:00:00.000Z`,
      ...(i === 61 ? { deletedAt: "2026-11-06T00:00:00.000Z" } : {}),
    };
    await save(asset); assets.push(asset);
  }
  const visible = assets.slice(0, 61);
  const options: LibraryAssetOrder[] = ["newest", "oldest", "updated-newest", "updated-oldest", "name-asc", "name-desc"].map((sort) => ({ sort } as LibraryAssetOrder));
  options.push({ sort: "random", randomSeed: "persisted-seed" });
  const results: Record<string, string[]> = {};
  for (const order of options) {
    const key = (asset: LibraryAsset) => order.sort === "random" ? createHash("md5").update(`${order.randomSeed}:${asset.id}`).digest("hex")
      : order.sort.startsWith("updated") ? asset.updatedAt : order.sort.startsWith("name") ? asset.name.toLowerCase() : asset.createdAt;
    const descending = ["newest", "updated-newest", "name-desc"].includes(order.sort);
    const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
    const expected = [...visible].sort((a, b) => (descending ? -1 : 1) * (compare(key(a), key(b)) || compare(a.id, b.id))).map((a) => a.id);
    let cursor: string | undefined;
    const actual: string[] = [];
    do {
      const page = await library.listLibraryAssets(actor, { ...order, limit: 7, cursor });
      assert.equal(page.total, 61);
      actual.push(...page.assets.map((a) => a.id)); cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(actual, expected, order.sort);
    results[order.sort] = actual;
    const subset = expected.filter((_, i) => i % 3 === 0).reverse();
    assert.deepEqual(await library.orderLibraryAssetIds(actor, { ...order, assetIds: subset }), [...subset].reverse());
    assert.deepEqual(await library.orderLibraryAssetIds(actor, { ...order, assetIds: [] }), []);
  }
  assert.notDeepEqual(results.newest, results["updated-newest"]);
  assert.deepEqual((await library.listLibraryAssets(actor, { sort: "random", randomSeed: "persisted-seed", limit: 100 })).assets.map((a) => a.id), results.random);
  assert.notDeepEqual((await library.listLibraryAssets(actor, { sort: "random", randomSeed: "reshuffled", limit: 100 })).assets.map((a) => a.id), results.random);
  const first = await library.listLibraryAssets(actor, { sort: "random", randomSeed: "persisted-seed", limit: 7 });
  await assert.rejects(library.listLibraryAssets(actor, { sort: "random", randomSeed: "changed", cursor: first.nextCursor }), /cursor/);
  await assert.rejects(library.listLibraryAssets(actor, { sort: "updated-newest", cursor: first.nextCursor }), /cursor/);
  await assert.rejects(library.listLibraryAssets(actor, { sort: "random", randomSeed: "persisted-seed", search: "changed", cursor: first.nextCursor }), /cursor/);
  for (const id of ["asset-061", "asset-062", "missing"]) await assert.rejects(library.orderLibraryAssetIds(actor, { sort: "updated-newest", assetIds: ["asset-001", id] }), /已删除或无权访问/);
  for (const bad of [{ sort: "bogus", assetIds: [] }, { sort: "random", assetIds: [] }, { sort: "random", randomSeed: "';--", assetIds: [] }, { assetIds: [null] }]) await assert.rejects(library.orderLibraryAssetIds(actor, bad));
  assert.deepEqual(await library.orderLibraryAssetIds(actor, { sort: "oldest", assetIds: ["asset-001", "asset-001"] }), ["asset-001"]);
  assert.equal((await library.listLibraryAssets(actor)).assets[0].id, results.newest[0], "Other pages retain newest-created default");

  // Exercise the actual route with isolated auth/domain dependencies.
  const require = createRequire(path.join(project, "src/app/api/library/assets/order/route.ts"));
  const output = ts.transpileModule(readFileSync(path.join(project, "src/app/api/library/assets/order/route.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as { POST: (r: Request) => Promise<Response> } };
  let signedIn = true;
  Function("require", "module", "exports", output)((name: string) => name === "@/lib/library-assets" ? library : name === "@/lib/workspace-accounts" ? {
    requireWorkspaceAccount: async () => { if (!signedIn) throw new Error("signin"); return actor; }, isWorkspaceSignInError: (e: Error) => e.message === "signin",
  } : require(name), mod, mod.exports);
  const request = (body: unknown) => new Request("http://fixture.invalid/api/library/assets/order", { method: "POST", body: JSON.stringify(body) });
  const ok = await mod.exports.POST(request({ assetIds: ["asset-002", "asset-001"], sort: "oldest" }));
  assert.equal(ok.status, 200); assert.deepEqual((await ok.json()).assetIds, ["asset-001", "asset-002"]);
  assert.equal((await mod.exports.POST(request({ assetIds: ["asset-062"], sort: "oldest" }))).status, 400);
  signedIn = false; assert.equal((await mod.exports.POST(request({ assetIds: [], sort: "oldest" }))).status, 401);
  const { createCanvasNode } = await import("../../src/lib/canvas/registry");
  const { decodeCanvasGraph } = await import("../../src/lib/canvas/serialization");
  const clipboard = await import("../../src/lib/canvas/clipboard");
  const node = createCanvasNode("input.library-images", "library", { x: 0, y: 0 });
  node.config = { ...node.config, assetIds: ["asset-002", "asset-001"], assetNames: ["Frozen 2", "Frozen 1"], urls: ["/frozen/2", "/frozen/1"], librarySearch: "search", libraryTag: "tag", libraryColor: "#3876C7", libraryCollectionId: "collection", librarySort: "random", libraryRandomSeed: "saved-seed" };
  const graph = { nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  assert.deepEqual(decodeCanvasGraph(JSON.parse(JSON.stringify(graph))).nodes[0].config, node.config);
  const payload = clipboard.parseCanvasClipboardPayload(JSON.stringify(clipboard.createCanvasClipboardPayload([node], [], [node.id])));
  assert(payload);
  const copied = clipboard.instantiateCanvasClipboardPayload(payload, { x: 40, y: 40 }, (kind, i) => `${kind}-${i}`);
  assert.deepEqual(copied.nodes[0].config, node.config);
  copied.nodes[0].config.librarySearch = "copy-only";
  assert.equal(node.config.librarySearch, "search");
  const region = createCanvasNode("utility.image-iterate", "region", { x: 0, y: 0 });
  assert(region.iteration);
  region.iteration.graph.nodes.push(structuredClone(node));
  assert.throws(() => decodeCanvasGraph(JSON.parse(JSON.stringify({ ...graph, nodes: [region] }))), /input.library-images is not allowed inside image iteration/, "Existing iteration node restrictions remain explicit");
  console.log(`Library order (${process.env.LIBRARY_ORDER_POSTGRES === "1" ? "PostgreSQL TEMP-only" : "SQLite fixture"}): seven sorts, seeded paging/restore, global selected order, cursor binding, ownership/deletion and authenticated route passed.`);
  } finally { await dispose(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
