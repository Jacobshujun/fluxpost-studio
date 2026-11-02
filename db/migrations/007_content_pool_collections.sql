-- Content-pool libraries, nested subsets, item memberships and tag preferences.
-- Reference migration for PostgreSQL. The runtime also applies the same DDL
-- idempotently from src/lib/database.ts.

CREATE TABLE IF NOT EXISTS content_pool_collections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  relative_path TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_pool_collections_owner_parent
  ON content_pool_collections(owner_user_id, parent_id, name);
CREATE INDEX IF NOT EXISTS idx_content_pool_collections_owner_path
  ON content_pool_collections(owner_user_id, relative_path);

CREATE TABLE IF NOT EXISTS content_pool_collection_items (
  collection_id TEXT NOT NULL REFERENCES content_pool_collections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(collection_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_content_pool_collection_items_item
  ON content_pool_collection_items(item_id, collection_id);

CREATE TABLE IF NOT EXISTS content_pool_tags (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  tag_key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL,
  UNIQUE(owner_user_id, tag_key)
);
CREATE INDEX IF NOT EXISTS idx_content_pool_tags_owner_key
  ON content_pool_tags(owner_user_id, tag_key);
