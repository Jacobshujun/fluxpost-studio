import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import type {
  BatchProductionJob,
  ContentProject,
  CrawlJob,
  ExecutionLogEntry,
  FeishuPublishJob,
  GeneratedPost,
  ImageGenerationQueueJob,
  LarkTaskLaunch,
  MaterialLibrarySnapshot,
  SimpleRun,
  SimpleRunQueueItem,
  WorkspaceAccountRecord,
  WorkspaceSession,
} from "./types";

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

type StoreTable =
  | "workspace_accounts"
  | "workspace_sessions"
  | "content_projects"
  | "generated_posts"
  | "batch_jobs"
  | "material_folders"
  | "material_assets"
  | "execution_logs"
  | "crawl_jobs"
  | "runtime_posts"
  | "simple_runs"
  | "simple_run_queue"
  | "image_generation_queue"
  | "feishu_publish_queue"
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

export async function readBatchJobsFromDb(): Promise<BatchProductionJob[]> {
  return readJsonRows<BatchProductionJob>("batch_jobs", "created_at DESC");
}

export async function writeBatchJobsToDb(jobs: BatchProductionJob[]) {
  await replaceJsonRows("batch_jobs", jobs, (job) => [
    job.id,
    job.status,
    job.createdAt,
    job.updatedAt,
    toJson(job),
  ]);
}

export async function readMaterialLibraryFromDb(): Promise<MaterialLibrarySnapshot> {
  return {
    folders: await readJsonRows("material_folders", "created_at ASC"),
    assets: await readJsonRows("material_assets", "updated_at DESC"),
  };
}

export async function writeMaterialLibraryToDb(library: MaterialLibrarySnapshot) {
  await ensureDatabaseReady();
  if (getDatabaseBackend() === "postgres") {
    await writeMaterialLibraryPostgres(library);
    return;
  }

  const db = getSqliteDatabase();
  runSqliteTransaction(db, () => {
    db.prepare("DELETE FROM material_folders").run();
    db.prepare("DELETE FROM material_assets").run();

    const insertFolder = db.prepare(`
      INSERT INTO material_folders (id, parent_id, name, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const folder of library.folders) {
      insertFolder.run(folder.id, folder.parentId || null, folder.name, folder.createdAt, folder.updatedAt, toJson(folder));
    }

    const insertAsset = db.prepare(`
      INSERT INTO material_assets (id, folder_id, path, kind, created_at, updated_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const asset of library.assets) {
      insertAsset.run(asset.id, asset.folderId, asset.path, asset.kind, asset.createdAt, asset.updatedAt, toJson(asset));
    }
  });
}

export async function readExecutionLogsFromDb(limit?: number): Promise<ExecutionLogEntry[]> {
  return readJsonRows<ExecutionLogEntry>("execution_logs", "created_at DESC", limit);
}

export async function readSimpleRunsFromDb(limit = 30): Promise<SimpleRun[]> {
  return readJsonRows<SimpleRun>("simple_runs", "created_at DESC", limit);
}

export async function getSimpleRunFromDb(runId: string) {
  return readJsonRowById<SimpleRun>("simple_runs", runId);
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
        WHERE run_id = $3 AND status IN ('queued', 'running')
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
    WHERE run_id = ? AND status IN ('queued', 'running')
  `).run(now, now, error, runId);
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
  await migrateLegacyJsonToPostgres();
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

async function writeMaterialLibraryPostgres(library: MaterialLibrarySnapshot) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM material_folders");
    await client.query("DELETE FROM material_assets");

    for (const folder of library.folders) {
      await client.query(
        resolvePostgresInsertSql("material_folders"),
        [folder.id, folder.parentId || null, folder.name, folder.createdAt, folder.updatedAt, toJson(folder)],
      );
    }

    for (const asset of library.assets) {
      await client.query(
        resolvePostgresInsertSql("material_assets"),
        [asset.id, asset.folderId, asset.path, asset.kind, asset.createdAt, asset.updatedAt, toJson(asset)],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

    CREATE TABLE IF NOT EXISTS material_folders (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_material_folders_parent_id ON material_folders(parent_id);

    CREATE TABLE IF NOT EXISTS material_assets (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_material_assets_folder_id ON material_assets(folder_id);
    CREATE INDEX IF NOT EXISTS idx_material_assets_updated_at ON material_assets(updated_at DESC);

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

  CREATE TABLE IF NOT EXISTS material_folders (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_material_folders_parent_id ON material_folders(parent_id);

  CREATE TABLE IF NOT EXISTS material_assets (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data_json JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_material_assets_folder_id ON material_assets(folder_id);
  CREATE INDEX IF NOT EXISTS idx_material_assets_updated_at ON material_assets(updated_at DESC);

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

    if ((await postgresTableCount(client, "batch_jobs")) === 0) {
      const store = readLegacyJson<{ jobs?: BatchProductionJob[] }>("batch-production.json");
      if (Array.isArray(store?.jobs)) {
        for (const job of store.jobs) {
          await client.query(resolvePostgresInsertSql("batch_jobs"), [job.id, job.status, job.createdAt, job.updatedAt, toJson(job)]);
        }
      }
    }

    if ((await postgresTableCount(client, "material_folders")) === 0 && (await postgresTableCount(client, "material_assets")) === 0) {
      const store = readLegacyJson<MaterialLibrarySnapshot>("material-library.json");
      if (store && (Array.isArray(store.folders) || Array.isArray(store.assets))) {
        for (const folder of store.folders || []) {
          await client.query(resolvePostgresInsertSql("material_folders"), [
            folder.id,
            folder.parentId || null,
            folder.name,
            folder.createdAt,
            folder.updatedAt,
            toJson(folder),
          ]);
        }
        for (const asset of store.assets || []) {
          await client.query(resolvePostgresInsertSql("material_assets"), [
            asset.id,
            asset.folderId,
            asset.path,
            asset.kind,
            asset.createdAt,
            asset.updatedAt,
            toJson(asset),
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

    if (sqliteTableCount(db, "batch_jobs") === 0) {
      const store = readLegacyJson<{ jobs?: BatchProductionJob[] }>("batch-production.json");
      if (Array.isArray(store?.jobs)) writeBatchRowsSqlite(db, store.jobs);
    }

    if (sqliteTableCount(db, "material_folders") === 0 && sqliteTableCount(db, "material_assets") === 0) {
      const store = readLegacyJson<MaterialLibrarySnapshot>("material-library.json");
      if (store && (Array.isArray(store.folders) || Array.isArray(store.assets))) {
        writeMaterialRowsSqlite(db, { folders: store.folders || [], assets: store.assets || [] });
      }
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
  if (table === "material_folders") {
    return "INSERT INTO material_folders (id, parent_id, name, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?, ?)";
  }
  if (table === "material_assets") {
    return "INSERT INTO material_assets (id, folder_id, path, kind, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)";
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
  if (table === "material_folders") {
    return "INSERT INTO material_folders (id, parent_id, name, created_at, updated_at, data_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb)";
  }
  if (table === "material_assets") {
    return "INSERT INTO material_assets (id, folder_id, path, kind, created_at, updated_at, data_json) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)";
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

function writeBatchRowsSqlite(db: SqliteDatabase, jobs: BatchProductionJob[]) {
  const insert = db.prepare(resolveSqliteInsertSql("batch_jobs"));
  for (const job of jobs) {
    insert.run(job.id, job.status, job.createdAt, job.updatedAt, toJson(job));
  }
}

function writeMaterialRowsSqlite(db: SqliteDatabase, library: MaterialLibrarySnapshot) {
  const insertFolder = db.prepare(resolveSqliteInsertSql("material_folders"));
  for (const folder of library.folders) {
    insertFolder.run(folder.id, folder.parentId || null, folder.name, folder.createdAt, folder.updatedAt, toJson(folder));
  }

  const insertAsset = db.prepare(resolveSqliteInsertSql("material_assets"));
  for (const asset of library.assets) {
    insertAsset.run(asset.id, asset.folderId, asset.path, asset.kind, asset.createdAt, asset.updatedAt, toJson(asset));
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

function fromFeishuPublishQueueRow(row: FeishuPublishQueueRow): FeishuPublishJob {
  const data = fromJson<FeishuPublishJob>(row.data_json);
  return {
    ...data,
    id: row.id,
    ownerUserId: row.owner_user_id,
    source: row.source,
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

function normalizeDateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : new Date(String(value)).toISOString();
}

function assertStoreTable(table: StoreTable) {
  const allowedTables: StoreTable[] = [
    "workspace_accounts",
    "workspace_sessions",
    "content_projects",
    "generated_posts",
    "batch_jobs",
    "material_folders",
    "material_assets",
    "execution_logs",
    "crawl_jobs",
    "runtime_posts",
    "simple_runs",
    "simple_run_queue",
    "image_generation_queue",
    "feishu_publish_queue",
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
