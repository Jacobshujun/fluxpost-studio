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
