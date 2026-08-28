ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS byte_size BIGINT;
ALTER TABLE library_assets ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(original_name, '') || ' ' || COALESCE(note, ''))
) STORED;

UPDATE library_assets SET
  name = COALESCE(name, data_json->>'name', ''),
  original_name = COALESCE(original_name, data_json->>'originalName', ''),
  note = COALESCE(note, data_json->>'note', ''),
  mime_type = COALESCE(mime_type, data_json->>'mimeType', ''),
  width = COALESCE(width, NULLIF(data_json->>'width', '')::integer),
  height = COALESCE(height, NULLIF(data_json->>'height', '')::integer),
  byte_size = COALESCE(byte_size, NULLIF(data_json->>'byteSize', '')::bigint, 0);

CREATE INDEX IF NOT EXISTS idx_library_assets_name ON library_assets(name, id);
CREATE INDEX IF NOT EXISTS idx_library_assets_dimensions ON library_assets(width, height, byte_size, id);
CREATE INDEX IF NOT EXISTS idx_library_assets_search ON library_assets USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_library_asset_labels_filter_lower ON library_asset_labels(dimension, LOWER(value), asset_id);

ALTER TABLE library_collections ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE library_collections ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'folder';

CREATE TABLE IF NOT EXISTS library_smart_folders (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  visibility TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  data_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_smart_folders_owner_name ON library_smart_folders(owner_user_id, name, id);
CREATE INDEX IF NOT EXISTS idx_library_smart_folders_visibility ON library_smart_folders(visibility, owner_user_id, name);

CREATE TABLE IF NOT EXISTS library_asset_favorites (
  owner_user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES library_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(owner_user_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_library_asset_favorites_asset ON library_asset_favorites(asset_id, owner_user_id);
