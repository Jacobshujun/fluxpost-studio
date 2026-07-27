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
