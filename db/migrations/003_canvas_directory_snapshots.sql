CREATE TABLE IF NOT EXISTS canvas_directory_snapshots (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_directory_snapshots_owner_scanned ON canvas_directory_snapshots(owner_user_id, scanned_at DESC);
