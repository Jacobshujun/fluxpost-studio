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

CREATE TABLE IF NOT EXISTS library_assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  tagging_status TEXT NOT NULL,
  cleanup_status TEXT NOT NULL,
  legacy_material_asset_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  data_json JSONB NOT NULL,
  UNIQUE(owner_user_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_library_assets_owner_created ON library_assets(owner_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_library_assets_visibility_created ON library_assets(visibility, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_library_assets_tagging_status ON library_assets(tagging_status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_assets_legacy_material ON library_assets(legacy_material_asset_id) WHERE legacy_material_asset_id IS NOT NULL;

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
