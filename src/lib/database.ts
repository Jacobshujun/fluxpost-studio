import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import type { CanvasNodeRun, CanvasRun, CanvasRunQueueItem, CanvasSchedule, CanvasSubtitlePreset, CanvasSubtitleTranscriptCacheEntry, CanvasWorkflow } from "./canvas/types";
import { getLibraryAssetAddedAt } from "./library-sort";
import type {
  ContentProject,
  CopyLibraryEntry,
  CrawlJob,
  DistributionCheckJob,
  ExecutionLogEntry,
  FeishuPublishJob,
  GeneratedPost,
  ImageGenerationQueueJob,
  LarkTaskLaunch,
  LibraryAsset,
  LibraryCollection,
  LibraryTaggingJob,
  OriginalBatch,
  OriginalBatchItem,
  OriginalBatchQueueItem,
  SimpleRun,
  SimpleRunQueueItem,
  WorkspaceAccountRecord,
  WorkspaceSession,
} from "./types";
import { normalizeFeishuPublishMode } from "./feishu-publish-mode";

type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
};

type SqliteDatabase = {
  close: () => void;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
};

type DatabaseSyncConstructor = new (location: string, options?: Record<string, unknown>) => SqliteDatabase;

type JsonRow = {
  data_json: unknown;
};

type CountRow = {
  count: number;
};

type SimpleRunQueueRow = {
  id: string;
  run_id: string;
  status: SimpleRunQueueItem["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
};

type OriginalBatchQueueRow = {
  id: string;
  batch_id: string;
  item_id: string;
  owner_user_id: string;
  status: OriginalBatchQueueItem["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  data_json: unknown;
};

type ExpiredOriginalBatchQueueRow = { item_id: string; batch_id: string };

type FeishuPublishQueueRow = {
  id: string;
  owner_user_id: string;
  source: FeishuPublishJob["source"];
  source_run_id?: string | null;
  status: FeishuPublishJob["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  data_json: unknown;
};

type DistributionCheckJobRow = {
  id: string;
  owner_user_id: string;
  status: DistributionCheckJob["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  data_json: unknown;
};

type ImageGenerationQueueRow = {
  id: string;
  provider: ImageGenerationQueueJob["provider"];
  status: ImageGenerationQueueJob["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  data_json: unknown;
};

type LarkTaskLaunchRow = {
  id: string;
  message_id: string;
  chat_id: string;
  sender_id: string;
  owner_user_id?: string | null;
  run_id?: string | null;
  status: LarkTaskLaunch["status"];
  created_at: string;
  updated_at: string;
  error?: string | null;
  data_json: unknown;
};

type WorkspaceAccountRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: WorkspaceAccountRecord["role"];
  status: WorkspaceAccountRecord["status"];
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
  data_json: unknown;
};

type WorkspaceSessionRow = {
  id: string;
  account_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at?: string | null;
  revoked_at?: string | null;
  data_json: unknown;
};

type LibraryTaggingJobRow = {
  id: string;
  asset_id: string;
  owner_user_id: string;
  status: LibraryTaggingJob["status"];
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  data_json: unknown;
};

type CanvasRunQueueRow = {
  id: string;
  run_id: string;
  status: CanvasRunQueueItem["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by?: string | null;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  data_json: unknown;
};

type StoreTable =
  | "workspace_accounts"
  | "workspace_sessions"
  | "content_projects"
  | "generated_posts"
  | "batch_jobs"
  | "execution_logs"
  | "crawl_jobs"
  | "runtime_posts"
  | "simple_runs"
  | "simple_run_queue"
  | "image_generation_queue"
  | "feishu_publish_queue"
  | "distribution_check_jobs"
  | "lark_task_launches";

export type DatabaseBackend = "sqlite" | "postgres";

const dataDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
export const sqliteStorePath = path.join(dataDir, "fluxpost.db");

let sqliteDatabase: SqliteDatabase | undefined;
let postgresPool: Pool | undefined;
let initializationBackend: DatabaseBackend | undefined;
let initializationPromise: Promise<void> | undefined;

export function getDatabaseBackend(): DatabaseBackend {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

export function getDatabaseRuntimeStatus() {
  const backend = getDatabaseBackend();
  return {
    backend,
    sqliteStorePath,
    postgresConfigured: backend === "postgres",
  };
}

export async function listLibraryAssetsFromDb(): Promise<LibraryAsset[]> {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM library_assets WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC");
    return result.rows.map((row) => fromLibraryAssetJson(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM library_assets WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC").all() as JsonRow[];
  return rows.map((row) => fromLibraryAssetJson(row.data_json));
}

export async function getLibraryAssetFromDb(assetId: string, includeDeleted = false) {
  await ensureDatabaseReady();
  const deletedClause = includeDeleted ? "" : " AND deleted_at IS NULL";
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>(`SELECT data_json FROM library_assets WHERE id = $1${deletedClause}`, [assetId]);
    return result.rows[0] ? fromLibraryAssetJson(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare(`SELECT data_json FROM library_assets WHERE id = ?${deletedClause}`).get(assetId) as JsonRow | undefined;
  return row ? fromLibraryAssetJson(row.data_json) : undefined;
}

export async function findLibraryAssetByOwnerHashFromDb(ownerUserId: string, sha256: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>(
      "SELECT data_json FROM library_assets WHERE owner_user_id = $1 AND sha256 = $2 AND deleted_at IS NULL LIMIT 1",
      [ownerUserId, sha256],
    );
    return result.rows[0] ? fromLibraryAssetJson(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare(
    "SELECT data_json FROM library_assets WHERE owner_user_id = ? AND sha256 = ? AND deleted_at IS NULL LIMIT 1",
  ).get(ownerUserId, sha256) as JsonRow | undefined;
  return row ? fromLibraryAssetJson(row.data_json) : undefined;
}

function fromLibraryAssetJson(value: unknown): LibraryAsset {
  const asset = fromJson<LibraryAsset>(value);
  const roleAddedAt: LibraryAsset["roleAddedAt"] = {};
  for (const role of asset.roles) roleAddedAt[role] = getLibraryAssetAddedAt(asset, role);
  return { ...asset, roleAddedAt };
}

export async function saveLibraryAssetToDb(asset: LibraryAsset) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      await saveLibraryAssetPostgres(client, asset);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return asset;
  }
  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => saveLibraryAssetSqlite(db, asset));
  return asset;
}

export async function saveLibraryAssetAndTaggingJobToDb(asset: LibraryAsset, job: LibraryTaggingJob) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      await saveLibraryAssetPostgres(client, asset);
      await saveLibraryTaggingJobPostgres(client, job);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { asset, job };
  }
  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    saveLibraryAssetSqlite(db, asset);
    saveLibraryTaggingJobSqlite(db, job);
  });
  return { asset, job };
}

export async function deleteLibraryAssetFromDb(assetId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("DELETE FROM library_assets WHERE id = $1", [assetId]);
    return;
  }
  getSqliteDatabase().prepare("DELETE FROM library_assets WHERE id = ?").run(assetId);
}

export async function listCopyLibraryEntriesFromDb(): Promise<CopyLibraryEntry[]> {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM copy_library_entries ORDER BY updated_at DESC, id DESC");
    return result.rows.map((row) => fromJson<CopyLibraryEntry>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM copy_library_entries ORDER BY updated_at DESC, id DESC").all() as JsonRow[];
  return rows.map((row) => fromJson<CopyLibraryEntry>(row.data_json));
}

export async function getCopyLibraryEntryFromDb(entryId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM copy_library_entries WHERE id = $1", [entryId]);
    return result.rows[0] ? fromJson<CopyLibraryEntry>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM copy_library_entries WHERE id = ?").get(entryId) as JsonRow | undefined;
  return row ? fromJson<CopyLibraryEntry>(row.data_json) : undefined;
}

export async function saveCopyLibraryEntryToDb(entry: CopyLibraryEntry) {
  await ensureDatabaseReady();
  const values = [entry.id, entry.ownerUserId, entry.visibility, entry.title, entry.createdAt, entry.updatedAt, toJson(entry)];
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO copy_library_entries (id, owner_user_id, visibility, title, created_at, updated_at, data_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, visibility=excluded.visibility,
         title=excluded.title, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      values,
    );
    return entry;
  }
  getSqliteDatabase().prepare(
    `INSERT INTO copy_library_entries (id, owner_user_id, visibility, title, created_at, updated_at, data_json)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, visibility=excluded.visibility,
       title=excluded.title, updated_at=excluded.updated_at, data_json=excluded.data_json`,
  ).run(...values);
  return entry;
}

export async function deleteCopyLibraryEntryFromDb(entryId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("DELETE FROM copy_library_entries WHERE id = $1", [entryId]);
    return;
  }
  getSqliteDatabase().prepare("DELETE FROM copy_library_entries WHERE id = ?").run(entryId);
}

export async function listLibraryCollectionsFromDb(): Promise<LibraryCollection[]> {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM library_collections ORDER BY created_at ASC, id ASC");
    return result.rows.map((row) => fromJson<LibraryCollection>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM library_collections ORDER BY created_at ASC, id ASC").all() as JsonRow[];
  return rows.map((row) => fromJson<LibraryCollection>(row.data_json));
}

export async function saveLibraryCollectionToDb(collection: LibraryCollection) {
  await ensureDatabaseReady();
  const values = [collection.id, collection.ownerUserId, collection.role, collection.parentId || null, collection.name, collection.relativePath || null, collection.createdAt, collection.updatedAt, toJson(collection)];
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO library_collections (id, owner_user_id, role, parent_id, name, relative_path, created_at, updated_at, data_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, role=excluded.role, parent_id=excluded.parent_id,
       name=excluded.name, relative_path=excluded.relative_path, updated_at=excluded.updated_at, data_json=excluded.data_json`,
      values,
    );
    return collection;
  }
  getSqliteDatabase().prepare(
    `INSERT INTO library_collections (id, owner_user_id, role, parent_id, name, relative_path, created_at, updated_at, data_json)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, role=excluded.role, parent_id=excluded.parent_id,
     name=excluded.name, relative_path=excluded.relative_path, updated_at=excluded.updated_at, data_json=excluded.data_json`,
  ).run(...values);
  return collection;
}

export async function deleteLibraryCollectionFromDb(collectionId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("DELETE FROM library_collections WHERE id = $1", [collectionId]);
    return;
  }
  getSqliteDatabase().prepare("DELETE FROM library_collections WHERE id = ?").run(collectionId);
}

export async function saveLibraryTaggingJobToDb(job: LibraryTaggingJob) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await saveLibraryTaggingJobPostgres(client, job);
    } finally {
      client.release();
    }
    return job;
  }
  saveLibraryTaggingJobSqlite(getSqliteDatabase(), job);
  return job;
}

export async function listLibraryTaggingJobsFromDb(ownerUserId?: string, limit = 100): Promise<LibraryTaggingJob[]> {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = ownerUserId
      ? await getPostgresPool().query<LibraryTaggingJobRow>("SELECT * FROM library_tagging_jobs WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT $2", [ownerUserId, limit])
      : await getPostgresPool().query<LibraryTaggingJobRow>("SELECT * FROM library_tagging_jobs ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(fromLibraryTaggingJobRow);
  }
  const rows = ownerUserId
    ? getSqliteDatabase().prepare("SELECT * FROM library_tagging_jobs WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT ?").all(ownerUserId, limit)
    : getSqliteDatabase().prepare("SELECT * FROM library_tagging_jobs ORDER BY created_at DESC LIMIT ?").all(limit);
  return (rows as LibraryTaggingJobRow[]).map(fromLibraryTaggingJobRow);
}

export async function claimNextLibraryTaggingJob(workerId: string, lockMs = 5 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<LibraryTaggingJobRow>(
      `WITH next_item AS (
         SELECT id FROM library_tagging_jobs
         WHERE ((status='queued' AND run_after <= $1) OR (status='running' AND locked_until <= $1))
           AND attempts < max_attempts
         ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE library_tagging_jobs queue SET status='running', attempts=queue.attempts+1, locked_by=$2,
         locked_until=$3, started_at=COALESCE(queue.started_at,$1), updated_at=$1
       FROM next_item WHERE queue.id=next_item.id RETURNING queue.*`,
      [nowIso, workerId, lockedUntil],
    );
    return result.rows[0] ? fromLibraryTaggingJobRow(result.rows[0]) : undefined;
  }
  const db = getSqliteDatabase();
  let claimed: LibraryTaggingJob | undefined;
  runSqliteTransaction(db, () => {
    const row = db.prepare(
      `SELECT * FROM library_tagging_jobs
       WHERE ((status='queued' AND run_after <= ?) OR (status='running' AND locked_until <= ?)) AND attempts < max_attempts
       ORDER BY created_at ASC LIMIT 1`,
    ).get(nowIso, nowIso) as LibraryTaggingJobRow | undefined;
    if (!row) return;
    db.prepare(
      `UPDATE library_tagging_jobs SET status='running', attempts=attempts+1, locked_by=?, locked_until=?,
       started_at=COALESCE(started_at,?), updated_at=? WHERE id=?`,
    ).run(workerId, lockedUntil, nowIso, nowIso, row.id);
    claimed = fromLibraryTaggingJobRow(db.prepare("SELECT * FROM library_tagging_jobs WHERE id=?").get(row.id) as LibraryTaggingJobRow);
  });
  return claimed;
}

export async function readContentProjectsFromDb(): Promise<ContentProject[]> {
  return readJsonRows<ContentProject>("content_projects");
}

export async function writeContentProjectsToDb(projects: ContentProject[]) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      for (const project of projects) {
        await client.query(
          `
            INSERT INTO content_projects (id, normalized_query, query, created_at, updated_at, last_crawled_at, data_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT(id) DO UPDATE SET
              normalized_query = excluded.normalized_query,
              query = excluded.query,
              created_at = content_projects.created_at,
              updated_at = excluded.updated_at,
              last_crawled_at = excluded.last_crawled_at,
              data_json = excluded.data_json
          `,
          [
            project.id,
            project.normalizedQuery,
            project.query,
            project.createdAt,
            project.updatedAt,
            project.lastCrawledAt || null,
            toJson(project),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    const insert = db.prepare(`
      INSERT INTO content_projects (id, normalized_query, query, created_at, updated_at, last_crawled_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        normalized_query = excluded.normalized_query,
        query = excluded.query,
        created_at = content_projects.created_at,
        updated_at = excluded.updated_at,
        last_crawled_at = excluded.last_crawled_at,
        data_json = excluded.data_json
    `);
    projects.forEach((project) => {
      insert.run(
        project.id,
        project.normalizedQuery,
        project.query,
        project.createdAt,
        project.updatedAt,
        project.lastCrawledAt || null,
        toJson(project),
      );
    });
  });
}

export async function readGeneratedPostsFromDb(): Promise<GeneratedPost[]> {
  return readJsonRows<GeneratedPost>("generated_posts", "updated_at DESC");
}

export async function writeGeneratedPostsToDb(posts: GeneratedPost[]) {
  await replaceJsonRows("generated_posts", posts, (post) => [
    post.id,
    post.sourceItemId,
    post.platform,
    post.status,
    post.createdAt || post.updatedAt,
    post.updatedAt,
    toJson(post),
  ]);
}

export async function saveGeneratedPostToDb(post: GeneratedPost) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO generated_posts (id, source_item_id, platform, status, created_at, updated_at, data_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          source_item_id = excluded.source_item_id,
          platform = excluded.platform,
          status = excluded.status,
          created_at = generated_posts.created_at,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `,
      [post.id, post.sourceItemId, post.platform, post.status, post.createdAt || post.updatedAt, post.updatedAt, toJson(post)],
    );
    return post;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO generated_posts (id, source_item_id, platform, status, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_item_id = excluded.source_item_id,
      platform = excluded.platform,
      status = excluded.status,
      created_at = generated_posts.created_at,
      updated_at = excluded.updated_at,
      data_json = excluded.data_json
  `).run(post.id, post.sourceItemId, post.platform, post.status, post.createdAt || post.updatedAt, post.updatedAt, toJson(post));
  return post;
}

export async function deleteGeneratedPostFromDb(postId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("DELETE FROM generated_posts WHERE id = $1", [postId]);
    return;
  }

  getSqliteDatabase().prepare("DELETE FROM generated_posts WHERE id = ?").run(postId);
}

export async function deleteGeneratedPostsFromDb(postIds: string[]) {
  const ids = Array.from(new Set(postIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return;

  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("DELETE FROM generated_posts WHERE id = ANY($1::text[])", [ids]);
    return;
  }

  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    const statement = db.prepare("DELETE FROM generated_posts WHERE id = ?");
    ids.forEach((id) => statement.run(id));
  });
}

export async function readExecutionLogsFromDb(limit?: number): Promise<ExecutionLogEntry[]> {
  return readJsonRows<ExecutionLogEntry>("execution_logs", "created_at DESC", limit);
}

export async function readSimpleRunsFromDb(limit = 30): Promise<SimpleRun[]> {
  return (await readJsonRows<SimpleRun>("simple_runs", "created_at DESC", limit)).map(normalizeStoredSimpleRun);
}

export async function getSimpleRunFromDb(runId: string) {
  const run = await readJsonRowById<SimpleRun>("simple_runs", runId);
  return run ? normalizeStoredSimpleRun(run) : undefined;
}

export async function saveSimpleRunToDb(run: SimpleRun) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO simple_runs (id, status, keyword, created_at, updated_at, data_json)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          keyword = excluded.keyword,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `,
      [run.id, run.status, run.input.keyword, run.createdAt, run.updatedAt, toJson(run)],
    );
    return run;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO simple_runs (id, status, keyword, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      keyword = excluded.keyword,
      updated_at = excluded.updated_at,
      data_json = excluded.data_json
  `).run(run.id, run.status, run.input.keyword, run.createdAt, run.updatedAt, toJson(run));
  return run;
}

export async function enqueueSimpleRunQueueItem(run: SimpleRun) {
  const now = new Date().toISOString();
  const item: SimpleRunQueueItem = {
    id: `simple-queue-${run.id}`,
    runId: run.id,
    status: "queued",
    priority: 0,
    attempts: 0,
    maxAttempts: 1,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
  };

  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO simple_run_queue (
          id, run_id, status, priority, attempts, max_attempts, run_after,
          locked_by, locked_until, created_at, updated_at, started_at,
          completed_at, error, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, NULL, NULL, NULL, $10::jsonb)
        ON CONFLICT(run_id) DO UPDATE SET
          status = CASE
            WHEN simple_run_queue.status IN ('completed', 'failed') THEN simple_run_queue.status
            ELSE excluded.status
          END,
          priority = excluded.priority,
          run_after = excluded.run_after,
          locked_by = NULL,
          locked_until = NULL,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `,
      [item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item)],
    );
    return item;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO simple_run_queue (
      id, run_id, status, priority, attempts, max_attempts, run_after,
      locked_by, locked_until, created_at, updated_at, started_at,
      completed_at, error, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      status = CASE
        WHEN simple_run_queue.status IN ('completed', 'failed') THEN simple_run_queue.status
        ELSE excluded.status
      END,
      priority = excluded.priority,
      run_after = excluded.run_after,
      locked_by = NULL,
      locked_until = NULL,
      updated_at = excluded.updated_at,
      data_json = excluded.data_json
  `).run(
    item.id,
    item.runId,
    item.status,
    item.priority,
    item.attempts,
    item.maxAttempts,
    item.runAfter,
    item.createdAt,
    item.updatedAt,
    toJson(item),
  );
  return item;
}

export async function getSimpleRunQueueItemByRunId(runId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<SimpleRunQueueRow>("SELECT * FROM simple_run_queue WHERE run_id = $1", [runId]);
    return result.rows[0] ? fromSimpleRunQueueRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM simple_run_queue WHERE run_id = ?").get(runId) as SimpleRunQueueRow | undefined;
  return row ? fromSimpleRunQueueRow(row) : undefined;
}

export async function claimNextSimpleRunQueueItem(workerId: string, lockMs = 5 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();

  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<SimpleRunQueueRow>(
      `
        WITH next_item AS (
          SELECT id
          FROM simple_run_queue
          WHERE status = 'queued'
            AND run_after <= $1
            AND attempts < max_attempts
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE simple_run_queue queue
        SET
          status = 'running',
          attempts = queue.attempts + 1,
          locked_by = $2,
          locked_until = $3,
          started_at = COALESCE(queue.started_at, $1),
          updated_at = $1
        FROM next_item
        WHERE queue.id = next_item.id
        RETURNING queue.*
      `,
      [nowIso, workerId, lockedUntil],
    );
    return result.rows[0] ? fromSimpleRunQueueRow(result.rows[0]) : undefined;
  }

  const db = getSqliteDatabase();
  let claimed: SimpleRunQueueItem | undefined;
  runSqliteTransaction(db, () => {
    const row = db.prepare(`
      SELECT *
      FROM simple_run_queue
      WHERE status = 'queued'
        AND run_after <= ?
        AND attempts < max_attempts
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(nowIso) as SimpleRunQueueRow | undefined;
    if (!row) return;
    db.prepare(`
      UPDATE simple_run_queue
      SET status = 'running',
          attempts = attempts + 1,
          locked_by = ?,
          locked_until = ?,
          started_at = COALESCE(started_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(workerId, lockedUntil, nowIso, nowIso, row.id);
    const nextRow = db.prepare("SELECT * FROM simple_run_queue WHERE id = ?").get(row.id) as SimpleRunQueueRow;
    claimed = fromSimpleRunQueueRow(nextRow);
  });
  return claimed;
}

export async function heartbeatSimpleRunQueueItem(queueId: string, workerId: string, lockMs = 5 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  const nowIso = now.toISOString();

  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE simple_run_queue
        SET locked_until = $1, updated_at = $2
        WHERE id = $3 AND locked_by = $4 AND status = 'running'
      `,
      [lockedUntil, nowIso, queueId, workerId],
    );
    return;
  }

  getSqliteDatabase().prepare(`
    UPDATE simple_run_queue
    SET locked_until = ?, updated_at = ?
    WHERE id = ? AND locked_by = ? AND status = 'running'
  `).run(lockedUntil, nowIso, queueId, workerId);
}

export async function completeSimpleRunQueueItem(queueId: string, workerId: string) {
  await updateSimpleRunQueueTerminalStatus(queueId, workerId, "completed");
}

export async function failSimpleRunQueueItem(queueId: string, workerId: string, error: string) {
  await updateSimpleRunQueueTerminalStatus(queueId, workerId, "failed", error);
}

export async function failSimpleRunQueueItemByRunId(runId: string, error: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();

  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE simple_run_queue
        SET status = 'failed',
            locked_by = NULL,
            locked_until = NULL,
            completed_at = $1,
            updated_at = $1,
            error = $2
        WHERE run_id = $3 AND status IN ('queued', 'running', 'paused')
      `,
      [now, error, runId],
    );
    return;
  }

  getSqliteDatabase().prepare(`
    UPDATE simple_run_queue
    SET status = 'failed',
        locked_by = NULL,
        locked_until = NULL,
        completed_at = ?,
        updated_at = ?,
        error = ?
    WHERE run_id = ? AND status IN ('queued', 'running', 'paused')
  `).run(now, now, error, runId);
}

export async function pauseQueuedSimpleRunQueueItemByRunId(runId: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `UPDATE simple_run_queue SET status='paused',updated_at=$1 WHERE run_id=$2 AND status='queued'`,
      [now, runId],
    );
    return;
  }
  getSqliteDatabase().prepare("UPDATE simple_run_queue SET status='paused',updated_at=? WHERE run_id=? AND status='queued'").run(now, runId);
}

export async function pauseClaimedSimpleRunQueueItem(queueId: string, workerId: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `UPDATE simple_run_queue SET status='paused',locked_by=NULL,locked_until=NULL,updated_at=$1 WHERE id=$2 AND locked_by=$3 AND status='running'`,
      [now, queueId, workerId],
    );
    return;
  }
  getSqliteDatabase().prepare(
    "UPDATE simple_run_queue SET status='paused',locked_by=NULL,locked_until=NULL,updated_at=? WHERE id=? AND locked_by=? AND status='running'",
  ).run(now, queueId, workerId);
}

export async function resumeSimpleRunQueueItemByRunId(runId: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE simple_run_queue SET status='queued',attempts=0,run_after=$1,locked_by=NULL,locked_until=NULL,completed_at=NULL,error=NULL,updated_at=$1 WHERE run_id=$2 AND status='paused'`,
      [now, runId],
    );
    if (!result.rowCount) throw new Error(`Simple run ${runId} does not have paused queue work.`);
    return;
  }
  const result = getSqliteDatabase().prepare(
    "UPDATE simple_run_queue SET status='queued',attempts=0,run_after=?,locked_by=NULL,locked_until=NULL,completed_at=NULL,error=NULL,updated_at=? WHERE run_id=? AND status='paused'",
  ).run(now, now, runId) as { changes: number };
  if (!result.changes) throw new Error(`Simple run ${runId} does not have paused queue work.`);
}

export async function createOriginalBatchRecords(batch: OriginalBatch, items: OriginalBatchItem[], queueItems: OriginalBatchQueueItem[]) {
  await ensureDatabaseReady();
  if (items.length !== queueItems.length) throw new Error("Original batch items and queue items must have equal length.");
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO original_batches (id, owner_user_id, status, created_at, updated_at, data_json)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [batch.id, batch.ownerUserId, batch.status, batch.createdAt, batch.updatedAt, toJson(batch)],
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO original_batch_items (id, batch_id, owner_user_id, ordinal, status, created_at, updated_at, data_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [item.id, item.batchId, item.ownerUserId, item.ordinal, item.status, item.createdAt, item.updatedAt, toJson(item)],
        );
      }
      for (const queueItem of queueItems) {
        await client.query(
          `INSERT INTO original_batch_queue (
             id,batch_id,item_id,owner_user_id,status,priority,attempts,max_attempts,run_after,
             locked_by,locked_until,created_at,updated_at,started_at,completed_at,error,data_json
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10,$11,NULL,NULL,NULL,$12::jsonb)`,
          [queueItem.id, queueItem.batchId, queueItem.itemId, queueItem.ownerUserId, queueItem.status, queueItem.priority, queueItem.attempts, queueItem.maxAttempts, queueItem.runAfter, queueItem.createdAt, queueItem.updatedAt, toJson(queueItem)],
        );
      }
      await client.query("COMMIT");
      return;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    db.prepare("INSERT INTO original_batches (id,owner_user_id,status,created_at,updated_at,data_json) VALUES (?,?,?,?,?,?)")
      .run(batch.id, batch.ownerUserId, batch.status, batch.createdAt, batch.updatedAt, toJson(batch));
    const itemStatement = db.prepare("INSERT INTO original_batch_items (id,batch_id,owner_user_id,ordinal,status,created_at,updated_at,data_json) VALUES (?,?,?,?,?,?,?,?)");
    items.forEach((item) => itemStatement.run(item.id, item.batchId, item.ownerUserId, item.ordinal, item.status, item.createdAt, item.updatedAt, toJson(item)));
    const queueStatement = db.prepare(`INSERT INTO original_batch_queue (
      id,batch_id,item_id,owner_user_id,status,priority,attempts,max_attempts,run_after,
      locked_by,locked_until,created_at,updated_at,started_at,completed_at,error,data_json
    ) VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,NULL,NULL,NULL,?)`);
    queueItems.forEach((item) => queueStatement.run(item.id, item.batchId, item.itemId, item.ownerUserId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item)));
  });
}

export async function listOriginalBatchesFromDb(limit = 30, offset = 0) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM original_batches ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
    return result.rows.map((row) => fromJson<OriginalBatch>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM original_batches ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset) as JsonRow[];
  return rows.map((row) => fromJson<OriginalBatch>(row.data_json));
}

export async function getOriginalBatchFromDb(batchId: string) {
  await ensureDatabaseReady();
  const row = getDatabaseBackend() === "postgres"
    ? (await getPostgresPool().query<JsonRow>("SELECT data_json FROM original_batches WHERE id = $1", [batchId])).rows[0]
    : getSqliteDatabase().prepare("SELECT data_json FROM original_batches WHERE id = ?").get(batchId) as JsonRow | undefined;
  return row ? fromJson<OriginalBatch>(row.data_json) : undefined;
}

export async function listOriginalBatchItemsFromDb(batchId: string) {
  await ensureDatabaseReady();
  const rows = getDatabaseBackend() === "postgres"
    ? (await getPostgresPool().query<JsonRow>("SELECT data_json FROM original_batch_items WHERE batch_id = $1 ORDER BY ordinal ASC", [batchId])).rows
    : getSqliteDatabase().prepare("SELECT data_json FROM original_batch_items WHERE batch_id = ? ORDER BY ordinal ASC").all(batchId) as JsonRow[];
  return rows.map((row) => fromJson<OriginalBatchItem>(row.data_json));
}

export async function getOriginalBatchItemFromDb(itemId: string) {
  await ensureDatabaseReady();
  const row = getDatabaseBackend() === "postgres"
    ? (await getPostgresPool().query<JsonRow>("SELECT data_json FROM original_batch_items WHERE id = $1", [itemId])).rows[0]
    : getSqliteDatabase().prepare("SELECT data_json FROM original_batch_items WHERE id = ?").get(itemId) as JsonRow | undefined;
  return row ? fromJson<OriginalBatchItem>(row.data_json) : undefined;
}

export async function saveOriginalBatchToDb(batch: OriginalBatch) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO original_batches (id,owner_user_id,status,created_at,updated_at,data_json)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,data_json=excluded.data_json`,
      [batch.id, batch.ownerUserId, batch.status, batch.createdAt, batch.updatedAt, toJson(batch)],
    );
  } else {
    getSqliteDatabase().prepare(`INSERT INTO original_batches (id,owner_user_id,status,created_at,updated_at,data_json)
      VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,data_json=excluded.data_json`)
      .run(batch.id, batch.ownerUserId, batch.status, batch.createdAt, batch.updatedAt, toJson(batch));
  }
  return batch;
}

export async function saveOriginalBatchItemToDb(item: OriginalBatchItem) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO original_batch_items (id,batch_id,owner_user_id,ordinal,status,created_at,updated_at,data_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,data_json=excluded.data_json`,
      [item.id, item.batchId, item.ownerUserId, item.ordinal, item.status, item.createdAt, item.updatedAt, toJson(item)],
    );
  } else {
    getSqliteDatabase().prepare(`INSERT INTO original_batch_items (id,batch_id,owner_user_id,ordinal,status,created_at,updated_at,data_json)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,data_json=excluded.data_json`)
      .run(item.id, item.batchId, item.ownerUserId, item.ordinal, item.status, item.createdAt, item.updatedAt, toJson(item));
  }
  return item;
}

export async function claimNextOriginalBatchQueueItem(workerId: string, lockMs = 5 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<OriginalBatchQueueRow>(
      `WITH next_item AS (
         SELECT queue.id FROM original_batch_queue queue
         JOIN original_batches batch ON batch.id = queue.batch_id
         WHERE queue.status='queued' AND queue.run_after <= $1 AND queue.attempts < queue.max_attempts
           AND batch.status IN ('queued','running')
         ORDER BY queue.priority DESC, queue.created_at ASC LIMIT 1 FOR UPDATE OF queue SKIP LOCKED
       )
       UPDATE original_batch_queue queue SET status='running',attempts=queue.attempts+1,locked_by=$2,locked_until=$3,
         started_at=COALESCE(queue.started_at,$1),updated_at=$1
       FROM next_item WHERE queue.id=next_item.id RETURNING queue.*`,
      [nowIso, workerId, lockedUntil],
    );
    return result.rows[0] ? fromOriginalBatchQueueRow(result.rows[0]) : undefined;
  }
  const db = getSqliteDatabase();
  let claimed: OriginalBatchQueueItem | undefined;
  runSqliteTransaction(db, () => {
    const row = db.prepare(`SELECT queue.* FROM original_batch_queue queue
      JOIN original_batches batch ON batch.id=queue.batch_id
      WHERE queue.status='queued' AND queue.run_after <= ? AND queue.attempts < queue.max_attempts
        AND batch.status IN ('queued','running')
      ORDER BY queue.priority DESC,queue.created_at ASC LIMIT 1`).get(nowIso) as OriginalBatchQueueRow | undefined;
    if (!row) return;
    db.prepare(`UPDATE original_batch_queue SET status='running',attempts=attempts+1,locked_by=?,locked_until=?,
      started_at=COALESCE(started_at,?),updated_at=? WHERE id=?`).run(workerId, lockedUntil, nowIso, nowIso, row.id);
    const next = db.prepare("SELECT * FROM original_batch_queue WHERE id=?").get(row.id) as OriginalBatchQueueRow;
    claimed = fromOriginalBatchQueueRow(next);
  });
  return claimed;
}

export async function heartbeatOriginalBatchQueueItem(queueId: string, workerId: string, lockMs = 5 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("UPDATE original_batch_queue SET locked_until=$1,updated_at=$2 WHERE id=$3 AND locked_by=$4 AND status='running'", [lockedUntil, nowIso, queueId, workerId]);
  } else {
    getSqliteDatabase().prepare("UPDATE original_batch_queue SET locked_until=?,updated_at=? WHERE id=? AND locked_by=? AND status='running'").run(lockedUntil, nowIso, queueId, workerId);
  }
}

export async function completeOriginalBatchQueueItem(queueId: string, workerId: string) {
  return updateOriginalBatchQueueTerminalStatus(queueId, workerId, "completed");
}

export async function failOriginalBatchQueueItem(queueId: string, workerId: string, error: string) {
  return updateOriginalBatchQueueTerminalStatus(queueId, workerId, "failed", error);
}

export async function cancelOriginalBatchQueueItem(queueId: string, workerId: string) {
  return updateOriginalBatchQueueTerminalStatus(queueId, workerId, "cancelled", "Batch cancelled");
}

export async function cancelOriginalBatchQueuedItems(batchId: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("UPDATE original_batch_queue SET status='cancelled',completed_at=$1,updated_at=$1,error='Batch cancelled' WHERE batch_id=$2 AND status='queued'", [now, batchId]);
  } else {
    getSqliteDatabase().prepare("UPDATE original_batch_queue SET status='cancelled',completed_at=?,updated_at=?,error='Batch cancelled' WHERE batch_id=? AND status='queued'").run(now, now, batchId);
  }
}

export async function requeueOriginalBatchItem(itemId: string, delayMs = 0) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  const runAfter = new Date(Date.now() + delayMs).toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(`UPDATE original_batch_queue SET status='queued',attempts=0,run_after=$1,locked_by=NULL,locked_until=NULL,
      started_at=NULL,completed_at=NULL,updated_at=$2,error=NULL WHERE item_id=$3`, [runAfter, now, itemId]);
  } else {
    getSqliteDatabase().prepare(`UPDATE original_batch_queue SET status='queued',attempts=0,run_after=?,locked_by=NULL,locked_until=NULL,
      started_at=NULL,completed_at=NULL,updated_at=?,error=NULL WHERE item_id=?`).run(runAfter, now, itemId);
  }
}

export async function requeueExpiredOriginalBatchQueueItemsWithProviderTasks() {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE original_batch_queue queue
       SET status='queued',attempts=0,run_after=$1,locked_by=NULL,locked_until=NULL,
           completed_at=NULL,updated_at=$1,error=NULL
       WHERE queue.status='running' AND queue.locked_until < $1
         AND EXISTS (
           SELECT 1
           FROM original_batch_items item,
             LATERAL jsonb_array_elements(COALESCE(item.data_json->'series'->'cards', '[]'::jsonb)) card
           WHERE item.id=queue.item_id
             AND COALESCE(card->>'providerTaskId', '') <> ''
             AND COALESCE(card->>'providerStatus', 'pending') IN ('pending','queued','in_progress')
         )`,
      [now],
    );
    return Number(result.rowCount || 0);
  }
  const result = getSqliteDatabase().prepare(
    `UPDATE original_batch_queue
     SET status='queued',attempts=0,run_after=?,locked_by=NULL,locked_until=NULL,
         completed_at=NULL,updated_at=?,error=NULL
     WHERE status='running' AND locked_until < ?
       AND EXISTS (
         SELECT 1
         FROM original_batch_items item, json_each(item.data_json, '$.series.cards') card
         WHERE item.id=original_batch_queue.item_id
           AND COALESCE(json_extract(card.value, '$.providerTaskId'), '') <> ''
           AND COALESCE(json_extract(card.value, '$.providerStatus'), 'pending') IN ('pending','queued','in_progress')
       )`,
  ).run(now, now, now) as { changes?: number };
  return Number(result.changes || 0);
}

export async function failExpiredOriginalBatchQueueItems() {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  const error = "Worker lock expired after an ambiguous provider boundary; explicit retry is required.";
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<ExpiredOriginalBatchQueueRow>(
      `UPDATE original_batch_queue SET status='failed',locked_by=NULL,locked_until=NULL,completed_at=$1,updated_at=$1,error=$2
       WHERE status='running' AND locked_until < $1 RETURNING item_id,batch_id`,
      [now, error],
    );
    return result.rows.map((row) => ({ itemId: row.item_id, batchId: row.batch_id, error }));
  }
  const db = getSqliteDatabase();
  let rows: ExpiredOriginalBatchQueueRow[] = [];
  runSqliteTransaction(db, () => {
    rows = db.prepare("SELECT item_id,batch_id FROM original_batch_queue WHERE status='running' AND locked_until < ?").all(now) as ExpiredOriginalBatchQueueRow[];
    db.prepare(`UPDATE original_batch_queue SET status='failed',locked_by=NULL,locked_until=NULL,completed_at=?,updated_at=?,error=?
      WHERE status='running' AND locked_until < ?`).run(now, now, error, now);
  });
  return rows.map((row) => ({ itemId: row.item_id, batchId: row.batch_id, error }));
}

export async function saveImageGenerationQueueJobToDb(job: ImageGenerationQueueJob) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO image_generation_queue (
          id, provider, status, priority, attempts, max_attempts, run_after,
          locked_by, locked_until, created_at, updated_at, started_at,
          completed_at, error, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          provider = excluded.provider,
          status = excluded.status,
          priority = excluded.priority,
          attempts = excluded.attempts,
          max_attempts = excluded.max_attempts,
          run_after = excluded.run_after,
          locked_by = excluded.locked_by,
          locked_until = excluded.locked_until,
          created_at = image_generation_queue.created_at,
          updated_at = excluded.updated_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          error = excluded.error,
          data_json = excluded.data_json
      `,
      [
        job.id,
        job.provider,
        job.status,
        job.priority,
        job.attempts,
        job.maxAttempts,
        job.runAfter,
        job.lockedBy || null,
        job.lockedUntil || null,
        job.createdAt,
        job.updatedAt,
        job.startedAt || null,
        job.completedAt || null,
        job.error || null,
        toJson(job),
      ],
    );
    return job;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO image_generation_queue (
      id, provider, status, priority, attempts, max_attempts, run_after,
      locked_by, locked_until, created_at, updated_at, started_at,
      completed_at, error, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      status = excluded.status,
      priority = excluded.priority,
      attempts = excluded.attempts,
      max_attempts = excluded.max_attempts,
      run_after = excluded.run_after,
      locked_by = excluded.locked_by,
      locked_until = excluded.locked_until,
      created_at = image_generation_queue.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      error = excluded.error,
      data_json = excluded.data_json
  `).run(
    job.id,
    job.provider,
    job.status,
    job.priority,
    job.attempts,
    job.maxAttempts,
    job.runAfter,
    job.lockedBy || null,
    job.lockedUntil || null,
    job.createdAt,
    job.updatedAt,
    job.startedAt || null,
    job.completedAt || null,
    job.error || null,
    toJson(job),
  );
  return job;
}

export async function getImageGenerationQueueJobFromDb(jobId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<ImageGenerationQueueRow>("SELECT * FROM image_generation_queue WHERE id = $1", [jobId]);
    return result.rows[0] ? fromImageGenerationQueueRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM image_generation_queue WHERE id = ?").get(jobId) as ImageGenerationQueueRow | undefined;
  return row ? fromImageGenerationQueueRow(row) : undefined;
}

export async function getLarkTaskLaunchByMessageId(messageId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<LarkTaskLaunchRow>("SELECT * FROM lark_task_launches WHERE message_id = $1", [messageId]);
    return result.rows[0] ? fromLarkTaskLaunchRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM lark_task_launches WHERE message_id = ?").get(messageId) as LarkTaskLaunchRow | undefined;
  return row ? fromLarkTaskLaunchRow(row) : undefined;
}

export async function saveLarkTaskLaunchToDb(launch: LarkTaskLaunch) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO lark_task_launches (
          id, message_id, chat_id, sender_id, owner_user_id, run_id,
          status, created_at, updated_at, error, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT(message_id) DO UPDATE SET
          chat_id = excluded.chat_id,
          sender_id = excluded.sender_id,
          owner_user_id = excluded.owner_user_id,
          run_id = COALESCE(lark_task_launches.run_id, excluded.run_id),
          status = excluded.status,
          updated_at = excluded.updated_at,
          error = excluded.error,
          data_json = excluded.data_json
      `,
      [
        launch.id,
        launch.messageId,
        launch.chatId,
        launch.senderId,
        launch.ownerUserId || null,
        launch.runId || null,
        launch.status,
        launch.createdAt,
        launch.updatedAt,
        launch.error || null,
        toJson(launch),
      ],
    );
    return launch;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO lark_task_launches (
      id, message_id, chat_id, sender_id, owner_user_id, run_id,
      status, created_at, updated_at, error, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      chat_id = excluded.chat_id,
      sender_id = excluded.sender_id,
      owner_user_id = excluded.owner_user_id,
      run_id = COALESCE(lark_task_launches.run_id, excluded.run_id),
      status = excluded.status,
      updated_at = excluded.updated_at,
      error = excluded.error,
      data_json = excluded.data_json
  `).run(
    launch.id,
    launch.messageId,
    launch.chatId,
    launch.senderId,
    launch.ownerUserId || null,
    launch.runId || null,
    launch.status,
    launch.createdAt,
    launch.updatedAt,
    launch.error || null,
    toJson(launch),
  );
  return launch;
}

export async function saveFeishuPublishJobToDb(job: FeishuPublishJob) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO feishu_publish_queue (
          id, owner_user_id, source, source_run_id, status, priority,
          attempts, max_attempts, run_after, locked_by, locked_until,
          created_at, updated_at, started_at, completed_at, error, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          source = excluded.source,
          source_run_id = excluded.source_run_id,
          status = excluded.status,
          priority = excluded.priority,
          attempts = excluded.attempts,
          max_attempts = excluded.max_attempts,
          run_after = excluded.run_after,
          locked_by = excluded.locked_by,
          locked_until = excluded.locked_until,
          created_at = feishu_publish_queue.created_at,
          updated_at = excluded.updated_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          error = excluded.error,
          data_json = excluded.data_json
      `,
      [
        job.id,
        job.ownerUserId,
        job.source,
        job.sourceRunId || null,
        job.status,
        job.priority,
        job.attempts,
        job.maxAttempts,
        job.runAfter,
        job.lockedBy || null,
        job.lockedUntil || null,
        job.createdAt,
        job.updatedAt,
        job.startedAt || null,
        job.completedAt || null,
        job.error || null,
        toJson(job),
      ],
    );
    return job;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO feishu_publish_queue (
      id, owner_user_id, source, source_run_id, status, priority,
      attempts, max_attempts, run_after, locked_by, locked_until,
      created_at, updated_at, started_at, completed_at, error, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_user_id = excluded.owner_user_id,
      source = excluded.source,
      source_run_id = excluded.source_run_id,
      status = excluded.status,
      priority = excluded.priority,
      attempts = excluded.attempts,
      max_attempts = excluded.max_attempts,
      run_after = excluded.run_after,
      locked_by = excluded.locked_by,
      locked_until = excluded.locked_until,
      created_at = feishu_publish_queue.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      error = excluded.error,
      data_json = excluded.data_json
  `).run(
    job.id,
    job.ownerUserId,
    job.source,
    job.sourceRunId || null,
    job.status,
    job.priority,
    job.attempts,
    job.maxAttempts,
    job.runAfter,
    job.lockedBy || null,
    job.lockedUntil || null,
    job.createdAt,
    job.updatedAt,
    job.startedAt || null,
    job.completedAt || null,
    job.error || null,
    toJson(job),
  );
  return job;
}

export async function readFeishuPublishJobsFromDb(limit = 50) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<FeishuPublishQueueRow>(
      `
        SELECT *
        FROM feishu_publish_queue
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map(fromFeishuPublishQueueRow);
  }

  const rows = getSqliteDatabase().prepare(`
    SELECT *
    FROM feishu_publish_queue
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as FeishuPublishQueueRow[];
  return rows.map(fromFeishuPublishQueueRow);
}

export async function getFeishuPublishJobFromDb(jobId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<FeishuPublishQueueRow>("SELECT * FROM feishu_publish_queue WHERE id = $1", [jobId]);
    return result.rows[0] ? fromFeishuPublishQueueRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM feishu_publish_queue WHERE id = ?").get(jobId) as FeishuPublishQueueRow | undefined;
  return row ? fromFeishuPublishQueueRow(row) : undefined;
}

export async function getFeishuPublishQueueContextFromDb(jobId: string) {
  await ensureDatabaseReady();
  const nowIso = new Date().toISOString();

  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<{ queue_ahead: number; active_job_id: string | null }>(
      `
        WITH target AS (
          SELECT owner_user_id, status, priority, created_at
          FROM feishu_publish_queue
          WHERE id = $1
        )
        SELECT
          count(*) FILTER (
            WHERE queue_item.id <> $1
              AND (
                (
                  queue_item.status = 'running'
                  AND (queue_item.locked_until IS NULL OR queue_item.locked_until > $2)
                )
                OR (
                  target.status = 'queued'
                  AND queue_item.status = 'queued'
                  AND (
                    queue_item.priority > target.priority
                    OR (queue_item.priority = target.priority AND queue_item.created_at < target.created_at)
                  )
                )
              )
          )::int AS queue_ahead,
          min(queue_item.id) FILTER (
            WHERE queue_item.status = 'running'
              AND (queue_item.locked_until IS NULL OR queue_item.locked_until > $2)
          ) AS active_job_id
        FROM target
        LEFT JOIN feishu_publish_queue queue_item ON queue_item.owner_user_id = target.owner_user_id
        GROUP BY target.status, target.priority, target.created_at
      `,
      [jobId, nowIso],
    );
    return {
      queueAhead: Number(result.rows[0]?.queue_ahead || 0),
      activeJobId: result.rows[0]?.active_job_id || undefined,
    };
  }

  const db = getSqliteDatabase();
  const target = db.prepare("SELECT * FROM feishu_publish_queue WHERE id = ?").get(jobId) as FeishuPublishQueueRow | undefined;
  if (!target) return { queueAhead: 0, activeJobId: undefined };
  const rows = db.prepare("SELECT * FROM feishu_publish_queue WHERE owner_user_id = ?").all(target.owner_user_id) as FeishuPublishQueueRow[];
  const activeJob = rows
    .filter((row) => row.status === "running" && (!row.locked_until || row.locked_until > nowIso))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
  const queuedAhead =
    target.status === "queued"
      ? rows.filter(
          (row) =>
            row.id !== jobId &&
            row.status === "queued" &&
            (row.priority > target.priority || (row.priority === target.priority && row.created_at < target.created_at)),
        ).length
      : 0;
  return {
    queueAhead: queuedAhead + (activeJob && activeJob.id !== jobId ? 1 : 0),
    activeJobId: activeJob?.id,
  };
}

export async function claimNextFeishuPublishQueueItem(workerId: string, lockMs = 10 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();

  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<FeishuPublishQueueRow>(
      `
        WITH next_item AS (
          SELECT id
          FROM feishu_publish_queue
          WHERE status = 'queued'
            AND run_after <= $1
            AND attempts < max_attempts
            AND NOT EXISTS (
              SELECT 1
              FROM feishu_publish_queue running
              WHERE running.owner_user_id = feishu_publish_queue.owner_user_id
                AND running.status = 'running'
                AND (running.locked_until IS NULL OR running.locked_until > $1)
            )
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE feishu_publish_queue queue
        SET
          status = 'running',
          attempts = queue.attempts + 1,
          locked_by = $2,
          locked_until = $3,
          started_at = COALESCE(queue.started_at, $1),
          updated_at = $1
        FROM next_item
        WHERE queue.id = next_item.id
        RETURNING queue.*
      `,
      [nowIso, workerId, lockedUntil],
    );
    return result.rows[0] ? fromFeishuPublishQueueRow(result.rows[0]) : undefined;
  }

  const db = getSqliteDatabase();
  let claimed: FeishuPublishJob | undefined;
  runSqliteTransaction(db, () => {
    const row = db.prepare(`
      SELECT *
      FROM feishu_publish_queue
      WHERE status = 'queued'
        AND run_after <= ?
        AND attempts < max_attempts
        AND NOT EXISTS (
          SELECT 1
          FROM feishu_publish_queue running
          WHERE running.owner_user_id = feishu_publish_queue.owner_user_id
            AND running.status = 'running'
            AND (running.locked_until IS NULL OR running.locked_until > ?)
        )
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(nowIso, nowIso) as FeishuPublishQueueRow | undefined;
    if (!row) return;
    db.prepare(`
      UPDATE feishu_publish_queue
      SET status = 'running',
          attempts = attempts + 1,
          locked_by = ?,
          locked_until = ?,
          started_at = COALESCE(started_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(workerId, lockedUntil, nowIso, nowIso, row.id);
    const nextRow = db.prepare("SELECT * FROM feishu_publish_queue WHERE id = ?").get(row.id) as FeishuPublishQueueRow;
    claimed = fromFeishuPublishQueueRow(nextRow);
  });
  return claimed;
}

export async function heartbeatFeishuPublishQueueItem(queueId: string, workerId: string, lockMs = 10 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  const nowIso = now.toISOString();

  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE feishu_publish_queue
        SET locked_until = $1, updated_at = $2
        WHERE id = $3 AND locked_by = $4 AND status = 'running'
      `,
      [lockedUntil, nowIso, queueId, workerId],
    );
    return;
  }

  getSqliteDatabase().prepare(`
    UPDATE feishu_publish_queue
    SET locked_until = ?, updated_at = ?
    WHERE id = ? AND locked_by = ? AND status = 'running'
  `).run(lockedUntil, nowIso, queueId, workerId);
}

export async function saveDistributionCheckJobToDb(job: DistributionCheckJob) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO distribution_check_jobs (
          id, owner_user_id, status, priority, attempts, max_attempts,
          run_after, locked_by, locked_until, created_at, updated_at,
          started_at, completed_at, error, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          status = excluded.status,
          priority = excluded.priority,
          attempts = excluded.attempts,
          max_attempts = excluded.max_attempts,
          run_after = excluded.run_after,
          locked_by = excluded.locked_by,
          locked_until = excluded.locked_until,
          created_at = distribution_check_jobs.created_at,
          updated_at = excluded.updated_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          error = excluded.error,
          data_json = excluded.data_json
      `,
      [
        job.id,
        job.ownerUserId,
        job.status,
        job.priority,
        job.attempts,
        job.maxAttempts,
        job.runAfter,
        job.lockedBy || null,
        job.lockedUntil || null,
        job.createdAt,
        job.updatedAt,
        job.startedAt || null,
        job.completedAt || null,
        job.error || null,
        toJson(job),
      ],
    );
    return job;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO distribution_check_jobs (
      id, owner_user_id, status, priority, attempts, max_attempts,
      run_after, locked_by, locked_until, created_at, updated_at,
      started_at, completed_at, error, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_user_id = excluded.owner_user_id,
      status = excluded.status,
      priority = excluded.priority,
      attempts = excluded.attempts,
      max_attempts = excluded.max_attempts,
      run_after = excluded.run_after,
      locked_by = excluded.locked_by,
      locked_until = excluded.locked_until,
      created_at = distribution_check_jobs.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      error = excluded.error,
      data_json = excluded.data_json
  `).run(
    job.id,
    job.ownerUserId,
    job.status,
    job.priority,
    job.attempts,
    job.maxAttempts,
    job.runAfter,
    job.lockedBy || null,
    job.lockedUntil || null,
    job.createdAt,
    job.updatedAt,
    job.startedAt || null,
    job.completedAt || null,
    job.error || null,
    toJson(job),
  );
  return job;
}

export async function readDistributionCheckJobsFromDb(limit = 30) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<DistributionCheckJobRow>(
      `
        SELECT *
        FROM distribution_check_jobs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map(fromDistributionCheckJobRow);
  }

  const rows = getSqliteDatabase().prepare(`
    SELECT *
    FROM distribution_check_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as DistributionCheckJobRow[];
  return rows.map(fromDistributionCheckJobRow);
}

export async function getDistributionCheckJobFromDb(jobId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<DistributionCheckJobRow>("SELECT * FROM distribution_check_jobs WHERE id = $1", [jobId]);
    return result.rows[0] ? fromDistributionCheckJobRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM distribution_check_jobs WHERE id = ?").get(jobId) as DistributionCheckJobRow | undefined;
  return row ? fromDistributionCheckJobRow(row) : undefined;
}

export async function claimNextDistributionCheckJob(workerId: string, lockMs = 10 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();

  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<DistributionCheckJobRow>(
      `
        WITH next_item AS (
          SELECT id
          FROM distribution_check_jobs
          WHERE status = 'queued'
            AND run_after <= $1
            AND attempts < max_attempts
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE distribution_check_jobs queue
        SET
          status = 'running',
          attempts = queue.attempts + 1,
          locked_by = $2,
          locked_until = $3,
          started_at = COALESCE(queue.started_at, $1),
          updated_at = $1
        FROM next_item
        WHERE queue.id = next_item.id
        RETURNING queue.*
      `,
      [nowIso, workerId, lockedUntil],
    );
    return result.rows[0] ? fromDistributionCheckJobRow(result.rows[0]) : undefined;
  }

  const db = getSqliteDatabase();
  let claimed: DistributionCheckJob | undefined;
  runSqliteTransaction(db, () => {
    const row = db.prepare(`
      SELECT *
      FROM distribution_check_jobs
      WHERE status = 'queued'
        AND run_after <= ?
        AND attempts < max_attempts
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(nowIso) as DistributionCheckJobRow | undefined;
    if (!row) return;
    db.prepare(`
      UPDATE distribution_check_jobs
      SET status = 'running',
          attempts = attempts + 1,
          locked_by = ?,
          locked_until = ?,
          started_at = COALESCE(started_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(workerId, lockedUntil, nowIso, nowIso, row.id);
    const nextRow = db.prepare("SELECT * FROM distribution_check_jobs WHERE id = ?").get(row.id) as DistributionCheckJobRow;
    claimed = fromDistributionCheckJobRow(nextRow);
  });
  return claimed;
}

export async function heartbeatDistributionCheckJob(queueId: string, workerId: string, lockMs = 10 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  const nowIso = now.toISOString();

  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE distribution_check_jobs
        SET locked_until = $1, updated_at = $2
        WHERE id = $3 AND locked_by = $4 AND status = 'running'
      `,
      [lockedUntil, nowIso, queueId, workerId],
    );
    return;
  }

  getSqliteDatabase().prepare(`
    UPDATE distribution_check_jobs
    SET locked_until = ?, updated_at = ?
    WHERE id = ? AND locked_by = ? AND status = 'running'
  `).run(lockedUntil, nowIso, queueId, workerId);
}

export async function countWorkspaceAccountsInDb() {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<CountRow>("SELECT COUNT(*)::int AS count FROM workspace_accounts");
    return Number(result.rows[0]?.count || 0);
  }

  const row = getSqliteDatabase().prepare("SELECT COUNT(*) AS count FROM workspace_accounts").get() as CountRow | undefined;
  return Number(row?.count || 0);
}

export async function readWorkspaceAccountsFromDb(): Promise<WorkspaceAccountRecord[]> {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<WorkspaceAccountRow>("SELECT * FROM workspace_accounts ORDER BY created_at ASC");
    return result.rows.map(fromWorkspaceAccountRow);
  }

  const rows = getSqliteDatabase().prepare("SELECT * FROM workspace_accounts ORDER BY created_at ASC").all() as WorkspaceAccountRow[];
  return rows.map(fromWorkspaceAccountRow);
}

export async function getWorkspaceAccountByIdFromDb(accountId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<WorkspaceAccountRow>("SELECT * FROM workspace_accounts WHERE id = $1", [accountId]);
    return result.rows[0] ? fromWorkspaceAccountRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM workspace_accounts WHERE id = ?").get(accountId) as WorkspaceAccountRow | undefined;
  return row ? fromWorkspaceAccountRow(row) : undefined;
}

export async function getWorkspaceAccountByUsernameFromDb(username: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<WorkspaceAccountRow>("SELECT * FROM workspace_accounts WHERE username = $1", [username]);
    return result.rows[0] ? fromWorkspaceAccountRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM workspace_accounts WHERE username = ?").get(username) as WorkspaceAccountRow | undefined;
  return row ? fromWorkspaceAccountRow(row) : undefined;
}

export async function saveWorkspaceAccountToDb(account: WorkspaceAccountRecord) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO workspace_accounts (
          id, username, display_name, password_hash, role, status,
          created_at, updated_at, last_login_at, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          password_hash = excluded.password_hash,
          role = excluded.role,
          status = excluded.status,
          created_at = workspace_accounts.created_at,
          updated_at = excluded.updated_at,
          last_login_at = excluded.last_login_at,
          data_json = excluded.data_json
      `,
      [
        account.id,
        account.username,
        account.displayName,
        account.passwordHash,
        account.role,
        account.status,
        account.createdAt,
        account.updatedAt,
        account.lastLoginAt || null,
        toJson(account),
      ],
    );
    return account;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO workspace_accounts (
      id, username, display_name, password_hash, role, status,
      created_at, updated_at, last_login_at, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      password_hash = excluded.password_hash,
      role = excluded.role,
      status = excluded.status,
      created_at = workspace_accounts.created_at,
      updated_at = excluded.updated_at,
      last_login_at = excluded.last_login_at,
      data_json = excluded.data_json
  `).run(
    account.id,
    account.username,
    account.displayName,
    account.passwordHash,
    account.role,
    account.status,
    account.createdAt,
    account.updatedAt,
    account.lastLoginAt || null,
    toJson(account),
  );
  return account;
}

export async function saveWorkspaceSessionToDb(session: WorkspaceSession) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO workspace_sessions (
          id, account_id, token_hash, created_at, expires_at,
          last_seen_at, revoked_at, data_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          account_id = excluded.account_id,
          token_hash = excluded.token_hash,
          expires_at = excluded.expires_at,
          last_seen_at = excluded.last_seen_at,
          revoked_at = excluded.revoked_at,
          data_json = excluded.data_json
      `,
      [
        session.id,
        session.accountId,
        session.tokenHash,
        session.createdAt,
        session.expiresAt,
        session.lastSeenAt || null,
        session.revokedAt || null,
        toJson(session),
      ],
    );
    return session;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO workspace_sessions (
      id, account_id, token_hash, created_at, expires_at,
      last_seen_at, revoked_at, data_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      last_seen_at = excluded.last_seen_at,
      revoked_at = excluded.revoked_at,
      data_json = excluded.data_json
  `).run(
    session.id,
    session.accountId,
    session.tokenHash,
    session.createdAt,
    session.expiresAt,
    session.lastSeenAt || null,
    session.revokedAt || null,
    toJson(session),
  );
  return session;
}

export async function getWorkspaceSessionByTokenHashFromDb(tokenHash: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<WorkspaceSessionRow>("SELECT * FROM workspace_sessions WHERE token_hash = $1", [tokenHash]);
    return result.rows[0] ? fromWorkspaceSessionRow(result.rows[0]) : undefined;
  }

  const row = getSqliteDatabase().prepare("SELECT * FROM workspace_sessions WHERE token_hash = ?").get(tokenHash) as WorkspaceSessionRow | undefined;
  return row ? fromWorkspaceSessionRow(row) : undefined;
}

export async function touchWorkspaceSessionInDb(sessionId: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE workspace_sessions
        SET last_seen_at = $1,
            data_json = jsonb_set(data_json, '{lastSeenAt}', to_jsonb($2::text), true)
        WHERE id = $3 AND revoked_at IS NULL
      `,
      [now, now, sessionId],
    );
    return;
  }

  const session = getSqliteDatabase().prepare("SELECT * FROM workspace_sessions WHERE id = ?").get(sessionId) as WorkspaceSessionRow | undefined;
  if (!session || session.revoked_at) return;
  const data = {
    ...fromWorkspaceSessionRow(session),
    lastSeenAt: now,
  };
  getSqliteDatabase().prepare(`
    UPDATE workspace_sessions
    SET last_seen_at = ?, data_json = ?
    WHERE id = ? AND revoked_at IS NULL
  `).run(now, toJson(data), sessionId);
}

export async function revokeWorkspaceSessionByTokenHashInDb(tokenHash: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE workspace_sessions
        SET revoked_at = $1,
            data_json = jsonb_set(data_json, '{revokedAt}', to_jsonb($2::text), true)
        WHERE token_hash = $3 AND revoked_at IS NULL
      `,
      [now, now, tokenHash],
    );
    return;
  }

  const session = getSqliteDatabase().prepare("SELECT * FROM workspace_sessions WHERE token_hash = ?").get(tokenHash) as WorkspaceSessionRow | undefined;
  if (!session || session.revoked_at) return;
  const data = {
    ...fromWorkspaceSessionRow(session),
    revokedAt: now,
  };
  getSqliteDatabase().prepare(`
    UPDATE workspace_sessions
    SET revoked_at = ?, data_json = ?
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(now, toJson(data), tokenHash);
}

export async function revokeWorkspaceSessionsByAccountIdInDb(accountId: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE workspace_sessions
        SET revoked_at = $1,
            data_json = jsonb_set(data_json, '{revokedAt}', to_jsonb($2::text), true)
        WHERE account_id = $3 AND revoked_at IS NULL
      `,
      [now, now, accountId],
    );
    return;
  }

  const rows = getSqliteDatabase()
    .prepare("SELECT * FROM workspace_sessions WHERE account_id = ? AND revoked_at IS NULL")
    .all(accountId) as WorkspaceSessionRow[];
  if (!rows.length) return;
  const update = getSqliteDatabase().prepare(`
    UPDATE workspace_sessions
    SET revoked_at = ?, data_json = ?
    WHERE id = ? AND revoked_at IS NULL
  `);
  rows.forEach((session) => {
    update.run(
      now,
      toJson({
        ...fromWorkspaceSessionRow(session),
        revokedAt: now,
      }),
      session.id,
    );
  });
}

export async function readAppMetaValue(key: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<{ value?: string }>("SELECT value FROM app_meta WHERE key = $1", [key]);
    return result.rows[0]?.value;
  }
  return getSqliteMeta(getSqliteDatabase(), key);
}

export async function writeAppMetaValue(key: string, value: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO app_meta (key, value, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
      [key, value, new Date().toISOString()],
    );
    return;
  }
  setSqliteMeta(getSqliteDatabase(), key, value);
}

export async function compareAndSetAppMetaValue(key: string, expectedValue: string | undefined, value: string) {
  await ensureDatabaseReady();
  const updatedAt = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    if (expectedValue === undefined) {
      const result = await getPostgresPool().query(
        `INSERT INTO app_meta (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO NOTHING`,
        [key, value, updatedAt],
      );
      return Number(result.rowCount || 0) === 1;
    }
    const result = await getPostgresPool().query(
      `UPDATE app_meta SET value = $1, updated_at = $2 WHERE key = $3 AND value = $4`,
      [value, updatedAt, key, expectedValue],
    );
    return Number(result.rowCount || 0) === 1;
  }
  const db = getSqliteDatabase();
  if (expectedValue === undefined) {
    const result = db.prepare(`INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)`)
      .run(key, value, updatedAt) as { changes?: number };
    return Number(result.changes || 0) === 1;
  }
  const result = db.prepare(`UPDATE app_meta SET value = ?, updated_at = ? WHERE key = ? AND value = ?`)
    .run(value, updatedAt, key, expectedValue) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function writeExecutionLogsToDb(entries: ExecutionLogEntry[]) {
  await replaceJsonRows("execution_logs", entries, (entry) => [
    entry.id,
    entry.scope,
    entry.action,
    entry.status,
    entry.createdAt,
    toJson(entry),
  ]);
}

export async function appendExecutionLogToDb(entry: ExecutionLogEntry, limit = 300) {
  await ensureDatabaseReady();
  const maxRows = Math.max(1, Math.floor(limit));

  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO execution_logs (id, scope, action, status, created_at, data_json)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT(id) DO NOTHING
        `,
        [entry.id, entry.scope, entry.action, entry.status, entry.createdAt, toJson(entry)],
      );
      await client.query(
        `
          DELETE FROM execution_logs
          WHERE id IN (
            SELECT id
            FROM execution_logs
            ORDER BY created_at DESC, id DESC
            OFFSET $1
          )
        `,
        [maxRows],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    db.prepare(`
      INSERT OR IGNORE INTO execution_logs (id, scope, action, status, created_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.scope, entry.action, entry.status, entry.createdAt, toJson(entry));
    db.prepare(`
      DELETE FROM execution_logs
      WHERE id IN (
        SELECT id
        FROM execution_logs
        ORDER BY created_at DESC, id DESC
        LIMIT -1 OFFSET ?
      )
    `).run(maxRows);
  });
}

export async function saveCrawlJobToDb(job: CrawlJob) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO crawl_jobs (id, status, platform, query, created_at, updated_at, data_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          platform = excluded.platform,
          query = excluded.query,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `,
      [job.id, job.status, job.input.platform, job.input.query, job.createdAt, job.updatedAt, toJson(job)],
    );
    return job;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO crawl_jobs (id, status, platform, query, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      platform = excluded.platform,
      query = excluded.query,
      updated_at = excluded.updated_at,
      data_json = excluded.data_json
  `).run(job.id, job.status, job.input.platform, job.input.query, job.createdAt, job.updatedAt, toJson(job));
  return job;
}

export async function getCrawlJobFromDb(jobId: string) {
  return readJsonRowById<CrawlJob>("crawl_jobs", jobId);
}

export async function listCrawlJobsFromDb() {
  return readJsonRows<CrawlJob>("crawl_jobs", "created_at DESC");
}

export async function saveRuntimePostToDb(post: GeneratedPost) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        INSERT INTO runtime_posts (id, source_item_id, platform, status, updated_at, data_json)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT(id) DO UPDATE SET
          source_item_id = excluded.source_item_id,
          platform = excluded.platform,
          status = excluded.status,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `,
      [post.id, post.sourceItemId, post.platform, post.status, post.updatedAt, toJson(post)],
    );
    return post;
  }

  getSqliteDatabase().prepare(`
    INSERT INTO runtime_posts (id, source_item_id, platform, status, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_item_id = excluded.source_item_id,
      platform = excluded.platform,
      status = excluded.status,
      updated_at = excluded.updated_at,
      data_json = excluded.data_json
  `).run(post.id, post.sourceItemId, post.platform, post.status, post.updatedAt, toJson(post));
  return post;
}

export async function getRuntimePostFromDb(postId: string) {
  return readJsonRowById<GeneratedPost>("runtime_posts", postId);
}

export async function listRuntimePostsFromDb() {
  return readJsonRows<GeneratedPost>("runtime_posts", "updated_at DESC");
}

export async function listCanvasWorkflowsFromDb() {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_workflows ORDER BY updated_at DESC");
    return result.rows.map((row) => fromJson<CanvasWorkflow>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM canvas_workflows ORDER BY updated_at DESC").all() as JsonRow[];
  return rows.map((row) => fromJson<CanvasWorkflow>(row.data_json));
}

export async function getCanvasWorkflowFromDb(workflowId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_workflows WHERE id = $1", [workflowId]);
    return result.rows[0] ? fromJson<CanvasWorkflow>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM canvas_workflows WHERE id = ?").get(workflowId) as JsonRow | undefined;
  return row ? fromJson<CanvasWorkflow>(row.data_json) : undefined;
}

export async function createCanvasWorkflowInDb(workflow: CanvasWorkflow) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_workflows (id, owner_user_id, name, revision, is_template, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [workflow.id, workflow.ownerUserId, workflow.name, workflow.revision, workflow.isTemplate, workflow.createdAt, workflow.updatedAt, toJson(workflow)],
    );
    return workflow;
  }
  getSqliteDatabase().prepare(`
    INSERT INTO canvas_workflows (id, owner_user_id, name, revision, is_template, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(workflow.id, workflow.ownerUserId, workflow.name, workflow.revision, workflow.isTemplate ? 1 : 0, workflow.createdAt, workflow.updatedAt, toJson(workflow));
  return workflow;
}

export async function updateCanvasWorkflowInDb(workflow: CanvasWorkflow, expectedRevision: number) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE canvas_workflows
       SET name = $1, revision = $2, is_template = $3, updated_at = $4, data_json = $5::jsonb
       WHERE id = $6 AND owner_user_id = $7 AND revision = $8`,
      [workflow.name, workflow.revision, workflow.isTemplate, workflow.updatedAt, toJson(workflow), workflow.id, workflow.ownerUserId, expectedRevision],
    );
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare(`
    UPDATE canvas_workflows
    SET name = ?, revision = ?, is_template = ?, updated_at = ?, data_json = ?
    WHERE id = ? AND owner_user_id = ? AND revision = ?
  `).run(workflow.name, workflow.revision, workflow.isTemplate ? 1 : 0, workflow.updatedAt, toJson(workflow), workflow.id, workflow.ownerUserId, expectedRevision) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function deleteCanvasWorkflowFromDb(workflowId: string, ownerUserId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query("DELETE FROM canvas_workflows WHERE id = $1 AND owner_user_id = $2", [workflowId, ownerUserId]);
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare("DELETE FROM canvas_workflows WHERE id = ? AND owner_user_id = ?").run(workflowId, ownerUserId) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function listCanvasSchedulesFromDb(limit = 100) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_schedules ORDER BY updated_at DESC LIMIT $1", [limit]);
    return result.rows.map((row) => fromJson<CanvasSchedule>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM canvas_schedules ORDER BY updated_at DESC LIMIT ?").all(limit) as JsonRow[];
  return rows.map((row) => fromJson<CanvasSchedule>(row.data_json));
}

export async function getCanvasScheduleFromDb(scheduleId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_schedules WHERE id = $1", [scheduleId]);
    return result.rows[0] ? fromJson<CanvasSchedule>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM canvas_schedules WHERE id = ?").get(scheduleId) as JsonRow | undefined;
  return row ? fromJson<CanvasSchedule>(row.data_json) : undefined;
}

export async function createCanvasScheduleInDb(schedule: CanvasSchedule) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_schedules (id, owner_user_id, workflow_id, status, revision, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [schedule.id, schedule.ownerUserId, schedule.workflowId, schedule.status, schedule.revision, schedule.createdAt, schedule.updatedAt, toJson(schedule)],
    );
    return schedule;
  }
  getSqliteDatabase().prepare(`
    INSERT INTO canvas_schedules (id, owner_user_id, workflow_id, status, revision, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(schedule.id, schedule.ownerUserId, schedule.workflowId, schedule.status, schedule.revision, schedule.createdAt, schedule.updatedAt, toJson(schedule));
  return schedule;
}

export async function updateCanvasScheduleInDb(schedule: CanvasSchedule, expectedRevision: number) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE canvas_schedules SET status = $1, revision = $2, updated_at = $3, data_json = $4::jsonb
       WHERE id = $5 AND owner_user_id = $6 AND revision = $7`,
      [schedule.status, schedule.revision, schedule.updatedAt, toJson(schedule), schedule.id, schedule.ownerUserId, expectedRevision],
    );
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare(`
    UPDATE canvas_schedules SET status = ?, revision = ?, updated_at = ?, data_json = ?
    WHERE id = ? AND owner_user_id = ? AND revision = ?
  `).run(schedule.status, schedule.revision, schedule.updatedAt, toJson(schedule), schedule.id, schedule.ownerUserId, expectedRevision) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function launchCanvasScheduleInDb(schedule: CanvasSchedule, expectedRevision: number, runs: CanvasRun[]) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE canvas_schedules SET status = $1, revision = $2, updated_at = $3, data_json = $4::jsonb
         WHERE id = $5 AND owner_user_id = $6 AND revision = $7`,
        [schedule.status, schedule.revision, schedule.updatedAt, toJson(schedule), schedule.id, schedule.ownerUserId, expectedRevision],
      );
      if (Number(updated.rowCount || 0) !== 1) throw new Error("Canvas schedule revision conflict");
      for (const run of runs) {
        const item = canvasRunQueueItem(run);
        await client.query(
          `INSERT INTO canvas_runs (id, workflow_id, owner_user_id, status, created_at, updated_at, data_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [run.id, run.workflowId, run.ownerUserId, run.status, run.createdAt, run.updatedAt, toJson(run)],
        );
        await client.query(
          `INSERT INTO canvas_run_queue (id, run_id, status, priority, attempts, max_attempts, run_after, created_at, updated_at, data_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item)],
        );
      }
      await client.query("COMMIT");
      return schedule;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    const updated = db.prepare(`
      UPDATE canvas_schedules SET status = ?, revision = ?, updated_at = ?, data_json = ?
      WHERE id = ? AND owner_user_id = ? AND revision = ?
    `).run(schedule.status, schedule.revision, schedule.updatedAt, toJson(schedule), schedule.id, schedule.ownerUserId, expectedRevision) as { changes?: number };
    if (Number(updated.changes || 0) !== 1) throw new Error("Canvas schedule revision conflict");
    const insertRun = db.prepare(`
      INSERT INTO canvas_runs (id, workflow_id, owner_user_id, status, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertQueue = db.prepare(`
      INSERT INTO canvas_run_queue (id, run_id, status, priority, attempts, max_attempts, run_after, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const run of runs) {
      const item = canvasRunQueueItem(run);
      insertRun.run(run.id, run.workflowId, run.ownerUserId, run.status, run.createdAt, run.updatedAt, toJson(run));
      insertQueue.run(item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item));
    }
  });
  return schedule;
}

export async function fanOutCanvasScheduleV2ChildrenInDb(schedule: CanvasSchedule, expectedRevision: number, runs: CanvasRun[]) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE canvas_schedules SET status = $1, revision = $2, updated_at = $3, data_json = $4::jsonb
         WHERE id = $5 AND owner_user_id = $6 AND revision = $7`,
        [schedule.status, schedule.revision, schedule.updatedAt, toJson(schedule), schedule.id, schedule.ownerUserId, expectedRevision],
      );
      if (Number(updated.rowCount || 0) !== 1) throw new Error("Canvas schedule revision conflict");
      for (const run of runs) {
        const item = canvasRunQueueItem(run);
        await client.query(
          `INSERT INTO canvas_runs (id, workflow_id, owner_user_id, status, created_at, updated_at, data_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
           ON CONFLICT(id) DO NOTHING`,
          [run.id, run.workflowId, run.ownerUserId, run.status, run.createdAt, run.updatedAt, toJson(run)],
        );
        await client.query(
          `INSERT INTO canvas_run_queue (id, run_id, status, priority, attempts, max_attempts, run_after, created_at, updated_at, data_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT(run_id) DO NOTHING`,
          [item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item)],
        );
      }
      await client.query("COMMIT");
      return schedule;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    const updated = db.prepare(`
      UPDATE canvas_schedules SET status = ?, revision = ?, updated_at = ?, data_json = ?
      WHERE id = ? AND owner_user_id = ? AND revision = ?
    `).run(schedule.status, schedule.revision, schedule.updatedAt, toJson(schedule), schedule.id, schedule.ownerUserId, expectedRevision) as { changes?: number };
    if (Number(updated.changes || 0) !== 1) throw new Error("Canvas schedule revision conflict");
    const insertRun = db.prepare(`
      INSERT OR IGNORE INTO canvas_runs (id, workflow_id, owner_user_id, status, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertQueue = db.prepare(`
      INSERT OR IGNORE INTO canvas_run_queue (id, run_id, status, priority, attempts, max_attempts, run_after, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const run of runs) {
      const item = canvasRunQueueItem(run);
      insertRun.run(run.id, run.workflowId, run.ownerUserId, run.status, run.createdAt, run.updatedAt, toJson(run));
      insertQueue.run(item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item));
    }
  });
  return schedule;
}

export async function deferCanvasRunQueueItems(runIds: string[], deferred: boolean) {
  await ensureDatabaseReady();
  const ids = Array.from(new Set(runIds.filter(Boolean)));
  if (!ids.length) return 0;
  const runAfter = deferred ? "9999-12-31T23:59:59.999Z" : new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE canvas_run_queue SET run_after = $1, updated_at = $2
       WHERE run_id = ANY($3::text[]) AND status = 'queued'`,
      [runAfter, new Date().toISOString(), ids],
    );
    return Number(result.rowCount || 0);
  }
  const placeholders = ids.map(() => "?").join(",");
  const result = getSqliteDatabase().prepare(
    `UPDATE canvas_run_queue SET run_after = ?, updated_at = ? WHERE run_id IN (${placeholders}) AND status = 'queued'`,
  ).run(runAfter, new Date().toISOString(), ...ids) as { changes?: number };
  return Number(result.changes || 0);
}

export async function deleteCanvasScheduleFromDb(scheduleId: string, ownerUserId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query("DELETE FROM canvas_schedules WHERE id = $1 AND owner_user_id = $2", [scheduleId, ownerUserId]);
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare("DELETE FROM canvas_schedules WHERE id = ? AND owner_user_id = ?").run(scheduleId, ownerUserId) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function listCanvasRunsFromDb(limit = 40) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_runs ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map((row) => fromJson<CanvasRun>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM canvas_runs ORDER BY created_at DESC LIMIT ?").all(limit) as JsonRow[];
  return rows.map((row) => fromJson<CanvasRun>(row.data_json));
}

export async function listCanvasSuccessfulNodeRunsForWorkflowFromDb(workflowId: string) {
  await ensureDatabaseReady();
  type SuccessfulNodeRunRow = { node_run_json: unknown; run_json: unknown };
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<SuccessfulNodeRunRow>(
      `SELECT node_runs.data_json AS node_run_json, canvas_runs.data_json AS run_json
       FROM canvas_node_runs AS node_runs
       JOIN canvas_runs ON canvas_runs.id = node_runs.run_id
       WHERE canvas_runs.workflow_id = $1
         AND node_runs.status IN ('completed', 'reused', 'bypassed')
       ORDER BY canvas_runs.created_at DESC, node_runs.attempt DESC`,
      [workflowId],
    );
    return result.rows.map((row) => ({
      run: fromJson<CanvasRun>(row.run_json),
      nodeRun: fromJson<CanvasNodeRun>(row.node_run_json),
    }));
  }
  const rows = getSqliteDatabase().prepare(
    `SELECT node_runs.data_json AS node_run_json, canvas_runs.data_json AS run_json
     FROM canvas_node_runs AS node_runs
     JOIN canvas_runs ON canvas_runs.id = node_runs.run_id
     WHERE canvas_runs.workflow_id = ?
       AND node_runs.status IN ('completed', 'reused', 'bypassed')
     ORDER BY canvas_runs.created_at DESC, node_runs.attempt DESC`,
  ).all(workflowId) as SuccessfulNodeRunRow[];
  return rows.map((row) => ({
    run: fromJson<CanvasRun>(row.run_json),
    nodeRun: fromJson<CanvasNodeRun>(row.node_run_json),
  }));
}

export async function getCanvasRunFromDb(runId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_runs WHERE id = $1", [runId]);
    return result.rows[0] ? fromJson<CanvasRun>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM canvas_runs WHERE id = ?").get(runId) as JsonRow | undefined;
  return row ? fromJson<CanvasRun>(row.data_json) : undefined;
}

export async function saveCanvasRunToDb(run: CanvasRun) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_runs (id, workflow_id, owner_user_id, status, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, data_json = excluded.data_json`,
      [run.id, run.workflowId, run.ownerUserId, run.status, run.createdAt, run.updatedAt, toJson(run)],
    );
    return run;
  }
  getSqliteDatabase().prepare(`
    INSERT INTO canvas_runs (id, workflow_id, owner_user_id, status, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, data_json = excluded.data_json
  `).run(run.id, run.workflowId, run.ownerUserId, run.status, run.createdAt, run.updatedAt, toJson(run));
  return run;
}

export async function listCanvasNodeRunsFromDb(runId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_node_runs WHERE run_id = $1 ORDER BY node_id ASC, attempt ASC", [runId]);
    return result.rows.map((row) => fromJson<CanvasNodeRun>(row.data_json));
  }
  const rows = getSqliteDatabase().prepare("SELECT data_json FROM canvas_node_runs WHERE run_id = ? ORDER BY node_id ASC, attempt ASC").all(runId) as JsonRow[];
  return rows.map((row) => fromJson<CanvasNodeRun>(row.data_json));
}

export async function getCanvasNodeRunFromDb(nodeRunId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_node_runs WHERE id = $1", [nodeRunId]);
    return result.rows[0] ? fromJson<CanvasNodeRun>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM canvas_node_runs WHERE id = ?").get(nodeRunId) as JsonRow | undefined;
  return row ? fromJson<CanvasNodeRun>(row.data_json) : undefined;
}

export async function saveCanvasNodeRunToDb(nodeRun: CanvasNodeRun) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_node_runs (id, run_id, node_id, node_type, attempt, status, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, data_json = excluded.data_json`,
      [nodeRun.id, nodeRun.runId, nodeRun.nodeId, nodeRun.nodeType, nodeRun.attempt, nodeRun.status, nodeRun.createdAt, nodeRun.updatedAt, toJson(nodeRun)],
    );
    return nodeRun;
  }
  getSqliteDatabase().prepare(`
    INSERT INTO canvas_node_runs (id, run_id, node_id, node_type, attempt, status, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, data_json = excluded.data_json
  `).run(nodeRun.id, nodeRun.runId, nodeRun.nodeId, nodeRun.nodeType, nodeRun.attempt, nodeRun.status, nodeRun.createdAt, nodeRun.updatedAt, toJson(nodeRun));
  return nodeRun;
}

export async function enqueueCanvasRunQueueItem(run: CanvasRun) {
  const item = canvasRunQueueItem(run);
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_run_queue (id, run_id, status, priority, attempts, max_attempts, run_after, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT(run_id) DO NOTHING`,
      [item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item)],
    );
    return item;
  }
  getSqliteDatabase().prepare(`
    INSERT OR IGNORE INTO canvas_run_queue (id, run_id, status, priority, attempts, max_attempts, run_after, created_at, updated_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.runId, item.status, item.priority, item.attempts, item.maxAttempts, item.runAfter, item.createdAt, item.updatedAt, toJson(item));
  return item;
}

function canvasRunQueueItem(run: CanvasRun): CanvasRunQueueItem {
  return {
    id: `canvas-queue-${run.id}`,
    runId: run.id,
    status: "queued",
    priority: 0,
    attempts: 0,
    maxAttempts: 1,
    runAfter: run.createdAt,
    createdAt: run.createdAt,
    updatedAt: run.createdAt,
  };
}

export async function requeueExpiredCanvasRunQueueItemsWithProviderTasks() {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE canvas_run_queue queue
       SET status = 'queued', attempts = 0, run_after = $1, locked_by = NULL, locked_until = NULL,
           completed_at = NULL, error = NULL, updated_at = $1
       WHERE queue.status = 'running' AND queue.locked_until <= $1
         AND EXISTS (
           SELECT 1 FROM canvas_node_runs node_run
           WHERE node_run.run_id = queue.run_id AND node_run.status = 'running'
             AND COALESCE(node_run.data_json->>'providerTaskId', '') <> ''
         )`,
      [now],
    );
    return Number(result.rowCount || 0);
  }
  const result = getSqliteDatabase().prepare(
    `UPDATE canvas_run_queue
     SET status = 'queued', attempts = 0, run_after = ?, locked_by = NULL, locked_until = NULL,
         completed_at = NULL, error = NULL, updated_at = ?
     WHERE status = 'running' AND locked_until <= ?
       AND EXISTS (
         SELECT 1 FROM canvas_node_runs node_run
         WHERE node_run.run_id = canvas_run_queue.run_id AND node_run.status = 'running'
           AND COALESCE(json_extract(node_run.data_json, '$.providerTaskId'), '') <> ''
       )`,
  ).run(now, now, now) as { changes?: number };
  return Number(result.changes || 0);
}

export async function claimNextCanvasRunQueueItem(workerId: string, lockMs = 10 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<CanvasRunQueueRow>(
      `WITH next_item AS (
         SELECT id FROM canvas_run_queue
         WHERE status = 'queued' AND run_after <= $1 AND attempts < max_attempts
         ORDER BY priority DESC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE canvas_run_queue queue
       SET status = 'running', attempts = queue.attempts + 1, locked_by = $2, locked_until = $3,
           started_at = COALESCE(queue.started_at, $1), updated_at = $1
       FROM next_item WHERE queue.id = next_item.id RETURNING queue.*`,
      [nowIso, workerId, lockedUntil],
    );
    return result.rows[0] ? fromCanvasRunQueueRow(result.rows[0]) : undefined;
  }
  const db = getSqliteDatabase();
  let claimed: CanvasRunQueueItem | undefined;
  runSqliteTransaction(db, () => {
    const row = db.prepare(`SELECT * FROM canvas_run_queue WHERE status = 'queued' AND run_after <= ? AND attempts < max_attempts ORDER BY priority DESC, created_at ASC LIMIT 1`).get(nowIso) as CanvasRunQueueRow | undefined;
    if (!row) return;
    db.prepare(`UPDATE canvas_run_queue SET status = 'running', attempts = attempts + 1, locked_by = ?, locked_until = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`).run(workerId, lockedUntil, nowIso, nowIso, row.id);
    claimed = fromCanvasRunQueueRow(db.prepare("SELECT * FROM canvas_run_queue WHERE id = ?").get(row.id) as CanvasRunQueueRow);
  });
  return claimed;
}

export async function heartbeatCanvasRunQueueItem(queueId: string, workerId: string, lockMs = 10 * 60_000) {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();
  const lockedUntil = new Date(now.getTime() + lockMs).toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query("UPDATE canvas_run_queue SET locked_until = $1, updated_at = $2 WHERE id = $3 AND locked_by = $4 AND status = 'running'", [lockedUntil, nowIso, queueId, workerId]);
    return;
  }
  getSqliteDatabase().prepare("UPDATE canvas_run_queue SET locked_until = ?, updated_at = ? WHERE id = ? AND locked_by = ? AND status = 'running'").run(lockedUntil, nowIso, queueId, workerId);
}

export async function finishCanvasRunQueueItem(queueId: string, workerId: string, status: "completed" | "failed" | "cancelled", error?: string) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      "UPDATE canvas_run_queue SET status = $1, locked_by = NULL, locked_until = NULL, completed_at = $2, updated_at = $2, error = $3 WHERE id = $4 AND locked_by = $5",
      [status, now, error || null, queueId, workerId],
    );
    return;
  }
  getSqliteDatabase().prepare("UPDATE canvas_run_queue SET status = ?, locked_by = NULL, locked_until = NULL, completed_at = ?, updated_at = ?, error = ? WHERE id = ? AND locked_by = ?").run(status, now, now, error || null, queueId, workerId);
}

export async function requeueCanvasRunQueueItem(runId: string, delayMs = 0) {
  await ensureDatabaseReady();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const runAfter = new Date(nowDate.getTime() + Math.max(0, delayMs)).toISOString();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE canvas_run_queue SET status = 'queued', attempts = 0, run_after = $1, locked_by = NULL,
       locked_until = NULL, completed_at = NULL, error = NULL, updated_at = $1 WHERE run_id = $2`,
      [runAfter, runId],
    );
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare(
    `UPDATE canvas_run_queue SET status = 'queued', attempts = 0, run_after = ?, locked_by = NULL,
       locked_until = NULL, completed_at = NULL, error = NULL, updated_at = ? WHERE run_id = ?`,
  ).run(runAfter, now, runId) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

async function ensureDatabaseReady() {
  const backend = getDatabaseBackend();
  if (initializationBackend === backend && initializationPromise) return initializationPromise;

  initializationBackend = backend;
  initializationPromise = backend === "postgres" ? initializePostgres() : Promise.resolve(initializeSqlite());
  return initializationPromise;
}

function initializeSqlite() {
  getSqliteDatabase();
}

function getSqliteDatabase() {
  if (sqliteDatabase) return sqliteDatabase;

  mkdirSync(dataDir, { recursive: true });
  const { DatabaseSync } = getNodeSqlite();
  sqliteDatabase = new DatabaseSync(sqliteStorePath);
  configureSqliteDatabase(sqliteDatabase);
  createSqliteSchema(sqliteDatabase);
  retireLegacyMaterialLibrarySqlite(sqliteDatabase);
  migrateLegacyJsonToSqlite(sqliteDatabase);
  return sqliteDatabase;
}

function getNodeSqlite() {
  const getBuiltinModule = (process as typeof process & { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  const sqlite = getBuiltinModule?.("node:sqlite") as { DatabaseSync?: DatabaseSyncConstructor } | undefined;
  if (!sqlite?.DatabaseSync) {
    throw new Error("Node built-in SQLite is unavailable. Use Node.js 24+ or configure DATABASE_URL for PostgreSQL.");
  }
  return { DatabaseSync: sqlite.DatabaseSync };
}

function getPostgresPool() {
  if (postgresPool) return postgresPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL storage.");
  postgresPool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return postgresPool;
}

async function initializePostgres() {
  await getPostgresPool().query(postgresSchemaSql);
  await retireLegacyMaterialLibraryPostgres();
  await migrateLegacyJsonToPostgres();
}

function retireLegacyMaterialLibrarySqlite(db: SqliteDatabase) {
  db.exec("DROP TABLE IF EXISTS material_assets; DROP TABLE IF EXISTS material_folders;");
}

async function retireLegacyMaterialLibraryPostgres() {
  await getPostgresPool().query("DROP TABLE IF EXISTS material_assets; DROP TABLE IF EXISTS material_folders;");
}

async function readJsonRows<T>(table: StoreTable, orderBy?: string, limit?: number): Promise<T[]> {
  await ensureDatabaseReady();
  assertStoreTable(table);

  if (getDatabaseBackend() === "postgres") {
    const sql = [
      `SELECT data_json FROM ${table}`,
      orderBy ? `ORDER BY ${orderBy}` : "",
      typeof limit === "number" ? "LIMIT $1" : "",
    ].filter(Boolean).join(" ");
    const result = await getPostgresPool().query<JsonRow>(sql, typeof limit === "number" ? [limit] : []);
    return result.rows.map((row) => fromJson<T>(row.data_json));
  }

  const sql = [
    `SELECT data_json FROM ${table}`,
    orderBy ? `ORDER BY ${orderBy}` : "",
    typeof limit === "number" ? "LIMIT ?" : "",
  ].filter(Boolean).join(" ");
  const rows = getSqliteDatabase().prepare(sql).all(...(typeof limit === "number" ? [limit] : [])) as JsonRow[];
  return rows.map((row) => fromJson<T>(row.data_json));
}

async function readJsonRowById<T>(table: StoreTable, id: string) {
  await ensureDatabaseReady();
  assertStoreTable(table);

  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>(`SELECT data_json FROM ${table} WHERE id = $1`, [id]);
    return result.rows[0] ? fromJson<T>(result.rows[0].data_json) : undefined;
  }

  const row = getSqliteDatabase().prepare(`SELECT data_json FROM ${table} WHERE id = ?`).get(id) as JsonRow | undefined;
  return row ? fromJson<T>(row.data_json) : undefined;
}

async function replaceJsonRows<T>(table: StoreTable, values: T[], bind: (value: T) => unknown[]) {
  await ensureDatabaseReady();
  assertStoreTable(table);

  if (getDatabaseBackend() === "postgres") {
    await replacePostgresRows(table, values, bind);
    return;
  }

  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    db.prepare(`DELETE FROM ${table}`).run();
    const insert = db.prepare(resolveSqliteInsertSql(table));
    values.forEach((value) => insert.run(...bind(value)));
  });
}

async function replacePostgresRows<T>(table: StoreTable, values: T[], bind: (value: T) => unknown[]) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table}`);
    const insertSql = resolvePostgresInsertSql(table);
    for (const value of values) {
      await client.query(insertSql, bind(value));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateSimpleRunQueueTerminalStatus(
  queueId: string,
  workerId: string,
  status: Extract<SimpleRunQueueItem["status"], "completed" | "failed">,
  error?: string,
) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();

  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `
        UPDATE simple_run_queue
        SET status = $1,
            locked_by = NULL,
            locked_until = NULL,
            completed_at = $2,
            updated_at = $2,
            error = $3
        WHERE id = $4 AND locked_by = $5
      `,
      [status, now, error || null, queueId, workerId],
    );
    return;
  }

  getSqliteDatabase().prepare(`
    UPDATE simple_run_queue
    SET status = ?,
        locked_by = NULL,
        locked_until = NULL,
        completed_at = ?,
        updated_at = ?,
        error = ?
    WHERE id = ? AND locked_by = ?
  `).run(status, now, now, error || null, queueId, workerId);
}

function configureSqliteDatabase(db: SqliteDatabase) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
}

function createSqliteSchema(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_accounts_status ON workspace_accounts(status, created_at ASC);

    CREATE TABLE IF NOT EXISTS workspace_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_sessions_account_id ON workspace_sessions(account_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_sessions_expires_at ON workspace_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS content_projects (
      id TEXT PRIMARY KEY,
      normalized_query TEXT NOT NULL UNIQUE,
      query TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_crawled_at TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_projects_updated_at ON content_projects(updated_at DESC);

    CREATE TABLE IF NOT EXISTS generated_posts (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generated_posts_updated_at ON generated_posts(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_posts_source_item_id ON generated_posts(source_item_id);

    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs(created_at DESC);

    CREATE TABLE IF NOT EXISTS original_batches (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_original_batches_owner_created ON original_batches(owner_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_original_batches_status_updated ON original_batches(status, updated_at ASC);

    CREATE TABLE IF NOT EXISTS original_batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      UNIQUE(batch_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS idx_original_batch_items_batch_ordinal ON original_batch_items(batch_id, ordinal ASC);
    CREATE INDEX IF NOT EXISTS idx_original_batch_items_owner_status ON original_batch_items(owner_user_id, status, updated_at ASC);

    CREATE TABLE IF NOT EXISTS original_batch_queue (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      item_id TEXT NOT NULL UNIQUE,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_original_batch_queue_ready ON original_batch_queue(status, run_after, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_original_batch_queue_batch ON original_batch_queue(batch_id, status);


    CREATE TABLE IF NOT EXISTS execution_logs (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      platform TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

    CREATE TABLE IF NOT EXISTS runtime_posts (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_posts_updated_at ON runtime_posts(updated_at DESC);

    CREATE TABLE IF NOT EXISTS simple_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      keyword TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_simple_runs_created_at ON simple_runs(created_at DESC);

    CREATE TABLE IF NOT EXISTS simple_run_queue (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_simple_run_queue_ready ON simple_run_queue(status, run_after, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_simple_run_queue_run_id ON simple_run_queue(run_id);

    CREATE TABLE IF NOT EXISTS image_generation_queue (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_image_generation_queue_ready ON image_generation_queue(status, run_after, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_image_generation_queue_provider_status ON image_generation_queue(provider, status, created_at ASC);

    CREATE TABLE IF NOT EXISTS feishu_publish_queue (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_run_id TEXT,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feishu_publish_queue_ready ON feishu_publish_queue(status, run_after, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_feishu_publish_queue_owner_status ON feishu_publish_queue(owner_user_id, status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_feishu_publish_queue_source_run_id ON feishu_publish_queue(source_run_id);

    CREATE TABLE IF NOT EXISTS distribution_check_jobs (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_distribution_check_jobs_ready ON distribution_check_jobs(status, run_after, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_distribution_check_jobs_owner_status ON distribution_check_jobs(owner_user_id, status, created_at ASC);

    CREATE TABLE IF NOT EXISTS lark_task_launches (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      owner_user_id TEXT,
      run_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lark_task_launches_message_id ON lark_task_launches(message_id);
    CREATE INDEX IF NOT EXISTS idx_lark_task_launches_run_id ON lark_task_launches(run_id);
    CREATE INDEX IF NOT EXISTS idx_lark_task_launches_created_at ON lark_task_launches(created_at DESC);

    CREATE TABLE IF NOT EXISTS canvas_workflows (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      revision INTEGER NOT NULL,
      is_template INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_workflows_owner_updated ON canvas_workflows(owner_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS canvas_subtitle_presets (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      UNIQUE(owner_user_id, normalized_name)
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_presets_owner_updated ON canvas_subtitle_presets(owner_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS canvas_subtitle_transcript_cache (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_transcript_cache_owner_updated ON canvas_subtitle_transcript_cache(owner_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS canvas_schedules (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_schedules_owner_updated ON canvas_schedules(owner_user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_canvas_schedules_status_updated ON canvas_schedules(status, updated_at ASC);

    CREATE TABLE IF NOT EXISTS canvas_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_runs_owner_created ON canvas_runs(owner_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_canvas_runs_workflow_created ON canvas_runs(workflow_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS canvas_node_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      node_type TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      UNIQUE(run_id, node_id, attempt)
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_node_runs_run_node ON canvas_node_runs(run_id, node_id, attempt ASC);

    CREATE TABLE IF NOT EXISTS canvas_run_queue (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_run_queue_ready ON canvas_run_queue(status, run_after, priority DESC, created_at ASC);

    CREATE TABLE IF NOT EXISTS library_assets (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      public_url TEXT NOT NULL,
      tagging_status TEXT NOT NULL,
      cleanup_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      data_json TEXT NOT NULL,
      UNIQUE(owner_user_id, sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_library_assets_owner_created ON library_assets(owner_user_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_library_assets_visibility_created ON library_assets(visibility, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_library_assets_tagging_status ON library_assets(tagging_status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS library_asset_roles (
      asset_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY(asset_id, role),
      FOREIGN KEY(asset_id) REFERENCES library_assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_asset_roles_role ON library_asset_roles(role, asset_id);

    CREATE TABLE IF NOT EXISTS library_collections (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      relative_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_library_collections_owner_role ON library_collections(owner_user_id, role, parent_id, name);

    CREATE TABLE IF NOT EXISTS library_collection_assets (
      collection_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(collection_id, asset_id),
      FOREIGN KEY(collection_id) REFERENCES library_collections(id) ON DELETE CASCADE,
      FOREIGN KEY(asset_id) REFERENCES library_assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_collection_assets_asset ON library_collection_assets(asset_id, collection_id);

    CREATE TABLE IF NOT EXISTS library_asset_labels (
      asset_id TEXT NOT NULL,
      dimension TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(asset_id, dimension, value),
      FOREIGN KEY(asset_id) REFERENCES library_assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_asset_labels_filter ON library_asset_labels(dimension, value, asset_id);

    CREATE TABLE IF NOT EXISTS library_tagging_jobs (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      data_json TEXT NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES library_assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_tagging_jobs_ready ON library_tagging_jobs(status, run_after, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_library_tagging_jobs_asset ON library_tagging_jobs(asset_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS copy_library_entries (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_copy_library_entries_owner_updated ON copy_library_entries(owner_user_id, updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_copy_library_entries_visibility_updated ON copy_library_entries(visibility, updated_at DESC, id DESC);
  `);
}

const postgresSchemaSql = `
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspace_accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    last_login_at TIMESTAMPTZ,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_workspace_accounts_status ON workspace_accounts(status, created_at ASC);

  CREATE TABLE IF NOT EXISTS workspace_sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_workspace_sessions_account_id ON workspace_sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_workspace_sessions_expires_at ON workspace_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS content_projects (
    id TEXT PRIMARY KEY,
    normalized_query TEXT NOT NULL UNIQUE,
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    last_crawled_at TIMESTAMPTZ,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_content_projects_updated_at ON content_projects(updated_at DESC);

  CREATE TABLE IF NOT EXISTS generated_posts (
    id TEXT PRIMARY KEY,
    source_item_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_generated_posts_updated_at ON generated_posts(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_generated_posts_source_item_id ON generated_posts(source_item_id);

  CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs(created_at DESC);

  CREATE TABLE IF NOT EXISTS original_batches (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_original_batches_owner_created ON original_batches(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_original_batches_status_updated ON original_batches(status, updated_at ASC);

  CREATE TABLE IF NOT EXISTS original_batch_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL,
    UNIQUE(batch_id, ordinal)
  );
  CREATE INDEX IF NOT EXISTS idx_original_batch_items_batch_ordinal ON original_batch_items(batch_id, ordinal ASC);
  CREATE INDEX IF NOT EXISTS idx_original_batch_items_owner_status ON original_batch_items(owner_user_id, status, updated_at ASC);

  CREATE TABLE IF NOT EXISTS original_batch_queue (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    item_id TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_original_batch_queue_ready ON original_batch_queue(status, run_after, priority DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_original_batch_queue_batch ON original_batch_queue(batch_id, status);


  CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS crawl_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    platform TEXT NOT NULL,
    query TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

  CREATE TABLE IF NOT EXISTS runtime_posts (
    id TEXT PRIMARY KEY,
    source_item_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runtime_posts_updated_at ON runtime_posts(updated_at DESC);

  CREATE TABLE IF NOT EXISTS simple_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    keyword TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_simple_runs_created_at ON simple_runs(created_at DESC);

  CREATE TABLE IF NOT EXISTS simple_run_queue (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_simple_run_queue_ready ON simple_run_queue(status, run_after, priority DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_simple_run_queue_run_id ON simple_run_queue(run_id);

  CREATE TABLE IF NOT EXISTS image_generation_queue (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_image_generation_queue_ready ON image_generation_queue(status, run_after, priority DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_image_generation_queue_provider_status ON image_generation_queue(provider, status, created_at ASC);

  CREATE TABLE IF NOT EXISTS feishu_publish_queue (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_run_id TEXT,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feishu_publish_queue_ready ON feishu_publish_queue(status, run_after, priority DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_feishu_publish_queue_owner_status ON feishu_publish_queue(owner_user_id, status, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_feishu_publish_queue_source_run_id ON feishu_publish_queue(source_run_id);

  CREATE TABLE IF NOT EXISTS distribution_check_jobs (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_distribution_check_jobs_ready ON distribution_check_jobs(status, run_after, priority DESC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_distribution_check_jobs_owner_status ON distribution_check_jobs(owner_user_id, status, created_at ASC);

  CREATE TABLE IF NOT EXISTS lark_task_launches (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    owner_user_id TEXT,
    run_id TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lark_task_launches_message_id ON lark_task_launches(message_id);
  CREATE INDEX IF NOT EXISTS idx_lark_task_launches_run_id ON lark_task_launches(run_id);
  CREATE INDEX IF NOT EXISTS idx_lark_task_launches_created_at ON lark_task_launches(created_at DESC);

  CREATE TABLE IF NOT EXISTS canvas_workflows (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    revision INTEGER NOT NULL,
    is_template BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_workflows_owner_updated ON canvas_workflows(owner_user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS canvas_subtitle_presets (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL,
    UNIQUE(owner_user_id, normalized_name)
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_presets_owner_updated ON canvas_subtitle_presets(owner_user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS canvas_subtitle_transcript_cache (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_transcript_cache_owner_updated ON canvas_subtitle_transcript_cache(owner_user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS canvas_schedules (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_schedules_owner_updated ON canvas_schedules(owner_user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_canvas_schedules_status_updated ON canvas_schedules(status, updated_at ASC);

  CREATE TABLE IF NOT EXISTS canvas_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_runs_owner_created ON canvas_runs(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_canvas_runs_workflow_created ON canvas_runs(workflow_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS canvas_node_runs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL,
    UNIQUE(run_id, node_id, attempt)
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_node_runs_run_node ON canvas_node_runs(run_id, node_id, attempt ASC);

  CREATE TABLE IF NOT EXISTS canvas_run_queue (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_canvas_run_queue_ready ON canvas_run_queue(status, run_after, priority DESC, created_at ASC);

  CREATE TABLE IF NOT EXISTS library_assets (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    visibility TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    public_url TEXT NOT NULL,
    tagging_status TEXT NOT NULL,
    cleanup_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    data_json JSONB NOT NULL,
    UNIQUE(owner_user_id, sha256)
  );
  CREATE INDEX IF NOT EXISTS idx_library_assets_owner_created ON library_assets(owner_user_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_library_assets_visibility_created ON library_assets(visibility, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_library_assets_tagging_status ON library_assets(tagging_status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS library_asset_roles (
    asset_id TEXT NOT NULL REFERENCES library_assets(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    PRIMARY KEY(asset_id, role)
  );
  CREATE INDEX IF NOT EXISTS idx_library_asset_roles_role ON library_asset_roles(role, asset_id);

  CREATE TABLE IF NOT EXISTS library_collections (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    relative_path TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_library_collections_owner_role ON library_collections(owner_user_id, role, parent_id, name);

  CREATE TABLE IF NOT EXISTS library_collection_assets (
    collection_id TEXT NOT NULL REFERENCES library_collections(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES library_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(collection_id, asset_id)
  );
  CREATE INDEX IF NOT EXISTS idx_library_collection_assets_asset ON library_collection_assets(asset_id, collection_id);

  CREATE TABLE IF NOT EXISTS library_asset_labels (
    asset_id TEXT NOT NULL REFERENCES library_assets(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(asset_id, dimension, value)
  );
  CREATE INDEX IF NOT EXISTS idx_library_asset_labels_filter ON library_asset_labels(dimension, value, asset_id);

  CREATE TABLE IF NOT EXISTS library_tagging_jobs (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES library_assets(id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_after TIMESTAMPTZ NOT NULL,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_library_tagging_jobs_ready ON library_tagging_jobs(status, run_after, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_library_tagging_jobs_asset ON library_tagging_jobs(asset_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS copy_library_entries (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    visibility TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_copy_library_entries_owner_updated ON copy_library_entries(owner_user_id, updated_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_copy_library_entries_visibility_updated ON copy_library_entries(visibility, updated_at DESC, id DESC);
`;

async function migrateLegacyJsonToPostgres() {
  const pool = getPostgresPool();
  const marker = await pool.query<{ value?: string }>("SELECT value FROM app_meta WHERE key = $1", ["legacy_json_migrated_v1"]);
  if (marker.rows[0]?.value) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if ((await postgresTableCount(client, "content_projects")) === 0) {
      const poolJson = readLegacyJson<{ projects?: ContentProject[] }>("content-pool.json");
      if (Array.isArray(poolJson?.projects)) {
        for (const project of poolJson.projects) {
          await client.query(resolvePostgresInsertSql("content_projects"), [
            project.id,
            project.normalizedQuery,
            project.query,
            project.createdAt,
            project.updatedAt,
            project.lastCrawledAt || null,
            toJson(project),
          ]);
        }
      }
    }

    if ((await postgresTableCount(client, "generated_posts")) === 0) {
      const store = readLegacyJson<{ posts?: GeneratedPost[] }>("generated-posts.json");
      if (Array.isArray(store?.posts)) {
        for (const post of store.posts) {
          await client.query(resolvePostgresInsertSql("generated_posts"), [
            post.id,
            post.sourceItemId,
            post.platform,
            post.status,
            post.createdAt || post.updatedAt,
            post.updatedAt,
            toJson(post),
          ]);
        }
      }
    }

    if ((await postgresTableCount(client, "execution_logs")) === 0) {
      const store = readLegacyJson<{ entries?: ExecutionLogEntry[] }>("execution-log.json");
      if (Array.isArray(store?.entries)) {
        for (const entry of store.entries) {
          await client.query(resolvePostgresInsertSql("execution_logs"), [
            entry.id,
            entry.scope,
            entry.action,
            entry.status,
            entry.createdAt,
            toJson(entry),
          ]);
        }
      }
    }

    await client.query(
      `
        INSERT INTO app_meta (key, value, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
      ["legacy_json_migrated_v1", "true", new Date().toISOString()],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function migrateLegacyJsonToSqlite(db: SqliteDatabase) {
  if (getSqliteMeta(db, "legacy_json_migrated_v1")) return;

  runSqliteTransaction(db, () => {
    if (sqliteTableCount(db, "content_projects") === 0) {
      const pool = readLegacyJson<{ projects?: ContentProject[] }>("content-pool.json");
      if (Array.isArray(pool?.projects)) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO content_projects (id, normalized_query, query, created_at, updated_at, last_crawled_at, data_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const project of pool.projects) {
          insert.run(project.id, project.normalizedQuery, project.query, project.createdAt, project.updatedAt, project.lastCrawledAt || null, toJson(project));
        }
      }
    }

    if (sqliteTableCount(db, "generated_posts") === 0) {
      const store = readLegacyJson<{ posts?: GeneratedPost[] }>("generated-posts.json");
      if (Array.isArray(store?.posts)) writeGeneratedPostsRowsSqlite(db, store.posts);
    }

    if (sqliteTableCount(db, "execution_logs") === 0) {
      const store = readLegacyJson<{ entries?: ExecutionLogEntry[] }>("execution-log.json");
      if (Array.isArray(store?.entries)) writeExecutionRowsSqlite(db, store.entries);
    }

    setSqliteMeta(db, "legacy_json_migrated_v1", "true");
  });
}

function readLegacyJson<T>(fileName: string): T | undefined {
  const filePath = path.join(dataDir, fileName);
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`Legacy JSON migration failed for ${fileName}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

function resolveSqliteInsertSql(table: StoreTable) {
  if (table === "content_projects") {
    return "INSERT INTO content_projects (id, normalized_query, query, created_at, updated_at, last_crawled_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)";
  }
  if (table === "generated_posts") {
    return "INSERT INTO generated_posts (id, source_item_id, platform, status, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)";
  }
  if (table === "batch_jobs") {
    return "INSERT INTO batch_jobs (id, status, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?)";
  }
  if (table === "execution_logs") {
    return "INSERT INTO execution_logs (id, scope, action, status, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)";
  }
  throw new Error(`Unsupported SQLite table: ${table}`);
}

function resolvePostgresInsertSql(table: StoreTable) {
  if (table === "content_projects") {
    return "INSERT INTO content_projects (id, normalized_query, query, created_at, updated_at, last_crawled_at, data_json) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)";
  }
  if (table === "generated_posts") {
    return "INSERT INTO generated_posts (id, source_item_id, platform, status, created_at, updated_at, data_json) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)";
  }
  if (table === "batch_jobs") {
    return "INSERT INTO batch_jobs (id, status, created_at, updated_at, data_json) VALUES ($1, $2, $3, $4, $5::jsonb)";
  }
  if (table === "execution_logs") {
    return "INSERT INTO execution_logs (id, scope, action, status, created_at, data_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb)";
  }
  throw new Error(`Unsupported PostgreSQL table: ${table}`);
}

function writeGeneratedPostsRowsSqlite(db: SqliteDatabase, posts: GeneratedPost[]) {
  const insert = db.prepare(resolveSqliteInsertSql("generated_posts"));
  for (const post of posts) {
    insert.run(post.id, post.sourceItemId, post.platform, post.status, post.createdAt || post.updatedAt, post.updatedAt, toJson(post));
  }
}

function writeExecutionRowsSqlite(db: SqliteDatabase, entries: ExecutionLogEntry[]) {
  const insert = db.prepare(resolveSqliteInsertSql("execution_logs"));
  for (const entry of entries) {
    insert.run(entry.id, entry.scope, entry.action, entry.status, entry.createdAt, toJson(entry));
  }
}

function runSqliteTransaction(db: SqliteDatabase, operation: () => void) {
  db.exec("BEGIN IMMEDIATE");
  try {
    operation();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function sqliteTableCount(db: SqliteDatabase, table: StoreTable) {
  assertStoreTable(table);
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as CountRow;
  return Number(row.count || 0);
}

async function postgresTableCount(client: PoolClient, table: StoreTable) {
  assertStoreTable(table);
  const result = await client.query<CountRow>(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(result.rows[0]?.count || 0);
}

function getSqliteMeta(db: SqliteDatabase, key: string) {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as { value?: string } | undefined;
  return row?.value;
}

function setSqliteMeta(db: SqliteDatabase, key: string, value: string) {
  db.prepare(`
    INSERT INTO app_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

function fromSimpleRunQueueRow(row: SimpleRunQueueRow): SimpleRunQueueItem {
  return {
    id: row.id,
    runId: row.run_id,
    status: row.status,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    runAfter: normalizeDateValue(row.run_after),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || undefined,
  };
}

function fromCanvasRunQueueRow(row: CanvasRunQueueRow): CanvasRunQueueItem {
  return {
    id: row.id,
    runId: row.run_id,
    status: row.status,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    runAfter: normalizeDateValue(row.run_after),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || undefined,
  };
}

function fromFeishuPublishQueueRow(row: FeishuPublishQueueRow): FeishuPublishJob {
  const data = fromJson<FeishuPublishJob>(row.data_json);
  return {
    ...data,
    id: row.id,
    ownerUserId: row.owner_user_id,
    source: row.source,
    publishMode: normalizeFeishuPublishMode(data.publishMode),
    sourceRunId: row.source_run_id || undefined,
    status: row.status,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    runAfter: normalizeDateValue(row.run_after),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || data.error,
  };
}

export async function listCanvasSubtitlePresetsFromDb() {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_subtitle_presets ORDER BY updated_at DESC");
    return result.rows.map((row) => fromJson<CanvasSubtitlePreset>(row.data_json));
  }
  return (getSqliteDatabase().prepare("SELECT data_json FROM canvas_subtitle_presets ORDER BY updated_at DESC").all() as JsonRow[])
    .map((row) => fromJson<CanvasSubtitlePreset>(row.data_json));
}

export async function getCanvasSubtitlePresetFromDb(presetId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_subtitle_presets WHERE id = $1", [presetId]);
    return result.rows[0] ? fromJson<CanvasSubtitlePreset>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM canvas_subtitle_presets WHERE id = ?").get(presetId) as JsonRow | undefined;
  return row ? fromJson<CanvasSubtitlePreset>(row.data_json) : undefined;
}

export async function createCanvasSubtitlePresetInDb(preset: CanvasSubtitlePreset) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_subtitle_presets (id, owner_user_id, normalized_name, revision, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [preset.id, preset.ownerUserId, preset.normalizedName, preset.revision, preset.createdAt, preset.updatedAt, toJson(preset)],
    );
  } else {
    getSqliteDatabase().prepare(
      `INSERT INTO canvas_subtitle_presets (id, owner_user_id, normalized_name, revision, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(preset.id, preset.ownerUserId, preset.normalizedName, preset.revision, preset.createdAt, preset.updatedAt, toJson(preset));
  }
  return preset;
}

export async function updateCanvasSubtitlePresetInDb(preset: CanvasSubtitlePreset, expectedRevision: number) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query(
      `UPDATE canvas_subtitle_presets SET owner_user_id = $1, normalized_name = $2, revision = $3, updated_at = $4, data_json = $5::jsonb
       WHERE id = $6 AND revision = $7`,
      [preset.ownerUserId, preset.normalizedName, preset.revision, preset.updatedAt, toJson(preset), preset.id, expectedRevision],
    );
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare(
    `UPDATE canvas_subtitle_presets SET owner_user_id = ?, normalized_name = ?, revision = ?, updated_at = ?, data_json = ?
     WHERE id = ? AND revision = ?`,
  ).run(preset.ownerUserId, preset.normalizedName, preset.revision, preset.updatedAt, toJson(preset), preset.id, expectedRevision) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function deleteCanvasSubtitlePresetFromDb(presetId: string, expectedRevision: number) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query("DELETE FROM canvas_subtitle_presets WHERE id = $1 AND revision = $2", [presetId, expectedRevision]);
    return Number(result.rowCount || 0) === 1;
  }
  const result = getSqliteDatabase().prepare("DELETE FROM canvas_subtitle_presets WHERE id = ? AND revision = ?").run(presetId, expectedRevision) as { changes?: number };
  return Number(result.changes || 0) === 1;
}

export async function getCanvasSubtitleTranscriptCacheFromDb(cacheId: string) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    const result = await getPostgresPool().query<JsonRow>("SELECT data_json FROM canvas_subtitle_transcript_cache WHERE id = $1", [cacheId]);
    return result.rows[0] ? fromJson<CanvasSubtitleTranscriptCacheEntry>(result.rows[0].data_json) : undefined;
  }
  const row = getSqliteDatabase().prepare("SELECT data_json FROM canvas_subtitle_transcript_cache WHERE id = ?").get(cacheId) as JsonRow | undefined;
  return row ? fromJson<CanvasSubtitleTranscriptCacheEntry>(row.data_json) : undefined;
}

export async function saveCanvasSubtitleTranscriptCacheToDb(entry: CanvasSubtitleTranscriptCacheEntry) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `INSERT INTO canvas_subtitle_transcript_cache (id, owner_user_id, created_at, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data_json = excluded.data_json`,
      [entry.id, entry.ownerUserId, entry.createdAt, entry.updatedAt, toJson(entry)],
    );
  } else {
    getSqliteDatabase().prepare(
      `INSERT INTO canvas_subtitle_transcript_cache (id, owner_user_id, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data_json = excluded.data_json`,
    ).run(entry.id, entry.ownerUserId, entry.createdAt, entry.updatedAt, toJson(entry));
  }
  return entry;
}

function normalizeStoredSimpleRun(run: SimpleRun): SimpleRun {
  return {
    ...run,
    input: {
      ...run.input,
      feishuPublishMode: normalizeFeishuPublishMode(run.input.feishuPublishMode),
    },
  };
}

function fromDistributionCheckJobRow(row: DistributionCheckJobRow): DistributionCheckJob {
  const data = fromJson<DistributionCheckJob>(row.data_json);
  return {
    ...data,
    id: row.id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    runAfter: normalizeDateValue(row.run_after),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || data.error,
  };
}

function fromImageGenerationQueueRow(row: ImageGenerationQueueRow): ImageGenerationQueueJob {
  const data = fromJson<ImageGenerationQueueJob>(row.data_json);
  return {
    ...data,
    id: row.id,
    provider: row.provider,
    status: row.status,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    runAfter: normalizeDateValue(row.run_after),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || data.error,
  };
}

function fromLarkTaskLaunchRow(row: LarkTaskLaunchRow): LarkTaskLaunch {
  const data = fromJson<Partial<LarkTaskLaunch>>(row.data_json);
  return {
    ...data,
    id: row.id,
    messageId: row.message_id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    ownerUserId: row.owner_user_id || data.ownerUserId,
    runId: row.run_id || data.runId,
    status: row.status,
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    error: row.error || data.error,
    commandText: data.commandText || "",
  };
}

function fromWorkspaceAccountRow(row: WorkspaceAccountRow): WorkspaceAccountRecord {
  const data = fromJson<Partial<WorkspaceAccountRecord>>(row.data_json);
  return {
    ...data,
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role === "admin" ? "admin" : "operator",
    status: row.status === "disabled" ? "disabled" : "active",
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    lastLoginAt: row.last_login_at ? normalizeDateValue(row.last_login_at) : undefined,
  };
}

function fromWorkspaceSessionRow(row: WorkspaceSessionRow): WorkspaceSession {
  const data = fromJson<Partial<WorkspaceSession>>(row.data_json);
  return {
    ...data,
    id: row.id,
    accountId: row.account_id,
    tokenHash: row.token_hash,
    createdAt: normalizeDateValue(row.created_at),
    expiresAt: normalizeDateValue(row.expires_at),
    lastSeenAt: row.last_seen_at ? normalizeDateValue(row.last_seen_at) : undefined,
    revokedAt: row.revoked_at ? normalizeDateValue(row.revoked_at) : undefined,
  };
}

async function saveLibraryAssetPostgres(client: PoolClient, asset: LibraryAsset) {
  await client.query(
    `INSERT INTO library_assets (
       id, owner_user_id, visibility, sha256, object_key, public_url, tagging_status, cleanup_status,
       created_at, updated_at, deleted_at, data_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, visibility=excluded.visibility,
       sha256=excluded.sha256, object_key=excluded.object_key, public_url=excluded.public_url,
       tagging_status=excluded.tagging_status, cleanup_status=excluded.cleanup_status,
       updated_at=excluded.updated_at,
       deleted_at=excluded.deleted_at, data_json=excluded.data_json`,
    libraryAssetValues(asset),
  );
  await client.query("DELETE FROM library_asset_roles WHERE asset_id=$1", [asset.id]);
  for (const role of Array.from(new Set(asset.roles))) {
    await client.query("INSERT INTO library_asset_roles (asset_id, role) VALUES ($1,$2)", [asset.id, role]);
  }
  await client.query("DELETE FROM library_collection_assets WHERE asset_id=$1", [asset.id]);
  for (const collectionId of Array.from(new Set(asset.collectionIds))) {
    await client.query(
      "INSERT INTO library_collection_assets (collection_id, asset_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [collectionId, asset.id, asset.updatedAt],
    );
  }
  await client.query("DELETE FROM library_asset_labels WHERE asset_id=$1", [asset.id]);
  for (const label of flattenLibraryAssetLabels(asset)) {
    await client.query(
      "INSERT INTO library_asset_labels (asset_id, dimension, value, source, confidence, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [asset.id, label.dimension, label.value, label.source, label.confidence ?? null, asset.updatedAt],
    );
  }
}

function saveLibraryAssetSqlite(db: SqliteDatabase, asset: LibraryAsset) {
  db.prepare(
    `INSERT INTO library_assets (
       id, owner_user_id, visibility, sha256, object_key, public_url, tagging_status, cleanup_status,
       created_at, updated_at, deleted_at, data_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, visibility=excluded.visibility,
       sha256=excluded.sha256, object_key=excluded.object_key, public_url=excluded.public_url,
       tagging_status=excluded.tagging_status, cleanup_status=excluded.cleanup_status,
       updated_at=excluded.updated_at,
       deleted_at=excluded.deleted_at, data_json=excluded.data_json`,
  ).run(...libraryAssetValues(asset));
  db.prepare("DELETE FROM library_asset_roles WHERE asset_id=?").run(asset.id);
  const insertRole = db.prepare("INSERT INTO library_asset_roles (asset_id, role) VALUES (?,?)");
  Array.from(new Set(asset.roles)).forEach((role) => insertRole.run(asset.id, role));
  db.prepare("DELETE FROM library_collection_assets WHERE asset_id=?").run(asset.id);
  const insertCollection = db.prepare(
    "INSERT INTO library_collection_assets (collection_id, asset_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING",
  );
  Array.from(new Set(asset.collectionIds)).forEach((collectionId) => insertCollection.run(collectionId, asset.id, asset.updatedAt));
  db.prepare("DELETE FROM library_asset_labels WHERE asset_id=?").run(asset.id);
  const insertLabel = db.prepare(
    "INSERT INTO library_asset_labels (asset_id, dimension, value, source, confidence, updated_at) VALUES (?,?,?,?,?,?)",
  );
  flattenLibraryAssetLabels(asset).forEach((label) =>
    insertLabel.run(asset.id, label.dimension, label.value, label.source, label.confidence ?? null, asset.updatedAt),
  );
}

function libraryAssetValues(asset: LibraryAsset) {
  return [
    asset.id,
    asset.ownerUserId,
    asset.visibility,
    asset.sha256,
    asset.objectKey,
    asset.publicUrl,
    asset.taggingStatus,
    asset.cleanupStatus,
    asset.createdAt,
    asset.updatedAt,
    asset.deletedAt || null,
    toJson(asset),
  ];
}

function flattenLibraryAssetLabels(asset: LibraryAsset) {
  const labels: Array<{ dimension: string; value: string; source: "ai" | "user"; confidence?: number }> = [];
  const profile = asset.effectiveTags;
  const add = (dimension: string, values: string[]) => {
    const source = Object.prototype.hasOwnProperty.call(asset.manualOverrides, dimension) ? "user" : "ai";
    for (const value of Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))) {
      labels.push({ dimension, value, source, confidence: source === "ai" ? profile.confidence : undefined });
    }
  };
  add("imageType", profile.imageType ? [profile.imageType] : []);
  add("scenes", profile.scenes);
  add("vehicleModels", profile.vehicleModels);
  add("vehicleColors", profile.vehicleColors);
  add("angles", profile.angles);
  add("people", [profile.people]);
  add("customTags", profile.customTags);
  return labels;
}

async function saveLibraryTaggingJobPostgres(client: PoolClient, job: LibraryTaggingJob) {
  await client.query(
    `INSERT INTO library_tagging_jobs (
       id, asset_id, owner_user_id, status, attempts, max_attempts, run_after, locked_by, locked_until,
       created_at, updated_at, started_at, completed_at, error, data_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, attempts=excluded.attempts, max_attempts=excluded.max_attempts,
       run_after=excluded.run_after, locked_by=excluded.locked_by, locked_until=excluded.locked_until,
       updated_at=excluded.updated_at, started_at=excluded.started_at, completed_at=excluded.completed_at,
       error=excluded.error, data_json=excluded.data_json`,
    libraryTaggingJobValues(job),
  );
}

function saveLibraryTaggingJobSqlite(db: SqliteDatabase, job: LibraryTaggingJob) {
  db.prepare(
    `INSERT INTO library_tagging_jobs (
       id, asset_id, owner_user_id, status, attempts, max_attempts, run_after, locked_by, locked_until,
       created_at, updated_at, started_at, completed_at, error, data_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, attempts=excluded.attempts, max_attempts=excluded.max_attempts,
       run_after=excluded.run_after, locked_by=excluded.locked_by, locked_until=excluded.locked_until,
       updated_at=excluded.updated_at, started_at=excluded.started_at, completed_at=excluded.completed_at,
       error=excluded.error, data_json=excluded.data_json`,
  ).run(...libraryTaggingJobValues(job));
}

function libraryTaggingJobValues(job: LibraryTaggingJob) {
  return [
    job.id,
    job.assetId,
    job.ownerUserId,
    job.status,
    job.attempts,
    job.maxAttempts,
    job.runAfter,
    job.lockedBy || null,
    job.lockedUntil || null,
    job.createdAt,
    job.updatedAt,
    job.startedAt || null,
    job.completedAt || null,
    job.error || null,
    toJson(job),
  ];
}

function fromLibraryTaggingJobRow(row: LibraryTaggingJobRow): LibraryTaggingJob {
  const data = fromJson<Partial<LibraryTaggingJob>>(row.data_json);
  return {
    ...data,
    id: row.id,
    assetId: row.asset_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: normalizeDateValue(row.run_after),
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || undefined,
  };
}

function normalizeDateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : new Date(String(value)).toISOString();
}

async function updateOriginalBatchQueueTerminalStatus(
  queueId: string,
  workerId: string,
  status: "completed" | "failed" | "cancelled",
  error?: string,
) {
  await ensureDatabaseReady();
  const now = new Date().toISOString();
  if (getDatabaseBackend() === "postgres") {
    await getPostgresPool().query(
      `UPDATE original_batch_queue SET status=$1,locked_by=NULL,locked_until=NULL,completed_at=$2,updated_at=$2,error=$3
       WHERE id=$4 AND locked_by=$5 AND status='running'`,
      [status, now, error || null, queueId, workerId],
    );
  } else {
    getSqliteDatabase().prepare(`UPDATE original_batch_queue SET status=?,locked_by=NULL,locked_until=NULL,completed_at=?,updated_at=?,error=?
      WHERE id=? AND locked_by=? AND status='running'`).run(status, now, now, error || null, queueId, workerId);
  }
}

function fromOriginalBatchQueueRow(row: OriginalBatchQueueRow): OriginalBatchQueueItem {
  const data = fromJson<Partial<OriginalBatchQueueItem>>(row.data_json);
  return {
    ...data,
    id: row.id,
    batchId: row.batch_id,
    itemId: row.item_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: normalizeDateValue(row.run_after),
    createdAt: normalizeDateValue(row.created_at),
    updatedAt: normalizeDateValue(row.updated_at),
    lockedBy: row.locked_by || undefined,
    lockedUntil: row.locked_until ? normalizeDateValue(row.locked_until) : undefined,
    startedAt: row.started_at ? normalizeDateValue(row.started_at) : undefined,
    completedAt: row.completed_at ? normalizeDateValue(row.completed_at) : undefined,
    error: row.error || undefined,
  };
}

function assertStoreTable(table: StoreTable) {
  const allowedTables: StoreTable[] = [
    "workspace_accounts",
    "workspace_sessions",
    "content_projects",
    "generated_posts",
    "batch_jobs",
    "execution_logs",
    "crawl_jobs",
    "runtime_posts",
    "simple_runs",
    "simple_run_queue",
    "image_generation_queue",
    "feishu_publish_queue",
    "distribution_check_jobs",
    "lark_task_launches",
  ];
  if (!allowedTables.includes(table)) throw new Error(`Unsupported store table: ${table}`);
}

function toJson(value: unknown) {
  return JSON.stringify(value);
}

function fromJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}
