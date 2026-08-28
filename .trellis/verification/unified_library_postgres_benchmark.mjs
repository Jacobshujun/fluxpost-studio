import { performance } from "node:perf_hooks";
import { Pool } from "pg";

const databaseUrl = process.env.FLUXPOST_BENCHMARK_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set FLUXPOST_BENCHMARK_DATABASE_URL or DATABASE_URL for the isolated PostgreSQL benchmark.");
const parsedUrl = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!localHosts.has(parsedUrl.hostname) && process.env.FLUXPOST_ALLOW_REMOTE_BENCHMARK !== "1") {
  throw new Error("The library benchmark only runs against local PostgreSQL unless FLUXPOST_ALLOW_REMOTE_BENCHMARK=1 is explicit.");
}

const schema = `fluxpost_library_bench_${process.pid}_${Date.now().toString(36)}`;
const quotedSchema = `"${schema}"`;
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const admin = await pool.connect();
const clients = [];

const projection = `a.data_json,
  ARRAY(SELECT ca.collection_id FROM library_collection_assets ca WHERE ca.asset_id=a.id ORDER BY ca.collection_id) collection_ids,
  EXISTS (SELECT 1 FROM library_asset_favorites fav WHERE fav.asset_id=a.id AND fav.owner_user_id=$1) favorite`;
const access = `(a.owner_user_id=$1 OR a.visibility='team') AND a.deleted_at IS NULL`;

function pageAndCount(where, values, order = "a.created_at DESC, a.id DESC") {
  return [
    { text: `SELECT ${projection} FROM library_assets a WHERE ${where} ORDER BY ${order} LIMIT 61`, values },
    { text: `SELECT COUNT(*) count FROM library_assets a WHERE ${where}`, values },
  ];
}

const cases = [
  {
    name: "default-list",
    targetMs: 300,
    queries: () => pageAndCount(access, ["owner-1"]),
  },
  {
    name: "tag-filter",
    targetMs: 300,
    queries: () => pageAndCount(`${access} AND EXISTS (
      SELECT 1 FROM library_asset_labels tag_filter
      WHERE tag_filter.asset_id=a.id AND tag_filter.dimension='unified' AND LOWER(tag_filter.value)=$2
    )`, ["owner-1", "tag-42"]),
  },
  {
    name: "collection-subtree",
    targetMs: 300,
    queries: () => pageAndCount(`${access} AND EXISTS (
      WITH RECURSIVE collection_tree(id) AS (
        SELECT id FROM library_collections WHERE id=$2
        UNION ALL SELECT child.id FROM library_collections child JOIN collection_tree parent ON child.parent_id=parent.id
      )
      SELECT 1 FROM library_collection_assets ca JOIN collection_tree tree ON tree.id=ca.collection_id WHERE ca.asset_id=a.id
    )`, ["owner-1", "root"]),
  },
  {
    name: "smart-folder",
    targetMs: 300,
    queries: () => pageAndCount(`${access}
      AND EXISTS (SELECT 1 FROM library_asset_labels smart_tag WHERE smart_tag.asset_id=a.id AND smart_tag.dimension='unified' AND LOWER(smart_tag.value)=$2)
      AND EXISTS (SELECT 1 FROM library_asset_favorites smart_favorite WHERE smart_favorite.asset_id=a.id AND smart_favorite.owner_user_id=$3)
      AND a.width >= $4`, ["owner-1", "tag-42", "owner-1", 1200]),
  },
  {
    name: "cursor-page",
    targetMs: 300,
    queries: () => pageAndCount(`${access} AND (a.created_at < $2 OR (a.created_at=$2 AND a.id < $3))`, ["owner-1", "2026-01-01T12:00:00.000Z", "asset-43200"]),
  },
  {
    name: "navigation-metadata",
    targetMs: 500,
    queries: () => [
      { text: `SELECT COUNT(*) count FROM library_assets a WHERE ${access}`, values: ["owner-1"] },
      { text: `SELECT COUNT(*) count FROM library_assets a WHERE ${access} AND NOT EXISTS (SELECT 1 FROM library_collection_assets ca WHERE ca.asset_id=a.id)`, values: ["owner-1"] },
      { text: `SELECT COUNT(*) count FROM library_assets a WHERE ${access} AND EXISTS (SELECT 1 FROM library_asset_favorites fav WHERE fav.asset_id=a.id AND fav.owner_user_id=$2)`, values: ["owner-1", "owner-1"] },
      { text: "SELECT id, parent_id, name FROM library_collections WHERE owner_user_id=$1 OR visibility='team' ORDER BY name, id", values: ["owner-1"] },
    ],
  },
];

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

async function runCase(testCase) {
  const run = async () => {
    const queries = testCase.queries();
    const startedAt = performance.now();
    await Promise.all(queries.map((query, index) => clients[index % clients.length].query(query)));
    return performance.now() - startedAt;
  };
  for (let index = 0; index < 3; index += 1) await run();
  const samples = [];
  for (let index = 0; index < 20; index += 1) samples.push(await run());
  const p95 = percentile95(samples);
  return { name: testCase.name, p95, targetMs: testCase.targetMs, ok: p95 < testCase.targetMs };
}

try {
  await admin.query(`CREATE SCHEMA ${quotedSchema}`);
  for (let index = 0; index < 4; index += 1) {
    const client = await pool.connect();
    await client.query(`SET search_path TO ${quotedSchema}`);
    clients.push(client);
  }
  const setup = clients[0];
  await setup.query(`
    CREATE UNLOGGED TABLE library_assets (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      byte_size BIGINT NOT NULL,
      tagging_status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      deleted_at TIMESTAMPTZ,
      data_json JSONB NOT NULL,
      search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(original_name, '') || ' ' || COALESCE(note, ''))
      ) STORED
    );
    CREATE INDEX idx_library_assets_owner_created ON library_assets(owner_user_id, created_at DESC, id DESC);
    CREATE INDEX idx_library_assets_visibility_created ON library_assets(visibility, created_at DESC, id DESC);
    CREATE INDEX idx_library_assets_name ON library_assets(name, id);
    CREATE INDEX idx_library_assets_dimensions ON library_assets(width, height, byte_size, id);
    CREATE INDEX idx_library_assets_search ON library_assets USING GIN(search_vector);

    CREATE UNLOGGED TABLE library_collections (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL
    );
    CREATE INDEX idx_library_collections_owner_parent ON library_collections(owner_user_id, parent_id, name);

    CREATE UNLOGGED TABLE library_collection_assets (
      collection_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      PRIMARY KEY(collection_id, asset_id)
    );
    CREATE INDEX idx_library_collection_assets_asset ON library_collection_assets(asset_id, collection_id);

    CREATE UNLOGGED TABLE library_asset_labels (
      asset_id TEXT NOT NULL,
      dimension TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY(asset_id, dimension, value, source)
    );
    CREATE INDEX idx_library_asset_labels_filter ON library_asset_labels(dimension, value, asset_id);
    CREATE INDEX idx_library_asset_labels_filter_lower ON library_asset_labels(dimension, LOWER(value), asset_id);

    CREATE UNLOGGED TABLE library_asset_favorites (
      owner_user_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      PRIMARY KEY(owner_user_id, asset_id)
    );
    CREATE INDEX idx_library_asset_favorites_asset ON library_asset_favorites(asset_id, owner_user_id);
  `);
  await setup.query(`
    INSERT INTO library_assets (
      id, owner_user_id, name, original_name, note, visibility, width, height, byte_size,
      tagging_status, created_at, updated_at, data_json
    )
    SELECT
      'asset-' || asset_no,
      CASE WHEN asset_no % 10 = 0 THEN 'owner-2' ELSE 'owner-1' END,
      'Asset ' || asset_no,
      'asset-' || asset_no || '.jpg',
      CASE WHEN asset_no % 17 = 0 THEN 'campaign launch detail' ELSE '' END,
      CASE WHEN asset_no % 10 = 0 THEN 'team' ELSE 'private' END,
      800 + (asset_no % 2400),
      600 + (asset_no % 1600),
      100000 + (asset_no % 5000000),
      CASE WHEN asset_no % 8 = 0 THEN 'idle' ELSE 'completed' END,
      TIMESTAMPTZ '2026-01-01T00:00:00Z' + asset_no * INTERVAL '1 second',
      TIMESTAMPTZ '2026-01-01T00:00:00Z' + asset_no * INTERVAL '1 second',
      jsonb_build_object('id', 'asset-' || asset_no, 'ownerDisplayName', CASE WHEN asset_no % 10 = 0 THEN 'Team Member' ELSE 'Owner One' END)
    FROM generate_series(1, 50000) asset_no;

    INSERT INTO library_collections (id, owner_user_id, visibility, parent_id, name)
    VALUES ('root', 'owner-1', 'private', NULL, 'Root');
    INSERT INTO library_collections (id, owner_user_id, visibility, parent_id, name)
    SELECT 'collection-' || collection_no, 'owner-1', 'private', 'root', 'Collection ' || collection_no
    FROM generate_series(1, 100) collection_no;

    INSERT INTO library_collection_assets (collection_id, asset_id)
    SELECT 'collection-' || (1 + asset_no % 100), 'asset-' || asset_no
    FROM generate_series(1, 50000) asset_no;

    INSERT INTO library_asset_labels (asset_id, dimension, value, source)
    SELECT
      'asset-' || asset_no,
      CASE WHEN label_no <= 12 THEN 'unified' WHEN label_no <= 15 THEN 'customTags' WHEN label_no <= 18 THEN 'imageType' ELSE 'scenes' END,
      CASE WHEN label_no <= 15 THEN 'tag-' || ((asset_no + label_no) % 200) WHEN label_no <= 18 THEN 'photo-' || (label_no % 3) ELSE 'scene-' || (label_no % 2) END,
      CASE WHEN label_no % 2 = 0 THEN 'ai' ELSE 'user' END
    FROM generate_series(1, 50000) asset_no
    CROSS JOIN generate_series(1, 20) label_no;

    INSERT INTO library_asset_favorites (owner_user_id, asset_id)
    SELECT 'owner-1', 'asset-' || asset_no FROM generate_series(10, 50000, 10) asset_no;

    ANALYZE library_assets;
    ANALYZE library_collections;
    ANALYZE library_collection_assets;
    ANALYZE library_asset_labels;
    ANALYZE library_asset_favorites;
  `);

  const results = [];
  for (const testCase of cases) results.push(await runCase(testCase));
  for (const result of results) console.log(`${result.name}: P95 ${result.p95.toFixed(1)}ms / ${result.targetMs}ms`);
  const failures = results.filter((result) => !result.ok);
  if (failures.length) throw new Error(`PostgreSQL library benchmark missed targets: ${failures.map((item) => item.name).join(", ")}`);
  console.log("Unified library PostgreSQL benchmark passed with 50,000 assets and 1,000,000 tag relations.");
} finally {
  for (const client of clients) client.release();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  } finally {
    admin.release();
    await pool.end();
  }
}
