CREATE TABLE IF NOT EXISTS canvas_subtitle_revisions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  video_sha256 TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL,
  UNIQUE(owner_user_id, workflow_id, node_id, video_sha256)
);
CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_revisions_workflow_node ON canvas_subtitle_revisions(workflow_id, node_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_revisions_owner_video ON canvas_subtitle_revisions(owner_user_id, video_sha256, updated_at DESC);

CREATE TABLE IF NOT EXISTS canvas_subtitle_waveform_cache (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  video_sha256 TEXT NOT NULL,
  protocol_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL,
  UNIQUE(owner_user_id, video_sha256, protocol_version)
);
CREATE INDEX IF NOT EXISTS idx_canvas_subtitle_waveform_owner_video ON canvas_subtitle_waveform_cache(owner_user_id, video_sha256, protocol_version);
