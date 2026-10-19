-- Image palette metadata and durable explicit analysis. No media reads during migration.

CREATE TABLE IF NOT EXISTS library_asset_palettes (
  asset_id TEXT PRIMARY KEY REFERENCES library_assets(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_palette_status ON library_asset_palettes(status, version, asset_id);
CREATE TABLE IF NOT EXISTS library_asset_colors (
  asset_id TEXT NOT NULL REFERENCES library_asset_palettes(asset_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL, l DOUBLE PRECISION NOT NULL, a DOUBLE PRECISION NOT NULL,
  b DOUBLE PRECISION NOT NULL, coverage DOUBLE PRECISION NOT NULL,
  PRIMARY KEY(asset_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_library_color_lab ON library_asset_colors(l, a, b, asset_id);
CREATE TABLE IF NOT EXISTS library_color_jobs (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, is_admin INTEGER NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_color_active_owner ON library_color_jobs(owner_user_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS library_color_items (
  job_id TEXT NOT NULL REFERENCES library_color_jobs(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL, sha256 TEXT NOT NULL, status TEXT NOT NULL,
  locked_by TEXT, locked_until TEXT, error TEXT,
  PRIMARY KEY(job_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_library_color_claim ON library_color_items(status, locked_until, job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_color_active_asset ON library_color_items(asset_id) WHERE status IN ('queued','running');
