import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const projectRoot = process.cwd();
const scriptPath = path.join(projectRoot, "scripts/db/remove-canvas-image-batch.mjs");
const scriptSource = readFileSync(scriptPath, "utf8");
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "fluxpost-canvas-review-cleanup-"));
const sqlitePath = path.join(tempDirectory, "fixture.db");

try {
  const database = new DatabaseSync(sqlitePath);
  database.exec(`
    CREATE TABLE generated_posts (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
  `);
  const insert = database.prepare(
    "INSERT INTO generated_posts (id, source_item_id, platform, status, created_at, updated_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const unchangedAt = "2026-08-24T12:00:00.000Z";
  const partial = {
    id: "post-partial",
    title: "Partial title",
    body: "Partial body",
    imageUrls: ["/partial.jpg"],
    status: "draft",
    canvasImageBatch: { status: "partial", total: 2, succeeded: 1, failed: 1, failedIndices: [2] },
  };
  const completed = {
    id: "post-completed",
    title: "Completed title",
    body: "Completed body",
    imageUrls: ["/completed.jpg"],
    status: "approved",
    canvasImageBatch: { status: "completed", total: 1, succeeded: 1, failed: 0, failedIndices: [] },
  };
  const plain = { id: "post-plain", title: "Plain", body: "Plain body", imageUrls: [], status: "draft" };
  for (const post of [partial, completed, plain]) {
    insert.run(post.id, `source-${post.id}`, "original", post.status, unchangedAt, unchangedAt, JSON.stringify(post));
  }
  database.close();

  const beforeBytes = readFileSync(sqlitePath);
  const dryRun = runCleanup(sqlitePath);
  assert.deepEqual(dryRun, {
    backend: "sqlite",
    mode: "dry-run",
    matched: 2,
    changed: 0,
    ids: ["post-completed", "post-partial"],
  });
  assert.deepEqual(readFileSync(sqlitePath), beforeBytes, "dry-run must not mutate the SQLite file");

  const applied = runCleanup(sqlitePath, true);
  assert.deepEqual(applied, {
    backend: "sqlite",
    mode: "apply",
    matched: 2,
    changed: 2,
    ids: ["post-completed", "post-partial"],
  });

  const verified = new DatabaseSync(sqlitePath, { readOnly: true });
  const rows = verified.prepare("SELECT id, status, updated_at, data_json FROM generated_posts ORDER BY id").all();
  verified.close();
  assert.equal(rows.length, 3);
  for (const row of rows) {
    const post = JSON.parse(row.data_json);
    assert.equal("canvasImageBatch" in post, false, `${row.id} must not retain canvasImageBatch`);
    assert.equal(row.updated_at, unchangedAt, `${row.id} updated_at must stay unchanged`);
    assert.equal(row.status, post.status, `${row.id} status must stay unchanged`);
  }
  const { canvasImageBatch: ignoredPartialBatch, ...expectedPartial } = partial;
  const { canvasImageBatch: ignoredCompletedBatch, ...expectedCompleted } = completed;
  assert.ok(ignoredPartialBatch && ignoredCompletedBatch);
  assert.deepEqual(JSON.parse(rows.find((row) => row.id === partial.id).data_json), expectedPartial);
  assert.deepEqual(JSON.parse(rows.find((row) => row.id === completed.id).data_json), expectedCompleted);
  assert.deepEqual(JSON.parse(rows.find((row) => row.id === plain.id).data_json), plain);
  assert.deepEqual(runCleanup(sqlitePath), { backend: "sqlite", mode: "dry-run", matched: 0, changed: 0, ids: [] });

  assert.match(scriptSource, /await client\.query\("BEGIN"\)/, "PostgreSQL cleanup must start a transaction");
  assert.match(scriptSource, /SET data_json = data_json - 'canvasImageBatch'/, "PostgreSQL cleanup must remove only the JSONB key");
  assert.match(scriptSource, /await client\.query\("COMMIT"\)/, "PostgreSQL apply must commit explicitly");
  assert.doesNotMatch(scriptSource, /SET[\s\S]{0,80}updated_at/i, "cleanup SQL must not update generated-post timestamps");

  console.log("Canvas review policy cleanup check passed.");
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

function runCleanup(databasePath, apply = false) {
  const result = spawnSync(process.execPath, [scriptPath, "--backend", "sqlite", "--sqlite", databasePath, ...(apply ? ["--apply"] : [])], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}
