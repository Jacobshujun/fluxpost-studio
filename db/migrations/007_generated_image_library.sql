-- Generated image provenance, exclusions and resumable indexing.

CREATE TABLE IF NOT EXISTS generated_image_results (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, original_url TEXT NOT NULL,
  status TEXT NOT NULL, evidence_json TEXT NOT NULL, error TEXT, token TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(owner_user_id, original_url)
);
CREATE INDEX IF NOT EXISTS idx_generated_result_status ON generated_image_results(status, id);
CREATE TABLE IF NOT EXISTS generated_image_sources (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES generated_image_results(id),
  entry TEXT NOT NULL, task_id TEXT NOT NULL, source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL, data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_sources_asset ON generated_image_sources(asset_id, entry);
CREATE TABLE IF NOT EXISTS generated_image_scans (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, is_admin INTEGER NOT NULL,
  phase INTEGER NOT NULL DEFAULT 0, cursor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued', uncertain INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0, error TEXT, lease_until TEXT,
  token TEXT, updated_at TEXT NOT NULL
);
